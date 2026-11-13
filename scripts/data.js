/**
 * Runtime adapter for the canonical master data and reviewed HAR observations.
 * Shared catalogs live in vampire-dominion-data.json; interval evidence is supplemental.
 */
import MASTER_DATA from '../data/vampire-dominion-data.json' with { type: 'json' };
import HAR_BLOOD_OBSERVATIONS from '../data/har-blood-observations-2026-11-13.json' with { type: 'json' };

export const GAME_DB = MASTER_DATA.catalog;
const BASE_REFERENCE = MASTER_DATA.calculation_reference;
const BASE_BLOOD = BASE_REFERENCE.blood_known || {};
const HAR_BLOOD = HAR_BLOOD_OBSERVATIONS.blood_known || {};

function mergeUniqueRows(baseRows = [], extraRows = [], keyOf) {
  const rows = new Map();
  for (const row of baseRows) rows.set(keyOf(row), row);
  for (const row of extraRows) {
    const key = keyOf(row);
    if (!rows.has(key)) rows.set(key, row);
  }
  return [...rows.values()];
}

export const CALCULATION_REFERENCE = {
  ...BASE_REFERENCE,
  blood_known: {
    ...BASE_BLOOD,
    samples: mergeUniqueRows(
      BASE_BLOOD.samples,
      HAR_BLOOD.samples,
      row => [row.warden_id, row.from_level, row.to_level, row.promote_from, row.promote_to].join(':')
    ),
    exact_next_level_costs: mergeUniqueRows(
      BASE_BLOOD.exact_next_level_costs,
      HAR_BLOOD.exact_next_level_costs,
      row => String(row.from_level)
    ),
  },
};
export const LOCAL_ICON_BASE = './assets/icons/';

export function getIconUrl(iconPath) {
  if (!iconPath) return '';
  return LOCAL_ICON_BASE + String(iconPath).replace(/^\/+/, '');
}
