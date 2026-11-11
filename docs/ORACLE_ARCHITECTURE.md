# Server Oracle — архитектура и контракт

## Цель

Калькулятор не подключается к Game of Vampires. Игрок вручную переносит в профиль фактические значения со своего игрового экрана. Единый Oracle на backend Render рассчитывает прогнозы по введённым значениям, базе каталога и текущей версии расчётного движка.

Важно различать:
- **Входные значения** — введены игроком и соответствуют тому, что он видит в игре на момент ввода.
- **Расчётный результат** — рассчитан сервером проекта по текущим формулам и таблицам.
- **Не подтверждённые формулы** — явно помечаются как приближённые/оценочные; не становятся «точными» только потому, что считаются на сервере.

Oracle не утверждает, что его ответ является ответом Game of Vampires. Он гарантирует единое место выполнения наших расчётов, а не синхронизацию с игровым сервером.

## Происхождение данных и уровни доверия

Каталог проекта содержит справочные данные, полученные из API стороннего бота «Помощник Дампира». Это источник A — полезный источник для наполнения каталога, но не официальный API Game of Vampires и не подтверждение того, что каждое поле совпадает с текущим состоянием игры.

Oracle публикует это происхождение в `meta.catalogProvenance` и `GET /api/oracle/meta`:
- `sourceId: dhampir-helper-api`;
- `sourceType: third-party-bot-api`;
- `trustLevel: reference-unverified`;
- `gameServerVerified: false`.

Подтверждённые значения самой игры — источник B. Они появляются только после отдельной сверки игроком с игровым интерфейсом или получения достоверного игрового контрольного примера. Пока такие контрольные значения не внесены, Oracle возвращает `meta.gameVerification.status: not-verified`.

Не смешиваем:
1. справочные сведения стороннего бота;
2. значения профиля, которые игрок вручную переписал из игры;
3. формулы и результаты, рассчитанные нашим движком;
4. значения, независимо подтверждённые в игре.

Наличие данных в API стороннего бота не повышает статус расчётной формулы до точной. Для обновления каталога нужны полные исходные JSON-ответы, время получения, версия/регион источника (если доступны), проверка схемы, дубликатов и полноты. Частичный фрагмент JSON нельзя выдавать за полный каталог.

## Поток данных

1. Игрок вводит кровь, очки Конклава и Сада, уровни смотрителей, таланты, опыт, Вдохновения, Веяния, близость, очки Доверия, уровни Кровных уз, уровни обликов и количество предметов.
2. Клиент отправляет профиль и план в `POST /api/oracle/calculate`.
3. Render нормализует входные данные, подставляет каталог проекта и запускает расчётный движок.
4. Клиент отображает ответ Oracle. При ошибке запроса локальный fallback запрещён: интерфейс показывает ошибку и кнопку повтора.
5. При применении плана Oracle повторно проверяет ресурсы и возвращает обновлённую копию профиля. Клиент сохраняет её локально.

Профиль не хранится на backend. API stateless: каждый запрос содержит нужный профиль и план; после вычисления данные не сохраняются на сервере приложения.

### Импорт снимков помощника

`POST /api/oracle/import-helper` принимает `{ account, snapshots }`, где `snapshots` — массив отдельных JSON-ответов/массивов записей из API «Помощника Дампира». Импортёр поддерживает строки смотрителей (`template_id`, `level`, `promote_id`, `talent_exp`, `filled`, `dominance`), Кровные узы (`template_id`, `level`, `percent_level`), облики (`kind`, `owner_id`, `template_id`, `level`), атрибуты Конклава, записи сумки с количеством и объект опыта/уровня Гильдии. Каждый ID сверяется с локальным каталогом; неизвестные/неподдерживаемые записи учитываются в `summary.skipped`.

`filled` и `dominance` сохраняются в `account.helperImport` как значения стороннего источника, отдельно от игровых расчётов. Записи не становятся подтверждёнными данными Game of Vampires. Импорт не может восстановить пропущенные в дампе ресурсы, например Близость или Доверие; их нужно проверить и ввести вручную. Клиент может выбрать несколько отдельных JSON-файлов, после чего профиль отправляется на сервер для преобразования и возвращается без серверного хранения.


## HTTP API

Все ответы JSON. Успешный транспортный ответ имеет форму `{ ok: true, result: ... }`; ошибки — `{ ok: false, error: { code, message } }`.

| Маршрут | Назначение |
|---|---|
| `GET /api/oracle/meta` | Версия Oracle/схемы, секции и ограничения точности |
| `POST /api/oracle/calculate` | Сводный снимок всех расчётов по профилю и плану |
| `POST /api/oracle/auto-conclave` | Автораспределение очков Конклава |
| `POST /api/oracle/auto-distribute` | Единое автораспределение плана |
| `POST /api/oracle/commit-plan` | Проверка ресурсов и атомарное применение плана к копии профиля |
| `POST /api/oracle/summon` | Проверка доступности призыва смотрителя и списание предметов |
| `POST /api/oracle/summon-lover` | Проверка доступности призыва возлюбленной и списание предметов |
| `POST /api/oracle/import-helper` | Импорт нескольких JSON-снимков стороннего помощника в ручной профиль с проверкой ID каталога |

API принимает только JSON-объект с `account`; при отсутствии профиля возвращается HTTP 400. Тело ограничено 256 KB, расчётные маршруты ограничены 120 запросами в минуту на IP и возвращают HTTP 429 при превышении. Ответы Oracle отправляются с `Cache-Control: no-store`.

## Разделы ответа

