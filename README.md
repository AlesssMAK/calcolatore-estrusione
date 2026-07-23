# Calcolatore di Estrusione

Production-time calculator for polycarbonate **sheets** and **profiles** on an extrusion line.

The app computes the total production time of a queue of orders and the finish date/time.
By default the line runs **Monday 06:00 → Saturday 06:00** (local time) and weekends are
skipped automatically, but an optional **weekend shift** (per-day, half-hour granularity) and
a full **per-company 7-day schedule** can override that. Each order carries a list of sizes,
an optional product name, and produced-quantity counters that shrink the remaining time
pro-rata.

Two extra tools ship alongside the calculator:

- **Piramide** (`/piramide`) — a sheet-nesting / cutting-stock optimiser that lays cut sheets
  onto a bancale as compactly as possible, with photo OCR input and a printable pyramid diagram.
- A **per-company product catalog** (Supabase-backed) that lets office users pick a pre-defined
  product and have its line speed auto-filled — no need to know the speed by heart. Admins
  manage their catalog and **global settings** through a built-in admin panel; a super-admin can
  spin up new companies and admin accounts entirely from the UI.

---

## Features

### Calculator

- **Two calculator types** in tabs: **Sheets** (`Lastre`, default) and **Profiles** (`Profili`,
  with package-count output). A company can restrict the app to a single type (see *Per-company
  settings*), in which case the tab bar collapses to the enabled one.
- **Order header**:
  - The `#N` badge is a button — clicking it reveals an inline product-name input
    (`Nome prodotto`, optional). When a catalog is loaded for this URL the input becomes a
    **custom combobox** (not a native `<datalist>`, which misbehaves in mobile keyboards): a
    positioned dropdown that **filters as you type** (`name.includes(query)`), is scoped to the
    active tab, natural-sorted, and closes on outside-click / `Esc`. Picking a suggestion
    auto-fills `Velocità` (and `cavità` for profiles) from the catalog.
  - The toggle **Σ Metri totali** (per order) swaps the size list for a single total-length
    input. Inherited by new orders so a whole queue can share the same input shape.
  - **Rimuovi** removes the order (disabled when only one is present).
- **Per-order speed** with cross-order inheritance: only the first order requires a speed value;
  subsequent orders inherit the last filled `lastSpeed`. Same inheritance for `cavity`,
  `profilesPerPackage` and `sheetsPerPallet`.
- **Cavity** (profiles): a multi-cavity die extrudes several strands at once, so the line
  finishes the order N× faster (`length / (speed × cavity)`). Auto-filled from the catalog when
  the product defines it.
- **Collapsed-by-default inheritance fields**: from order #2 onwards `speed` and inline
  `profilesPerPackage` collapse into a `⚡` / `📦` icon button — opens on click, snaps back when
  left empty. Removes the autofocus trap on mobile when adding a new order.
- **Multi-size orders**: each order holds a list of `{sheets, length, profilesPerPackage?}`
  triples with `+` / `−` buttons in-row. Total order length = sum across sizes.
- **📷 OCR sheet scanner** (sizes mode): `Scatta foto` / `Carica` under the size list open the
  same camera/crop/recognise flow used by Piramide — it reads `Lunghezza + Quantità` pairs from
  a photo of the order sheet and fills the size rows (`length + sheets`), preserving rows you
  already typed.
- **Calcolo avanzato (per order)** — collapsible advanced calculation that subtracts
  already-produced work:
  - **Sizes mode**: per-size blocks (`SizeAdvancedBlock*`) with their own `±` rows — a single
    size can hold multiple partial-production entries (day-by-day) tagged with `sizeIndex` and
    aggregated server-side.
  - **Σ Metri totali mode**: a unified **BatchRowsArray** — a 4-field row
    (`count + length + rate + total`) with a single `−/+` pair that adds/removes the whole batch
    atomically. `profilesPerPackage` / `sheetsPerPallet` become per-batch arrays with
    **inheritance** (an empty slot inherits the previous filled value within the order and across
    orders).
  - **Symmetric mutex**: the pairs `count ↔ length` and `rate ↔ total` are disabled together.
    Stale values in disabled fields are ignored by the calculator (no contribution to
    produced/remaining).

