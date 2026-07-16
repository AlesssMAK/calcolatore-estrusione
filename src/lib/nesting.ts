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

/** Seed-and-subset-sum packing: fill one corsia at a time (seed = longest
 *  remaining, then the best-filling subset of the rest). */
function packBins(pieces: number[], base: number, unit: number): number[][] {
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
  return bins;
}

/** Corsie ordinate per lunghezza decrescente → effetto "piramide". */
function binsToSlots(bins: number[][], base: number): Slot[] {
  return bins
    .map((pcs) => {
      const length = pcs.reduce((sum, p) => sum + p, 0);
      return { pieces: pcs, length, scarto: base - length };
    })
    .sort((a, b) => b.length - a.length);
}

/** Sizes that sit in corsie whose lengths differ by more than `gap` — a size
 *  split across dissimilar rows, which raises a production split warning. */
function scatteredSizes(slots: Slot[], gap: number): Set<number> {
  const span = new Map<number, { min: number; max: number }>();
  for (const s of slots) {
    for (const size of new Set(s.pieces)) {
      const e = span.get(size);
      if (e) {
        e.min = Math.min(e.min, s.length);
        e.max = Math.max(e.max, s.length);
      } else span.set(size, { min: s.length, max: s.length });
    }
  }
  const out = new Set<number>();
  for (const [size, { min, max }] of span) if (max - min > gap) out.add(size);
  return out;
}

/**
 * The subset-sum packer maximises per-corsia fill, which can scatter a size
 * across dissimilar rows (e.g. 6740+1200+1200+1200 here, one lone 1200 there)
 * for no global benefit — often another packing with the SAME corsia count
 * keeps that size together. When sizes are scattered, reserve them into their
 * own (evenly split) corsie, re-pack the rest, and adopt the result only when
 * it's FREE: no extra corsie (so total scarto is unchanged) and strictly fewer
 * scattered sizes. Lanes-agnostic — runs before strati are formed.
 */
function deScatter(
  slots: Slot[],
  pieces: number[],
  base: number,
  unit: number,
  gap: number,
): Slot[] {
  const scattered = scatteredSizes(slots, gap);
  if (scattered.size === 0) return slots;

  const count = new Map<number, number>();
  const rest: number[] = [];
  for (const p of pieces) {
    if (scattered.has(p)) count.set(p, (count.get(p) ?? 0) + 1);
    else rest.push(p);
  }

  // Reserve each scattered size into its own corsie, split evenly so the
  // reserved corsie are equal-length (and the size can't re-scatter itself).
  const reserved: number[][] = [];
  for (const [size, c] of count) {
    const per = Math.max(1, Math.floor(base / size));
    const nc = Math.ceil(c / per);
    for (let i = 0; i < nc; i++) {
      const k = Math.floor(c / nc) + (i < c % nc ? 1 : 0);
      reserved.push(new Array<number>(k).fill(size));
    }
  }

  const candidate = binsToSlots(
    [...reserved, ...packBins(rest, base, unit)],
    base,
  );
  const free =
    candidate.length <= slots.length &&
    scatteredSizes(candidate, gap).size < scattered.size;
  return free ? candidate : slots;
}

const byLenDesc = (a: Slot, b: Slot) => b.length - a.length;

/** Group corsie by piece signature; pair `lanes` identical ones into uniform
 *  strati and return the rest (a signature's count not divisible by lanes). */
function splitUniform(
  slots: Slot[],
  lanes: number,
): { uniform: Slot[][]; leftovers: Slot[] } {
  const bySig = new Map<string, Slot[]>();
  for (const s of slots) {
    const sig = s.pieces.join('+');
    const arr = bySig.get(sig);
    if (arr) arr.push(s);
    else bySig.set(sig, [s]);
  }
  const uniform: Slot[][] = [];
  const leftovers: Slot[] = [];
  for (const group of bySig.values()) {
    let i = 0;
    for (; i + lanes <= group.length; i += lanes) {
      uniform.push(group.slice(i, i + lanes));
    }
    for (; i < group.length; i++) leftovers.push(group[i]);
  }
  return { uniform, leftovers };
}

