# Calcolatore di Estrusione

Production-time calculator for polycarbonate sheets and profiles on a 24/7 extrusion line.

The app computes the total production time of a queue of orders and the finish date/time. The line runs Monday 06:00 → Saturday 06:00 in local time; weekends are skipped automatically. Each order can carry a list of sizes, an optional product name, and produced-quantity counters that shrink the remaining time pro-rata.

## Features

- **Two calculator types** in tabs: **Sheets** (default) and **Profiles** (with package count output).
- **Order header**:
  - The `#N` badge is a button — clicking it reveals an inline product-name input (`Nome prodotto`, optional, no label). When set, the name is inherited by newly added orders and shown next to `#N` in the results.
  - The toggle **Σ Metri totali** (per order) swaps the size list for a single total-length input. The choice is inherited by new orders so a whole queue can share the same input shape; previously entered values are kept across toggles.
  - **Rimuovi** removes the order (disabled when only one is present).
- **Per-order speed** with cross-order inheritance: only the first order requires a speed value; subsequent orders inherit the last filled `lastSpeed`. Same inheritance is applied to `profilesPerPackage` and `sheetsPerPallet`.
- **Multi-size orders**: each order holds a list of `{sheets, length, profilesPerPackage?}` triples with `+` / `−` buttons in-row. Total order length = sum across sizes. (When `Σ Metri totali` is on, the list is replaced by a single meters input.)
- **Global settings panel** — three toggles for default behaviors:
  - 🗓 **Set time** → off: start now; on: manual date/time via calendar.
  - ⏸ **Gaps between orders** → off: continuous run; on: optional gap field per order (empty = 0).
  - ✏ **Show product name input** → enables the per-order `Nome prodotto` capsule.
- **Calcolo avanzato (per order)** — collapsible advanced calculation that subtracts already-produced work from the order:
  - **Sizes mode** — produced arrays are index-aligned to `sizes[]`, badges `#N` shown on the count column only:
    - Profiles: `Profili prodotti[]` + `Pacchi prodotti[]`, cross-converted via per-size `profilesPerPackage`.
    - Sheets: `Lastre prodotte[]` + `Lastre per bancale[]` + `Bancali prodotti[]`, cross-converted via per-row `sheetsPerPallet`.
  - **Σ Metri totali mode** — a unified **BatchRowsArray** replaces the three columns with a 4-field row (`count + length + rate + total`) and a single `−/+` pair that adds/removes the whole batch atomically. `profilesPerPackage` and `sheetsPerPallet` become per-batch arrays with **inheritance**: an empty slot inherits the previous filled value (within the order and across orders via `lastPerPackage` / `lastSheetsPerPallet`).
  - **Symmetric mutex** — pairs `count ↔ length` and `rate ↔ total` are disabled together. Stale values left in a disabled field are ignored by the calculator (no contribution to produced/remaining).
- **Results**:
  - Three KPIs at the top: net production time, total duration, queue finish date/time.
  - Per-order breakdown (cards on mobile, table on desktop). When produced data is present, a strip shows `produced / total ↓ remaining` plus `Tempo per il restante`.
  - Under **Σ Metri totali** an extra `Metri prodotti X / Y  ↓ Z m` row is shown — the meter-based progress is the well-defined metric when batches have different lengths (counts/packages are still shown but their remaining is `—`).
  - Multi-size orders also surface a per-size sub-rows breakdown (`#N.1`, `#N.2`, …) with start/end and produced/remaining per size.
  - **Print** + **copy to clipboard** (plain text).
- **Calendar** (`react-datepicker`) with weekend awareness:
  - Sundays are not selectable.
  - On a selectable day, time slots before 06:00 on Mondays and from 06:00 onward on Saturdays are filtered out, matching the line's working window.
  - Past dates and times are also disabled.
  - On mobile (≤ 480px) it opens as a full-width modal with body scroll-lock.
