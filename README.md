# Calcolatore di Estrusione

Production-time calculator for polycarbonate sheets and profiles on a 24/7 extrusion line.

The app computes the total production time of a queue of orders and the finish date/time. The line runs Monday 06:00 → Saturday 06:00 in local time; weekends are skipped automatically. Each order can carry a list of sizes, an optional product name, and produced-quantity counters that shrink the remaining time pro-rata.

A **per-company product catalog** (Supabase-backed) lets office users pick a pre-defined product and have its production speed auto-filled — no need to know the line speed by heart. Admins manage their catalog through a built-in admin panel; a super-admin can spin up new companies and admin accounts entirely from the UI.

## Features

### Calculator

- **Two calculator types** in tabs: **Sheets** (default) and **Profiles** (with package count output).
- **Order header**:
  - The `#N` badge is a button — clicking it reveals an inline product-name input (`Nome prodotto`, optional). When the catalog is loaded for this URL, the input becomes a combobox with native autocomplete (`<datalist>`) filtered by the active tab; picking a suggestion auto-fills `Velocità` from the catalog.
  - The toggle **Σ Metri totali** (per order) swaps the size list for a single total-length input. Inherited by new orders so a whole queue can share the same input shape.
  - **Rimuovi** removes the order (disabled when only one is present).
- **Per-order speed** with cross-order inheritance: only the first order requires a speed value; subsequent orders inherit the last filled `lastSpeed`. Same inheritance for `profilesPerPackage` and `sheetsPerPallet`.
- **Collapsed-by-default inheritance fields**: from order #2 onwards `speed` and inline `profilesPerPackage` collapse into a `⚡` / `📦` icon button — opens on click, snaps back when left empty. Removes the autofocus trap on mobile when adding a new order.
- **Multi-size orders**: each order holds a list of `{sheets, length, profilesPerPackage?}` triples with `+` / `−` buttons in-row. Total order length = sum across sizes.
- **Global settings panel** — three toggles:
  - 🗓 **Set time** → off: start now; on: manual date/time via calendar.
  - ⏸ **Gaps between orders** → off: continuous; on: optional gap field per order.
  - ✏ **Show product name input** → enables the per-order `Nome prodotto` capsule.
- **Calcolo avanzato (per order)** — collapsible advanced calculation that subtracts already-produced work:
  - **Sizes mode**: per-size blocks (`SizeAdvancedBlock*`) with their own `± ` rows — a single size can hold multiple partial-production entries (day-by-day) tagged with `sizeIndex` and aggregated server-side.
  - **Σ Metri totali mode**: a unified **BatchRowsArray** — 4-field row (`count + length + rate + total`) and a single `−/+` pair that adds/removes the whole batch atomically. `profilesPerPackage` and `sheetsPerPallet` become per-batch arrays with **inheritance** (empty slot inherits the previous filled value within the order and across orders).
  - **Symmetric mutex**: pairs `count ↔ length` and `rate ↔ total` are disabled together. Stale values in disabled fields are ignored by the calculator (no contribution to produced/remaining).
- **Calendar** (`react-datepicker`) with weekend awareness: Sundays disabled; Saturday slots ≥ 06:00 and Monday slots < 06:00 filtered; past dates/times disabled. Below 480px the calendar opens as a full-width modal with body scroll-lock.

### Results

- Three KPIs at the top: net production time, total duration, queue finish date/time.
- Per-order breakdown (cards on mobile, table on desktop). When produced data is present, a strip shows `produced / total ↓ remaining` plus `Tempo per il restante`.
- Under **Σ Metri totali** an extra `Metri prodotti X / Y ↓ Z m` row — the meter-based progress is the well-defined metric when batches have different lengths (counts/packages are still shown but their remaining is `—`).
- Multi-size orders surface a per-size sub-rows breakdown (`#N.1`, `#N.2`, …).
- **🖨 Stampa** — `@media print` hides everything except the results panel, so the browser dialog can save it as a clean PDF.
- **📷 Salva immagine** — exports the results panel as a PNG (via `html-to-image`, 2× pixel ratio).
- **📋 Copia** — plain-text copy to clipboard.

### Catalog (Listino)

- Per-company product catalog stored in Supabase (`companies` + `products` tables, RLS-protected).
- Activated by URL: `?company=<slug>` (e.g. `…/?company=akra-plast`). The clean root URL stays a stand-alone calculator without a listino — nothing is persisted in `localStorage`.
- A pill badge in the header shows `🏷 Listino: <Company name>` when a catalog is loaded.
- Each product has a name, category (`sheets`/`profiles`), and speed (m/min). When the user picks a product from the dropdown, the order's `Velocità` is auto-filled from the catalog.
- Suggestions are natural-sorted within each category (`U4 < U10`, not `U10 < U4`).

### Admin panel (`/admin`)

