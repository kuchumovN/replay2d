# Skybox для CS2 — контекст проекта

Веб-приложение: открываешь `.dem` CS2 → матч проигрывается в 2D сверху на радаре карты (а-ля Skybox).
Браузерная версия парсит демку прямо в браузере (WASM), сервер не нужен; десктоп — Electron с нативным парсером.
Пользовательская документация — `README.md`. Этот файл — для продолжения разработки.

## Согласованные с пользователем решения (не менять без вопроса)

- Парсинг через demoparser2. Веб — WASM-сборка в Web Worker, без сервера (статический сайт); десктоп — нативный
  `@laihoe/demoparser2` (Rust/NAPI) через локальный Fastify. Режим веб-сервера (`npm start`, загрузка файла) убран.
- WASM собирается локально (rustup + wasm-pack) и в CI; результат не коммитится.
- Публичная версия — GitHub Pages: https://kuchumovn.github.io/skybox-cs2/, деплой на каждый push в `main`
  (`.github/workflows/pages.yml`). Радары выкладываются вместе с сайтом.
- Источник демок — только локальный файл (drag&drop). Без URL/FACEIT/share codes.
- MVP: позиции + взгляд, гранаты, килфид + скорборд, бомба + выстрелы, таймлайн раундов. Всё сделано.
- Фронт: React + TypeScript + Canvas 2D (Vite). UI на английском, общение с пользователем — на русском.
- Радары скачиваются скриптом из https://github.com/MurkyYT/cs2-map-icons (в git не коммитятся).
- Многоуровневые карты (Nuke, Vertigo, Train): радары рядом, уровень игрока по Z (`verticalsections`).
- Хранение: только текущая сессия — в браузере в памяти вкладки (последние 3 демки, перезагрузка закрывает демку),
  в десктопе в памяти сервера (последние 3).

Десктоп (решения пользователя): Electron (своё окно), без подписи кода (для себя и друзей), радары вшиты в
приложение, открытие демок — drag&drop/выбор файла (без ассоциации .dem и списка недавних), сборка в GitHub
Actions + Releases, macOS — только Apple Silicon (Intel не поддерживается).

Решения, принятые мной самостоятельно (пользователь пока не подтверждал — можно спросить при случае):
раунд открывается за 5 с до конца freeze time (`LEAD_IN_SECONDS`); ↑ — предыдущий раунд, ↓ — следующий;
`.dem.gz`/CS:GO-демки отклоняются с ошибкой; id демки хранится в URL-хэше `#/demo/<id>`; в браузере после
перезагрузки — возврат на экран загрузки с сообщением «Open the file again»; на экране загрузки (только веб)
подпись «Demos are parsed in your browser and never uploaded.»; SIMD в WASM (Safari ≥ 16.4).

## Правила работы

- Перед реализацией фичи с неоднозначностью (поведение UI, API, архитектура) — спросить через AskUserQuestion, все вопросы разом.
- Коммитить/пушить только по просьбе. Remote: `git@github.com:kuchumovN/skybox-cs2.git` (публичный), ветка `main`. Автор коммитов — `nkuchumov010@gmail.com`; рабочий адрес нигде не должен фигурировать.
- Стиль: TS strict, комментарии в коде на английском и только там, где неочевидно; ESM, импорты сервера с `.js`.
- После изменений: `npm test` и `npm run typecheck`; для UI — визуальная проверка (см. ниже).

## Команды

```sh
npm install --cache <scratchpad>/npm-cache   # см. «Окружение»: ~/.npm с root-owned файлами
npm run fetch-maps                            # радары → web/public/maps (+ maps.json); `-- de_nuke` — выборочно
npm run build-wasm                            # WASM-парсер → web/src/parse/demoparser (нужен до typecheck/build)
npm run dev                                   # Vite http://localhost:5173 (парсинг в браузере)
npm run build                                 # статический сайт → web/dist (base './', любой путь хостинга)
npm run desktop                               # десктоп из исходников (bundle + electron)
npm run desktop:dist                          # установщик под текущую ОС → desktop/release/
npm test                                      # vitest (shared, server, web, scripts)
npm run typecheck                             # tsc для server, web, scripts, desktop
```

## Архитектура

