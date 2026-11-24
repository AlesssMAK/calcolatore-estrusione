// On a touch screen (phone, tablet) the keyboard covers the lower part of the
// screen: a field taking the focus goes to the middle of the part that's still
// seen, between the screen's top and the keyboard — with room added under the
// page when it lacks it (utils/tailRoom). While the keyboard is still coming
// up (the part seen shrinking), it follows.
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
/** The least between the field and the top of what's seen (its error bubble
 *  fits there). */
const MARGIN = 40;
/** After the focus: the keyboard on its way, the browser's own scroll done. */
const DELAY_MS = 300;
/** How long the field follows the keyboard still settling. */
const FOLLOW_MS = 1000;

/** A phone / tablet: a finger, no mouse to hover with — where a field taking
 *  the focus is brought to the middle by this. */
export const isTouchScreen = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(hover: none) and (pointer: coarse)').matches;

/** Halfway down the part of the screen that's seen (over the keyboard). */
function middleOffset(el: HTMLElement): number {
  const seen = window.visualViewport?.height ?? window.innerHeight;
  const r = el.getBoundingClientRect();
  return Math.max(MARGIN, Math.round((seen - (r.bottom - r.top)) / 2));
}

export function installLiftOnFocus(): () => void {
  let timer = 0;
  let stopFollowing = () => {};

  const lift = (el: HTMLElement) => {
    if (document.activeElement === el && el.isConnected) liftToTop(el, middleOffset(el));
  };

  /** The part seen changes size (the keyboard still sliding up, its bar of
   *  suggestions): to the middle again, for a moment. */
  const follow = (el: HTMLElement) => {
    const vv = window.visualViewport;
    if (!vv) return;
    let settle = 0;
    const onResize = () => {
      window.clearTimeout(settle);
      settle = window.setTimeout(() => lift(el), 100);
    };
    vv.addEventListener('resize', onResize);
    const end = window.setTimeout(() => stopFollowing(), FOLLOW_MS);
    stopFollowing = () => {
      window.clearTimeout(settle);
      window.clearTimeout(end);
      vv.removeEventListener('resize', onResize);
      stopFollowing = () => {};
    };
  };

  const onFocusIn = (e: FocusEvent) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
    if (el instanceof HTMLInputElement && !TYPED.has(el.type)) return;
    if (el.readOnly || el.closest(SKIP) || !isTouchScreen()) return;
    window.clearTimeout(timer);
    stopFollowing();
    timer = window.setTimeout(() => {
      if (document.activeElement !== el || !el.isConnected) return;
      lift(el);
      follow(el);
    }, DELAY_MS);
  };

  document.addEventListener('focusin', onFocusIn, true);
  return () => {
    window.clearTimeout(timer);
    stopFollowing();
    document.removeEventListener('focusin', onFocusIn, true);
  };
}
