# Calcolatore di Estrusione

Production-time calculator for polycarbonate sheets and profiles on the extrusion line of **AKRAPLAST Sistemi S.r.l.**

The app computes the total production time of a queue of orders and the finish date/time, assuming the line runs 24/7.

## Features

- **Two calculator types** in tabs: **Sheets** (default) and **Profiles** (with package count output).
- **Simplified settings panel** with three toggles that flip the default behaviors:
  - ⚡ **Per-order speed** → off: single global speed; on: speed field per order.
  - 🗓 **Set time** → off: start now; on: manual date/time via calendar.
  - ⏸ **Gaps between orders** → off: continuous run; on: gap field per order.
- **Calendar** (`react-datepicker`) with past dates and times disabled. On mobile (≤ 480px) it opens as a full-width modal with body scroll-lock.
- **Responsive layout**:
  - Mobile (< 768px): icon-only toggles, 2-column order rows, results as cards.
  - Desktop (≥ 768px): toggles with labels, inline order rows, results as a table.
  - `min-width: 320px` to prevent layout breakage on ultra-narrow viewports.
- **3 UI languages**: Italian (default), English, Spanish — auto-detected via `i18next-browser-languagedetector`.
- **Print** + **copy to clipboard** for the result.

## Stack

- **React 19** + **TypeScript** + **Vite 8**
- **Tailwind CSS 4** (configured via `@theme` in `index.css`, `@tailwindcss/vite` plugin)
- **react-i18next** (IT · EN · ES)
- **react-hook-form** + **zod** + **@hookform/resolvers**
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
Order length (m)       = (pieces × length_mm) / 1000
Production time (min)  = length_m / speed_m_per_min

Order #N start         = #(N-1) end + #(N-1) gap-after
Order #N end           = #N start + #N production time
Total duration         = last end − first start

Packages (profiles)    = ⌈ pieces / profiles_per_package ⌉
```

The core function is [`calculateSchedule(settings, orders, { now?, mode? })`](src/utils/calculator.ts) — pure, covered by tests in [`calculator.test.ts`](src/utils/calculator.test.ts) (20 tests).

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
│   ├── CalculatorForm.tsx      # FormProvider, dynamic schema
│   ├── OrdersList.tsx          # useFieldArray, mobile/desktop layout
│   ├── ResultsPanel.tsx        # mobile cards + desktop table
│   └── FieldError.tsx
├── locales/
│   ├── it.json
│   ├── en.json
│   └── es.json
├── utils/
│   ├── calculator.ts           # pure logic
│   ├── calculator.test.ts      # 20 tests
│   ├── defaults.ts             # buildEmptyDefaults(), makeEmptyOrder()
│   └── format.ts               # date/duration formatting
├── types.ts
├── formSchema.ts               # buildFormSchema(mode) — zod factory
├── i18n.ts
├── App.tsx                     # mode state + formKey for remount
├── main.tsx
└── index.css                   # Tailwind 4 @theme + DatePicker overrides
```

## Technical notes

- **Form reset**: the "New calculation" button and tab switching bump `formKey` on `<CalculatorForm key={formKey}>` to unmount/remount the form. RHF with uncontrolled inputs and `undefined` defaults doesn't reliably sync DOM inputs via `reset()` — remount is the safe pattern.
- **Dynamic schema**: `buildFormSchema(mode)` returns a different zod schema for `sheets` vs `profiles` (in `profiles`, `profilesPerPackage` is required).
- **Mobile DatePicker**: `withPortal` is enabled only below 480px via `useMediaQuery`; the body is locked (`position: fixed`) to prevent background scroll under the modal.
- **Vitest on Windows**: the default `forks` pool times out — `--pool=threads` is required in the `test` script.
