# Skybox для CS2 — контекст проекта

Локальное веб-приложение: загружаешь `.dem` CS2 → матч проигрывается в 2D сверху на радаре карты (а-ля Skybox).
Пользовательская документация — `README.md`. Этот файл — для продолжения разработки.

## Согласованные с пользователем решения (не менять без вопроса)

- Web + локальный Node-бэкенд; парсинг через `@laihoe/demoparser2` (Rust/NAPI).
- Источник демок — только локальный файл (drag&drop). Без URL/FACEIT/share codes.
- MVP: позиции + взгляд, гранаты, килфид + скорборд, бомба + выстрелы, таймлайн раундов. Всё сделано.
- Фронт: React + TypeScript + Canvas 2D (Vite). UI на английском, общение с пользователем — на русском.
- Радары скачиваются скриптом из https://github.com/MurkyYT/cs2-map-icons (в git не коммитятся).
- Многоуровневые карты (Nuke, Vertigo, Train): радары рядом, уровень игрока по Z (`verticalsections`).
- Хранение: только текущая сессия — данные в памяти сервера (последние 3 демки), `.dem` удаляется после парсинга.

Десктоп (решения пользователя): Electron (своё окно), без подписи кода (для себя и друзей), радары вшиты в
приложение, открытие демок — drag&drop/выбор файла (без ассоциации .dem и списка недавних), сборка в GitHub
Actions + Releases, macOS — только Apple Silicon (Intel не поддерживается).

Решения, принятые мной самостоятельно (пользователь пока не подтверждал — можно спросить при случае):
раунд открывается за 5 с до конца freeze time (`LEAD_IN_SECONDS`); ↑ — предыдущий раунд, ↓ — следующий;
`.dem.gz`/CS:GO-демки отклоняются с ошибкой; id демки хранится в URL-хэше `#/demo/<id>`.

## Правила работы

- Перед реализацией фичи с неоднозначностью (поведение UI, API, архитектура) — спросить через AskUserQuestion, все вопросы разом.
- Коммитить/пушить только по просьбе. Remote: `git@github.com:kuchumovN/skybox-cs2.git` (публичный), ветка `main`. Автор коммитов — `nkuchumov010@gmail.com`; рабочий адрес нигде не должен фигурировать.
- Стиль: TS strict, комментарии в коде на английском и только там, где неочевидно; ESM, импорты сервера с `.js`.
- После изменений: `npm test` и `npm run typecheck`; для UI — визуальная проверка (см. ниже).

## Команды

```sh
npm install --cache <scratchpad>/npm-cache   # см. «Окружение»: ~/.npm с root-owned файлами
npm run fetch-maps                            # радары → web/public/maps (+ maps.json); `-- de_nuke` — выборочно
npm run dev                                   # API :3001 + Vite http://localhost:5173 (прокси /api)
npm run desktop                               # десктоп из исходников (bundle + electron)
npm run desktop:dist                          # установщик под текущую ОС → desktop/release/
npm start                                     # прод: build фронта, всё на http://127.0.0.1:3001
npm test                                      # vitest (server, web, scripts)
npm run typecheck                             # tsc для server, web, scripts
```

## Архитектура

npm workspaces: `shared/` (типы), `server/`, `web/`, `scripts/`.

Поток: `POST /api/demos?name=` (сырое тело, стрим на диск, проверка магии `PBDEMS2\0`) → `startParse` запускает
worker → клиент опрашивает `GET /api/demos/:id` (`ParseStatus`: parsing+stage | ready+meta | error) →
`GET /api/demos/:id/rounds/:n` (1-based) отдаёт заранее сериализованный JSON раунда.

