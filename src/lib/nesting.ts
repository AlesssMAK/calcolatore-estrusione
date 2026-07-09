// Piramide — sheet nesting (distribuzione fogli su bancale).
//
// Physical model, per the operator's spec:
//   • Ogni foglio ha una lunghezza (mm) e una quantità. La larghezza NON si
//     considera — si indica direttamente quante corsie (fogli in larghezza)
//     stanno su un bancale.
//   • "Base" (lunghezza piramidale) = la lunghezza di riferimento: o inserita
//     a mano, oppure il foglio più lungo se non indicata.
//   • Ogni corsia è un contenitore 1D di capacità = base. Ci si mettono uno o
//     più fogli in fila finché entrano; l'avanzo (base − somma) è lo "scarto".
//   • Le corsie si raggruppano in strati (corsie affiancate = larghezza) e gli
//     strati in bancali (limite opzionale di righe/strati per bancale).
//
// Packing: si riempie una corsia alla volta. Ogni nuova corsia parte dal
// foglio più lungo rimasto, poi si completa con il sottoinsieme dei fogli
// rimanenti che riempie di più lo spazio residuo (subset-sum / knapsack ≤
// spazio). Poiché la base è fissa, minimizzare le corsie equivale a
// minimizzare lo scarto totale (scarto = corsie × base − Σ lunghezze).
//
// Il semplice First-Fit-Decreasing qui non basta: accoppierebbe avidamente
// due fogli medi uguali (es. 4220+4220) occupando lo spazio che servirebbe a
// una combinazione migliore (4220+2990+2990), sprecando una corsia intera. Il
// riempimento a subset-sum sceglie il completamento che riempie di più, quindi
// preferisce 2990+2990 (5980) a un secondo 4220 e trova l'ottimo su questi casi.

export interface SheetInput {
  /** Lunghezza del foglio in mm (> 0). */
  length: number;
  /** Quantità di fogli di questa lunghezza (intero > 0). */
  qty: number;
}

export interface NestingOptions {
  /** Base manuale (lunghezza piramidale). Se assente o ≤ 0 → foglio più lungo.
   *  Se inferiore al foglio più lungo viene alzata al più lungo (un pezzo non
   *  può stare in una corsia più corta di sé). */
  base?: number;
  /** Fogli in larghezza (corsie per strato). Default 1. */
  lanes?: number;
  /** Numero massimo di strati per bancale. Se assente o ≤ 0 → illimitato. */
  maxRows?: number;
}

export interface Slot {
  /** Lunghezze dei fogli in questa corsia, es. [6970, 3440]. */
  pieces: number[];
  /** Somma delle lunghezze (fogli affiancati in lunghezza). */
  length: number;
  /** base − length (materiale non usato in questa corsia). */
  scarto: number;
}

export interface Strato {
  /** Corsie affiancate (lunghezza ≤ lanes; l'ultimo strato può averne meno). */
  corsie: Slot[];
  /** Totale fogli fisici nello strato. */
  fogli: number;
}

export interface Bancale {
  strati: Strato[];
}

export interface NestingResult {
  /** Base effettiva usata per il calcolo. */
  base: number;
  /** Corsie per strato effettive (≥ 1). */
  lanes: number;
  /** Tutte le corsie/progetti, ordinate per lunghezza decrescente. */
  slots: Slot[];
  /** slots raggruppati in strati da `lanes` corsie. */
  strati: Strato[];
  /** strati raggruppati in bancali (per maxRows). */
  bancali: Bancale[];
  /** Totale fogli fisici distribuiti. */
  totalFogli: number;
  /** Numero totale di corsie (= slots.length). */
  totalSlots: number;
  /** Scarto totale in mm. */
  totalScarto: number;
}

