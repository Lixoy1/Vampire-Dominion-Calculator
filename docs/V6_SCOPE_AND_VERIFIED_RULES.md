# Crimson Obsidian V6 — scope, verified behaviour and implementation contract

## Product goal

Build a completely free Vampire Dominion companion as a Telegram Mini App / responsive web app. It should retain the reference calculator's useful sections and planning workflows, but use the Crimson Obsidian visual identity and have no VIP/Plus gates, account caps, paid auto-calculation or premium-only features.

The project is a calculator and planner. It must not claim to read the live game account automatically unless a supported official API or export format becomes available.

## Existing project baseline

The current repository is a working vanilla JavaScript ES-module app:

- `index.html` loads `js/app.js`, `js/data.js`, `js/engine.js` and the CSS.
- `server.js` serves the Mini App and optionally starts a grammY Telegram bot.
- The browser stores profiles and calculator state locally and supports JSON import/export.
- The app currently has nine sections: Dominance; Conclave and Courtyard; Warden Levels and Blood; Talents and EXP; Auras and Presences; Scarlet Bonds; Skins; Summoning; Bag and event points.
- The checked-in tests assert 68 Wardens, 45 Lovers, 237 Items, 8 promotion tiers, 180 Conclave rows, 210 Courtyard rows, 155 Presence curve rows and 496 referenced local WebP icons.
- Existing source tables and icons must be preserved and extended rather than replaced.

The latest captured catalogue-count response differs from the checked-in database: it reports 240 Items and 108 Skins. This difference must be reconciled record-by-record before database cardinality assertions or user data are changed. Do not silently overwrite the existing catalogue.

## What is already present

- Multiple local profiles/accounts and profile switching.
- Manual resource and character state entry.
- JSON backup and restore.
- Inventory editing and search/category filtering.
- Conclave and Courtyard level tables and spending calculations.
- Warden level/promote planning.
- Talent level and EXP inputs.
- Aura and Presence level inputs.
- Lover closeness, affinity and Scarlet Bond controls.
- Skin level inputs.
- Warden summon candidate list.
- Intimacy, Attraction and Guild EXP bag calculators.
- A combined report and a basic auto-distribution routine.
- Local, hashed WebP character/item icons.

These are implemented features, not proof that every calculation is already wired into one complete end-to-end planner.

## Audit findings — gaps to close

### 1. The combined report is incomplete

The current `calculateTotalDominanceReport` combines Conclave, Courtyard, Warden levels, Scarlet Bonds and selected Warden summons. It does not yet aggregate a complete attribute breakdown for Talents, Auras, Presences, Skins or Lover summons. The final report must expose both an overall total and a per-attribute/per-source breakdown.

### 2. Auto-distribution is not yet a full Oracle

The current top-level auto-distribution routine plans Conclave, Courtyard and Warden levels, then selects eligible Warden summons. It does not yet optimize every supported source (Talents/manuscripts/EXP, Auras, Presences, Bonds, Skins and Lover summons) under one shared resource budget.

The V6 Oracle must reserve each item/resource in a single temporary ledger. A resource spent by one recommended action cannot be spent again by another. The proposed plan must be previewable, editable, resettable and atomically applicable.

### 3. Applying a plan must cover every planned category

The current plan-commit path validates and applies several resource families, including Blood, Conclave/Courtyard points, promote items, affinity and Warden summons. It does not yet commit every visible category such as Skin levels, Talent/script/scroll allocations, Aura/Presence upgrades and Lover summons.

V6 must have one validation pass against a cloned account, followed by one commit only after every check passes. Failed validation must leave the original profile and inventory untouched.

### 4. Some formulae are explicitly approximate

The checked-in code labels Blood-per-level cost as an approximation. The current Scarlet Bond cost functions are also modelled by local polynomial expressions, not yet proven to match every server level. Do not describe these as exact game-server formulas until multiple level-by-level checks confirm them.

Where captured responses expose `next_cost`, `next_gain`, `max_target`, `best_path`, `minimum`, `expected` or `maximum`, preserve those values and use them as reference vectors. A single next-step sample is not enough to extrapolate a complete cost curve.

### 5. Distinguish state from plans and results

- Current account state (what the player owns and has already levelled) is separate from a target plan.
- A planner's `best_path.runs` is a suggested sequence, not evidence that those levels have already been applied.
- `next_gain` is a next-step value, not automatically a total gain for all planned levels.
- `null` must remain distinct from numeric zero.
- Warden and Lover IDs are different entity namespaces; join them only through the catalogue's explicit relationship fields.
- Closeness unlocks Scarlet Bond branches; Affinity is a spendable resource. Keep these separate.
- Presence curves and collection-style Presences are different types and must retain their specific rules.
- Skin ownership, summon status, purchase eligibility, card count and fabric cost are separate inputs.

## Calculation source-of-truth policy

Use this evidence order:

