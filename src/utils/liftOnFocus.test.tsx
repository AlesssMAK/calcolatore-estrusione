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
    ({ matches: touch && q.includes('pointer: coarse'), media: q }) as MediaQueryList) as typeof window.matchMedia;
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
  it('goes up near the top, room added under the page when it lacks it', () => {
    const el = fieldAt('<input data-t type="number" />', 900);
    el.focus();
    vi.advanceTimersByTime(300);
    vi.runAllTimers();
    expect(scrollTo).toHaveBeenCalledWith({ top: 860, behavior: 'smooth' });
    // jsdom: the page has no height — all of it is room to add
    expect(getTailRoom()).toBeGreaterThan(0);
  });

  it('a text area too', () => {
    const el = fieldAt('<textarea data-t></textarea>', 500);
    el.focus();
    vi.runAllTimers();
    expect(scrollTo).toHaveBeenCalledWith({ top: 460, behavior: 'smooth' });
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
});
