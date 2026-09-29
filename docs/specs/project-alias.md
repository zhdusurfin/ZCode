# Спека: алиас проекта (отображаемое имя workspace)

Статус: implemented. Ветка: `feature/project-alias`.

## 1. Поведение

Пользователь может задать проекту **алиас** — альтернативное короткое имя для открытой папки (workspace). Алиас — **только отображаемое имя**: он подменяет имя папки (`getPathLeaf`) в UI, но не участвует в идентификации workspace, путях файловых операций, cwd агента и RPC.

- Если алиас задан — во всех пользовательских поверхностях показывается он.
- Если алиас пуст или не задан — показывается текущее имя папки (fallback, поведение не меняется).
- Удаление алиаса возвращает имя папки.

## 2. Владелец состояния и точка коммита

```text
пользователь: сайдбар ⋯ → «Переименовать проект»
  → диалог: локальный draft (useState, больше нигде не хранится)
  → валидация: trim, срез управляющих символов, ≤100 символов
  → settingService.update({ projectAliases })   ← единственный владелец: AppSettings
       ├─ enqueueSettingsWrite → appSettingsPatchSchema.parse → merge → settings.json
       └─ platform.onSettingsChanged → useSettings.refresh() во всех окнах
  → производные проекции: resolveWorkspaceDisplayName(...) читают алиас при рендере
     (сайдбар, заголовок workspace, command center, список задач, пустой чат, Memory Scope)
```

- **Владелец**: `AppSettings.projectAliases?: Record<string, string>` — новое опциональное поле.
  Ключ — канонический `workspaceIdentity?.trim() || workspacePath` через существующий хелпер
  `getWorkspaceKey` (`packages/ui/src/lib/workspaceKey.ts`). Запрет на рукописные форматы ключа.
- **Коммит**: существующий `settingService.update()` (`packages/services/src/setting/settingService.ts`) —
  сериализованная очередь записи уже решает гонку `recentProjects`/`lastWorkspaceSession`; новый
  сервис не создаём. При обновлении читаем актуальные `projectAliases` из settings и мержим один
  ключ (паттерн `useRecentProjects.addProject`), не перезаписываем всю map вслепую.
- **Tab label остаётся fallback'ом**: `tab.label` (`labelFromPath`, `packages/ui/src/store/tabStore.ts:143`)
  не переписываем. Алиас — производное отображение, а не вторая копия истины в tab state.
- **Восстановление/персистентность**: settings.json уже персистентен и синхронизируется между
  окнами через `onSettingsChanged`. Отдельной миграции не нужно (optional-поле, старые данные валидны).

## 3. Матрица поверхностей

| Поверхность | Точка в коде | Изменение |
| --- | --- | --- |
| Сайдбар, строка workspace | `WorkspaceSidebarItem.tsx:235` | `resolveWorkspaceDisplayName` перед `formatRemoteWorkspaceDisplayLabel` (суффикс `[SSH: …]` сохраняется) |
| Вход редактирования | `WorkspaceSidebarItem.tsx` (dropdown ⋯, пункт «Переименовать») + `WorkspaceAliasDialog.tsx` | Кнопки Save/Cancel; пустое значение при сохранении = очистка алиаса (единая точка коммита) |
| Заголовок workspace | `App.tsx:600` → `WorkspaceShellLayout.tsx:1380` → `WorkspaceHeaderSections.tsx:186` | `projectName` = resolve(алиас, leaf) |
| Command center | `CommandCenterDialog.tsx:490` (`workspaceLabelByKey`) | значение = resolve вместо `tab.label` |
| Список задач | `TaskListItem.tsx:385` | resolve по `task.workspacePath` + `task.workspaceIdentity` |
| Групповые секции задач | `WorkspaceGroupedTasksSection.tsx:869,882` | resolve с fallback на существующую логику |
| Пустой чат / меню workspace | `ChatEmptyState.tsx:73-88` | resolve в трёх хелперах заголовков |
| Settings → Memory Scope | `SettingsPage.tsx:670-679` | resolve имён проектов |
| Онбординг (кандидаты workspace) | `onboarding/OnboardingDialog.tsx:125` | resolve только по пути: кандидаты приходят из миграции локальных сессий без workspaceIdentity, remote-алиасы здесь не применяются (сознательно) |
| Тултип строки сайдбара (алиас задан) | `WorkspaceSidebarItem.tsx:848` (обёртка `workspaceLabelContent`) | Если алиас задан и SSH-тултипа нет — добавить тултип: реальное имя папки + полный путь. В SSH-тултипе путь уже виден — там ничего не меняем |
| Терминал (табы сессий) | `Terminal.tsx:314` | **не алиасим — решено**: заголовок — basename cwd сессии, cwd может быть подкаталогом, алиас проекта вводит в заблуждение |
| Заголовок окна ОС | `desktop/src/main/index.ts:1580` (`title: ""`, hidden titlebar) | поверхность отсутствует |

