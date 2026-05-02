# Calcolatore di Estrusione

Production-time calculator for polycarbonate sheets and profiles on the extrusion line of **AKRAPLAST Sistemi S.r.l.**

The app computes the total production time of a queue of orders and the finish date/time, assuming the line runs 24/7. Each order can carry a list of sizes, an optional product name, and produced-quantity counters that shrink the remaining time pro-rata.

## Features

- **Two calculator types** in tabs: **Sheets** (default) and **Profiles** (with package count output).
- **Order header**:
  - The `#N` badge is a button — clicking it reveals an inline product-name input (`Nome prodotto`, optional, no label). When set, the name is inherited by newly added orders and shown next to `#N` in the results.
  - The toggle **Σ Metri totali** (per order) swaps the size list for a single total-length input. The choice is inherited by new orders so a whole queue can share the same input shape; previously entered values are kept across toggles.
  - **Rimuovi** removes the order (disabled when only one is present).
- **Multi-size orders**: each order holds a list of `{count, length}` pairs with `+` / `−` buttons in-row. Total order length = sum across pairs. (When `Σ Metri totali` is on, the list is replaced by a single meters input.)
- **Simplified settings panel** with three toggles that flip the default behaviors:
  - ⚡ **Per-order speed** → off: single global speed; on: speed field per order. Speed is required only on the first order; later orders inherit the last filled value.
  - 🗓 **Set time** → off: start now; on: manual date/time via calendar.
  - ⏸ **Gaps between orders** → off: continuous run; on: optional gap field per order (empty = 0).
- **Calcolo avanzato (per order)** — collapsible advanced calculation that subtracts already-produced work from the order:
  - **Profiles**: `Profili prodotti[]` ↔ `Pacchi prodotti[]` (mutually exclusive — typing into one disables the other; cross-converted via `profilesPerPackage`).
  - **Sheets**: `Lastre prodotte[]` + `Lastre per bancale[]` + `Bancali prodotti[]`. Pallets gate on per-pallet being filled; sheets and pallets cross-convert via the per-pallet sum.
  - Under **Σ Metri totali** an extra `Lunghezza` (mm) field appears so produced count × length can be subtracted from total meters.
  - The schedule reflects the produced fraction: `remainingMinutes = productionMinutes × (1 − fraction)`, the cursor advances by `remainingMinutes`, and the queue's `endAt` accounts for partial work.
- **Results**:
  - Three KPIs at the top: net production time, total duration, queue finish date/time.
  - Per-order breakdown (cards on mobile, table on desktop). When produced data is present, an extra strip shows produced / total / ↓ remaining, plus `Tempo per il restante`.
  - **Print** + **copy to clipboard** (plain text).
- **UX touches**:
  - Duplicate `+ Aggiungi` button at the bottom-right of the order list, shown only when the top button has scrolled out of view (IntersectionObserver).
  - Validation toast: a floating banner pops up if `Calcola` is pressed with required fields missing, and the page scrolls the first invalid field into view.
  - `cursor: pointer` on every interactive element by default (Tailwind v4 preflight ships `cursor: default`).
- **Calendar** (`react-datepicker`) with past dates and times disabled. On mobile (≤ 480px) it opens as a full-width modal with body scroll-lock.
- **Responsive layout**:
  - Mobile (< 768px): icon-only toggles, stacked size rows, results as cards.
  - Desktop (≥ 768px): toggles with labels, inline rows, results as a table with an extra produced sub-row.
  - `min-width: 320px` to prevent layout breakage on ultra-narrow viewports.
- **3 UI languages**: Italian (default), English, Spanish — auto-detected via `i18next-browser-languagedetector`.

## Stack

- **React 19** + **TypeScript** + **Vite 8**
- **Tailwind CSS 4** (configured via `@theme` in `index.css`, `@tailwindcss/vite` plugin)
- **react-i18next** (IT · EN · ES)
- **react-hook-form** + **zod** + **@hookform/resolvers** (mode-agnostic schema)
- **react-datepicker** + **date-fns** (IT/EN/ES locales registered)
- **Vitest** for unit tests (`--pool=threads` on Windows)

No backend: all computation happens client-side and nothing is persisted.

## Local setup

```bash
npm install
npm run dev
```