### Working schedule & weekend shift

- **Default working window**: Mon 06:00 → Sat 06:00 (local). Production runs continuously (24 h)
  on weekdays; the weekend (Sat 06:00 → Mon 06:00) is skipped, and a start/gap that lands in it
  snaps forward to the next working instant.
- **Global settings panel** — four toggles:
  - 🗓 **Set time** → off: start now; on: manual date/time via calendar.
  - ⏸ **Gaps between orders** → off: continuous; on: optional gap field per order.
  - ✏ **Show product name input** → enables the per-order `Nome prodotto` capsule.
  - 📅 **Weekend** → a per-day weekend shift. Each of Saturday / Sunday has its own enable chip,
    a **24 h** checkbox, and `Dalle` / `Alle` dropdowns in **30-minute** slots (24 h disables the
    range). Persisted in `localStorage['calc.weekend']` so it survives reloads and resets. When
    active a banner is shown on the main page (even with the settings panel collapsed) and the
    scheduler works the chosen weekend windows.
- **Calendar** (`react-datepicker`): weekends are blocked unless their weekend shift is enabled;
  on an enabled weekend day only the shift hours are selectable (Saturday keeps its 00:00–06:00
  weekday tail). Past dates/times are disabled. Below 480 px the calendar opens as a full-width
  modal with body scroll-lock.
- **Per-company 7-day schedule**: when a company defines a full weekly schedule in the admin
  panel it becomes the source of truth for **every** day (overriding the Mon–Fri default). The
  base link (no `?company=`) keeps the default + the local weekend toggle.

The scheduler ([`src/utils/calculator.ts`](src/utils/calculator.ts)) is built on a general
working-intervals model (`workingIntervals(dow, work)` → `nextWorkingInstant` →
`addWorkingMinutes`); with no config it reproduces the classic Mon 06:00 → Sat 06:00 behaviour.

### Results

- Three KPIs at the top: net production time, total duration, queue finish date/time.
- Per-order breakdown (cards on mobile, table on desktop). When produced data is present, a strip
  shows `produced / total ↓ remaining` plus `Tempo per il restante`.
- Under **Σ Metri totali** an extra `Metri prodotti X / Y ↓ Z m` row — meter-based progress is
  the well-defined metric when batches have different lengths (counts/packages are still shown
  but their remaining is `—`).
- Multi-size orders surface a per-size sub-rows breakdown (`#N.1`, `#N.2`, …).
- **🖨 Stampa** — `@media print` hides everything except the results panel, so the browser dialog
  can save it as a clean PDF.
- **📷 Condividi foto** — exports the results panel as a PNG and hands it to the native share
  sheet (`navigator.share`), falling back to a new tab / download (via `html-to-image`, 2× pixel
  ratio).
- **📋 Copia** — plain-text copy to clipboard.

### Piramide — sheet nesting (`/piramide`)

Optional page (shown only when the company enables it — see *Per-company settings*) that packs
cut sheets onto a bancale as compactly as possible.

- **Input**: rows of `Quantità + Lunghezza` (mm). No width is computed — the operator states how
  many sheets sit side-by-side (`Lastre in larghezza` = *corsie* per strato). Values can be typed
  or read from a photo.
- **Photo OCR** ([`src/lib/ocr.ts`](src/lib/ocr.ts)): **Tesseract.js** (dynamically imported so
  the WASM is only fetched on scan), grayscale + upscale + **auto-deskew** preprocessing, a
  digits-only whitelist, and a parser that un-glues collapsed `qty+length` tokens. The
  plausible-length window (`min` / `max`, default 300 / 11000 mm) is a per-scan option, so a rare
  extra-long sheet or short-noise filter can be dialed in. A collapsed diagnostics panel shows the
  raw engine text + confidence.
- **Nesting** ([`src/lib/nesting.ts`](src/lib/nesting.ts)): fills one corsia at a time (seed =
  longest remaining, then a **subset-sum** completion that maximises the fill ≤ base), which beats
  a naive First-Fit-Decreasing on real orders. Corsie group into *strati* (by `lanes`), strati
  into *bancali* (by an optional max-rows limit).
  - **Same-size grouping (lanes > 1)** and a **free de-scatter pass** keep a size together when
    another packing with the *same* corsia count (hence the same scarto) allows it — so a size
    isn't split across dissimilar rows for no global benefit.
