# Electron Desktop — Agent Guidelines

## Scope

- This is a standalone Electron app (`apps/electron-desktop/`).
- **Never modify files outside `apps/electron-desktop/`** — core project code, root configs, and other apps are off-limits.
- **Never use scripts from the core project** (e.g. `scripts/committer`, root `pnpm` scripts). Use only local commands described below.
- **Never commit without explicit user permission.** Always ask before running `git add`, `git commit`, or any staging/commit operation.

## Testing

- Run tests: `npx vitest run --config vitest.config.ts` from `apps/electron-desktop/`.
- Always run tests after any file moves or import changes.

## Renderer UI Architecture (Feature-based)

Source: `renderer/src/`

```
renderer/src/
├── main.tsx              # entry point (Provider, HashRouter, global CSS imports)
├── env.d.ts              # ambient type declarations for window.openclawDesktop
├── gateway/              # gateway WebSocket RPC client + React context
├── ipc/                  # desktop IPC wrapper (desktopApi)
├── store/                # Redux store, typed hooks, slices (chat, config, gateway, onboarding)
└── ui/
    ├── app/              # app shell: App.tsx, routes.ts, ExecApprovalModal.tsx
    ├── chat/             # chat feature: ChatPage, ChatComposer, StartChatPage, messageParser, etc.
    ├── sidebar/          # sidebar: Sidebar, SessionSidebarItem
    ├── terminal/         # terminal: TerminalPage
    ├── updates/          # auto-update: UpdateBanner, WhatsNewModal
    ├── onboarding/       # onboarding & bootstrap (see sub-structure below)
    ├── settings/         # settings: SettingsPage + tab subdirs (see sub-structure below)
    ├── shared/           # cross-feature shared code: kit/ (UI primitives), models/, toast, Toaster
    ├── styles/           # global CSS (base, layout, etc.)
    └── __tests__/        # smoke & integration tests
```

### Onboarding sub-structure

```
ui/onboarding/
├── ConsentScreen.tsx        # pre-onboarding consent
├── LoadingScreen.tsx        # loading / spinner screen
├── WelcomePage.tsx          # main onboarding orchestrator (renders all sub-pages via Routes)
├── connections/             # service connection pages (Telegram, Slack, Notion, etc.)
├── providers/               # provider & model selection pages (ProviderSelect, ApiKey, ModelSelect)
├── skills/                  # skill/feature setup pages (Skills, Gog, MediaUnderstanding, WebSearch)
└── hooks/                   # shared hooks, types, utils, constants for the onboarding flow
```

- `WelcomePage.tsx` imports page components from `connections/`, `providers/`, `skills/`.
- `hooks/` contains `useWelcomeState` (main state orchestrator) and domain hooks (`useWelcome*.ts`).
- `hooks/types.ts` exports `ConfigSnapshot` and `GatewayRpcLike` — also used by `settings/` modals.
- New onboarding connection page → `connections/`; new skill page → `skills/`; new provider page → `providers/`.

### Settings sub-structure

```
ui/settings/
├── SettingsPage.tsx          # settings shell (tabs, outlet context, routing)
├── SettingsPage.css
├── OtherTab.tsx              # "Other" tab (small, stays in root)
├── OtherTab.css
├── connectors/               # Messengers/connectors tab
│   ├── ConnectorsTab.tsx
│   ├── useConnectorsStatus.ts
│   └── modals/               # per-connector setup modals (Telegram, Slack, Discord, etc.)
├── providers/                # AI Models & Providers tab
│   ├── ModelProvidersTab.tsx
│   ├── ApiKeyModalContent.tsx
│   ├── ProviderTile.tsx
│   └── ProviderTile.test.tsx
└── skills/                   # Skills & Integrations tab
    ├── SkillsIntegrationsTab.tsx
    ├── useSkillsStatus.ts
    ├── CustomSkillMenu.tsx
    ├── CustomSkillMenu.test.tsx
    ├── CustomSkillUploadModal.tsx
    └── modals/               # per-skill setup modals (Notion, GitHub, Obsidian, etc.)
```

- Each tab has its own subdirectory containing the tab component, hooks, and related modals.
- `OtherTab` stays in root (only 2 files — no need for a separate dir).
- New connector modal → `connectors/modals/`; new skill modal → `skills/modals/`.

### Where to put new code

| What you're adding                 | Where it goes                                                     |
| ---------------------------------- | ----------------------------------------------------------------- |
| New page / feature                 | Create a new dir under `ui/` (e.g. `ui/my-feature/`)              |
| Component used by one feature      | Inside that feature dir (e.g. `ui/chat/MyComponent.tsx`)          |
| Component/util used by 2+ features | `ui/shared/` (kit for UI primitives, or top-level for utils)      |
| New Redux slice                    | `store/slices/` (slices stay centralized)                         |
| New route                          | Register in `ui/app/routes.ts`, page component in the feature dir |
| Global CSS                         | `ui/styles/`                                                      |
| Per-component CSS                  | Next to the component file in its feature dir                     |

### Import conventions

