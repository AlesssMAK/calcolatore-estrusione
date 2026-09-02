import { useTranslation } from 'react-i18next';

interface Props {
  /** True while the user is looking at the as-saved (original) result. */
  showOriginal: boolean;
  /** Epoch ms when the calculation was saved (for the relative label). */
  ts: number;
  onViewOriginal: () => void;
  onViewAdvanced: () => void;
}

/** Relative time ("3h fa") in the current language, degrading gracefully. */
function relativeLabel(ts: number, lang: string): string {
  const minutes = Math.round((Date.now() - ts) / 60_000);
  try {
    const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
    if (Math.abs(minutes) < 60) return rtf.format(-minutes, 'minute');
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) return rtf.format(-hours, 'hour');
    return rtf.format(-Math.round(hours / 24), 'day');
  } catch {
    return new Date(ts).toLocaleString(lang);
  }
}

/**
 * Banner shown when a stale saved calculation has been auto-advanced to "now".
 * Explains the current view and toggles between the advanced and original one.
 */
function AdvanceBanner({
  showOriginal,
  ts,
  onViewOriginal,
  onViewAdvanced,
}: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'it';
  const rel = relativeLabel(ts, lang);

  return (
    <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 sm:text-sm">
      <span className="min-w-0">
        <span aria-hidden>⏱ </span>
        <span className="font-medium">
          {showOriginal ? t('advance.originalView') : t('advance.updatedToNow')}
        </span>
        <span className="ml-1 text-amber-700/80">({rel})</span>
        {!showOriginal && (
          <span className="ml-1 hidden text-amber-700/80 sm:inline">
            · {t('advance.assumption')}
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={showOriginal ? onViewAdvanced : onViewOriginal}
        className="shrink-0 rounded-md border border-amber-300 bg-white px-2.5 py-1 font-medium text-amber-800 shadow-sm transition hover:border-amber-500 hover:text-amber-900"
      >
        {showOriginal ? t('advance.updateToNow') : t('advance.viewOriginal')}
      </button>
    </div>
  );
}

export default AdvanceBanner;