- Email + password login (`/admin/login`), backed by Supabase Auth. Session persists across reloads.
- **Prodotti** tab: list of catalog products with `+ Aggiungi prodotto`, `✎ Modifica`, `🗑 Elimina`. An admin is mapped to exactly one company through `public.admins` and sees only their own catalog (enforced by Row Level Security on Postgres).
- **Aziende** tab (visible only to a **super-admin** with `is_super=true`): manage companies. Each row shows product count and admin count, with `+ Nuova azienda` / `✎ Modifica` / `🗑 Elimina` actions. Mutations go through three Supabase Edge Functions that perform the operations atomically with the service-role key:
  - `create-company` — creates the company, the admin auth user (auto-confirmed), and the admins-mapping row in one transaction (with rollback on failure).
  - `update-company` — patches `slug` / `name`.
  - `delete-company` — cascades `products` + `admins-mapping`, then deletes the auth users. Refuses to delete the super-admin's own company (anti-foot-gun).
- All three Edge Functions verify `is_super=true` for the caller before doing anything.

### UX touches

- Duplicate `+ Aggiungi` button at the bottom-right of the order list, shown only when the top button has scrolled out of view (IntersectionObserver).
- Validation toast: a floating banner pops up if `Calcola` is pressed with required fields missing; the page scrolls the first invalid field into view.
- `cursor: pointer` on every interactive element by default (Tailwind v4 preflight ships `cursor: default`).
- Field-error text shrinks to `text-[9px]` on viewports ≤ 360px to avoid overlap with the `Calcolo avanzato` toggle.

### Responsive layout

- Mobile (< 768px): icon-only toggles, stacked size rows, results as cards.
- Desktop (≥ 768px): toggles with labels, inline rows, results as a table with extra produced sub-rows.
- `min-width: 320px` to prevent layout breakage on ultra-narrow viewports.

### Languages

- 3 UI languages: Italian (default), English, Spanish — auto-detected via `i18next-browser-languagedetector`.
- Product names in the catalog are language-agnostic (stored as-is by the admin).

## Stack

- **React 19** + **TypeScript** + **Vite 8**
- **Tailwind CSS 4** (`@theme` in `index.css`, `@tailwindcss/vite` plugin)
- **react-router-dom 7** (browser routing: `/`, `/admin`, `/admin/login`)
- **react-i18next** (IT · EN · ES)
- **react-hook-form** + **zod** + **@hookform/resolvers** (mode-aware schema)
- **react-datepicker** + **date-fns** (IT/EN/ES locales registered)
- **html-to-image** (~12 kB, PNG export of the results panel)
- **@supabase/supabase-js** (client for catalog + admin auth + Edge Function invocations)
- **Vitest** for unit tests (`--pool=forks` on Windows)

### Backend (Supabase)

- **Database** (Postgres): `companies`, `products`, `admins` tables with Row Level Security. Anonymous role can read `companies` / `products` (anyone with the URL can see the catalog); writes are restricted to authenticated admins of the matching company. Super-admins (`admins.is_super=true`) have full CRUD on all three tables.
- **Auth**: email/password, sessions stored in `localStorage` for admin persistence.
- **Edge Functions**: `create-company`, `update-company`, `delete-company` — run on Deno, use the service-role key (never exposed to the browser). Free tier comfortably covers the use case.
- A `public.is_super_admin(uuid)` `SECURITY DEFINER` function bypasses RLS for the super-admin policies, sidestepping a self-referential infinite-recursion issue with admins-checks-admins.

## Local setup

```bash
npm install
cp .env.example .env.local   # then fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev
```

The app runs at http://localhost:5173

If you don't set the Supabase env vars, the app still boots as a stand-alone calculator — the catalog dropdown and admin pages simply won't be wired up.

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
- `sumEntriesForSize(entries, sizeIdx)` / `firstNonZeroForSize(entries, sizeIdx)` — aggregate produced entries per size, honoring the `sizeIndex` tag with fallback to array position (backward-compat).

Coverage: **47 tests** in [`calculator.test.ts`](src/utils/calculator.test.ts).

## Vercel deployment