- **Responsive layout**:
  - Mobile (< 768px): icon-only toggles, stacked size rows, results as cards.
  - Desktop (≥ 768px): toggles with labels, inline rows, results as a table with extra produced sub-row(s).
  - `min-width: 320px` to prevent layout breakage on ultra-narrow viewports.
- **UX touches**:
  - Duplicate `+ Aggiungi` button at the bottom-right of the order list, shown only when the top button has scrolled out of view (IntersectionObserver).
  - Validation toast: a floating banner pops up if `Calcola` is pressed with required fields missing, and the page scrolls the first invalid field into view.
  - `cursor: pointer` on every interactive element by default (Tailwind v4 preflight ships `cursor: default`).
- **3 UI languages**: Italian (default), English, Spanish — auto-detected via `i18next-browser-languagedetector`.

## Stack

- **React 19** + **TypeScript** + **Vite 8**
- **Tailwind CSS 4** (configured via `@theme` in `index.css`, `@tailwindcss/vite` plugin)
- **react-i18next** (IT · EN · ES)
- **react-hook-form** + **zod** + **@hookform/resolvers** (mode-aware schema)
- **react-datepicker** + **date-fns** (IT/EN/ES locales registered)
- **Vitest** for unit tests (`--pool=forks` on Windows)

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
| `npm run build` | Production build into `dist/` (runs `tsc -b` first) |
| `npm run preview` | Preview the production build |
| `npm run test` | Run tests once (`vitest run --pool=forks`) |
| `npm run test:watch` | Tests in watch mode |
| `npm run typecheck` | TypeScript type-check (`tsc -b --noEmit`) |
| `npm run lint` | Run ESLint |

## Calculation logic

```
Working window         = Mon 06:00 ↔ Sat 06:00 (local time)
                         start/end snap forward across the weekend gap

Order length (m)
  ├── Σ Metri totali on:  totalLengthM
  └── otherwise:          Σ (size.sheets × size.length) / 1000

Production time (min)  = length_m / speed_m_per_min

Effective produced (per batch / per size)
  ├── direct path:     producedSheets[i] or producedProfiles[i]
  └── rate path:       (producedPallets[i]  × sheetsPerPallet[i])
                       (producedPackages[i] × profilesPerPackage[i])

Produced length (m)    = Σ effective[i] × itemLength[i] / 1000   (Metri totali)
                       = Σ effective[i] × sizes[i].length / 1000 (sizes mode)

Produced fraction      = producedLengthM / orderLengthM
Remaining time (min)   = productionMinutes × (1 − fraction)

Order #N start         = #(N-1) end + #(N-1) gap-after
Order #N end           = #N start + #N remaining time
                         shifted forward across the Sat 06:00 → Mon 06:00 gap
Total duration         = last end − first start

Packages (profiles)    = ⌈ totalProfiles / profilesPerPackage ⌉
Pallets (sheets)       = ⌈ producedSheets / sheetsPerPallet ⌉
```

The core helpers live in [`src/utils/calculator.ts`](src/utils/calculator.ts):

- `calculateSchedule(settings, orders, { now?, mode? })` — pure, fully tested.
- `calculateOrderLengthM(order)` — handles `useTotalLength`, `sizes[]`, and the legacy `sheets/sheetLengthMm` shape.
- `calculateTotalProfiles(order)` — sum of size counts (or legacy `sheets`).
- `calculateProducedProfiles(order, perPackages[])` / `calculateProducedSheets(order, perBatchPerPallets?)` — fraction + counts under both input shapes (the per-batch parameter only kicks in under `useTotalLength`).
- `resolvePerBatchRates(entries, count, lastValue)` — internal helper that resolves per-batch rates with within-order + cross-order inheritance.

Coverage: **45 tests** in [`calculator.test.ts`](src/utils/calculator.test.ts).

## Vercel deployment