/** Split an array into chunks of at most `size` (size ≥ 1). */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function gcd(a: number, b: number): number {
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

/**
 * 0/1 subset-sum over `pool` that maximises the total length placed without
 * exceeding `room`. Returns the chosen indices into `pool`. `unit` is the GCD
 * of all lengths — the DP runs in scaled units so its table stays small even
 * for large mm values (lengths are multiples of the unit, so this is exact).
 */
function bestSubset(pool: number[], room: number, unit: number): number[] {
  const R = Math.floor(room / unit);
  if (R <= 0) return [];
  const reach = new Uint8Array(R + 1);
  reach[0] = 1;
  const from = new Int32Array(R + 1).fill(-1); // item index that reached w
  const prev = new Int32Array(R + 1).fill(-1); // previous sum before w
  for (let i = 0; i < pool.length; i++) {
    const v = Math.floor(pool[i] / unit);
    if (v <= 0 || v > R) continue;
    for (let w = R; w >= v; w--) {
      if (reach[w - v] && !reach[w]) {
        reach[w] = 1;
        from[w] = i;
        prev[w] = w - v;
      }
    }
  }
  let best = R;
  while (best > 0 && !reach[best]) best--;
  const idx: number[] = [];
  let w = best;
  while (w > 0 && from[w] >= 0) {
    idx.push(from[w]);
    w = prev[w];
  }
  return idx;
}

/**
 * Distribute the given sheets into corsie (1D bins of capacity = base),
 * then group them into strati (by `lanes`) and bancali (by `maxRows`).
 *
 * Returns an empty result (all totals 0) when there is nothing valid to pack.
 */
export function computeNesting(
  sheets: SheetInput[],
  options: NestingOptions = {},
): NestingResult {
  const lanes = Math.max(1, Math.floor(options.lanes ?? 1));
  const maxRows =
    options.maxRows && options.maxRows > 0 ? Math.floor(options.maxRows) : 0;

  // Expand to individual pieces, keeping only valid positive integers.
  const pieces: number[] = [];
  for (const s of sheets) {
    const len = Number(s.length);
    const qty = Math.floor(Number(s.qty));
    if (!Number.isFinite(len) || len <= 0) continue;
    if (!Number.isFinite(qty) || qty <= 0) continue;
    for (let i = 0; i < qty; i++) pieces.push(len);
  }

  if (pieces.length === 0) {
    return {
      base: 0,
      lanes,
      slots: [],
      strati: [],
      bancali: [],
      totalFogli: 0,
      totalSlots: 0,
      totalScarto: 0,
    };
  }

  const maxLength = Math.max(...pieces);
  // A piece can never sit in a corsia shorter than itself, so the base is at
  // least the longest sheet even if the operator typed something smaller.
  const base =
    options.base && options.base > 0
      ? Math.max(options.base, maxLength)
      : maxLength;

  const unit = pieces.reduce((g, p) => gcd(g, p), 0) || 1;

  // Fill one corsia at a time: seed with the longest remaining sheet, then
  // complete it with the best-filling subset of what's left.
  const remaining = [...pieces].sort((a, b) => b - a);
  const bins: number[][] = [];
  while (remaining.length > 0) {
    const seed = remaining.shift() as number;
    const room = base - seed;
    // Remove chosen pieces high-index-first so earlier splices don't shift the
    // indices we still have to remove.
    const pick = bestSubset(remaining, room, unit).sort((a, b) => b - a);
    const chosen = pick.map((i) => remaining[i]);
    for (const i of pick) remaining.splice(i, 1);
    bins.push([seed, ...chosen].sort((a, b) => b - a));
  }

  // Corsie ordinate per lunghezza decrescente → effetto "piramide".
  const slots: Slot[] = bins
    .map((pcs) => {
      const length = pcs.reduce((sum, p) => sum + p, 0);
      return { pieces: pcs, length, scarto: base - length };
    })
    .sort((a, b) => b.length - a.length);

  const strati: Strato[] = chunk(slots, lanes).map((corsie) => ({
    corsie,
    fogli: corsie.reduce((sum, c) => sum + c.pieces.length, 0),
  }));

  const bancali: Bancale[] = (
    maxRows > 0 ? chunk(strati, maxRows) : [strati]
  ).map((s) => ({ strati: s }));

  return {
    base,
    lanes,
    slots,
    strati,
    bancali,
    totalFogli: pieces.length,
    totalSlots: slots.length,
    totalScarto: slots.reduce((sum, s) => sum + s.scarto, 0),
  };
}
