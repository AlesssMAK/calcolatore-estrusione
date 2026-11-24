// Room under the page, so an element near its end can still be scrolled to
// the top of the screen (a new order's card — "first on screen"). It's only
// there for that: once scrolled back up out of sight, it goes
// (components/TailRoom renders it at the very end of the page).

let room = 0;
const listeners = new Set<() => void>();

export const getTailRoom = () => room;

export function setTailRoom(px: number) {
  room = px;
  listeners.forEach((l) => l());
}

export function subscribeTailRoom(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Bring `el` to the top of the screen (smoothly), adding the room the page
 *  lacks under it for that. */
export function scrollToTopWithRoom(el: HTMLElement, margin = 12) {
  const top = el.getBoundingClientRect().top + window.scrollY - margin;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const need = Math.ceil(top - max);
  if (need > 0) setTailRoom(room + need);
  // The room renders first (React, at once), then the scroll can reach.
  window.setTimeout(() =>
    el.scrollIntoView({ block: 'start', behavior: 'smooth' }),
  );
}

/** Bring `el` to `offset` px under the top of the part of the screen that's
 *  seen (smoothly), adding the room the page lacks under it — a field taking
 *  the focus on a touch screen, over the keyboard (utils/liftOnFocus). With
 *  the keyboard up a phone may show a lower part of the page than the window
 *  says (iPhone): measured from that part, not the window's top. */
export function liftToTop(el: HTMLElement, offset: number) {
  const seenTop = window.visualViewport?.offsetTop ?? 0;
  const top = el.getBoundingClientRect().top + window.scrollY - seenTop - offset;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const need = Math.ceil(top - max);
  if (need > 0) setTailRoom(room + need);
  window.setTimeout(() => window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' }));
}