- **Result**: a paper-style table (`# · Combinazione · Lunghezza · Lastre · Scarto`), summary
  chips, an **SVG pyramid** in production/stacking order, and a **production-order list** (each
  length once, so one machine setup per length). Rows sharing a length that are too far apart
  raise a `⚠` warning. **🖨 Stampa** and **📷 Salva immagine** export the panel.
- Covered by unit tests in [`nesting.test.ts`](src/lib/nesting.test.ts) and
  [`ocr.test.ts`](src/lib/ocr.test.ts).

### Catalog (Listino)

- Per-company product catalog stored in Supabase (`companies` + `products` tables, RLS-protected).
- Activated by URL: `?company=<slug>` (e.g. `…/?company=akra-plast`). The clean root URL stays a
  stand-alone calculator without a listino — nothing is persisted in `localStorage`.
- A pill badge in the header shows `🏷 Listino: <Company name>` when a catalog is loaded.
- Each product has a name, category (`sheets`/`profiles`), speed (m/min), and optional cavity.
  Picking a product auto-fills the order's `Velocità` (and cavity for profiles).
- Suggestions filter as you type and are natural-sorted within each category
  (`U4 < U10`, not `U10 < U4`).

### Admin panel (`/admin`)

- Email + password login (`/admin/login`), backed by Supabase Auth. Session persists across
  reloads. The header shows `Admin · <company name>` + the signed-in email, and a strip below it
  with the full shareable calculator URL (`/?company=<slug>`) + a **📋 Copia** button. The
  `Calcolatore` button links to that company's calculator.
- **Prodotti** tab: list of catalog products with `+ Aggiungi prodotto`, `✎ Modifica`,
  `🗑 Elimina`. An admin is mapped to exactly one company through `public.admins` and sees only
  their own catalog (enforced by Row Level Security on Postgres).
- **⚙ Impostazioni globali** (every admin): a responsive modal to configure the company's
  calculator — which tabs to show, whether Piramide is visible, and a 7-day working schedule
  (see *Per-company settings*).
- **Aziende** tab (super-admin only, `is_super=true`): manage companies. Each row shows product /
  admin counts, with `+ Nuova azienda` / `✎ Modifica` / `🗑 Elimina`. Mutations go through three
  Supabase Edge Functions that run atomically with the service-role key:
  - `create-company` — creates the company, the admin auth user (auto-confirmed), and the
    admins-mapping row in one transaction (rollback on failure).
  - `update-company` — patches `slug` / `name`.
  - `delete-company` — cascades `products` + `admins-mapping`, then deletes the auth users.
    Refuses to delete the super-admin's own company (anti-foot-gun).
  - All three verify `is_super=true` for the caller before doing anything.

### Per-company settings

Stored per company in a Supabase `company_settings` table (a JSONB blob, RLS: public read /
company-admin write), read by the calculator via `?company=<slug>`:

- **`modes`** — `both` / `sheets` / `profiles`: which calculator tabs the company shows.
- **`showPiramide`** — whether the Piramide page + links are visible. **Off by default** (Piramide
  is removed from the base project); a company opts in via the checkbox. The `/piramide` route is
  guarded and redirects to the calculator when disabled.
- **`schedule`** — an optional full 7-day working schedule (per-day `enabled / 24h / start-end`,
  30-minute slots). When present it drives the scheduler for the whole week.

The active company link (`?company=<slug>`) is preserved across navigation (logo, footer, Piramide
links, back link) so a reload keeps the company context.

### UX touches

- Duplicate `+ Aggiungi` button at the bottom-right of the order list, shown only when the top
  button has scrolled out of view (IntersectionObserver); sized to match the top button.
- Validation toast: a floating banner pops up if `Calcola` is pressed with required fields
  missing; the page scrolls the first invalid field into view.
- `cursor: pointer` on every interactive element by default (Tailwind v4 preflight ships
  `cursor: default`).
- Field-error text shrinks to `text-[9px]` on viewports ≤ 360 px to avoid overlap with the
  `Calcolo avanzato` toggle.

