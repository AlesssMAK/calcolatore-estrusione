# Calcolatore di Estrusione

Calcolatore del tempo di produzione per lastre in policarbonato sulla linea di estrusione di **AKRAPLAST Sistemi S.r.l.**

L'applicazione calcola il tempo totale di produzione di una coda di ordini e la data/ora di fine lavorazione, considerando che la linea funziona 24/7.

## Stack

- **React 19** + **TypeScript** + **Vite**
- **Tailwind CSS 4**
- **react-i18next** (IT · EN · ES)
- **react-hook-form** + **zod**
- **date-fns**
- **Vitest** per i test di unità

Non esiste backend: tutti i calcoli avvengono nel browser e i risultati non vengono salvati.

## Avvio locale

```bash
npm install
npm run dev
```

L'app sarà disponibile su http://localhost:5173

## Script disponibili

| Comando | Descrizione |
|---|---|
| `npm run dev` | Avvia il server di sviluppo con HMR |
| `npm run build` | Build di produzione in `dist/` |
| `npm run preview` | Anteprima del build di produzione |
| `npm run test` | Esegue i test una volta |
| `npm run test:watch` | Test in modalità watch |
| `npm run typecheck` | Controllo dei tipi TypeScript |
| `npm run lint` | Esegue ESLint |

## Logica di calcolo

```
Lunghezza ordine (m) = (lastre × lunghezza_mm) / 1000
Tempo produzione (min) = lunghezza_m / velocità_m_per_min

Inizio ordine #N   = Fine #(N-1) + Pausa dopo #(N-1)
Fine ordine #N     = Inizio #N + Tempo produzione #N
Durata totale      = Fine ultimo ordine − Inizio primo ordine
```

La funzione principale è [`calculateSchedule`](src/utils/calculator.ts) — funzione pura, coperta dai test in [`calculator.test.ts`](src/utils/calculator.test.ts).

## Deploy su Vercel

1. Importare il repository su Vercel.
2. Framework preset: **Vite**.
3. Build command: `npm run build` — output directory: `dist`.
4. Non sono richieste variabili d'ambiente.

## Struttura del progetto

```
src/
├── components/
│   ├── Header.tsx
│   ├── LanguageSwitcher.tsx
│   ├── GlobalSettingsPanel.tsx
│   ├── OrdersList.tsx
│   ├── ResultsPanel.tsx
│   └── FieldError.tsx
├── locales/
│   ├── it.json
│   ├── en.json
│   └── es.json
├── utils/
│   ├── calculator.ts        # logica pura + test
│   ├── calculator.test.ts
│   └── format.ts            # formattazione date/durata
├── types.ts
├── formSchema.ts            # schema zod per il form
├── i18n.ts
├── App.tsx
└── main.tsx
```