npm workspaces: `shared/` (типы + пайплайн парсинга), `server/` (бэкенд десктопа), `web/`, `desktop/`; `wasm/` — Rust.

Пайплайн один (`shared/src/parse/pipeline.ts`, `parseDemo(parser: DemoParser, ...)`), парсер подставляется:
- Браузер: `api.openDemo` → `web/src/parse/local.ts` создаёт Web Worker на каждую демку (память WASM не
  уменьшается — воркер завершается) → файл кусками по 16 МБ копируется в память WASM (`DemoFile`) →
  `parseDemo` → meta + rounds постятся на страницу и хранятся в `Map` вкладки; id — случайная строка.
- Десктоп: `POST /api/demos/local` (путь + токен) → worker thread с нативным парсером → опрос
  `GET /api/demos/:id` (`ParseStatus`) → `GET /api/demos/:id/rounds/:n` (1-based). `api.ts` выбирает путь по
  `desktop?.pathForFile(file)`; `getStatus`/`getRound` сначала смотрят демки вкладки.

| Файл | Роль |
|---|---|
| `shared/src/types.ts` | `MatchMeta`, `RoundMeta`, `RoundData`, `PlayerFrames`, `PlayerSlow`, события, `GrenadeTrack/Effect`, `MapInfo` |
| `shared/src/weapons.ts` | id оружия → отображаемое имя, `isNonFiring`, имена из `inventory` (`'C4 Explosive'`) |
| `shared/src/parse/pipeline.ts` | интерфейс `DemoParser`, все вызовы demoparser2 (события — одним проходом), списки событий/пропсов, cvars, `checkDemoMagic` |
| `shared/src/parse/rounds.ts` | `sliceRounds` — нарезка раундов (якорь — `round_end`) |
| `shared/src/parse/build.ts` | сырые данные → `RoundData` (кадры, slow, события, гранаты, эффекты), `playerKey` |
| `wasm/src/lib.rs` | WASM-обвязка: класс `DemoFile` (файл в памяти WASM один раз), методы как в Node-обвязке, результат — JSON-строка |
| `wasm/demoparser.patch`, `scripts/build-wasm.sh` | патч апстрима (`web-time` вместо `std::time::Instant`), сборка: клон по закреплённым коммитам → `wasm/vendor` |
| `web/src/parse/*` | `wasm.ts` (адаптер `DemoParser`, загрузка файла кусками), `worker.ts`, `local.ts` (демки вкладки) |
| `server/src/store.ts` | in-memory LRU (3 демки), запуск worker через `worker-boot.mjs` |
| `server/src/parse/parse.ts` | нативный адаптер `DemoParser` (путь к файлу) |
| `web/src/playback/playback.ts` | класс `Playback`: часы (rAF), раунды, загрузка/префетч, снапшоты для React (10 Гц) |
| `web/src/playback/interp.ts` | интерполяция игроков/гранат, телепорт > 300 ед. не интерполируется, yaw по короткой дуге |
| `web/src/playback/state.ts` | производное состояние: бомба, ослепление, часы раунда, счёт |
| `web/src/render/*` | слои canvas: `frame.ts` (оркестратор), `view.ts` (раскладка уровней, zoom/pan), players, grenades, bomb, shots |
| `web/src/ui/*` | `App` (хэш-роутинг), `Upload`, `Viewer`, `RadarCanvas`, `Scoreboard`, `KillFeed`, `Timeline`, `WeaponIcon` (SVG из `web/src/assets/weapons`, lexogrine/cs2-react-hud, MIT; имя предмета или id события → `itemWeaponId`), `HudIcon` (броня и модификаторы килфида из `web/src/assets/hud`, Juknum/counter-strike-icons). В скорборде — основное оружие из инвентаря (`mainWeapon`), не активное |
| `scripts/fetch-maps.ts`, `map-info.ts` | загрузка радаров, выбор картинки уровня, `maps.json` |
| `server/src/app.ts` | `buildServer({ localFileToken, webRoot })` — бэкенд десктопа: `/api/demos/local`, статус, раунды, раздача `web/dist` |
| `desktop/src/main.ts` | Electron: сервер в процессе на `127.0.0.1:<random>`, окно, путь к нативному парсеру |
| `desktop/src/preload.ts` | `window.skybox` = `pathForFile` (webUtils) + токен (через IPC) |
| `desktop/src/updater.ts` | «Check for updates»: GitHub API `releases/latest`, ассет по суффиксу из `dist.mjs`; Windows — тихая установка `/S --updated --force-run` и выход, macOS — открыть `.dmg`. UI — `web/src/ui/UpdateButton.tsx` (проверка при запуске) |
| `desktop/scripts/bundle.mjs` | esbuild: `main.mjs`, `worker.mjs` (ESM + require-shim), `preload.cjs`; копирует `web/dist` |
| `desktop/scripts/dist.mjs` | stage-каталог без node_modules, нативный парсер в `resources/native`, electron-builder |
| `.github/workflows/wasm.yml` | переиспользуемый: сборка WASM (ubuntu, кэш cargo) → артефакт `demoparser-wasm` |
| `.github/workflows/pages.yml` | push в `main` → сайт на GitHub Pages |
| `.github/workflows/release.yml` | `wasm.yml` → сборка на macos-latest + windows-latest; тег `v*` → GitHub Release (только артефакты `skybox-*`) |

