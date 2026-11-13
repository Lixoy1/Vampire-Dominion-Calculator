# HAR-grounded reconstruction

This document records only observations confirmed by the three supplied HAR captures. Private account identifiers, cookies, authorization headers, Telegram init data, and session tokens are intentionally excluded.

## Successful template responses

The captures include successful HTTP 200 responses for:

- `GET /api/v1/templates/wardens?detailed=true`: 68
- `GET /api/v1/templates/lovers?detailed=true`: 45
- `GET /api/v1/templates/items`: 240
- `GET /api/v1/templates/warden-promotes`: 8
- `GET /api/v1/templates/conclave-levels`: 180
- `GET /api/v1/templates/courtyard-levels`: 210

The canonical catalog now contains all 240 item templates. Three previously missing skin items were added: 10464101, 20464101, and 30464101. Their API icon paths are preserved as `api_icon_path`, while `icon_path` is null because those three WebP files were not present in the supplied HAR captures or local asset bundle; the UI must use its normal icon fallback for these entries.

## API limits

The successful `GET /api/v1/limits` response confirms:

- Warden level: 450
- Talent level: 320
- Aura level: 30
- Scarlet bond flat and percent levels: 600
- Presence level: 30
- Conclave level: 180
- Courtyard level: 210
- Skin level: 10
- Skin-store level: 30

## Exact calculation observations

Successful `POST /api/v1/accounts/{account}/calculations/dominance` responses confirm these aggregate blood costs:

| From | To | Cost | Next level cost |
|---:|---:|---:|---:|
| 1 | 3 | 384 | 461 |
| 1 | 7 | 3,765 | 1,614 |
| 1 | 10 | 9,799 | 2,883 |
| 105 | 150 | 36,056,873 | 2,096,083 |

These are exact **aggregate intervals**. The HAR also exposes exact next-step costs at levels 1 (115), 3 (461), 7 (1,614), 10 (2,883), 150 (2,096,083), 182 (3,470,701), and 258 (29,999,162). The exact 1→3 interval (384) plus the first-step cost (115) determines the level-2 step cost (269). Other per-level costs remain approximation-only.

The same dominance responses confirm first-step Scarlet Bond costs:

- Captured bond templates 1701–1704: first flat level costs 0 and gains 120 / 100 / 100 / 300 respectively.
- Their next flat-step costs are 20 / 20 / 20 / 54; next gains are 132 / 110 / 110 / 330.
- Their first percentage-step costs are 20 / 20 / 20 / 54, with API next-gain forecasts 1 / 1 / 1 / 3. Those percentage next-gain values were returned by the API but the captures did not exercise applying those upgrades.

These values are exact only for those four captured bond templates and their first two flat levels: the response's next_gain fields supply the second-step gains. Higher bond levels and other bond templates are not covered and remain unverified.

A successful `GET /calculations/lover-points` scenario confirms that 2 units of item 4232 yield 10 minimum, 12 expected, and 16 maximum intimacy points.

## Calculation endpoint coverage

The captures include these calculation endpoints:

- `POST /calculations/dominance`
- `POST /calculations/quick`
- `GET /calculations/talent-points`
- `GET /calculations/lover-points`
- `GET /calculations/guild-exp`

Dominance responses expose detailed sections for Conclave, levels, bonds, auras, presences, skins, talents, courtyard, and books. Quick calculation responses expose planned changes for Conclave, levels, bonds, auras, skins, talents, and presences.

## Quick Calculation reconstruction

The two HAR captures contain nine successful Quick Calculation calls but only three distinct request/response pairs. The captured request contract is:

- `goal`: `all`, `strength`, `allure`, `intellect`, or `spirit`.
- `spend`: independent switches for `blood`, `promote_items`, `conclave`, `trust`, `group_items`, `presence_items`, `talent_items`, `talent_exp`, `skin_cards`, and `fabric`.
- `wardens`: per-template exclusions and limits, including `off`, `summon`, `levels`, `max_level`, and excluded promote/talent/aura/skin IDs.
- `lovers`: per-template exclusions, summon switches, excluded bond branches, presences, and skins.
- `conclave_off`: optional per-attribute exclusions.

The captured client splash flow presents these stages in order: Conclave, levels and breakthroughs, summon, auras, talents, skins, Scarlet Bonds, and Presences. The Quick API response contains targets for Conclave, levels, bonds, auras, skins, talents, and presences. It does not contain a Courtyard target; the local Quick plan therefore leaves Courtyard unchanged.

Only one non-empty Quick response was captured. It returned Warden targets 10270→3, 10280→7, 10300→10, and 10960→3; four first flat bond levels for Lover 20170; and two scroll levels for Warden 10540. A second distinct response disabled Blood, breakthrough items, Conclave, Trust, talent items/EXP, skin cards, and fabric and returned no planned changes. The third distinct request duplicated the first request/response pair.

Important limitation: the HAR contains the browser's Quick UI/client code and calls to the server endpoint, but not the server-side optimization implementation. The client code confirms the settings model, response mapping, animation sequence, and replacement/undo behavior; it does not reveal the optimizer's internal candidate ranking or tie-breaking rules. Therefore the local implementation is a deterministic offline optimizer with explicit confidence warnings, not a claim of byte-for-byte parity with the server optimizer.

