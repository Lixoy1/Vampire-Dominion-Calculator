# HAR API map

This is a route-level inventory of the two supplied HAR captures. Account IDs are replaced with `{account_id}`; user IDs, cookies, authorization headers, Telegram init data, and other session material are deliberately omitted. Counts are combined across both captures and may include repeated page loads.

## Initialization and account context

| Method | Route | Captures | Purpose |
|---|---|---:|---|
| GET | `/api/v1/me/game-login` | 60 | Game-link / login state |
| GET | `/api/v1/me` | 24 | User settings and plan |
| GET | `/api/v1/me/subscription` | 22 | Subscription state |
| GET | `/api/v1/me/subscription/payments` | 20 | Payment history |
| GET | `/api/v1/maintenance` | 29 | Maintenance state |
| GET | `/api/v1/limits` | 2 | Server limits |
| GET | `/api/v1/locales` | 7 | Available locales |
| GET | `/api/v1/locales/ru` | 2 | Russian translations |
| GET | `/api/v1/accounts` | 30 | Account list |
| POST | `/api/v1/accounts` | 2 | Create account |
| GET | `/api/v1/accounts/{account_id}/summary` | 59 | Account summary |
| GET | `/api/v1/accounts/{account_id}/quick-template` | 11 | Active quick-calculation preset |
| GET | `/api/v1/me/quick-templates` | 11 | Built-in and saved quick presets |
| GET | `/api/v1/accounts/{account_id}/sync/free-rewards` | 2 | Free synchronization rewards |
| PATCH | `/api/v1/accounts/{account_id}` | 27 | Account resources and profile fields |

## Canonical templates

| Method | Route | Captures | Successful template count |
|---|---|---:|---:|
| GET | `/api/v1/templates/wardens?detailed=true` | 2 | 68 |
| GET | `/api/v1/templates/lovers?detailed=true` | 2 | 45 |
| GET | `/api/v1/templates/items` | 2 | 240 |
| GET | `/api/v1/templates/warden-promotes` | 2 | 8 |
| GET | `/api/v1/templates/conclave-levels` | 2 | 180 |
| GET | `/api/v1/templates/courtyard-levels` | 2 | 210 |

## Account state and detail routes

| Method | Route | Captures |
|---|---|---:|
| GET | `/api/v1/accounts/{account_id}/wardens` | 219 |
| GET | `/api/v1/accounts/{account_id}/lovers` | 111 |
| GET | `/api/v1/accounts/{account_id}/items` | 12 |
| GET | `/api/v1/accounts/{account_id}/conclaves` | 19 |
| GET | `/api/v1/accounts/{account_id}/skin-store` | 32 |
| GET | `/api/v1/accounts/{account_id}/skin-store/skins` | 20 |
| GET | `/api/v1/accounts/{account_id}/wardens/{warden_id}/attributes` | 98 |
| GET | `/api/v1/accounts/{account_id}/wardens/{warden_id}/talents` | 15 |
| GET | `/api/v1/accounts/{account_id}/wardens/{warden_id}/auras` | 12 |
| GET | `/api/v1/accounts/{account_id}/wardens/{warden_id}/skins` | 10 |

## Calculation routes

| Method | Route | Captures | Response sections |
|---|---|---:|---|
| POST | `/api/v1/accounts/{account_id}/calculations/dominance` | 81 | Total dominance, attributes, Conclave, levels, bonds, auras, presences, skins, talents, courtyard, books |
| POST | `/api/v1/accounts/{account_id}/calculations/quick` | 9 | Proposed Conclave, levels, bonds, auras, skins, talents, presences |
| GET | `/api/v1/accounts/{account_id}/calculations/talent-points` | 12 | Minimum/expected points, Warden capacity, items, manuscripts, chance tiers |
| GET | `/api/v1/accounts/{account_id}/calculations/lover-points` | 4 | Intimacy and attraction min/expected/max |
| GET | `/api/v1/accounts/{account_id}/calculations/guild-exp` | 2 | Guild experience min/expected/max and donation days |

## Observed write operations

The captures include these local account-editing operations:

- `PATCH /accounts/{account_id}/wardens/batch`: bulk Warden level, breakthrough, talent experience, and skin state.
- `POST /accounts/{account_id}/wardens/batch`: add Wardens.
- `PATCH /accounts/{account_id}/wardens/{warden_id}/attributes/{attribute}`: book contribution by attribute.
- `PATCH /accounts/{account_id}/wardens/{warden_id}/talents/{position}`: set talent level.
- `PATCH /accounts/{account_id}/wardens/{warden_id}/auras/{aura_id}`: set aura level.
- `POST /accounts/{account_id}/lovers/batch` and `PATCH /accounts/{account_id}/lovers/batch`: add and update Lovers.
- `PUT /accounts/{account_id}/items/batch`: set inventory counts.
- `PATCH /accounts/{account_id}/conclaves/{attribute}`: set Conclave level.
- `PATCH /accounts/{account_id}/skin-store/skins`: set skin-store levels.
- `PATCH /accounts/{account_id}`: set blood, Conclave experience, Courtyard level/experience, profile name and portrait.

The independent calculator will reproduce these as local profile-editing actions. It will not send writes to the original service.

## Important interpretation

The HAR files prove that these routes and response shapes were exercised. They do not contain server-side source code. The browser JavaScript chunks are UI and API-client modules; the authoritative calculation logic runs behind the API. Therefore formula reconstruction must be based on response differentials and explicit confidence labels, not on the assumption that frontend chunks contain the server formulas.
