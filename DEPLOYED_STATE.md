# DEPLOYED_STATE.md

Технический снимок кода, соответствующего фактически развёрнутому сервису.
Подготовлено автоматически при экспорте ветки `replit-current-2026-09-01`.
Это снимок конкретного состояния кода на момент выгрузки — методология и логика расчётов не изменялись.

## 1. Коммит и время выгрузки

- **Хеш коммита (источник, ветка `main` в рабочей среде Replit):** `7e020f1cc1596b6fa3a25b6bbe7c7bc901f8ccad`
- **Дата коммита:** 2026-09-01 09:38:11 +0000
- **Дата и время выгрузки в GitHub:** 2026-09-01 (выполнено в текущей сессии, время по UTC берётся из штампа коммита выгрузки в целевом репозитории)
- **Рабочая копия на момент выгрузки:** чистая (`git status` — без незакоммиченных изменений)

## 2. Какая версия сейчас развёрнута

Данные получены напрямую из сервиса деплоя Replit (`getDeploymentInfo`):

- **Продакшн-URL:** https://7k.biznes-razbor.ru (дополнительно: https://biznies-sistiema-7-k.replit.app)
- **Тип деплоя:** autoscale
- **Видимость:** public
- **Статус последней сборки:** успешна (`hasSuccessfulBuild: true`)
- **Что именно развёрнуто:**
  - Backend: `artifacts/api-server` — production build `pnpm --filter @workspace/api-server run build`, запуск `node --enable-source-maps artifacts/api-server/dist/index.mjs`, порт 8080, health-check `/api/healthz`.
  - Frontend: `artifacts/cabinet` ("Кабинет менеджера") — статическая сборка `pnpm --filter @workspace/cabinet run build`, раздаётся из `artifacts/cabinet/dist/public`.
- Рабочая среда Replit не даёт напрямую получить хеш коммита, из которого был собран текущий продакшн-билд; проверено, что рабочее дерево на момент выгрузки чистое и совпадает с последним коммитом (`7e020f1`), поэтому этот коммит принят как представление фактически развёрнутого состояния.

## 3. Что включено / что исключено из этой копии

Включено — весь код, от которого зависит работающий сервис:

- `artifacts/cabinet/**` — актуальный frontend ("Кабинет менеджера")
- `artifacts/api-server/**` — актуальный backend (Express API), включая:
  - `src/reference/server/7k/**` — P-01 (сбор и оценка сигналов), Target Configuration (`config/target-rules*`, `config/archetypes*`), P-02 (`config/p02-strategy-rules*`, `money-now-selector.ts`), построение Route, промпты `prompts/p01.*`, `p02.*`
  - `src/reference/lib/**` — генерация чек-листа (`analysis-checklist.ts`), план роста (`growth-priority-plan.ts`), бизнес-анализ и рычаги 7К
  - `src/domain/**` — пайплайн анализа, роуты, схемы
  - P-04 — соответствующие модули в `src/reference/server/7k` и `src/domain/analysis-pipeline`
- `lib/db/**` — схема БД и миграции (`lib/db/migrations`)
- `lib/api-spec/**`, `lib/api-zod/**`, `lib/api-client-react/**` — контракты API, типы, генерируемые схемы/клиент
- `lib/integrations*/**` — серверные интеграции (например, AI-транспорт)
- Тесты (`**/__tests__/**`, `*.test.ts`, `*.spec.ts`) по всем указанным пакетам
- `pnpm-lock.yaml` — lock-файл зависимостей
- `package.json`, `pnpm-workspace.yaml`, `tsconfig*.json`, `.npmrc`, `.replit`, `.replitignore`, `.gitignore`, `replit.md`, `scripts/**` — актуальные манифесты версий и конфигурация workspace

Исключено из этой копии сознательно (не является кодом развёрнутого сервиса):

- `artifacts/mockup-sandbox/**` — canvas-песочница для прототипирования UI (kind = "design"), не собирается и не разворачивается в продакшн (в `artifact.toml` нет секции `services.production`)
- `.reference/**` — архивная копия предыдущей версии проекта (не входит в `pnpm-workspace.yaml`, не участвует в сборке)
- `attached_assets/**` — файлы, приложенные пользователем в чате (не часть приложения)
- `debug/**` — материалы предыдущего аудита (аналитика, не код приложения)
- `.agents/**` — служебная память ассистента
- `current-score-route-audit.zip` — служебный архив аудита