The app runs at http://localhost:5173

## Available scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with HMR |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Preview the production build |
| `npm run test` | Run tests once (`vitest run --pool=threads`) |
| `npm run test:watch` | Tests in watch mode |
| `npm run typecheck` | TypeScript type-check |
| `npm run lint` | Run ESLint |

## Calculation logic

```
Order length (m)
  ├── Σ Metri totali on:  totalLengthM
  └── otherwise:          Σ (size.count × size.length) / 1000

Production time (min)  = length_m / speed_m_per_min

Produced fraction
  ├── sizes mode:               producedCount / totalCount
  └── Σ Metri totali + length:  (producedCount × itemLength / 1000) / totalLengthM

Remaining time (min)   = productionMinutes × (1 − fraction)

Order #N start         = #(N-1) end + #(N-1) gap-after
Order #N end           = #N start + #N remaining time
Total duration         = last end − first start

Packages (profiles)    = ⌈ totalProfiles / profilesPerPackage ⌉
Pallets (sheets)       = ⌈ producedSheets / sheetsPerPallet ⌉
```

The core helpers live in [`src/utils/calculator.ts`](src/utils/calculator.ts):

- `calculateSchedule(settings, orders, { now?, mode? })` — pure, fully tested.
- `calculateOrderLengthM(order)` — handles `useTotalLength`, `sizes[]`, and the legacy `sheets/sheetLengthMm` shape.
- `calculateTotalProfiles(order)` — sum of size counts (or legacy `sheets`).
- `calculateProducedProfiles(order, perPackage?)` / `calculateProducedSheets(order)` — fraction + counts under both input shapes.

Coverage: **36 tests** in [`calculator.test.ts`](src/utils/calculator.test.ts).

## Vercel deployment

1. Import the repo into Vercel.
2. Framework preset: **Vite**.
3. Build command: `npm run build` — output directory: `dist`.
4. No environment variables required.

## Project structure

```
src/
├── components/
│   ├── Header.tsx
│   ├── LanguageSwitcher.tsx
│   ├── Tabs.tsx                # Sheets / Profiles selector
│   ├── GlobalSettingsPanel.tsx # toggles + DatePicker
│   ├── CalculatorForm.tsx      # FormProvider, validation toast
│   ├── OrdersList.tsx          # OrderFields + SizesFieldArray + AdvancedSection
│   ├── ResultsPanel.tsx        # cards (mobile) + table with produced sub-row (desktop)
│   └── FieldError.tsx
├── locales/
│   ├── it.json
│   ├── en.json
│   └── es.json
├── utils/
│   ├── calculator.ts           # pure logic
│   ├── calculator.test.ts      # 36 tests
│   ├── defaults.ts             # buildEmptyDefaults(mode), makeEmptyOrder(mode, inheritUseTotal, inheritName)
│   └── format.ts               # date/duration formatting
├── types.ts                    # Order, OrderSize, ProducedEntry, ScheduledOrder, …
├── formSchema.ts               # buildFormSchema() — single zod schema, mode-agnostic
├── i18n.ts
├── App.tsx                     # mode state + formKey for remount
├── main.tsx
└── index.css                   # Tailwind 4 @theme + DatePicker overrides + cursor base
```

## Technical notes

- **Form reset**: the "New calculation" button and tab switching bump `formKey` on `<CalculatorForm key={formKey}>` to unmount/remount the form. RHF with uncontrolled inputs and `undefined` defaults doesn't reliably sync DOM inputs via `reset()` — remount is the safe pattern.
- **Single zod schema**: `buildFormSchema()` no longer takes a `mode` argument — both modes share the same shape; per-mode behavior (e.g. `profilesPerPackage` is fully optional, packages are skipped without it) lives in the calculator.
- **`useFieldArray` reactivity**: `AdvancedSection` watches sums via an explicit `watch().subscribe()` rather than `useWatch`, because `useWatch` on nested array paths can miss leaf-level changes (the original cause of the "Bancali prodotti stuck disabled" bug).
- **Mobile DatePicker**: `withPortal` is enabled only below 480px via `useMediaQuery`; the body is locked (`position: fixed`) to prevent background scroll under the modal.
- **Vitest on Windows**: the default `forks` pool times out — `--pool=threads` is required in the `test` script.
