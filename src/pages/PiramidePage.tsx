import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import ImageCropper from '../components/piramide/ImageCropper';
import { recognizeSheets } from '../lib/ocr';
import {
  computeNesting,
  type NestingResult,
  type SheetInput,
  type Strato,
} from '../lib/nesting';

interface SheetRow {
  id: string;
  length: string;
  qty: string;
}

let rowSeq = 0;
const newRow = (length = '', qty = ''): SheetRow => ({
  id: `r${rowSeq++}`,
  length,
  qty,
});

// Below this Tesseract confidence a scan is flagged as unreliable (likely
// missing rows) — the operator should re-crop tighter.
const MIN_CONFIDENCE = 90;

const inputCls =
  'w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-ink shadow-sm transition focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none';
const labelCls =
  'block text-xs font-medium tracking-wide text-ink-soft uppercase';

// Group consecutive identical strati (same corsie layout) so a run of 15 twin
// layers collapses to one line "#13–27 ×15" like the paper pyramid.
interface StratoGroup {
  start: number; // 1-based global strato number
  end: number;
  count: number;
  strato: Strato;
}

function stratoSignature(s: Strato): string {
  return s.corsie.map((c) => c.pieces.join('+')).join('|');
}

function groupStrati(strati: Strato[], startNumber: number): StratoGroup[] {
  const groups: StratoGroup[] = [];
  let n = startNumber;
  for (const s of strati) {
    const sig = stratoSignature(s);
    const last = groups[groups.length - 1];
    if (last && stratoSignature(last.strato) === sig) {
      last.end = n;
      last.count += 1;
    } else {
      groups.push({ start: n, end: n, count: 1, strato: s });
    }
    n += 1;
  }
  return groups;
}

