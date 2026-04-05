# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   └── api-server/         # Express API server
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.

## DTF Maquetador — Key Features

### Export System (api-server/src/routes/pliegos/index.ts)
- `POST /pliegos/:id/export-rgb` — PNG, transparent, AdobeRGB1998 ICC (iCCP chunk), 300 DPI
- `POST /pliegos/:id/export-cmyk` — PDF 1.7, DeviceCMYK, CMYK JPEG (DCTDecode), FOGRA39 ICC embedded, OutputIntent in catalog
- ICC profiles generated from chromaticity data via Python and stored in `artifacts/api-server/src/icc/profiles.ts` as base64 constants
- `pdf-lib` used for PDF generation; CMYK JPEG image embedded as raw XObject with `DeviceCMYK` color space

### AI Features
- Remove background: `PATCH /pliegos/:id/images/:imageId/remove-bg`
- Upscale: `PATCH /pliegos/:id/images/:imageId/upscale`
- Halftone/Semitono: `PATCH /pliegos/:id/images/:imageId/halftone`
- All AI overlays use smooth CSS animations (beam sweep, breathing tint, ring pulse, corner brackets)
- **Local SR model**: waifu2x cunet ONNX (`artifacts/api-server/models/waifu2x_cunet_art_noise2_scale2x.onnx`, 5MB)
  - Tiling: TILE=128px, STEP=92px (border=36px per edge in 2x space = 18px in original space)
  - Formula: `output_size = 2 × tile_size − 72`
  - x2: single pass; x4: two chained 2x passes; x3: waifu2x 2x → Lanczos resize to 3x
  - Fallback: FSRCNN (if waifu2x model missing); loaded via `onnxruntime` CPUExecutionProvider

### Canvas UX
- Ctrl+Z undo (20-step history via HistoryContext)
- Arrow key nudging (0.1cm/step, 1cm+Shift, debounced 400ms)
- Per-image quantity with auto-nest (600ms debounce)
- Auto-nest / pack layout via `POST /pliegos/:id/auto-nest`
- Design system: bg `#111115`, violet `hsl(262 83% 65%)`, borders `rgba(255,255,255,0.07)`

### Mobile Optimization
- Responsive layout: `useMobile()` hook detects `< 768px` viewport using `matchMedia`
- `MobileLayout.tsx` — full mobile shell: top bar (DTF logo, pliego name, undo/redo), canvas (flex-1), optional quick-edit bar (in flow, never overlaps), bottom tab bar (Subir, Pliego, Imágenes, IA)
- Bottom sheet uses `createPortal` directly (NOT Radix Sheet/Dialog — avoids `DialogPortal must be used within Dialog` error)
- **Quick-edit bar (in flow)**: appears between canvas and tab bar when a single image is selected; shows W/H inputs with aspect-ratio lock, quantity +/-, delete; NOT fixed/portal so canvas resizes naturally
- **Dedicated mobile panels**: `MobileUploadPanel.tsx` (drop zone, progress ring, text tool, Recortar/Semi toggles) and `MobilePliegoPanel.tsx` (dimensions, bg color presets, auto-nest, cost card, RGB/CMYK export) in `src/components/layout/mobile/`
- `SidebarRight` handles "Imágenes" and "IA" tabs in mobile mode (accepts `mobile?: boolean` prop)
- Canvas touch events in `CanvasArea.tsx`:
  - Single finger on **resize handle** (`[data-resize-dir]`) → resize image (detected before image div, dispatches native `mousedown` on handle to trigger `startResize`)
  - Single finger on **image** (`[data-image-id]`) → move image
  - Single finger on **background** → pan canvas
  - Two fingers → pinch zoom with focal point preservation
  - Resize handles are 14px (increased from 8px for touch usability)
  - `data-resize-dir` + `data-resize-img` attributes on each handle for touch hit-testing
- Viewport meta: `user-scalable=no` + PWA meta tags (apple-mobile-web-app-capable, etc.)
