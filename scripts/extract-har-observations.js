#!/usr/bin/env node
/**
 * Extract only non-sensitive blood-cost observations from a Vampire Dominion HAR.
 *
 * Usage:
 *   node scripts/extract-har-observations.js capture.har
 *   node scripts/extract-har-observations.js capture.har sanitized-observations.json
 *
 * The source HAR is read locally and is never uploaded or copied into the repository.
 * Account IDs, request headers, cookies, authorization values, request bodies, and
 * account-specific stat gains are intentionally excluded from the output.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function parseHarText(source) {
  // Some WebInspector exports wrap very long response-body strings with literal
  // line breaks. JSON strings cannot contain literal line breaks, so remove only
  // those characters while inside quoted strings before parsing.
  const output = [];
  let inString = false;
  let escaped = false;

  for (const character of source) {
    const code = character.charCodeAt(0);
    if (inString) {
      if (character === '\r' || character === '\n') continue;
      if (escaped) {
        output.push(character);
        escaped = false;
      } else if (character === '\\') {
        output.push(character);
        escaped = true;
      } else if (character === '"') {
        output.push(character);
        inString = false;
      } else if (code < 0x20) {
        output.push('\\u' + code.toString(16).padStart(4, '0'));
      } else {
        output.push(character);
      }
    } else {
      output.push(character);
      if (character === '"') inString = true;
    }
  }
  return JSON.parse(output.join(''));
}

function parseResponseBody(entry) {
  const content = entry?.response?.content || {};
  let body = content.text;
  if (typeof body !== 'string') return null;
  if (content.encoding === 'base64') {
    body = Buffer.from(body, 'base64').toString('utf8');
  }
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function extractHarObservations(har) {
  const entries = Array.isArray(har?.log?.entries) ? har.log.entries : [];
  const intervals = new Map();
  const nextCosts = new Map();
  let dominanceResponses = 0;

  for (const entry of entries) {
    const request = entry?.request || {};
    if (request.method !== 'POST') continue;

    let pathname = '';
    try {
      pathname = new URL(request.url).pathname;
    } catch {
      continue;
    }
    if (!/\/api\/v1\/accounts\/[^/]+\/calculations\/dominance$/.test(pathname)) continue;

    const status = asNumber(entry?.response?.status);
    if (status === null || status < 200 || status >= 300) continue;
    const response = parseResponseBody(entry);
    if (!response || !Array.isArray(response?.levels?.wardens)) continue;
    dominanceResponses++;

    for (const row of response.levels.wardens) {
      const wardenId = asNumber(row?.warden_id);
      const from = asNumber(row?.level);
      const to = asNumber(row?.target);
      const cost = asNumber(row?.cost);
      const promoteFrom = asNumber(row?.promote);
      const promoteTo = asNumber(row?.promote_after);

      if (wardenId === null || from === null || to === null || cost === null) continue;
      if (to > from && cost > 0) {
        const key = [wardenId, from, to, promoteFrom, promoteTo, cost].join(':');
        const item = intervals.get(key) || {
          warden_id: wardenId,
          from_level: from,
          to_level: to,
          promote_from: promoteFrom,
          promote_to: promoteTo,
          cost,
          occurrences: 0,
          confidence: 'exact_api_interval',
        };
        item.occurrences++;
        intervals.set(key, item);
      }

      const nextCost = asNumber(row?.next_cost);
      if (nextCost !== null && nextCost > 0 && to !== null) {
        const key = [wardenId, to, promoteTo, nextCost].join(':');
        const item = nextCosts.get(key) || {
          warden_id: wardenId,
          level: to,
          promote: promoteTo,
          cost: nextCost,
          occurrences: 0,
          confidence: 'exact_api_next_level_cost',
        };
        item.occurrences++;
        nextCosts.set(key, item);
      }
    }
  }

  return {
    schema_version: 1,
    source_endpoint: 'POST /api/v1/accounts/{account}/calculations/dominance',
    dominance_responses: dominanceResponses,
    blood_intervals: [...intervals.values()].sort((a, b) =>
      a.warden_id - b.warden_id || a.from_level - b.from_level || a.to_level - b.to_level
    ),
    next_level_cost_observations: [...nextCosts.values()].sort((a, b) =>
      a.warden_id - b.warden_id || a.level - b.level
    ),
    notes: [
      'Only successful 2xx dominance responses are used.',
      'The output intentionally omits account IDs, headers, cookies, authorization values, request payloads, and gain fields.',
      'Exact intervals are exact only for the captured from/to pair; they do not define every intermediate step.',
      'Review and reconcile observations before importing them into the canonical game dataset.',
    ],
  };
}

function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  if (!inputPath) {
    process.stderr.write('Usage: node scripts/extract-har-observations.js <capture.har> [sanitized-output.json]\n');
    process.exitCode = 2;
    return;
  }

  try {
    const har = parseHarText(readFileSync(inputPath, 'utf8'));
    const output = JSON.stringify(extractHarObservations(har), null, 2) + '\n';
    if (outputPath) {
      writeFileSync(outputPath, output, 'utf8');
      process.stdout.write('Sanitized observations saved. No account/session data was exported.\n');
    } else {
      process.stdout.write(output);
    }
  } catch {
    process.stderr.write('Could not parse this HAR. Keep the original file unchanged and check that the export includes response content.\n');
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