function PiramidePage() {
  const { t } = useTranslation();

  const [rows, setRows] = useState<SheetRow[]>([newRow()]);
  const [base, setBase] = useState('');
  const [lanes, setLanes] = useState('1');
  const [maxRows, setMaxRows] = useState('');
  const [result, setResult] = useState<NestingResult | null>(null);

  // Photo / OCR flow.
  const [photoSrc, setPhotoSrc] = useState<string | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatus, setOcrStatus] = useState<{ kind: 'ok' | 'warn' | 'err'; msg: string } | null>(
    null,
  );
  // Raw Tesseract text (+ confidence) of the last scan — collapsed diagnostics.
  const [ocrDebug, setOcrDebug] = useState<{ rawText: string; confidence: number } | null>(
    null,
  );
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setOcrStatus(null);
    setPhotoSrc(URL.createObjectURL(file));
  };

  const closePhoto = () => {
    if (photoSrc) URL.revokeObjectURL(photoSrc);
    setPhotoSrc(null);
    setOcrBusy(false);
    setOcrProgress(0);
  };

  const onCrop = async (canvas: HTMLCanvasElement) => {
    setOcrBusy(true);
    setOcrProgress(0);
    try {
      const result = await recognizeSheets(canvas, (p) => {
        if (p.status === 'recognizing text') setOcrProgress(p.progress);
      });
      setOcrDebug({ rawText: result.rawText, confidence: result.confidence });
      const parsed = result.rows;
      if (parsed.length === 0) {
        setOcrStatus({ kind: 'warn', msg: t('piramide.photo.readEmpty') });
      } else {
        setRows((prev) => {
          const filled = prev.filter((r) => r.length.trim() || r.qty.trim());
          const added = parsed.map((p) => newRow(String(p.length), String(p.qty)));
          return [...filled, ...added, newRow()];
        });
        const confidence = Math.round(result.confidence);
        if (confidence < MIN_CONFIDENCE) {
          setOcrStatus({
            kind: 'warn',
            msg: t('piramide.photo.readLowConfidence', {
              count: parsed.length,
              confidence,
            }),
          });
        } else {
          setOcrStatus({
            kind: 'ok',
            msg: t('piramide.photo.readOk', { count: parsed.length }),
          });
        }
      }
    } catch {
      setOcrStatus({ kind: 'err', msg: t('piramide.photo.readError') });
    } finally {
      closePhoto();
    }
  };

  const setRow = (id: string, patch: Partial<SheetRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };
  const addRowAfter = (id: string) =>
    setRows((prev) => {
      const i = prev.findIndex((r) => r.id === id);
      const next = [...prev];
      next.splice(i + 1, 0, newRow());
      return next;
    });
  const removeRow = (id: string) =>
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  const clearRows = () => {
    setRows([newRow()]);
    setResult(null);
    setOcrDebug(null);
    setOcrStatus(null);
  };

  const parsedSheets: SheetInput[] = rows
    .map((r) => ({ length: Number(r.length), qty: Number(r.qty) }))
    .filter((s) => s.length > 0 && s.qty > 0);

  const totalPieces = parsedSheets.reduce((sum, s) => sum + Math.floor(s.qty), 0);
  const distinct = new Set(parsedSheets.map((s) => s.length)).size;

  const onCompute = () => {
    const r = computeNesting(parsedSheets, {
      base: Number(base) > 0 ? Number(base) : undefined,
      lanes: Number(lanes) > 0 ? Number(lanes) : 1,
      maxRows: Number(maxRows) > 0 ? Number(maxRows) : undefined,
    });
    setResult(r);
    requestAnimationFrame(() => {
      document
        .getElementById('piramide-result')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  return (
    <div className="min-h-full bg-surface-alt">
      <Header title={t('piramide.title')} homeHref="/" />

      <main className="mx-auto max-w-6xl space-y-4 px-3 py-4 sm:space-y-5 sm:px-4 sm:py-8">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-ink-soft shadow-sm transition hover:border-brand-500 hover:text-brand-600"
        >
          ← {t('piramide.backToCalculator')}
        </Link>

        {/* Photo / OCR */}
        <section className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm sm:p-5">
          <h2 className="text-base font-semibold text-ink sm:text-lg">
            {t('piramide.photo.title')}
          </h2>
          <p className="mt-1 text-sm text-ink-soft">{t('piramide.photo.hint')}</p>

          <details className="mt-2 rounded-md border border-brand-100 bg-brand-50/40 p-3 text-xs">
            <summary className="cursor-pointer font-semibold text-brand-700">
              {t('piramide.tips.title')}
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-ink-soft">
              <li>{t('piramide.tips.crop')}</li>
              <li>{t('piramide.tips.allRows')}</li>
              <li>{t('piramide.tips.flat')}</li>
              <li>{t('piramide.tips.lowConf')}</li>
              <li>{t('piramide.tips.manual')}</li>
            </ul>
          </details>

          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={onPickFile}
          />
          <input
            ref={uploadRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onPickFile}
          />

          {photoSrc ? (
            <div className="mt-3">
              <ImageCropper
                src={photoSrc}
                onCrop={onCrop}
                onCancel={closePhoto}
                busy={ocrBusy}
                progress={ocrProgress}
              />
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="rounded-md bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
              >
                {t('piramide.photo.take')}
              </button>
              <button
                type="button"
                onClick={() => uploadRef.current?.click()}
                className="rounded-md border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-ink shadow-sm transition hover:border-brand-500 hover:text-brand-600"
              >
                {t('piramide.photo.upload')}
              </button>
            </div>
          )}

          {ocrStatus && !photoSrc && (
            <p
              className={`mt-3 rounded-md px-3 py-2 text-sm ${
                ocrStatus.kind === 'ok'
                  ? 'bg-green-50 text-success'
                  : ocrStatus.kind === 'warn'
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-red-50 text-danger'
              }`}
            >
              {ocrStatus.msg}
            </p>
          )}

          {ocrDebug && !photoSrc && (
            <details className="mt-3 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs">
              <summary className="cursor-pointer font-semibold text-ink-soft">
                {t('piramide.readText', {
                  confidence: Math.round(ocrDebug.confidence),
                })}
              </summary>
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() =>
                    void navigator.clipboard?.writeText(ocrDebug.rawText)
                  }
                  className="rounded border border-neutral-300 bg-white px-2 py-1 text-[11px] font-medium text-ink-soft hover:border-brand-500 hover:text-brand-600"
                >
                  📋 {t('actions.copy')}
                </button>
              </div>
              <pre className="mt-1 max-h-64 overflow-auto rounded bg-white p-2 font-mono text-[11px] leading-snug whitespace-pre-wrap text-ink">
                {ocrDebug.rawText || '(vuoto)'}
              </pre>
            </details>
          )}
        </section>

        {/* Sheets table */}
        <section className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-ink sm:text-lg">
              {t('piramide.sheets.title')}
            </h2>
            <div className="flex items-center gap-2 text-xs text-ink-soft">
              <span>
                {t('piramide.sheets.totalPieces')}: <b>{totalPieces}</b>
              </span>
              <span>·</span>
              <span>
                {t('piramide.sheets.distinct')}: <b>{distinct}</b>
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2 sm:gap-3">
              <label className={labelCls}>{t('piramide.sheets.length')}</label>
              <label className={labelCls}>{t('piramide.sheets.qty')}</label>
              <span className="w-[84px]" />
            </div>
            {rows.map((r) => (
              <div
                key={r.id}
                className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 sm:gap-3"
              >
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  className={inputCls}
                  value={r.length}
                  onChange={(e) => setRow(r.id, { length: e.target.value })}
                />
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  className={inputCls}
                  value={r.qty}
                  onChange={(e) => setRow(r.id, { qty: e.target.value })}
                />
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={() => removeRow(r.id)}
                    disabled={rows.length <= 1}
                    aria-label={t('piramide.sheets.remove')}
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-neutral-300 bg-white text-base font-medium text-ink-soft shadow-sm transition hover:border-danger hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    onClick={() => addRowAfter(r.id)}
                    aria-label={t('piramide.sheets.add')}
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-brand-300 bg-white text-base font-bold text-brand-700 shadow-sm transition hover:border-brand-600 hover:bg-brand-50"
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={clearRows}
              className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-ink-soft shadow-sm transition hover:border-danger hover:text-danger"
            >
              {t('piramide.sheets.clear')}
            </button>
          </div>
        </section>

        {/* Options */}
        <section className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm sm:p-5">
          <h2 className="mb-3 text-base font-semibold text-ink sm:text-lg">
            {t('piramide.options.title')}
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={labelCls}>{t('piramide.options.base')}</label>
              <input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                placeholder={t('piramide.options.baseHint')}
                className={`${inputCls} mt-1`}
                value={base}
                onChange={(e) => setBase(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>{t('piramide.options.lanes')}</label>
              <input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                className={`${inputCls} mt-1`}
                value={lanes}
                onChange={(e) => setLanes(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-ink-soft">
                {t('piramide.options.lanesHint')}
              </p>
            </div>
            <div>
              <label className={labelCls}>{t('piramide.options.maxRows')}</label>
              <input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                placeholder={t('piramide.options.maxRowsHint')}
                className={`${inputCls} mt-1`}
                value={maxRows}
                onChange={(e) => setMaxRows(e.target.value)}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={onCompute}
            disabled={parsedSheets.length === 0}
            className="mt-6 w-full rounded-md bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 sm:mt-7 sm:w-auto"
          >
            {t('piramide.calculate')}
          </button>
        </section>

        {/* Result */}
        <div id="piramide-result">
          {result && result.totalSlots > 0 ? (
            <ResultView result={result} />
          ) : (
            <div className="rounded-xl border border-dashed border-neutral-300 bg-white/50 p-5 text-center text-sm text-ink-soft sm:p-6">
              {t('piramide.result.empty')}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-surface-alt px-3 py-2">
      <div className="text-[11px] tracking-wide text-ink-soft uppercase">{label}</div>
      <div className="text-sm font-semibold text-ink">{value}</div>
    </div>
  );
}

function ResultView({ result }: { result: NestingResult }) {
  const { t } = useTranslation();
  const multiLane = result.lanes > 1;

  // Global strato numbering across bancali.
  let stratoOffset = 0;

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-base font-semibold text-ink sm:text-lg">
        {t('piramide.result.title')}
      </h2>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Chip label={t('piramide.result.base')} value={`${result.base} mm`} />
        <Chip label={t('piramide.result.corsie')} value={result.totalSlots} />
        <Chip label={t('piramide.result.strati')} value={result.strati.length} />
        <Chip label={t('piramide.result.fogli')} value={result.totalFogli} />
        <Chip
          label={t('piramide.result.scartoTot')}
          value={`${result.totalScarto} mm`}
        />
      </div>

      {result.bancali.map((bancale, bi) => {
        const groups = groupStrati(bancale.strati, stratoOffset + 1);
        stratoOffset += bancale.strati.length;
        return (
          <div key={bi} className="mt-4">
            {result.bancali.length > 1 && (
              <h3 className="mb-2 text-sm font-semibold text-brand-700">
                {t('piramide.result.bancale', { n: bi + 1 })}
              </h3>
            )}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-neutral-300 text-left text-xs tracking-wide text-ink-soft uppercase">
                    <th className="py-2 pr-3">{t('piramide.result.colNum')}</th>
                    <th className="py-2 pr-3">
                      {t('piramide.result.colCombinazione')}
                    </th>
                    <th className="py-2 pr-3">
                      {t('piramide.result.colLunghezza')}
                    </th>
                    <th className="py-2 pr-3">{t('piramide.result.colFogli')}</th>
                    <th className="py-2">{t('piramide.result.colScarto')}</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g, gi) => (
                    <StratoRow key={gi} group={g} multiLane={multiLane} t={t} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function StratoRow({
  group,
  multiLane,
  t,
}: {
  group: StratoGroup;
  multiLane: boolean;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  const { strato, start, end, count } = group;
  const rangeLabel = count > 1 ? `${start}–${end}` : `${start}`;
  const foldLabel = count > 1 ? ` (×${count})` : '';

  // Corsie: dedupe display when all identical (common — twin lanes).
  const combos = strato.corsie.map((c) => c.pieces.join(' + '));
  const lengths = strato.corsie.map((c) => c.length);
  const scarti = strato.corsie.map((c) => c.scarto);
  const allSame = combos.every((x) => x === combos[0]);

  return (
    <tr className="border-b border-neutral-100 align-top">
      <td className="py-2 pr-3 font-medium text-ink-soft">{rangeLabel}</td>
      <td className="py-2 pr-3 font-medium text-ink">
        {allSame ? (
          <span>
            {combos[0]}
            {multiLane && strato.corsie.length > 1 && (
              <span className="text-ink-soft"> ×{strato.corsie.length}</span>
            )}
          </span>
        ) : (
          <div className="space-y-0.5">
            {combos.map((c, i) => (
              <div key={i}>
                <span className="text-[11px] text-ink-soft">
                  {t('piramide.result.corsia', { n: i + 1 })}:{' '}
                </span>
                {c}
              </div>
            ))}
          </div>
        )}
      </td>
      <td className="py-2 pr-3 whitespace-nowrap text-ink">
        {allSame
          ? `${lengths[0]} mm`
          : lengths.map((l) => `${l}`).join(' / ') + ' mm'}
      </td>
      <td className="py-2 pr-3 whitespace-nowrap text-ink">
        {strato.fogli}
        {foldLabel}
      </td>
      <td className="py-2 whitespace-nowrap text-ink-soft">
        {allSame
          ? `${scarti[0]} mm`
          : scarti.map((s) => `${s}`).join(' / ') + ' mm'}
      </td>
    </tr>
  );
}

export default PiramidePage;