**Известное ограничение выгрузки:** файл `artifacts/cabinet/index.html` (стандартный HTML-шаблон Vite, 1.5 КБ) не попал в этот снимок. Причина — не в содержимом файла (в нём нет секретов, это обычная HTML-разметка с тегом подключения скрипта), а в защитном фильтре сетевой инфраструктуры, через которую агент отправлял файлы в GitHub: любой запрос, тело которого после декодирования содержит открывающий тег скрипта, блокируется на уровне инфраструктуры независимо от контекста. Все остальные 483 файла (включая все PNG с похожим объёмом и вообще весь остальной код) загружены без проблем — ограничение специфично именно для этого одного файла. Содержимое файла не изменилось и доступно в рабочей среде Replit по тому же пути; при необходимости его можно добавить в ветку вручную через веб-интерфейс GitHub (создание/редактирование файла) — это не требует доступа к среде Replit.

Секреты не выгружались: `.env`-файлы, ключи и токены в репозитории не отслеживаются git (см. `.gitignore`); в самой копии нет файлов с реальными значениями секретов — переменные окружения (`AI_INTEGRATIONS_OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `SESSION_SECRET`, `SUPABASE_DATABASE_URL` и т.п.) хранятся в Replit Secrets и не входят в git-историю.

## 4. Откуда frontend и backend берут расчётную логику

- **Backend (`artifacts/api-server`)** — единственный источник расчётной логики. Весь пайплайн (P-01 → Target Configuration → P-02 → Route → чек-лист → P-04) реализован в:
  - `src/reference/server/7k/` — конфигурация архетипов, целевых уровней (target-rules), правил стратегии P-02, промпты для AI-этапов P-01–P-04
  - `src/reference/lib/` — построение чек-листа (`analysis-checklist.ts`), плана роста, агрегированного бизнес-анализа
  - `src/domain/analysis-pipeline/` — оркестрация этапов пайплайна и связанные с ним стоимость/ретраи
  - `src/routes/analysis.ts` — HTTP-эндпоинты, которые дергает frontend для запуска и получения результата разбора
- **Frontend (`artifacts/cabinet`)** — не пересчитывает бизнес-логику самостоятельно, а получает результат через API (сгенерированные клиент/типы из `lib/api-client-react`, `lib/api-zod`, контракт в `lib/api-spec/openapi.yaml`). Исключение: часть логики чек-листа задублирована в `artifacts/cabinet/src/lib/` (собственная копия `analysis-checklist.ts`) для локального отображения — она должна оставаться синхронизированной с серверной копией в `artifacts/api-server/src/reference/lib/analysis-checklist.ts`; на момент выгрузки обе копии присутствуют в этой ветке без изменений.

## 5. Реализованные и предложенные задачи (project tasks)

Статусы на момент выгрузки (2026-09-01, из очереди задач проекта):

### Реализовано (IMPLEMENTED)
- #18 — Prevent the analysis waiting screen from silently hanging if a pipeline step fails

### Предложено, но не реализовано (PROPOSED)
- #48 — Confirm the live разбор session correctly follows the manager between Plan, Gift, and Мои разборы
- #44 — Alex's progress wheel should track the next reveal, then disappear
- #54 — Fix 7К target levels, route, and checklist calculation
- #47 — Catch a specific-ruble income claim in a report before it reaches a client
- #45 — Show the growth map and 'you are here' marker in the downloadable PDF report
- #46 — Confirm the 50-hour overload threshold that triggers the delegation checklist item

### В очереди, заблокировано лимитом параллельности (PENDING / CONCURRENCY_LIMIT)
- #22 — Verify the target-rules archetype model matches the latest methodology doc
- #53 — Stop retries on a failed report from ballooning to 5+ minutes and still failing

Эта ветка — только синхронизация текущего состояния. Ни одна из перечисленных задач в рамках подготовки этой копии не реализовывалась и методология расчётов не менялась.