Модель данных раунда: кадры на равномерной сетке `startTick + i*2` (32 Гц) в колоночном виде на игрока
(`x/y/z/yaw` могут быть `null`), медленное состояние каждые 16 тиков (броня, деньги, K/D/A, инвентарь),
строки (оружие/инвентарь) — индексы в `RoundData.strings`. Тики везде абсолютные. Граничный тик принадлежит двум
соседним раундам. Счёт по сторонам берётся из `team_rounds_total` через 32 тика после `round_end`.

Рендер: canvas читает `playback.tick` напрямую каждый кадр, React-панели обновляются снапшотами.
Координаты: `px = (x - pos_x) / scale`, `py = (pos_y - y) / scale` в базисе 1024 независимо от размера PNG.
Yaw 0 = +X; на экране угол = `-yaw`. Для одноуровневых карт клип — весь canvas, для многоуровневых — квадрат каждого уровня.

## Особенности CS2-демок и demoparser2 (найдено на реальных демках)

- `parseTicks(..., structOfArrays=true)` в ~3 раза быстрее и экономнее, чем построчно — использовать его.
- Формат `round_end` зависит от демки: старые — `winner: 2|3`, `reason: число`; новые (про-матчи 2026) —
  `winner: "CT"|"T"|null`, `reason: "t_killed"|"ct_killed"|"bomb_exploded"|"bomb_defused"|"time_ran_out"|"ct_surrender"...`.
  Поддержаны оба (`winnerSide`, `endKindFromReason`). `round_end` с `winner: null` пропускается.
- В про-демках нет `begin_new_match`, первый `round_start` на тике 1. В MM-демках есть разминка и `begin_new_match` —
  всё до последнего `begin_new_match` отбрасывается. Последний раунд может закончиться сдачей во время freeze time
  без `round_freeze_end` и `round_officially_ended`.
- `bomb_pickup` приходит не всегда (например, если бомбу выбросили в freeze time и подобрали) — дополнительно
  слушаем `item_pickup` с `item === 'c4'`, а на клиенте сверяем «лежит» с инвентарём.
- `parseGrenades(path, null, false)` — только снаряды. Id сущностей переиспользуются → трек режется по разрывам в тиках.
  Дым/HE остаются сущностью после детонации → полёт обрезается по событию детонации с тем же `entityid`.
  У молотова событие `inferno_startburn` имеет свой `entityid` (не снаряда).
- Боты имеют steamid `"0"` → ключ `BOT:<name>` (`playerKey`).
- Тикрейт демки CS2 всегда 64. `mp_roundtime` → пропс `CCSGameRulesProxy.CCSGameRules.m_iRoundTime`.
  `mp_c4timer` часто отсутствует в `server_cvar` → дефолт 40. `mp_maxrounds`/`mp_overtime_maxrounds` — из cvars.
- `cs2-map-icons/data/available.json` уже содержит распарсенный `radar_info` (pos_x, pos_y, scale, verticalsections).
  Картинки: `<map>_radar_psd.png` → `_tga` → без суффикса; уровни — `<map>_<section>_radar_*.png`
  (секции: `default`, `lower`, у de_boulder `higher1`). Некоторые новые карты в 2048 px — рисуются в базисе 1024.