### Responsive layout

- Mobile (< 768 px): icon-only toggles, stacked size rows, results (and the Piramide table) as
  cards.
- Desktop (≥ 768 px): toggles with labels, inline rows, results as a table with extra produced
  sub-rows.
- `min-width: 320px` to prevent layout breakage on ultra-narrow viewports.

### Languages

- 3 UI languages: Italian (default), English, Spanish — auto-detected via
  `i18next-browser-languagedetector`. (The admin panel is Italian-only.)
- Product names in the catalog are language-agnostic (stored as-is by the admin).

---

## Stack

- **React 19** + **TypeScript** + **Vite**
- **Tailwind CSS 4** (`@theme` in `index.css`, `@tailwindcss/vite` plugin)
- **react-router-dom 7** (routing: `/`, `/piramide`, `/admin`, `/admin/login`)
- **react-i18next** (IT · EN · ES)
- **react-hook-form** + **zod** + **@hookform/resolvers** (mode-aware schema)
- **react-datepicker** + **date-fns** (IT/EN/ES locales registered)
- **tesseract.js** (OCR, dynamically imported — only loaded on a photo scan)
- **html-to-image** (PNG export / share of the results & piramide panels)
- **@supabase/supabase-js** (catalog + admin auth + Edge Function invocations)
- **Vitest** for unit tests (`--pool=forks` on Windows)

### Backend (Supabase)

- **Database** (Postgres): `companies`, `products`, `admins`, `company_settings` tables with Row
  Level Security. The anonymous role can read `companies` / `products` / `company_settings`
  (anyone with the URL sees the catalog + settings); writes are restricted to authenticated admins
  of the matching company. Super-admins (`admins.is_super=true`) have full CRUD.
- **Auth**: email/password, sessions stored in `localStorage` for admin persistence.
- **Edge Functions**: `create-company`, `update-company`, `delete-company` — run on Deno with the
  service-role key (never exposed to the browser). `company_settings` needs no Edge Function — it
  is written directly via `supabase.from('company_settings').upsert(...)` (RLS gatekeeps).
- A `public.is_super_admin(uuid)` `SECURITY DEFINER` function bypasses RLS for the super-admin
  policies, sidestepping a self-referential infinite-recursion issue with admins-checks-admins.

> The Supabase schema (tables, RLS, Edge Functions) lives **outside** this repo — it is managed in
> the Supabase dashboard. `company_settings` was added with a hand-run SQL migration (table +
> `public read` and `admin write` RLS policies).

---

## Local setup

```bash
npm install
cp .env.example .env.local   # then fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev
```

The app runs at http://localhost:5173

If you don't set the Supabase env vars, the app still boots as a stand-alone calculator — the
catalog dropdown, admin pages and per-company settings simply won't be wired up (the base link
uses built-in defaults).

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

---

## Calculation logic

```
Working window         = Mon 06:00 ↔ Sat 06:00 (local time) by default
                         + optional per-day weekend shift
                         + optional full per-company 7-day schedule (source of truth)
                         start/end snap forward across any non-working gap

Order length (m)
  ├── Σ Metri totali on:  totalLengthM
  └── otherwise:          Σ (size.sheets × size.length) / 1000

Production time (min)  = length_m / (speed_m_per_min × cavity)

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
                         shifted forward across every non-working interval
Total duration         = last end − first start

Packages (profiles)    = ⌈ totalProfiles / profilesPerPackage ⌉
Pallets (sheets)       = ⌈ producedSheets / sheetsPerPallet ⌉
```

The core helpers live in [`src/utils/calculator.ts`](src/utils/calculator.ts):

- `calculateSchedule(settings, orders, { now?, mode?, schedule? })` — pure, fully tested. `schedule`
  is the optional per-company 7-day schedule.
- `calculateOrderLengthM(order)` — handles `useTotalLength`, `sizes[]`, and the legacy
  `sheets/sheetLengthMm` shape.
- `calculateProducedProfiles` / `calculateProducedSheets` — fraction + counts under both input
  shapes (the per-batch parameter only kicks in under `useTotalLength`).