Снимок `calculate` включает:
- `report` — общий прирост и расход ресурсов, включая отдельное поле оценки призыва;
- `conclaveBranches` и `courtyardUpgrade`;
- `wardens` — сводки талантов, опыт, базовые атрибуты, стоимость выбранного повышения и Вдохновения;
- `lovers` — Кровные узы и Веяния;
- `inventory` — серверная группировка предметов сумки и их количества;
- `skins` — текущий уровень, лимит, качество, стоимость уровня в ткани и требование ткани до максимума;
- `summonCandidates` — доступность призыва смотрителей и возлюбленных;
- `warnings` — оговорки точности.

Метаданные включают версии Oracle, схемы, движка и каталога, время расчёта, источник входа `player-entered`, происхождение каталога в `catalogProvenance`, отдельный статус `gameVerification`, `gameConnected: false` и `stateless: true`.

## Единый источник расчёта

Браузер больше не импортирует расчётные методы из `js/engine.js`. Он отправляет входные значения в Oracle, получает структурированный результат и использует его для отображения разделов. В браузере остаются обработчики пользовательского ввода, локальное сохранение/импорт/экспорт, поиск по каталогу и отрисовка интерфейса.

`js/engine.js` остаётся расчётным модулем, но импортируется только серверным `oracle.js`. Это позволяет централизованно менять формулы и таблицы, не поддерживая две отдельные реализации — в браузере и на сервере.

## Ограничения точности

На текущем движке специально помечены:
- стоимость уровней смотрителей в Крови — аппроксимация кривой прогрессии;
- стоимость Кровных уз — формульная оценка;
- прирост Господства от призыва — оценка, которая исключена из поля `report.gain.total` и показана отдельно в `report.gain.summon` / `report.gain.totalWithSummonEstimate`.

Серверное исполнение не делает эти формулы точными. До публичного релиза требуются контрольные примеры: игрок фиксирует исходное состояние, вводит его в калькулятор, сравнивает прогноз стоимости/прироста с игровым результатом, а затем сохраняет вход, версию каталога, ожидаемый результат и фактический результат как регрессионный тест.

## Безопасность и приватность

- Не запрашиваются игровой пароль, игровой токен, session cookie или вход через Google/VK/Facebook.
- Никакие запросы в Game of Vampires и её CDN не выполняются.
- Telegram Bot Token используется только на backend для Telegram-бота и проверки Telegram Mini App initData; он не отправляется в браузер.
- Профили передаются для расчёта только по запросу игрока и не записываются в базу Render.
- Входная нормализация ограничивает диапазоны уровней и объёмы числовых ресурсов.

## Проверки

Локально и в GitHub Actions:
- `npm run check` — синтаксис server, Oracle и клиентских файлов.
- `npm test` — тесты расчётного движка, Oracle, HTTP API и smoke test девяти вкладок.
- `npm run verify:icons` — локальные WebP-иконки.

Проверка API запускает отдельный экземпляр Express на временном порту, вызывает health/meta/calculate и проверяет ошибочный вход без профиля.

Публичный релиз возможен после зелёного CI, проверки реального Render deployment и сверки отмеченных приближённых формул по игровым контрольным данным.


## Skin upgrade transaction

The account's current skin level is separate from the planned target (`plan.skins[skinId]`). Oracle resolves each target against the catalogue and current account state, then computes card and fabric usage. A skin's own card item (same ID as the skin) is consumed before quality fabric: A = item 4421 / 50, S = 4422 / 100, SS = 4423 / 200 per level. Fabric is rejected for non-purchasable skins. The commit validates all required resources before mutating the cloned account, updates skin levels and adds the catalogue `store_exp` for each gained level. This changes shop experience, not the exact dominance total. Automatic skin ranking is intentionally withheld until trustworthy per-level `next_gain` data is available for every skin.


## Aura and presence reporting

The calculation response exposes `report.modifiers` with per-attribute aura percentages split into `talent` and `book` buckets, plus per-attribute presence percentages. The values use the existing engine formulas (`calcAuraPercent` and `calcPresencePercents`) and the imported presence curve table. These are modifier percentages, not absolute dominance points: they are intentionally excluded from `report.gain.total` until the game's exact stacking/rounding rules can be checked against a game-side reference result. The UI presents them separately in the dominance dashboard.


## Presence upgrade transaction

The plan accepts absolute target levels at `plan.presences[loverId][presenceId]` for owned, updatable presences only. The server clamps targets to the catalogue range and derives token cost from the matching `lover_presence_levels` rows for each newly reached level, charging the presence template's `upgrade_item_id`. Preview exposes `report.presenceUpgrade.byItem` and `byPresence`; planned presence percentages are reflected in the modifier breakdown. Commit validates token inventory before applying target levels and deducting tokens. Collection presences remain account state and cannot be upgraded through this path.


## Presence auto-distribution

`POST /api/oracle/auto-presences` plans upgrades for owned, updatable presences using the per-level costs in `lover_presence_levels`. The optimizer reserves any already-planned presence costs first, then spends remaining matching tokens on the next affordable level with the greatest summed percentage-point increase per token. The full `/api/oracle/auto-distribute` path runs this same step after Warden, talent and summon reservations. It returns `summary.addedLevels`, `summary.addedPercentPoints` and per-item reservations.

This is a percentage-modifier allocation heuristic, not a dominance-point optimizer. Percent modifiers remain excluded from `report.gain.total` because exact in-game stacking and rounding have not been verified. Aura auto-upgrades are not included: current aura catalogue rows identify the upgrade item and percentage step, but do not provide an authoritative per-level item cost table.