1. Import the repo into Vercel — framework preset **Vite**.
2. Build command: `npm run build`, output directory: `dist`.
3. **Environment variables** (Settings → Environment Variables, for Production + Preview + Development):
   - `VITE_SUPABASE_URL` — your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` — Supabase `publishable` / `anon` key (safe to expose; RLS does the gatekeeping)
4. `vercel.json` rewrites every path to `/index.html` so `/admin/login` (or any client-side route) survives a hard refresh.

`tsc -b` runs as part of `build` and surfaces type errors that `tsc --noEmit` may miss (for example interface fields that became optional after a refactor) — green local `npm run build` is the right pre-push check before relying on Vercel.

## Project structure

```
src/
├── components/
│   ├── Header.tsx                # logo + lang switcher + 🏷 Listino pill
│   ├── LanguageSwitcher.tsx
│   ├── Tabs.tsx                  # Sheets / Profiles + global settings button
│   ├── GlobalSettingsPanel.tsx   # 3 toggles + DatePicker (manualStart / gaps / productName)
│   ├── CalculatorForm.tsx        # FormProvider, validation toast
│   ├── OrdersList.tsx            # OrderFields + SizesFieldArray + AdvancedSection +
│   │                             # SizeAdvancedBlock(Listi|Profili) + BatchRowsArray +
│   │                             # CollapsibleInheritField + OrderNameField (catalog combobox)
│   ├── ResultsPanel.tsx          # cards (mobile) + table with produced sub-rows + export buttons
│   ├── FieldError.tsx
│   └── admin/
│       └── CompaniesTab.tsx      # super-admin: list + create/edit/delete companies
├── contexts/
│   ├── AuthContext.tsx           # session + companyId + isSuper from Supabase
│   └── CatalogContext.tsx        # company + products from Supabase (URL-driven)
├── lib/
│   ├── supabase.ts               # createClient (returns null if env vars absent)
│   └── catalog.ts                # Company / CatalogProduct types, fetch + natural sort
├── pages/
│   ├── AdminLoginPage.tsx
│   └── AdminPage.tsx             # Prodotti tab + Aziende tab (super-admin only)
├── locales/                      # it.json (default), en.json, es.json
├── utils/
│   ├── calculator.ts             # pure logic
│   ├── calculator.test.ts        # 47 tests
│   ├── defaults.ts               # buildEmptyDefaults(mode), makeEmptyOrder(...)
│   ├── numeric.ts                # numericSetValueAs (DRY for number inputs)
│   └── format.ts                 # date/duration formatting
├── types.ts                      # Order, OrderSize, ProducedEntry (with sizeIndex),
│                                 # ScheduledOrder (with producedLengthM / remainingLengthM), …
├── formSchema.ts                 # buildFormSchema(mode) — zod schema (sizeIndex must be
│                                 # declared here or RHF state strips the tag after append)
├── i18n.ts
├── App.tsx                       # <BrowserRouter><AuthProvider><CatalogProvider><Routes/>
├── main.tsx
└── index.css                     # Tailwind 4 @theme + print rules + cursor base
```

Supabase Edge Functions live outside the repo (deployed via Supabase Dashboard / CLI):
- `create-company`, `update-company`, `delete-company` — Deno + service-role key, verify caller `is_super_admin` before mutating.

## Technical notes

- **Form reset**: the "New calculation" button and tab switching bump `formKey` on `<CalculatorForm key={formKey}>` to unmount/remount the form. RHF with uncontrolled inputs and `undefined` defaults doesn't reliably sync DOM inputs via `reset()` — remount is the safe pattern.
- **`useWatch` for reactive disabled**: `AdvancedSection` reads its mutex flags via `useWatch({ control, name: 'orders.X.field' })` directly. The form runs in `mode: 'onBlur'`, which can suppress `watch().subscribe()` notifications; `useWatch` fires on every change and keeps the disabled state in sync as fields are filled or cleared.
- **Stale-value isolation**: when the user fills the direct path (e.g. `producedSheets`), values left over in the now-disabled rate path (`producedPallets`) are explicitly excluded from the produced totals — the calculator branches on `sumEntries(...) > 0` for the active side before summing the other.
- **Zod resolver strips unknown keys**: any new field on `Order` / `ProducedEntry` *must* be declared in `producedEntrySchema` / `orderSchema` — otherwise the resolver discards it right after `useFieldArray.append({ extra })` and the state silently loses the tag (this is how we lost `sizeIndex` for half a day).
- **Mobile DatePicker**: `withPortal` is enabled only below 480px via `useMediaQuery`; the body is locked (`position: fixed`) to prevent background scroll under the modal.
- **Vitest on Windows**: the default `threads` pool times out on cold start in Vitest 4.1 on Windows — `--pool=forks` is required in both `test` and `test:watch`.
- **React Compiler + RHF**: `babel-plugin-react-compiler` is enabled via `reactCompilerPreset()` in `vite.config.ts`. RHF / context-consuming components that rely on live state need `'use no memo';` as the first statement: `CalculatorForm`, `GlobalSettingsPanel`, `OrdersList`, `OrderFields`, `OrderNameField`, `CollapsibleInheritField`, `SizesFieldArray`, `AdvancedSection`, `BatchRowsArray`, `SizeAdvancedBlockListi`, `SizeAdvancedBlockProfili`, `AuthProvider`, `AdminPage`, `AdminLoginPage`, `CompaniesTab`.
- **SPA routing on Vercel**: `vercel.json` rewrites everything to `/index.html` so direct hits on `/admin/login` (or any nested route) don't 404 before React Router mounts.
- **Super-admin RLS recursion**: the obvious `EXISTS (SELECT 1 FROM admins WHERE … is_super=true)` policy on `admins` itself causes infinite recursion in Postgres. The fix is a `SECURITY DEFINER` `public.is_super_admin(uid)` helper that runs as the function owner and bypasses RLS — the policies then call the helper instead of self-referencing the table.
