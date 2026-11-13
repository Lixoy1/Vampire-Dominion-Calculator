# HAR-grounded reconstruction

This document records only observations confirmed by the two supplied HAR captures. Private account identifiers, cookies, authorization headers, Telegram init data, and session tokens are intentionally excluded.

## Successful template responses

The captures include successful HTTP 200 responses for:

- `GET /api/v1/templates/wardens?detailed=true`: 68
- `GET /api/v1/templates/lovers?detailed=true`: 45
- `GET /api/v1/templates/items`: 240
- `GET /api/v1/templates/warden-promotes`: 8
- `GET /api/v1/templates/conclave-levels`: 180
- `GET /api/v1/templates/courtyard-levels`: 210

The canonical catalog now contains all 240 item templates. Three previously missing skin items were added: 10464101, 20464101, and 30464101.

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

These are exact **aggregate intervals**, not enough evidence to reconstruct every per-level cost. The legacy per-level exponential curve remains approximation-only outside exact intervals.

The same dominance responses confirm first-step Scarlet Bond costs:

- Flat bond level 0 -> 1: 0 affinity; next flat step: 20.
- Percent bond level 0 -> 1: 20 affinity.

Higher bond levels are not covered by these captures and remain unverified.

A successful `GET /calculations/lover-points` scenario confirms that 2 units of item 4232 yield 10 minimum, 12 expected, and 16 maximum intimacy points.

## Calculation endpoint coverage

The captures include these calculation endpoints:

- `POST /calculations/dominance`
- `POST /calculations/quick`
- `GET /calculations/talent-points`
- `GET /calculations/lover-points`
- `GET /calculations/guild-exp`

Dominance responses expose detailed sections for Conclave, levels, bonds, auras, presences, skins, talents, courtyard, and books. Quick calculation responses expose planned changes for Conclave, levels, bonds, auras, skins, talents, and presences.

## Confidence policy

- **Exact API observation**: directly returned by a successful API response.
- **Exact interval**: aggregate cost is exact for the captured from/to pair; individual intermediate level costs are not implied.
- **Approximation only**: formula retained from the previous engine but not validated by these captures.
- **Not captured**: no test result for the behavior in these HAR files.

Never present an approximation as an exact game formula.

## Known parity gap identified by the HAR comparison

For the captured Warden upgrade scenario 10270, level 1 -> 3, the server returns a gain of 50 while the current local attribute formula returns 9. The blood interval is exact (384), but the stat-gain formula is **not** yet reconciled. The engine now exposes `baseGainConfidence: approximation_only`; this value must not be presented as exact until additional evidence resolves the discrepancy.