1. Import the repo into Vercel.
2. Framework preset: **Vite**.
3. Build command: `npm run build` — output directory: `dist`.
4. No environment variables required.

`tsc -b` runs as part of `build` and surfaces type errors that `tsc --noEmit` may miss (for example interface fields that became optional after a refactor) — green local `npm run build` is the right pre-push check before relying on Vercel.

## Project structure

```
src/
├── components/
│   ├── Header.tsx
│   ├── LanguageSwitcher.tsx
│   ├── Tabs.tsx                # Sheets / Profiles selector + global settings button
│   ├── GlobalSettingsPanel.tsx # 3 toggles + DatePicker (manualStart / gaps / productName)
│   ├── CalculatorForm.tsx      # FormProvider, validation toast
│   ├── OrdersList.tsx          # OrderFields + SizesFieldArray + AdvancedSection + BatchRowsArray
│   ├── ResultsPanel.tsx        # cards (mobile) + table with produced sub-rows (desktop)
│   └── FieldError.tsx
├── locales/
│   ├── it.json
│   ├── en.json
│   └── es.json
├── utils/
│   ├── calculator.ts           # pure logic
│   ├── calculator.test.ts      # 45 tests
│   ├── defaults.ts             # buildEmptyDefaults(mode), makeEmptyOrder(mode, inheritUseTotal, inheritName)
│   ├── numeric.ts              # numericSetValueAs (DRY for number inputs)
│   └── format.ts               # date/duration formatting
├── types.ts                    # Order, OrderSize, ProducedEntry, ScheduledOrder, ScheduledSizeDetail, …
├── formSchema.ts               # buildFormSchema(mode) — single zod schema with per-mode validation
├── i18n.ts
├── App.tsx                     # mode state + formKey for remount
├── main.tsx
└── index.css                   # Tailwind 4 @theme + DatePicker overrides + cursor base
```

`types.ts` exposes the data shapes that flow through the calculator: `Order` carries `producedProfiles[] / producedPackages[] / producedSheets[] / sheetsPerPallet[] / producedPallets[] / producedItemLength[] / profilesPerPackage[]` (the last one is `useTotalLength`-only and parallel to `sheetsPerPallet`). `ScheduledOrder` exposes `producedLengthM` / `remainingLengthM` for the meters-progress row.

## Technical notes

- **Form reset**: the "New calculation" button and tab switching bump `formKey` on `<CalculatorForm key={formKey}>` to unmount/remount the form. RHF with uncontrolled inputs and `undefined` defaults doesn't reliably sync DOM inputs via `reset()` — remount is the safe pattern.
- **`useWatch` for reactive disabled**: `AdvancedSection` reads its mutex flags via `useWatch({ control, name: 'orders.X.field' })` directly. The form runs in `mode: 'onBlur'`, which can suppress `watch().subscribe()` notifications; `useWatch` fires on every change and keeps the disabled state in sync as fields are filled or cleared.
- **Stale-value isolation**: when the user fills the direct path (e.g. `producedSheets`), values left over in the now-disabled rate path (`producedPallets`) are explicitly excluded from the produced totals — the calculator branches on `sumEntries(...) > 0` for the active side before summing the other.
- **Mobile DatePicker**: `withPortal` is enabled only below 480px via `useMediaQuery`; the body is locked (`position: fixed`) to prevent background scroll under the modal.
- **Vitest on Windows**: the default `threads` pool times out on cold start in Vitest 4.1 on Windows — `--pool=forks` is required in both `test` and `test:watch`.
- **React Compiler + RHF**: `babel-plugin-react-compiler` is enabled via `reactCompilerPreset()` in `vite.config.ts`. RHF components that rely on live `formState.errors` need `'use no memo';` as the first statement (`CalculatorForm`, `GlobalSettingsPanel`, `OrdersList`, `OrderFields`, `SizesFieldArray`, `AdvancedSection`, `ProducedSizedArray`, `BatchRowsArray`).