- Производительность (про-матч 290–340 МБ): натив 4–7 с, пик RSS 1,4–1,9 ГБ; WASM 11–14 с (Chrome — 13 с на Mirage),
  память WASM ~0,7 ГБ, пик RSS процесса 1,8–2,2 ГБ. JSON раунда 0,6–2,9 МБ. Каждый вызов парсера — полный проход
  по демке, поэтому события берутся одним `parseEvents`.

## WASM-сборка demoparser2 (грабли)

- Готовой WASM-сборки на npm нет; `src/wasm` в апстриме устарел (выход — `Map` вместо объектов, `parseGrenades`
  с другими настройками → в 7 раз больше строк, файл копируется в каждый вызов). Поэтому своя обвязка `wasm/src/lib.rs`,
  повторяющая `src/node/src/lib.rs` (те же `ParserInputs`), но с `ForceSingleThreaded`.
- `std::time::Instant::now()` в `parse_demo` паникует на wasm32 → патч на `web-time`.
- Сборка `csgoproto` клонирует последний GameTracking-CS2 — свежие proto ломают компиляцию; клонируем заранее
  закреплённый коммит (`build.rs` игнорирует ошибку `git clone` в существующую папку). Нужен `protoc`
  (локально — `~/.local/protoc/bin/protoc`, `PROTOC=...`; rustup/wasm-pack — в `~/.cargo/bin`, не в PATH по умолчанию).
- Без lock-файла подтягивается `getrandom` 0.3 (не собирается под wasm32) → `wasm/Cargo.lock` коммитится
  (основа — lock из апстрим `src/wasm`).
- Вывод через `serde_wasm_bindgen` в 2 раза медленнее, чем `serde_json::to_string` + `JSON.parse` (гранаты 16 с → 3 с).
  SIMD (`wasm/.cargo/config.toml`) — ещё −20%.
- Отличия от натива: yaw/duration на границе округления могут отличаться на 0,1 (f32 → JSON); тест
  `server/src/parse/wasm.test.ts` сравнивает с допуском. Все 4 про-демки + тестовая — без других расхождений.

## Окружение и грабли

- `~/.npm` содержит root-owned файлы → `npm install` падает с EACCES. Обход: `--cache <scratchpad>/npm-cache`
  или пользователь выполняет `sudo chown -R $(id -u):$(id -g) ~/.npm`.
- Worker-потоки не наследуют загрузчик tsx → точка входа `server/src/parse/worker-boot.mjs` регистрирует tsx и
  импортирует `worker.ts`. `tsx` — runtime-зависимость сервера (и в проде).
- Vite слушает `localhost` (IPv6) — curl/браузер на `http://localhost:5173`, не `127.0.0.1`.
- TypeScript 7, Vite 8, Vitest 5, React 19, Fastify 5. В TS 7 сужение `let x: T | null = null` в цикле со switch
  ломается — писать `let x = null as T | null`.
- SVG-иконки оружия: каждой нужны `xmlns` и `fill="white"` (в исходном lexogrine у flashbang/hegrenade/smokegrenade их не было,
  поправлено вручную). Vite встраивает файлы < 4 КБ как `data:`-URI, без `xmlns` такая картинка не грузится.

## Десктоп: грабли (найдено при сборке)

- Десктоп переиспользует сервер: Electron main поднимает `buildServer` на случайном порту, окно грузит
  `http://127.0.0.1:<port>/`. Вместо загрузки файла фронт шлёт путь (`POST /api/demos/local`, заголовок
  `x-skybox-token`). Если пути нет (`pathForFile` вернул ""), десктоп парсит в браузере через WASM.
- demoparser2 0.42.0: **нет** опубликованных `darwin-x64` (последний 0.23.0) и `darwin-universal` (только в
  optionalDependencies) → macOS-сборка только arm64. Windows — `win32-x64-msvc`.
- electron-builder не копирует папки `node_modules` в `extraResources` → парсер кладётся в
  `resources/native/demoparser2`, `.node` копируется рядом с `index.js` (загрузчик сначала ищет локальный файл);
  путь передаётся воркеру через `SKYBOX_DEMOPARSER`.
