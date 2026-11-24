import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installLiftOnFocus } from './liftOnFocus';
import { getTailRoom, setTailRoom } from './tailRoom';

let uninstall: () => void;
let touch = true;
let scrollTo: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  touch = true;
  window.matchMedia = ((q: string) =>
    ({
      matches: touch && q.includes('pointer: coarse'),
      media: q,
    }) as MediaQueryList) as typeof window.matchMedia;
  scrollTo = vi.fn();
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
  setTailRoom(0);
  uninstall = installLiftOnFocus();
});
afterEach(() => {
  uninstall();
  document.body.innerHTML = '';
  setTailRoom(0);
  vi.useRealTimers();
});

/** A field `top` px down the page (jsdom has no layout: faked). */
function fieldAt(html: string, top: number): HTMLElement {
  document.body.innerHTML = html;
  const el = document.querySelector<HTMLElement>('[data-t]')!;
  el.getBoundingClientRect = () => ({ top, bottom: top + 30 }) as DOMRect;
  return el;
}

describe('a field taking the focus on a touch screen', () => {
  // jsdom: a 768 px window, no keyboard — the middle for a 30 px field: 369.
  it('goes to the middle of the screen, room added under the page when it lacks it', () => {
    const el = fieldAt('<input data-t type="number" />', 900);
    el.focus();
    vi.advanceTimersByTime(300);
    vi.runAllTimers();
    expect(scrollTo).toHaveBeenCalledWith({ top: 531, behavior: 'smooth' });
    // jsdom: the page has no height — all of it is room to add
    expect(getTailRoom()).toBeGreaterThan(0);
  });

  it('a text area too', () => {
    const el = fieldAt('<textarea data-t></textarea>', 500);
    el.focus();
    vi.runAllTimers();
    expect(scrollTo).toHaveBeenCalledWith({ top: 131, behavior: 'smooth' });
  });

  it('not with a mouse (a computer)', () => {
    touch = false;
    const el = fieldAt('<input data-t type="text" />', 900);
    el.focus();
    vi.runAllTimers();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('not in a window over the page, a calendar field, a read-only one, a checkbox, or opted out', () => {
    for (const html of [
      '<div role="dialog"><input data-t type="text" /></div>',
      '<div class="react-datepicker-wrapper"><input data-t type="text" /></div>',
      '<input data-t type="text" readonly />',
      '<input data-t type="checkbox" />',
      '<input data-t type="text" data-no-lift />',
    ]) {
      const el = fieldAt(html, 900);
      el.focus();
      vi.runAllTimers();
    }
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('not once the focus has moved away meanwhile', () => {
    const el = fieldAt('<input data-t type="text" /><button>b</button>', 900);
    el.focus();
    document.querySelector('button')!.focus();
    vi.runAllTimers();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  describe('with the keyboard up', () => {
    let vv: EventTarget & { height: number; offsetTop: number };
    beforeEach(() => {
      vv = Object.assign(new EventTarget(), { height: 400, offsetTop: 0 });
      Object.defineProperty(window, 'visualViewport', {
        value: vv,
        configurable: true,
      });
    });
    afterEach(() => {
      Object.defineProperty(window, 'visualViewport', {
        value: undefined,
        configurable: true,
      });
    });

    it('the middle of what it leaves seen', () => {
      const el = fieldAt('<input data-t type="text" />', 900);
      el.focus();
      vi.advanceTimersByTime(300);
      vi.advanceTimersByTime(1);
      // (400 − 30) / 2 = 185 under the top of what's seen
      expect(scrollTo).toHaveBeenLastCalledWith({
        top: 715,
        behavior: 'smooth',
      });
    });

    it('a phone showing a lower part of the page (iPhone): measured from there', () => {
      vv.offsetTop = 100;
      const el = fieldAt('<input data-t type="text" />', 900);
      el.focus();
      vi.advanceTimersByTime(301);
      expect(scrollTo).toHaveBeenLastCalledWith({
        top: 615,
        behavior: 'smooth',
      });
    });

    it('follows the keyboard still coming up, for a moment', () => {
      vv.height = 600;
      const el = fieldAt('<input data-t type="text" />', 900);
      el.focus();
      vi.advanceTimersByTime(301);
      expect(scrollTo).toHaveBeenLastCalledWith({
        top: 615,
        behavior: 'smooth',
      });
      vv.height = 400;
      vv.dispatchEvent(new Event('resize'));
      vi.advanceTimersByTime(101);
      expect(scrollTo).toHaveBeenLastCalledWith({
        top: 715,
        behavior: 'smooth',
      });
      // later on, it's the user's screen again
      vi.advanceTimersByTime(2000);
      scrollTo.mockClear();
      vv.dispatchEvent(new Event('resize'));
      vi.advanceTimersByTime(200);
      expect(scrollTo).not.toHaveBeenCalled();
    });
  });
});
