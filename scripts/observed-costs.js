/**
 * Sparse, exact cost observations extracted from the supplied HAR captures.
 *
 * These are server-returned next_cost values, not fitted/interpolated curves.
 * Missing levels deliberately remain on the legacy estimate until a real
 * observation is captured. HAR account identifiers and account state are not
 * stored in this file.
 */

export const API_OBSERVED_BLOOD_COSTS = Object.freeze({
  1: 115,
  2: 269,
  3: 461,
  4: 691,
  5: 961,
  11: 3382,
  50: 89785,
  51: 93374,
  58: 122150,
  61: 136440,
  64: 151904,
  77: 232490,
  80: 254218,
  85: 293043,
  87: 309486,
  95: 380479,
  100: 434739,
  150: 2096083,
  153: 2204807,
  182: 3470701,
  186: 3675875,
  191: 3942763,
  194: 4108454,
  196: 4221230,
  197: 4278313,
  200: 8858383,
  250: 25316634,
  258: 29999162,
  259: 30745656,
  300: 126095128,
  350: 624596836,
  400: 6884526660,
});

const BOND_COSTS = Object.freeze({
  flat: Object.freeze({
    // Step number = target level + 1 reported in the API's next_cost.
    default: Object.freeze({ 1: 0, 2: 20, 6: 44, 7: 53, 9: 76, 11: 113, 13: 150 }),
    one: Object.freeze({ 1: 0, 2: 54, 3: 64, 11: 305 }),
    two: Object.freeze({ 2: 37, 6: 81, 7: 98 }),
    all: Object.freeze({ 1: 0, 2: 28, 4: 42 }),
  }),
  percent: Object.freeze({
    default: Object.freeze({ 1: 20, 3: 24, 34: 1037 }),
    one: Object.freeze({ 1: 54, 3: 64 }),
    two: Object.freeze({ 1: 37, 7: 98, 8: 118 }),
    all: Object.freeze({ 1: 28 }),
  }),
});

export function getObservedBloodCost(level) {
  return API_OBSERVED_BLOOD_COSTS[Number(level)];
}

export function getObservedBondCost(kind, bondType, level) {
  const type = String(bondType || 'default').toLowerCase();
  return BOND_COSTS[kind]?.[type]?.[Number(level)];
}

export function getObservedBondCostTable() {
  return BOND_COSTS;
}

export const API_OBSERVATION_META = Object.freeze({
  source: 'four supplied HAR captures; sanitized aggregate only',
  harCaptures: 4,
  totalNetworkEntries: 3487,
  apiRequests: 1251,
  successfulDominanceResponses: 78,
  successfulQuickResponses: 17,
  quickRateLimitedResponses: 5,
  distinctBloodNextCostLevels: Object.keys(API_OBSERVED_BLOOD_COSTS).length,
  distinctBondNextCostLevels: 26,
  note: 'All four captures were reconciled. Only explicitly observed level/branch steps are exact. No interpolation is performed.',
});