- electron-builder тащит `dependencies` из `desktop/package.json` в приложение → там их нет намеренно (всё в бандле).
- `asar: false` (воркер и нативный модуль вне архива), `mac.identity: '-'` (ad-hoc, иначе не запустится на
  Apple Silicon), `hardenedRuntime: false` (с ad-hoc подписью блокирует загрузку нативной библиотеки).
- Версия релиза берётся из тега (`GITHUB_REF_NAME`), локально — из `desktop/package.json`. Обновление в приложении
  видит только опубликованные релизы (тег `v*`), ручной запуск workflow релиз не создаёт.
- Проверка упакованного приложения: запустить `Skybox.app/Contents/MacOS/Skybox --remote-debugging-port=9333`,
  подключиться `puppeteer.connect({ browserURL })`, `input[type=file].uploadFile(path)` (webUtils даёт путь).
  Проверять копию из `.dmg` вне проекта — внутри проекта парсер может случайно найтись в корневых node_modules.
- `npm audit`: moderate в `sprintf-js` через electron-builder (только инструмент сборки, в приложение не попадает).
- Windows-сборка локально не проверялась — только в CI.

## Тестовые данные и проверка

- `fixtures/test_demo.dem` (gitignored) — публичная демка из репо demoparser (`src/parser/test_demo.dem`):
  de_mirage, MM, 10 раундов, T 8:2 сдачей. На ней интеграционные тесты `server/src/parse/parse.test.ts` и
  `wasm.test.ts` (пропускаются, если файла или WASM-сборки нет; другой файл — `SKYBOX_TEST_DEMO=/path`).
- `mock_demos/` (gitignored) — архивы пользователя: Spirit vs MOUZ (ESL PL S24, de_dust2 13:5 и de_mirage 13:11) и
  `de_nuke.rar`. Распаковывать в scratchpad: `bsdtar -xf mock_demos/<file>.rar -C <dir>` (unrar/7z не установлены).
- Визуальная проверка: Claude in Chrome в прошлой сессии был недоступен, использовался `puppeteer-core` из
  scratchpad (не в проекте) с системным Chrome (`/Applications/Google Chrome.app/...`): раздать `web/dist` из
  подпапки (`python3 -m http.server`, как на GitHub Pages), `input[type=file].uploadFile(path)`, нажимать клавиши,
  делать скриншоты.

## Статус и следующие шаги

Сделано и проверено: весь MVP, на трёх реальных демках (раунды, счёт, смена сторон, бомба — 0 расхождений с инвентарём).
Десктоп: macOS `.dmg` собран и проверен (установка из dmg, открытие демок); Windows — только через CI.
Браузерный парсинг (WASM): проверен в headless Chrome на про-демках Mirage и Nuke (два уровня) и CS:GO-демке;
десктоп после переделки проверен из исходников (`npm run desktop`), `.dmg` и CI-job `wasm` ещё не запускались.

Публикация: `pages.yml` = `wasm.yml` (переиспользуемый, общий с `release.yml`) → typecheck/test/fetch-maps/build →
`actions/deploy-pages`. Pages в репо включён с `build_type=workflow`.

Не проверено / идеи (согласовывать с пользователем перед реализацией):
1. **Многоуровневые карты** — Nuke на реальной демке открывается (два уровня), но границы `AltitudeMin/Max` и
   отображение гранат/бомбы по уровням детально не проверялись.
2. Потребление памяти при парсинге (натив 1,4–1,9 ГБ, браузер ~2 ГБ) — можно парсить пропсы по раундам или уменьшить
   набор; для телефонов полный матч, скорее всего, не влезет. Ускорение WASM — потоки (нужен COOP/COEP).
3. Поддержка `.dem.gz`/`.zst`/`.bz2` (FACEIT отдаёт сжатые) — сейчас отклоняются.
4. Форма огня молотова — сейчас круг 120 ед.; точная форма есть в сущностях inferno.
5. Позиция выброшенной бомбы — сейчас позиция игрока при выбросе (сама бомба отлетает).
6. Траектории гранат после броска (история), heatmap и т.п.