/**
 * Re-pack leftover corsie (lanes>1) grouping their pieces by SIZE, so a size
 * the scarto-optimal packer scattered across mixed corsie gets its own row(s)
 * instead. Each size goes into the FEWEST corsie that hold it (so the corsia
 * count — hence total scarto — is unchanged), the pieces spread as evenly as
 * possible so paired lanes come out equal-length. Only adopted when it's free
 * (see formStrati).
 */
function regroupLeftoversBySize(leftovers: Slot[], base: number): Slot[] {
  const count = new Map<number, number>();
  for (const s of leftovers)
    for (const p of s.pieces) count.set(p, (count.get(p) ?? 0) + 1);

  const out: Slot[] = [];
  for (const [size, c] of count) {
    const maxPer = Math.max(1, Math.floor(base / size));
    const nc = Math.ceil(c / maxPer); // fewest corsie for this size
    for (let i = 0; i < nc; i++) {
      // Even split: the first (c % nc) corsie take one extra piece.
      const k = Math.floor(c / nc) + (i < c % nc ? 1 : 0);
      const pieces = new Array<number>(k).fill(size);
      const length = k * size;
      out.push({ pieces, length, scarto: base - length });
    }
  }
  return out;
}

/**
 * Group corsie into strati of `lanes`, PREFERRING identical corsie in the same
 * strato so equal sizes stay on one level. For lanes>1 the leftover corsie
 * (signature count not a multiple of lanes) are heterogeneous, which scatters a
 * size across mixed rows; we re-pack those pieces grouped by size instead — but
 * only when it's free: no extra corsie (same scarto) and no extra strati (same
 * row count). lanes=1 is left completely untouched.
 */
function formStrati(slots: Slot[], lanes: number, base: number): Slot[][] {
  if (lanes <= 1) return slots.map((s) => [s]);

  const { uniform, leftovers } = splitUniform(slots, lanes);

  // Baseline: chunk the heterogeneous leftovers as-is (may mix sizes in a row).
  const baselineTail = chunk([...leftovers].sort(byLenDesc), lanes);

  // Alternative: leftover pieces regrouped by size, then paired.
  const repacked = regroupLeftoversBySize(leftovers, base);
  const second = splitUniform(repacked, lanes);
  const repackTail = [
    ...second.uniform,
    ...chunk([...second.leftovers].sort(byLenDesc), lanes),
  ];

  // Adopt the grouped version only when it costs nothing: no extra corsie
  // (scarto) and no extra strati (rows). Otherwise keep the tighter packing.
  const grouped =
    repacked.length <= leftovers.length &&
    repackTail.length <= baselineTail.length;
  const tail = grouped ? repackTail : baselineTail;

  const uniformSorted = [...uniform].sort((a, b) => b[0].length - a[0].length);
  tail.sort(
    (a, b) =>
      Math.max(...b.map((c) => c.length)) - Math.max(...a.map((c) => c.length)),
  );
  return [...uniformSorted, ...tail];
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

  // Optimal (scarto-minimal) packing, then a free de-scatter pass that keeps a
  // size together when another same-corsia-count packing allows it.
  let slots = binsToSlots(packBins(pieces, base, unit), base);
  slots = deScatter(slots, pieces, base, unit, SAME_SIZE_GAP_MM);

  const strati: Strato[] = formStrati(slots, lanes, base).map((corsie) => ({
    corsie,
    fogli: corsie.reduce((sum, c) => sum + c.pieces.length, 0),
  }));

  // formStrati may re-pack leftover corsie (lanes>1), so derive the final
  // corsie/totals from the strati to keep everything consistent.
  const finalSlots = strati.flatMap((s) => s.corsie).sort(byLenDesc);

  const bancali: Bancale[] = (
    maxRows > 0 ? chunk(strati, maxRows) : [strati]
  ).map((s) => ({ strati: s }));

  return {
    base,
    lanes,
    slots: finalSlots,
    strati,
    bancali,
    totalFogli: pieces.length,
    totalSlots: finalSlots.length,
    totalScarto: finalSlots.reduce((sum, s) => sum + s.scarto, 0),
  };
}

