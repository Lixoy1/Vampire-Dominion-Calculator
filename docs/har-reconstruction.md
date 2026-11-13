# HAR reconstruction — source audit

## Source and handling

- Source: two HAR files supplied by the project owner, captured 2026-11-12.
- The files are local analysis inputs and are deliberately **not committed** to this repository.
- Account identifiers, authentication headers, cookies, Telegram init data, device identifiers, and personal profile fields are excluded from committed fixtures.
- The oracle fixture contains only a few minimal game-rule observations needed for regression tests.

## Captured coverage

Across both HAR files:

- 6,213 network entries.
- 1,203 requests to the game API host under `/api/`.
- 81 successful dominance-calculation requests.
- 9 successful quick-calculation requests.
- 12 talent-points calculation requests.
- 4 lover-points calculation requests.
- 2 guild-exp calculation requests.
- 68 Warden templates, 45 Lover templates, 240 Item templates, 8 promotion stages, 180 Conclave levels, and 210 Courtyard levels.

The current canonical repository catalog contains 237 items. The captured API template contains 240. The three absent IDs are:

| ID | API name | Category |
|---:|---|---|
| 10464101 | WILLIAM_SKIN_1 | skin |
| 20464101 | REDD_SKIN_1_MALE | skin |
| 30464101 | REDD_SKIN_1_FEMALE | skin |

Their icon files are not currently present in `assets/icons/items/`; add the catalog records only together with verified local icon assets or an explicit safe fallback.

## Confirmed calculation observations

### Warden blood

Successful `POST /api/v1/accounts/{account_id}/calculations/dominance` responses show:

- At current level 1, the next blood cost is 115.
- A level-1 to level-3 target costs 384 total, so the level-2 step costs 269.
- At current level 3, the next blood cost is 461.
- At current level 150, the next blood cost is 2,096,083.

These observations are recorded in `tests/fixtures/har-oracle.json`. They do **not** establish a complete cost curve. Any unobserved level still uses the legacy estimate and is now marked in the engine result via `bloodCostVerified` and `estimatedBloodLevels`.

### Scarlet bonds

The captured dominance response for Lover template 20170 reports ordinary bond level 0 -> 1 as cost 0 for all four attributes. The same response reports the following next-step costs after the free level: 20, 20, 20, and 54. The captured UI guide explicitly states that the first ordinary bond level is free.

The engine now returns zero cost for ordinary bond level 1. Later levels and percentage bonds remain unverified until a captured request actually exercises them.

## Known gaps — do not silently guess

- Only one useful low-level Warden upgrade range and one level-150 next-step price were captured. The full blood-cost curve is not yet verified.
- Captured Scarlet Bond scenarios exercise the first ordinary level, not later ordinary levels or percentage branches.
- Guild-exp endpoint coverage is sparse (two requests); verify item limits and donation-window edge cases before claiming full parity.
- Quick-calculation coverage is nine requests but only a small number of distinct input profiles; optimizer parity needs more fixtures.
- The current UI can be reconstructed from captured JS modules and observed network behavior, but the HAR does not provide the original CSS source as a complete standalone stylesheet.

## Implementation policy

1. Treat successful API responses as the oracle for the exact scenario they contain.
2. Store only minimized, anonymized fixtures — never commit raw HAR files or session material.
3. Separate verified formulas from estimates in code and in UI copy.
4. Add one regression test per newly confirmed rule before changing its implementation.
5. Do not deploy experimental reconstruction commits to production until all local tests pass.