Local Quick allocation uses a single mutable inventory ledger: each stage reserves items before later stages can consume them. Resource switches mask the corresponding budgets before planning. Quick plans are deltas: unchanged Warden levels and breakthrough targets are omitted, and Courtyard is not modified by Quick Calculation.

## Confidence policy

- **Exact API observation**: directly returned by a successful API response.
- **Exact interval**: aggregate cost is exact for the captured from/to pair; individual intermediate level costs are not implied.
- **Approximation only**: formula retained from the previous engine but not validated by these captures.
- **Not captured**: no test result for the behavior in these HAR files.

Never present an approximation as an exact game formula.

## Known parity gap identified by the HAR comparison

For the captured Warden upgrade scenario 10270, level 1 -> 3, the server returns a gain of 50 while the current local attribute formula returns 9. The blood interval is exact (384), but the stat-gain formula is **not** yet reconciled. The engine now exposes `baseGainConfidence: approximation_only`; this value must not be presented as exact until additional evidence resolves the discrepancy.


Validation is run in GitHub Actions for this feature branch before merging.

## Exact Warden dominance gains

The captured dominance response includes exact gains for four level intervals: Warden 10270 (1→3: 50), 10280 (1→7: 641), 10300 (1→10: 2,051), and 10960 (1→3: 57). The engine stores these as captured-account observations, separate from its local estimate. They are not substituted into the generic formula because the HAR does not fully describe every profile modifier that contributed to the server result. The general level-gain formula remains approximation-only.

## Conclave cost parity

The captured dominance response for Conclave levels 5, 6, 7, and 8 reports next-step costs 6,014, 6,132, 6,250, and 6,368. These match the canonical destination-level table rows 6–9 and are covered by the HAR parity test.


## Third HAR capture: 2026-11-13

The third supplied HAR contains 322 network entries: 308 HTTP 200 responses, 3 HTTP 201 responses, and 11 HTTP 204 responses. The account-scoped URL segment is represented here as `{account}`; no account ID, cookie, authorization header, Telegram init data, or session token is retained in the repository.

### Dominance response is the authoritative calculation record

The browser sequence contains `POST /api/v1/accounts/{account}/calculations/quick` followed by `POST /api/v1/accounts/{account}/calculations/dominance`. Quick returns the proposed target map; the dominance response contains the calculated result. For Warden levels, the fields to preserve are:

- `level` and `target`: captured interval endpoints;
- `cost`: exact aggregate Blood cost for that interval;
- `next_cost`: server-reported cost of the level after the target;
- `promote` and `promote_after`: breakthrough state before and after the plan.

The third capture adds these exact aggregate intervals (costs are Blood):

| Warden template | Interval | Exact cost | Next cost |
|---:|---:|---:|---:|
| 10260 | 1→50 | 894,737 | 89,785 |
| 10260 | 1→51 | 984,522 | 93,374 |
| 10300 | 1→58 | 1,720,812 | 122,150 |
| 10300 | 1→77 | 4,960,329 | 232,490 |
| 10300 | 1→85 | 7,026,700 | 293,043 |
| 10300 | 1→100 | 12,338,141 | 434,739 |
| 10500 | 2→80 | 5,679,151 | 254,218 |
| 10490 | 50→51 | 89,785 | 93,374 |
| 10490 | 50→61 | 1,206,554 | 136,440 |
| 10500 | 2→95 | 10,339,710 | 380,479 |
| 10950 | 182→197 | 57,584,118 | 4,278,313 |
| 10950 | 182→196 | 53,362,888 | 4,221,230 |
| 10950 | 182→191 | 33,096,771 | 3,942,763 |
| 10950 | 182→186 | 14,188,250 | 3,675,875 |

These are exact aggregate observations for the recorded interval and breakthrough state only. They do not fill in all intermediate per-level costs. A repeated interval for Warden 10260 (1→50) returned the same Blood cost (894,737), while its `gain` value differed between responses (35,246 versus 49,549). Consequently the supplement stores costs and next costs, but deliberately omits server gain values: those depend on the captured account state and must not be generalized as a universal Warden formula.

### Additional calculation response contracts

- `GET /api/v1/accounts/{account}/calculations/talent-points` returns `minimum`, `expected`, `exp_points`, per-Warden `exp`, `points`, `left`, `room` and `plan`, item point contributions, `manuscripts`, and star `tiers` with chance/protection values. The numeric current-EXP values and plans are account-specific; only the response shape is recorded here.
- `GET /api/v1/accounts/{account}/calculations/lover-points` returned intimacy min/expected/max of 10/12/16 for two bags of item 4232, and attraction 2/2/2 for two bags of item 4221.
- `GET /api/v1/accounts/{account}/calculations/guild-exp` returned 160 min/expected/max guild EXP for eight units of item 30021, with `donation_days: 3`. This is a captured scenario, not a full level/price table.
- The third capture again returned the shared Conclave and Courtyard level templates (180 and 210 rows respectively). These endpoints are shared template data; the account-scoped calculation responses remain profile-dependent.

### Local extraction workflow

The repository now includes `scripts/extract-har-observations.js`. Run it locally against a HAR file:

```bash
node scripts/extract-har-observations.js capture.har sanitized-observations.json
```

The generated JSON contains only changed-Warden interval costs and next-level cost observations from successful dominance responses. It excludes account IDs, request bodies, headers, cookies, authorization values, and gain fields. The original HAR stays local and should never be committed. Review the extracted output before merging it into the canonical observation data.