// --- Production plan (stacking order) --------------------------------------
//
// The operator sets one cut length on the machine and must finish it before
// switching (a setup is costly), so every length has to be produced in ONE
// continuous run. Production order = the order sheets are laid on the bancale,
// base (longest) first. When a length lives in more than one row (e.g. 4220 in
// both 4220+2990+2990 and 4220+2550+2550), those rows are pulled adjacent so
// the length stays a single run — even if it slightly breaks the descending
// pyramid. If the rows are too far apart in length (> gap) we don't force it;
// we flag a warning instead (a future step will re-nest to avoid it).

export interface ProductionGroup {
  strato: Strato;
  /** How many identical strati this group represents. */
  count: number;
}

export interface ProductionItem {
  length: number;
  qty: number;
}

export interface ProductionWarning {
  /** The length shared across rows that are too different to group. */
  length: number;
  /** The differing row lengths (desc). */
  rowLengths: number[];
}

export interface ProductionPlan {
  /** Row groups in production / stacking order (base first). */
  groups: ProductionGroup[];
  /** Each distinct length once, total quantity, in production order. */
  list: ProductionItem[];
  /** Lengths split across rows further apart than the gap. */
  warnings: ProductionWarning[];
}

/** Max row-length difference (mm) still allowed to group a shared length. */
export const SAME_SIZE_GAP_MM = 1000;

export function buildProductionPlan(
  strati: Strato[],
  gapMm: number = SAME_SIZE_GAP_MM,
): ProductionPlan {
  // Collapse identical strati (same corsie signature) into counted groups.
  const map = new Map<string, ProductionGroup>();
  for (const st of strati) {
    const sig = st.corsie.map((c) => c.pieces.join('+')).join('|');
    const e = map.get(sig);
    if (e) e.count += 1;
    else map.set(sig, { strato: st, count: 1 });
  }
  const groups = [...map.values()];
  const n = groups.length;

  const rowLen = (g: ProductionGroup) =>
    Math.max(...g.strato.corsie.map((c) => c.length));
  const groupSizes = groups.map(
    (g) => new Set(g.strato.corsie.flatMap((c) => c.pieces)),
  );

  // Union-Find: connect groups that share a length AND whose rows are within
  // the gap. A shared length across a larger gap raises a warning instead.
  const parent = groups.map((_, i) => i);
  const find = (x: number): number =>
    parent[x] === x ? x : (parent[x] = find(parent[x]));

  const warnings: ProductionWarning[] = [];
  const warned = new Set<number>();
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const shared = [...groupSizes[i]].filter((s) => groupSizes[j].has(s));
      if (shared.length === 0) continue;
      if (Math.abs(rowLen(groups[i]) - rowLen(groups[j])) <= gapMm) {
        parent[find(i)] = find(j);
      } else {
        for (const s of shared) {
          if (warned.has(s)) continue;
          warned.add(s);
          warnings.push({
            length: s,
            rowLengths: [rowLen(groups[i]), rowLen(groups[j])].sort(
              (a, b) => b - a,
            ),
          });
        }
      }
    }
  }

  // Clusters, ordered base-first (by their longest row); rows within a cluster
  // by length desc.
  const clusters = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const arr = clusters.get(r);
    if (arr) arr.push(i);
    else clusters.set(r, [i]);
  }
  const ordered = [...clusters.values()]
    .map((members) => {
      members.sort((a, b) => rowLen(groups[b]) - rowLen(groups[a]));
      return { members, maxLen: rowLen(groups[members[0]]) };
    })
    .sort((a, b) => b.maxLen - a.maxLen)
    .flatMap((cl) => cl.members.map((m) => groups[m]));

  // Total quantity of each length across the whole bancale.
  const totalQty = new Map<number, number>();
  for (const g of groups)
    for (const c of g.strato.corsie)
      for (const p of c.pieces) totalQty.set(p, (totalQty.get(p) ?? 0) + g.count);

  // Production list: each length once (total qty), at its first occurrence in
  // the ordered rows — so a combo's pieces stay together and a shared length
  // is a single consecutive run.
  const emitted = new Set<number>();
  const list: ProductionItem[] = [];
  for (const g of ordered) {
    const distinct = [
      ...new Set(g.strato.corsie.flatMap((c) => c.pieces)),
    ].sort((a, b) => b - a);
    for (const p of distinct) {
      if (emitted.has(p)) continue;
      emitted.add(p);
      list.push({ length: p, qty: totalQty.get(p) ?? 0 });
    }
  }

  return { groups: ordered, list, warnings };
}
