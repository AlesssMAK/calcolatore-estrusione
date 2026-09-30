import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  buildProductionPlan,
  type NestingResult,
  type ProductionGroup,
} from '../../lib/nesting';

// The pyramid bar diagram for one bancale's row groups (base-first). Pure SVG,
// scales to its container. Shared by the Piramide page and the calculator (where
// an order carries its layout schema).
export function PyramidSchema({
  groups,
  base,
}: {
  groups: ProductionGroup[];
  base: number;
}) {
  const { t } = useTranslation();
  if (groups.length === 0 || base <= 0) return null;

  const VW = 1000;
  const BAR_ZONE = 700; // bars live in 0..700; length + ×count to the right
  const maxLanes = Math.max(...groups.map((g) => g.strato.corsie.length));
  const corsiaH = maxLanes > 1 ? 18 : 26;
  const corsiaGap = 3;
  const stratoGap = 12;
  const padY = 6;
  const fontSize = maxLanes > 1 ? 13 : 17;

  // groups are base-first (production order) → draw base at the bottom.
  const rows = [...groups].reverse();

  let y = padY;
  const laid = rows.map((g) => {
    const h = maxLanes * corsiaH + (maxLanes - 1) * corsiaGap;
    const item = { g, y0: y, h };
    y += h + stratoGap;
    return item;
  });
  const height = y - stratoGap + padY;

  return (
    <svg
      viewBox={`0 0 ${VW} ${height}`}
      width="100%"
      className="block"
      style={{ maxWidth: '660px' }}
      role="img"
    >
      {laid.map(({ g, y0, h }, i) => (
        <g key={i}>
          {Array.from({ length: maxLanes }, (_, k) => {
            const by = y0 + k * (corsiaH + corsiaGap);
            const c = g.strato.corsie[k];
            if (!c) {
              return (
                <g key={k}>
                  <rect
                    x={0}
                    y={by}
                    width={BAR_ZONE}
                    height={corsiaH}
                    rx={3}
                    fill="#fafafa"
                    stroke="#d4d4d4"
                    strokeDasharray="5 4"
                  />
                  <text
                    x={BAR_ZONE / 2}
                    y={by + corsiaH * 0.7}
                    textAnchor="middle"
                    fontSize={fontSize}
                    fill="#a3a3a3"
                  >
                    {t('piramide.result.recover')}
                  </text>
                </g>
              );
            }
            const barW = (c.length / base) * BAR_ZONE;
            const x0 = (BAR_ZONE - barW) / 2;
            let cx = x0;
            return (
              <g key={k}>
                <rect x={0} y={by} width={BAR_ZONE} height={corsiaH} rx={3} fill="#f1f1f1" />
                {c.pieces.map((p, j) => {
                  const w = (p / base) * BAR_ZONE;
                  const segX = cx;
                  cx += w;
                  return (
                    <g key={j}>
                      <rect
                        x={segX}
                        y={by}
                        width={w}
                        height={corsiaH}
                        fill="#c8102e"
                        stroke="#ffffff"
                        strokeWidth={2}
                      />
                      <text
                        x={segX + w / 2}
                        y={by + corsiaH * 0.7}
                        textAnchor="middle"
                        fontSize={fontSize}
                        fontWeight={600}
                        fill="#ffffff"
                      >
                        {p}
                      </text>
                    </g>
                  );
                })}
                <text
                  x={BAR_ZONE + 12}
                  y={by + corsiaH * 0.7}
                  fontSize={fontSize}
                  fontWeight={600}
                  fill="#3a3a3a"
                >
                  {c.length} mm
                </text>
              </g>
            );
          })}
          {g.count > 1 && (
            <text
              x={VW - 8}
              y={y0 + h / 2 + fontSize * 0.35}
              textAnchor="end"
              fontSize={17}
              fontWeight={700}
              fill="#c8102e"
            >
              ×{g.count}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

// Diagram + production-order list (+ split warnings) for one bancale.
export function BancaleSchema({
  strati,
  base,
  t,
}: {
  strati: NestingResult['bancali'][number]['strati'];
  base: number;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  const plan = buildProductionPlan(strati);

  return (
    <div className="mt-4">
      <div className="mb-1 text-xs tracking-wide text-ink-soft uppercase">
        {t('piramide.result.schema')}
      </div>

      {plan.warnings.length > 0 && (
        <div className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {plan.warnings.map((w) => (
            <div key={w.length}>
              {t('piramide.result.splitWarning', {
                length: w.length,
                rows: w.rowLengths.join(', '),
              })}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <PyramidSchema groups={plan.groups} base={base} />
        </div>
        <div className="shrink-0">
          <div className="mb-1 text-xs tracking-wide text-ink-soft uppercase">
            {t('piramide.result.order')}
          </div>
          <ol className="text-sm leading-relaxed text-ink tabular-nums">
            {plan.list.map((it, i) => (
              <li key={i}>
                {i + 1}. {it.qty} × {it.length}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

// A collapsed-by-default "Schema piramide" block wrapping the full layout view —
// used by the calculator's order form and results to show a carried layout
// without taking space until opened. Renders nothing without a valid schema.
export function CollapsibleSchema({ schema }: { schema?: unknown }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const result = schema as NestingResult | undefined;
  if (!result?.bancali?.length) return null;
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 transition hover:text-brand-800 sm:text-sm"
      >
        <span aria-hidden>{open ? '▾' : '▸'}</span>
        <span>📐 {t('piramide.schemaBlock')}</span>
      </button>
      {open && (
        <div className="mt-1 rounded-md border border-neutral-200 bg-white p-2 sm:p-3">
          <PiramideSchemaView result={result} />
        </div>
      )}
    </div>
  );
}

// Full layout schema for a whole nesting result (all bancali), used in the
// calculator where an order carries its Piramide layout.
export function PiramideSchemaView({ result }: { result: NestingResult }) {
  const { t } = useTranslation();
  if (!result?.bancali?.length) return null;
  return (
    <div>
      {result.bancali.map((bancale, bi) => (
        <div key={bi}>
          {result.bancali.length > 1 && (
            <div className="mt-2 text-xs font-semibold text-brand-700">
              {t('piramide.result.bancale', { n: bi + 1 })}
            </div>
          )}
          <BancaleSchema strati={bancale.strati} base={bancale.base} t={t} />
        </div>
      ))}
    </div>
  );
}