| Файл | Роль |
|---|---|
| `shared/src/types.ts` | `MatchMeta`, `RoundMeta`, `RoundData`, `PlayerFrames`, `PlayerSlow`, события, `GrenadeTrack/Effect`, `MapInfo` |
| `shared/src/weapons.ts` | id оружия → отображаемое имя, `isNonFiring`, имена из `inventory` (`'C4 Explosive'`) |
| `server/src/index.ts` | Fastify: роуты, лимит 2 ГБ, в проде раздаёт `web/dist` |
| `server/src/store.ts` | in-memory LRU (3 демки), запуск worker через `worker-boot.mjs` |
| `server/src/parse/parse.ts` | все вызовы demoparser2, списки событий/пропсов, cvars |
| `server/src/parse/rounds.ts` | `sliceRounds` — нарезка раундов (якорь — `round_end`) |
| `server/src/parse/build.ts` | сырые данные → `RoundData` (кадры, slow, события, гранаты, эффекты), `playerKey` |
| `web/src/playback/playback.ts` | класс `Playback`: часы (rAF), раунды, загрузка/префетч, снапшоты для React (10 Гц) |
| `web/src/playback/interp.ts` | интерполяция игроков/гранат, телепорт > 300 ед. не интерполируется, yaw по короткой дуге |
| `web/src/playback/state.ts` | производное состояние: бомба, ослепление, часы раунда, счёт |
| `web/src/render/*` | слои canvas: `frame.ts` (оркестратор), `view.ts` (раскладка уровней, zoom/pan), players, grenades, bomb, shots |
| `web/src/ui/*` | `App` (хэш-роутинг), `Upload`, `Viewer`, `RadarCanvas`, `Scoreboard`, `KillFeed`, `Timeline`, `WeaponIcon` (SVG из `web/src/assets/weapons`, lexogrine/cs2-react-hud, MIT; имя предмета или id события → `itemWeaponId`), `HudIcon` (броня и модификаторы килфида из `web/src/assets/hud`, Juknum/counter-strike-icons). В скорборде — основное оружие из инвентаря (`mainWeapon`), не активное |
| `scripts/fetch-maps.ts`, `map-info.ts` | загрузка радаров, выбор картинки уровня, `maps.json` |
| `server/src/app.ts` | `buildServer(options)` — общий для веба и десктопа; `localFileToken` включает `/api/demos/local` |
| `desktop/src/main.ts` | Electron: сервер в процессе на `127.0.0.1:<random>`, окно, путь к нативному парсеру |
| `desktop/src/preload.ts` | `window.skybox` = `pathForFile` (webUtils) + токен (через IPC) |
| `desktop/scripts/bundle.mjs` | esbuild: `main.mjs`, `worker.mjs` (ESM + require-shim), `preload.cjs`; копирует `web/dist` |
| `desktop/scripts/dist.mjs` | stage-каталог без node_modules, нативный парсер в `resources/native`, electron-builder |
| `.github/workflows/release.yml` | сборка на macos-latest + windows-latest; тег `v*` → GitHub Release |

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
- Производительность: полный про-матч (300–360 МБ) парсится за 4–6 с, пик RSS 1,4–1,8 ГБ; JSON раунда 0,6–2,9 МБ.

## Окружение и грабли

- `~/.npm` содержит root-owned файлы → `npm install` падает с EACCES. Обход: `--cache <scratchpad>/npm-cache`
  или пользователь выполняет `sudo chown -R $(id -u):$(id -g) ~/.npm`.
- Worker-потоки не наследуют загрузчик tsx → точка входа `server/src/parse/worker-boot.mjs` регистрирует tsx и
  импортирует `worker.ts`. `tsx` — runtime-зависимость сервера (и в проде).
- Vite слушает `localhost` (IPv6) — curl/браузер на `http://localhost:5173`, не `127.0.0.1`. API — `127.0.0.1:3001`.
- TypeScript 7, Vite 8, Vitest 5, React 19, Fastify 5. В TS 7 сужение `let x: T | null = null` в цикле со switch
  ломается — писать `let x = null as T | null`.
- `tsx watch` перезапускает сервер при правке → распарсенные демки теряются, нужно загрузить заново.
- SVG-иконки оружия: каждой нужны `xmlns` и `fill="white"` (в исходном lexogrine у flashbang/hegrenade/smokegrenade их не было,
  поправлено вручную). Vite встраивает файлы < 4 КБ как `data:`-URI, без `xmlns` такая картинка не грузится.

## Десктоп: грабли (найдено при сборке)