## 4. Инварианты

1. `workspacePath` не изменяется: файловые операции, cwd агента, Git, RPC, путь в тултипах остаются реальным путём.
2. Ключ алиаса всегда `getWorkspaceKey(workspacePath, workspaceIdentity)`; same path на разных remote-хостах — разные алиасы.
3. Алиас не влияет на дедупликацию/identity: `isSameWorkspaceTab`, `workspaceKey`-границы не затрагиваются.
4. Пустой/пробельный алиас = удаление записи из map; пустые строки не персистятся.
5. Алиас — display-only: не попадает в промпты агента, протокол, имена задач, терминалы.
6. Окно без settingService: чтение даёт fallback-имена, запись завершается явной ошибкой в диалоге (`setProjectAlias` бросает до RPC). Гейта-скрытия пункта нет сознательно: accessor — универсальный RPC-proxy, truthiness-проверка невозможна; во всех текущих окнах (desktop, remote-attachment, web) settingService присутствует, а `supportsSettings=false` есть только у update-status окна без сайдбара.
7. SSH-суффикс `[SSH: …]` и remote-подзаголовки строятся поверх resolve-имени, порядок не меняется.

## 5. Валидация

- `trim()`; удаление управляющих символов (`[\x00-\x1F\x7F]`, включая `\r` от CRLF-вставки).
- Максимум 100 символов. Черновик молча обрезается до лимита: `maxLength=100` на input (UTF-16 code units) + `slice(0, 100)` в нормализации при записи; счётчик/подсветка не нужны.
- Уникальность между проектами не требуется (display-only).
- Ошибка `settingService.update` → диалог остаётся открыт с draft'ом, показываем error-текст (паттерн `taskGroup.renameFailed`).

## 6. Сценарии приёмки

| # | Сценарий | Ожидание | Тип |
| --- | --- | --- | --- |
| A1 | Задать алиас локальному проекту | Сайдбар, заголовок, command center, список задач показывают алиас; после перезапуска сохраняется | accepted |
| A2 | Очистить алиас в диалоге | Запись удалена, везде снова имя папки | accepted |
| A3 | Два remote workspace с одним путём на разных хостах | Алиасы независимы (ключ с identity) | accepted |
| A4 | Второе окно открыто во время переименования | После `onSettingsChanged` во втором окне алиас появляется без перезапуска | accepted |
| A5 | SSH workspace | Алиас отображается, суффикс `[SSH: alias]` сохраняется | accepted |
| A6 | Навести курсор на строку сайдбара с алиасом (без SSH-тултипа) | Тултип показывает реальное имя папки и полный путь; без алиаса тултип не появляется | accepted |
| P1 | Терминальные табы | Остаются basename cwd — решено не алиасить (см. матрицу) | pruned |
| P2 | Окно без settingService (сейчас таких с сайдбаром нет) | Сохранение показывает «Could not rename project», имена — fallback | pruned (явная ошибка записи) |
| U1 | Алиас совпадает с именем другой папки | Поведение не определено специально: конфликта нет, поверхности показывают как есть | undefined (осознанно) |

## 7. Тесты и верификация

- Unit (`node:test`, `packages/ui/test/projectAlias.test.ts`): resolve/fallback, нормализация ключа, trim/длина/управляющие символы, merge одного ключа без затирания соседних; схема-тесты в том же файле (`appSettingsSchema`/`appSettingsPatchSchema`).
- Раннер (фактический, из корня пакета с tsconfig для алиаса `@/`):
  `cd packages/ui && node --import tsx --test test/projectAlias.test.ts`.
- Прогнано при реализации: `pnpm typecheck` — 0 ошибок; `pnpm lint` — 0 errors, 72 warnings (равны бейзлайну ветки); `pnpm architecture:check --changed` — 0 violations.
- Интерактивный E2E в этой среде не запускался (только unit-покрытие логики и type-проверки UI).

## 8. Решения по открытым вопросам (зафиксированы)

| Вопрос | Решение |
| --- | --- |
| Алиасить ли терминальные табы | Нет. Заголовок таба — basename cwd сессии; cwd бывает подкаталогом, алиас проекта там вводит в заблуждение. Пересмотр возможен в v2 как режим «только корневые сессии» |
| Синхронизация между устройствами | Нет, v1 локально: алиас живёт в settings.json машины. Remote-проекты ключуются по workspaceIdentity, у каждого устройства свой алиас одного проекта. Серверная синхронизация — отдельная доработка |
| Реальное имя папки рядом с алиасом | Тултип при hover в сайдбаре (реальное имя + полный путь, только когда алиас задан); в SSH-тултипе путь и так виден |
