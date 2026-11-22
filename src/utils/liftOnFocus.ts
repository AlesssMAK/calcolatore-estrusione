// On a touch screen (phone, tablet) the keyboard covers the lower part of the
// screen: a field taking the focus goes up near the top, clear of it — with
// room added under the page when it lacks it (utils/tailRoom).
//
// Not a field in a window over the page (a dialog: it scrolls by itself), nor
// a calendar field (it opens its own sheet), nor a read-only one (no keyboard).
// One listener for the whole app, so a new field gets this by itself. Opt out
// with `data-no-lift`.

import { liftToTop } from './tailRoom';

/** The fields a keyboard comes up for. */
const TYPED = new Set(['text', 'number', 'search', 'tel', 'email', 'url', 'password']);
const SKIP =
  '[data-no-lift], [role="dialog"], [aria-modal="true"], .react-datepicker-wrapper, .react-datepicker__portal';
/** Between the field and the screen's top (its error bubble fits there). */
const MARGIN = 40;
/** After the focus: the keyboard on its way, the browser's own scroll done. */
const DELAY_MS = 300;

/** A phone / tablet: a finger, no mouse to hover with. */
const isTouchScreen = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(hover: none) and (pointer: coarse)').matches;

export function installLiftOnFocus(): () => void {
  let timer = 0;

  const onFocusIn = (e: FocusEvent) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
    if (el instanceof HTMLInputElement && !TYPED.has(el.type)) return;
    if (el.readOnly || el.closest(SKIP) || !isTouchScreen()) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (document.activeElement === el && el.isConnected) liftToTop(el, MARGIN);
    }, DELAY_MS);
  };

  document.addEventListener('focusin', onFocusIn, true);
  return () => {
    window.clearTimeout(timer);
    document.removeEventListener('focusin', onFocusIn, true);
  };
}