- Десктоп переиспользует сервер: Electron main поднимает `buildServer` на случайном порту, окно грузит
  `http://127.0.0.1:<port>/`. Вместо загрузки файла фронт шлёт путь (`POST /api/demos/local`, заголовок
  `x-skybox-token`), файл не удаляется. В веб-режиме эндпоинта нет.
- demoparser2 0.42.0: **нет** опубликованных `darwin-x64` (последний 0.23.0) и `darwin-universal` (только в
  optionalDependencies) → macOS-сборка только arm64. Windows — `win32-x64-msvc`.
- electron-builder не копирует папки `node_modules` в `extraResources` → парсер кладётся в
  `resources/native/demoparser2`, `.node` копируется рядом с `index.js` (загрузчик сначала ищет локальный файл);
  путь передаётся воркеру через `SKYBOX_DEMOPARSER`.
- electron-builder тащит `dependencies` из `desktop/package.json` в приложение → там их нет намеренно (всё в бандле).
- `asar: false` (воркер и нативный модуль вне архива), `mac.identity: '-'` (ad-hoc, иначе не запустится на
  Apple Silicon), `hardenedRuntime: false` (с ad-hoc подписью блокирует загрузку нативной библиотеки).
- Версия релиза берётся из тега (`GITHUB_REF_NAME`), локально — из `desktop/package.json`.
- Проверка упакованного приложения: запустить `Skybox.app/Contents/MacOS/Skybox --remote-debugging-port=9333`,
  подключиться `puppeteer.connect({ browserURL })`, `input[type=file].uploadFile(path)` (webUtils даёт путь).
  Проверять копию из `.dmg` вне проекта — внутри проекта парсер может случайно найтись в корневых node_modules.
- `npm audit`: moderate в `sprintf-js` через electron-builder (только инструмент сборки, в приложение не попадает).
- Windows-сборка локально не проверялась — только в CI.

## Тестовые данные и проверка

- `fixtures/test_demo.dem` (gitignored) — публичная демка из репо demoparser (`src/parser/test_demo.dem`):
  de_mirage, MM, 10 раундов, T 8:2 сдачей. На ней интеграционный тест `server/src/parse/parse.test.ts`
  (пропускается, если файла нет; другой файл — `SKYBOX_TEST_DEMO=/path`).
- `mock_demos/` (gitignored) — архивы пользователя: Spirit vs MOUZ (ESL PL S24, de_dust2 13:5 и de_mirage 13:11) и
  `de_nuke.rar`. Распаковывать в scratchpad: `bsdtar -xf mock_demos/<file>.rar -C <dir>` (unrar/7z не установлены).
- Визуальная проверка: Claude in Chrome в прошлой сессии был недоступен, использовался `puppeteer-core` из
  scratchpad (не в проекте) с системным Chrome (`/Applications/Google Chrome.app/...`): открыть
  `http://localhost:5173/#/demo/<id>` после загрузки через API, нажимать клавиши/кликать, делать скриншоты.

## Статус и следующие шаги

Сделано и проверено: весь MVP, на трёх реальных демках (раунды, счёт, смена сторон, бомба — 0 расхождений с инвентарём).
Десктоп: macOS `.dmg` собран и проверен (установка из dmg, открытие демок); Windows — только через CI.

Не проверено / идеи (согласовывать с пользователем перед реализацией):
1. **Многоуровневые карты на реальной демке** — есть `mock_demos/de_nuke.rar`; раскладка проверялась только
   симуляцией (Mirage с подставленным вторым уровнем). Проверить границы `AltitudeMin/Max` и отображение гранат/бомбы.
2. Потребление памяти при парсинге (1,4–1,8 ГБ) — можно парсить пропсы по раундам или уменьшить набор.
3. Поддержка `.dem.gz`/`.zst`/`.bz2` (FACEIT отдаёт сжатые) — сейчас отклоняются.
4. Форма огня молотова — сейчас круг 120 ед.; точная форма есть в сущностях inferno.
5. Позиция выброшенной бомбы — сейчас позиция игрока при выбросе (сама бомба отлетает).
6. Траектории гранат после броска (история), heatmap и т.п.
