import type { WeekendDay } from '../types';

// 30-min slots (values in hours).
const fmtHour = (h: number) => {
  const hh = Math.floor(h);
  return `${String(hh).padStart(2, '0')}:${h - hh >= 0.5 ? '30' : '00'}`;
};
const START_SLOTS: number[] = [];
for (let h = 0; h < 24; h += 0.5) START_SLOTS.push(h);
const END_SLOTS: number[] = [];
for (let h = 0.5; h <= 24; h += 0.5) END_SLOTS.push(h);

const selectCls =
  'rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-ink shadow-sm transition focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none';
const chipActive =
  'w-24 shrink-0 rounded-md border border-brand-600 bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition';
const chipIdle =
  'w-24 shrink-0 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-ink-soft shadow-sm transition hover:border-brand-400 hover:text-ink';

/** Presentational (form-agnostic) working-hours row for one day: enable chip +
 *  24h checkbox + from/to 30-min dropdowns. Controlled via value/onChange. */
export default function DayHoursRow({
  label,
  value,
  onChange,
  labels,
}: {
  label: string;
  value: WeekendDay;
  onChange: (v: WeekendDay) => void;
  labels: { full24: string; from: string; to: string };
}) {
  const dim = value.full24 ? 'opacity-40' : '';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        aria-pressed={value.enabled}
        onClick={() => onChange({ ...value, enabled: !value.enabled })}
        className={value.enabled ? chipActive : chipIdle}
      >
        {label}
      </button>
      {value.enabled && (
        <>
          <label className="inline-flex items-center gap-1.5 text-sm text-ink-soft">
            <input
              type="checkbox"
              checked={value.full24}
              onChange={(e) => onChange({ ...value, full24: e.target.checked })}
              className="h-4 w-4 rounded border-neutral-300 text-brand-600 focus:ring-brand-500"
            />
            {labels.full24}
          </label>
          <select
            aria-label={labels.from}
            disabled={value.full24}
            value={value.start}
            onChange={(e) => onChange({ ...value, start: Number(e.target.value) })}
            className={`${selectCls} ${dim}`}
          >
            {START_SLOTS.map((h) => (
              <option key={h} value={h}>
                {fmtHour(h)}
              </option>
            ))}
          </select>
          <span className={`text-ink-soft ${dim}`}>–</span>
          <select
            aria-label={labels.to}
            disabled={value.full24}
            value={value.end}
            onChange={(e) => onChange({ ...value, end: Number(e.target.value) })}
            className={`${selectCls} ${dim}`}
          >
            {END_SLOTS.map((h) => (
              <option key={h} value={h}>
                {fmtHour(h)}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}