1. Captured server calculation response or a validated in-game result for the exact account/state.
2. Explicit catalogue/table values (cost rows, level curves, unlock thresholds, item metadata).
3. A formula that has passed multiple independent test vectors, including boundaries.
4. Approximation only as a clearly labelled fallback when exact data is unavailable.

Never turn a plausible pattern into an asserted game formula. Unknown or incomplete calculations should be marked as unverified and shown separately rather than silently included in the official total.

Captured response snapshots should become deterministic test fixtures. For each fixture, record the account input, plan input and expected result. Compare all four attributes, section totals, resource costs, remaining balances and null/empty behaviour.

## Target functional architecture

### Data and state

- Keep one normalized catalogue with Wardens, Lovers, Items, Promotes, Conclave levels, Courtyard levels, Presence curves and all skin/aura/presence/bond templates.
- Keep per-profile account state separate from per-profile plan state.
- Preserve original IDs, null values, empty arrays and icon paths.
- Support manual entry, unlimited local profiles and JSON import/export without subscription checks.

### Calculation modules

- `DominanceEngine`: calculate current and planned contribution by attribute and by source.
- `OracleEngine`: find a high-value feasible plan using the selected goal and enabled spending categories.
- `InventoryLedger`: reserve and reconcile all resources across proposed actions.
- `SnapshotAdapter`: normalize captured calculator/server responses into a stable internal contract and fixture format.

The engines must be pure functions where possible: inputs in, results out, no DOM or localStorage mutation.

### Oracle planning rules

- Allow one target: Strength, Allure, Intellect, Spirit or overall balanced growth.
- Respect all selected include/exclude toggles and per-character caps.
- Optimize contribution per resource only where the resource and gain are comparable.
- Respect unlocks, summon eligibility, promotion requirements, item counts and shared reservations.
- Explain every recommendation: cost, expected gain, remaining resources, blocking condition and why it was selected.
- Never spend resources implicitly; the user reviews and applies the proposed plan.

### User experience

- Mobile-first Telegram Mini App and browser layout.
- Keep the nine major functional sections and preserve horizontal swipe navigation.
- More distinctive buttons: polished gradient surfaces, clear primary/secondary/destructive hierarchy, press states, focus states and readable disabled states.
- Compact profile/account controls; theme and language remain easy to reach.
- Result cards should make total gain, four attributes, section sources, cost and remaining inventory immediately understandable.
- Add explicit actions for calculate, apply plan, reset plan, save calculation, export and import.
- Light and dark themes, Russian and English strings, safe-area support and reduced-motion support.
- Every calculation and planning control is free; there is no Plus/VIP state or feature gating.

## Game connection boundary

Telegram Mini App `initData` proves the Telegram user context; it is not a Game of Vampires login. The current checked-in project does not implement a supported game-account API connector. Do not ask for or store the player's game password, Google/VK/Facebook password, cookies or session tokens. Until the game publisher provides an official API/SDK or supported export, keep local manual profiles and JSON import/export as the honest supported workflow.

## Delivery gates

1. Reconcile the latest catalogue additions against the checked-in database without deleting existing records or icons.
2. Add server-response fixtures and write parity tests before replacing approximate formulas.
3. Complete the per-attribute Dominance breakdown and verify it against captured outputs.
4. Complete the shared-ledger Oracle and atomic plan application across all supported categories.
5. Connect each tab to the same account/plan state and correct all summary totals.
6. Run syntax checks, unit tests, app smoke tests and icon verification.
7. Test the Telegram WebView interaction model, mobile horizontal navigation, profile persistence, import/export and both themes.
8. Deploy only after the test gates pass; describe any remaining unverified formula honestly.

## Additional parity findings from account snapshots

- For Warden 10170 at level 1, the captured server response reported next blood cost 115 and next gain 7.
- For Wardens 10540 and 10660 at level 5, the captured server response reported next blood cost 961, with next gains 105 and 562 respectively.
- The current local exponential blood-cost approximation does not reproduce those checkpoints (for example, it returns 100 at level 1 and approximately 130 at level 5). Therefore plans which change Warden levels are marked approximate and cannot be committed until the curve is reconciled.
- Scarlet Bond cost curves are also approximate. A single response showed flat next costs of 0 and percentage next costs of 20/54 for one account/target; those values are not enough to derive a universal curve.
- The latest catalogue-count JSON reports 240 items and 108 skins while the checked-in catalogue contains 237 items and 105 skins. Do not add synthetic records; reconcile the exact IDs and metadata first.
- The server `summon:false` flag was observed alongside zero summon cost for some candidates. A zero cost does not imply a free or available summon.

## Current release boundary

The current branch has a tested Telegram Mini App shell, local profiles, the catalogue, JSON import/export, a snapshot viewer, and a shared inventory ledger. The local Dominance report is deliberately partial. It must not be presented as an exact full-game total until Talents, Auras, Presences, Skins and all level/bond formulas are integrated and checked against multiple server snapshots. The Oracle remains a staged implementation rather than a completed global optimiser.