- Features import from `../shared/` for shared UI kit, models, toast.
- Features import from `../../gateway/`, `../../ipc/`, `../../store/` for infra (two levels up from `ui/<feature>/`).
- Features import from `../app/routes` for route constants.
- Never use barrel re-exports between feature dirs — import directly from the source file.
- Tests colocate with their source files (`MyComponent.test.tsx` next to `MyComponent.tsx`).

## CSS Strategy

- **Per-component CSS**: lives next to the component (e.g. `chat/ChatComposer.css`).
- **Global CSS**: lives in `ui/styles/` and is imported once via `ui/styles/index.css` in `main.tsx`.
- Some component CSS is imported in `main.tsx` for global side-effect styles (Sidebar.css, chat transcript styles). Keep this pattern when adding new global-scope component styles.

## Main-Process Architecture

Source: `src/main/`

```
src/main/
├── bootstrap/          # app-bootstrap.ts (wiring), app-lifecycle.ts (events, quit, deep-link)
├── gateway/            # config.ts, lifecycle.ts, spawn.ts, pid-file.ts, config-migrations.ts
├── ipc/                # IPC handler modules (one per domain) + register.ts orchestrator + types.ts
│   └── backup/         # backup sub-services (archive, restore, dialog, config-patch)
├── platform/           # Platform abstraction: types.ts (interface), darwin.ts, win32.ts, index.ts
├── whisper/            # models.ts (data), download.ts (util), ffmpeg.ts, model-state.ts, ipc.ts
├── gog/                # gog.ts (exec helper), ipc.ts, types.ts
├── reset/              # ipc.ts (reset-and-close handler)
├── terminal/           # ipc.ts + pty-manager.ts (multi-session PTY)
├── keys/               # API key storage + auth profiles
├── openclaw/           # paths.ts (binary/renderer path resolution)
├── util/               # fs.ts, net.ts (port picking, tail buffer)
├── window/             # mainWindow.ts, window-manager.ts
├── auth/               # anthropic.ts
├── app-state.ts        # mutable AppState type + factory
├── types.ts            # BinaryPaths, GatewayState, ResetAndCloseResult
├── constants.ts        # DEFAULT_PORT
├── consent.ts          # consent read/write
├── tray.ts             # system tray
├── updater.ts          # auto-updater
├── update-splash.ts    # macOS update splash screen
└── deep-link.ts        # deep-link parsing
```

### Adding a new IPC channel (checklist)

When adding a new IPC channel, update these files in order:

1. `src/shared/ipc-channels.ts` — add the channel name to the `IPC` object (for invoke/handle) or `IPC_EVENTS` (for one-way main→renderer events).
2. `src/shared/desktop-bridge-contract.ts` — add the method signature to the `OpenclawDesktopApi` interface and add the key to the `DESKTOP_BRIDGE_KEYS` array.
3. `src/preload.ts` — implement the bridge method using `ipcRenderer.invoke(IPC.yourChannel, ...)`.
4. `src/main/ipc/<domain>-ipc.ts` — implement `ipcMain.handle(IPC.yourChannel, ...)` using the `IPC` constant (never hardcoded strings).
5. `src/main/ipc/types.ts` — if the handler needs new params, add them to `RegisterParams` and update the narrowed `Pick` type for the module.
6. `src/main/ipc/register.ts` — if adding a new handler module, import and call it here.

The contract test in `src/main/ipc/contracts.test.ts` automatically verifies that all `IPC` channels are registered and all handler modules accept only their narrowed param types.

### IPC handler pattern

Every IPC handler module follows the same pattern:

- **Params:** accept a narrowed `Pick<RegisterParams, ...>` type (defined in `types.ts`).
- **Channel names:** always use `IPC.*` constants from `src/shared/ipc-channels.ts` — never raw strings.
- **Registration:** called from `register.ts` with `registerFoo(params)`.
- **Type safety:** the contract test has `expectTypeOf` assertions for each handler module.

### Platform abstraction

The `Platform` interface (`src/main/platform/types.ts`) abstracts all OS-specific behavior. `DarwinPlatform` is shared by macOS and Linux; `Win32Platform` covers Windows.

- **When to add a Platform method:** any logic that has `if (process.platform === ...)` or `switch (process.platform)` should be a Platform method instead.
- **When inline checks are OK:** only for truly trivial one-off checks that are unlikely to differ across platforms.

### Binary paths (`BinaryPaths`)

All bundled/external binary paths are grouped in the `BinaryPaths` type (`src/main/types.ts`). They are resolved once in `app-bootstrap.ts` and spread into `RegisterParams`, `GatewayStarterDeps`, and terminal params.

To add a new binary:

1. Add the field to `BinaryPaths` in `src/main/types.ts`.
2. Add `resolveBin("name", binOpts)` to the `bins` object in `app-bootstrap.ts`.
3. The field automatically flows to `RegisterParams`, gateway deps, and terminal params via spread.
4. Add a narrowed `Pick` type if a specific IPC handler needs access.

### Config migrations

Gateway config migrations live in `src/main/gateway/config-migrations.ts`. Each migration has a `version` number, a `description`, and an `apply(cfg)` function that mutates the config in-place.

To add a new migration:

1. Append a new entry to `DESKTOP_CONFIG_MIGRATIONS` with the next version number.
2. The runner applies all pending migrations (version > stored state) on each app launch.
3. State is tracked in `desktop-state.json` inside `stateDir`.