- `resolvePerBatchRates(entries, count, lastValue)` — per-batch rate resolution with within-order +
  cross-order inheritance.
- `sumEntriesForSize` / `firstNonZeroForSize` — aggregate produced entries per size, honoring the
  `sizeIndex` tag with fallback to array position (backward-compat).

## Nesting logic (Piramide)

The core helpers live in [`src/lib/nesting.ts`](src/lib/nesting.ts):

- `computeNesting(sheets, { base?, lanes?, maxRows? })` — seed + subset-sum packing into corsie,
  a free **de-scatter** pass (keep a size together at the same corsia count), then `formStrati`
  (pair identical corsie, regroup leftovers by size for `lanes > 1`) and bancali chunking.
- `buildProductionPlan(strati, gap?)` — production/stacking order + a "one length = one run" list,
  clustering rows that share a length within a gap and warning when they are too far apart.

Coverage: **99 tests** total across
[`calculator.test.ts`](src/utils/calculator.test.ts),
[`nesting.test.ts`](src/lib/nesting.test.ts) and [`ocr.test.ts`](src/lib/ocr.test.ts).

---

## Vercel deployment

1. Import the repo into Vercel — framework preset **Vite**.
2. Build command: `npm run build`, output directory: `dist`.
3. **Environment variables** (Settings → Environment Variables, for Production + Preview +
   Development):
   - `VITE_SUPABASE_URL` — your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` — Supabase `publishable` / `anon` key (safe to expose; RLS
     gatekeeps)
4. `vercel.json` rewrites every path to `/index.html` so `/admin/login`, `/piramide` (or any
   client-side route) survive a hard refresh.

`tsc -b` runs as part of `build` and surfaces type errors that `tsc --noEmit` may miss — a green
local `npm run build` (plus `npm run test`) is the right pre-push check.

---

## Project structure

```
src/
├── components/
│   ├── Header.tsx                # logo (keeps ?company=) + lang switcher + 🏷 Listino pill
│   ├── LanguageSwitcher.tsx
│   ├── Tabs.tsx                  # Sheets / Profiles + Piramide link + settings button
│   ├── GlobalSettingsPanel.tsx   # 4 toggles (manualStart / gaps / productName / weekend)
│   ├── WeekendBanner.tsx         # always-visible "weekend shift active" banner
│   ├── DayHoursRow.tsx           # form-agnostic per-day hours row (chip + 24h + 30-min selects)
│   ├── WeekendDayRow.tsx*        # (inside GlobalSettingsPanel) RHF-bound weekend day row
│   ├── CalculatorForm.tsx        # FormProvider, validation toast, feeds company schedule
│   ├── OrdersList.tsx            # OrderFields + SizesFieldArray + AdvancedSection +
│   │                             # SizeAdvancedBlock(Listi|Profili) + BatchRowsArray +
│   │                             # CollapsibleInheritField + OrderNameField (catalog combobox)
│   ├── SheetScanner.tsx          # OCR order-sizes scanner (reuses piramide flow)
│   ├── ResultsPanel.tsx          # cards (mobile) + table + export/share buttons
│   ├── FieldError.tsx
│   ├── piramide/
│   │   └── ImageCropper.tsx      # crop frame for the OCR photo
│   └── admin/
│       ├── CompaniesTab.tsx      # super-admin: list + create/edit/delete companies
│       └── GlobalSettingsModal.tsx  # per-company modes / showPiramide / 7-day schedule
├── contexts/
│   ├── AuthContext.tsx           # session + companyId + isSuper from Supabase
│   └── CatalogContext.tsx        # company + products + settings from Supabase (URL-driven)
├── lib/
│   ├── supabase.ts               # createClient (null if env vars absent)
│   ├── catalog.ts                # Company / CatalogProduct / CompanySettings + fetch/save
│   ├── nesting.ts                # cutting-stock: computeNesting + buildProductionPlan
│   ├── ocr.ts                    # tesseract pipeline + parser (parseOcrText, recognizeSheets)
│   └── calcHistory.ts            # saved-calculations LocalStorage helpers
├── pages/
│   ├── AdminLoginPage.tsx
│   ├── AdminPage.tsx             # Prodotti + Aziende (super) + ⚙ Impostazioni globali
│   └── PiramidePage.tsx          # nesting page: OCR input, table, SVG pyramid, plan
├── locales/                      # it.json (default), en.json, es.json
├── utils/
│   ├── calculator.ts             # pure scheduling logic (weekend / 7-day schedule)
│   ├── calculator.test.ts
│   ├── defaults.ts               # buildEmptyDefaults, makeEmptyOrder, weekend pref load/save
│   ├── numeric.ts                # numericSetValueAs (DRY for number inputs)
│   └── format.ts                 # date/duration formatting
├── types.ts                      # Order, OrderSize, ProducedEntry (sizeIndex),
│                                 # WeekendDay/WeekendWork/WeekSchedule, ScheduledOrder, …
├── formSchema.ts                 # buildFormSchema(mode) — zod schema (declare new fields here)
├── i18n.ts
├── App.tsx                       # <BrowserRouter><AuthProvider><CatalogProvider><Routes/>
├── main.tsx
└── index.css                     # Tailwind 4 @theme + print rules + cursor base

* WeekendDayRow is defined inside GlobalSettingsPanel.tsx (RHF-bound); DayHoursRow is its
  standalone value/onChange twin used by the admin modal.
```

Supabase Edge Functions live outside the repo (deployed via Supabase Dashboard / CLI):
`create-company`, `update-company`, `delete-company` — Deno + service-role key, verify caller
`is_super_admin` before mutating.

---

## Technical notes

- **Form reset**: the "New calculation" button and tab switching bump `formKey` (the form is keyed
  on `` `${formKey}:${mode}` ``) to unmount/remount `<CalculatorForm>`. RHF with uncontrolled
  inputs and `undefined` defaults doesn't reliably sync DOM inputs via `reset()` — remount is the
  safe pattern.
- **Derived mode**: the active mode is derived from `selectedMode` and the company `modes` setting
  (not stored via an effect), so a mode restriction applies without a cascading `setState`.
- **`useWatch` for reactive disabled**: mutex flags are read via `useWatch({ control, name })`.
  The form runs in `mode: 'onBlur'`, which can suppress `watch().subscribe()` notifications;
  `useWatch` fires on every change and keeps the disabled state in sync.
- **Stale-value isolation**: when the direct path is filled (e.g. `producedSheets`), values left
  in the now-disabled rate path (`producedPallets`) are excluded from totals — the calculator
  branches on `sumEntries(...) > 0` for the active side before summing the other.
- **Zod resolver strips unknown keys**: any new field on `Order` / `ProducedEntry` *must* be
  declared in `producedEntrySchema` / `orderSchema` — otherwise the resolver discards it right
  after `useFieldArray.append({ extra })` and the state silently loses the tag.
- **Catalog `loading` guard**: `CatalogContext.loading` initialises to `true` when a `?company=`
  slug is present, so route guards (Piramide) wait for the real settings instead of acting on the
  defaults on the first render (which would wrongly redirect on a hard reload).
- **Mobile DatePicker**: `withPortal` is enabled only below 480 px via `useMediaQuery`; the body is
  locked (`position: fixed`) to prevent background scroll under the modal.
- **Vitest on Windows**: the default `threads` pool times out on cold start on Windows —
  `--pool=forks` is required in both `test` and `test:watch`.
- **React Compiler + RHF**: `babel-plugin-react-compiler` is enabled in `vite.config.ts`. RHF /
  context-consuming components that rely on live state need `'use no memo';` as their first
  statement (`CalculatorForm`, `GlobalSettingsPanel`, `OrdersList`, `OrderFields`, `OrderNameField`,
  `CollapsibleInheritField`, `SizesFieldArray`, `AdvancedSection`, `BatchRowsArray`,
  `SizeAdvancedBlock*`, `AuthProvider`, `AdminPage`, `AdminLoginPage`, `CompaniesTab`, …).
- **SPA routing on Vercel**: `vercel.json` rewrites everything to `/index.html` so direct hits on
  `/admin/login`, `/piramide` (or any nested route) don't 404 before React Router mounts.
- **OCR is opt-in weight**: `tesseract.js` is `await import()`-ed only when a scan starts, so its
  WASM never lands in the main calculator bundle.
