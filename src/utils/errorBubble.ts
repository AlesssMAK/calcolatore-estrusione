// A field in error isn't explained by a line of text under it: it's framed red
// and its grey hint (its name) turns red (index.css), and the message shows in
// a bubble over the field while it has the focus. Typing hides the bubble; a
// new verdict on the field (the error gone, another one) updates it live.
//
// A field takes part by carrying its error as attributes — `errorAttrs(msg)`:
// aria-invalid="true" + data-error="<message>" (the message may sit on a
// wrapper instead, for a field rendered by a library: the date picker).
//
// One bubble for the whole app, like clearOnFocus: a new field gets this by
// itself.

/** The attributes of a field in error (none when `message` is empty). */
export const errorAttrs = (message: string | undefined) =>
  message ? ({ 'aria-invalid': true, 'data-error': message } as const) : {};

const BUBBLE_ID = 'field-error-bubble';
/** Between the field and the bubble. */
const GAP = 6;
/** The bubble keeps this far from the screen's edges. */
const EDGE = 8;

const isField = (el: EventTarget | null): el is HTMLElement =>
  el instanceof HTMLInputElement ||
  el instanceof HTMLTextAreaElement ||
  el instanceof HTMLSelectElement;

const messageOf = (el: HTMLElement) =>
  el.getAttribute('aria-invalid') === 'true'
    ? (el.getAttribute('data-error') ??
      el.closest('[data-error]')?.getAttribute('data-error') ??
      null)
    : null;

export function installErrorBubble(): () => void {
  const bubble = document.createElement('div');
  bubble.id = BUBBLE_ID;
  bubble.className = 'error-bubble';
  bubble.setAttribute('role', 'tooltip');
  bubble.hidden = true;
  document.body.appendChild(bubble);

  let field: HTMLElement | null = null;
  // Typing hides the bubble until the field's error changes.
  let typed = false;
  let frame = 0;

  const hide = () => {
    bubble.hidden = true;
    if (field?.getAttribute('aria-describedby') === BUBBLE_ID) {
      field.removeAttribute('aria-describedby');
    }
  };

  const show = () => {
    const msg = field && !typed && field.isConnected ? messageOf(field) : null;
    if (!field || !msg) return hide();
    const r = field.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return hide();
    bubble.textContent = msg;
    // Measured from the corner: its full width, not what's left beside the
    // last place.
    bubble.style.left = '0px';
    bubble.style.top = '0px';
    bubble.hidden = false;
    if (!field.hasAttribute('aria-describedby')) {
      field.setAttribute('aria-describedby', BUBBLE_ID);
    }
    const b = bubble.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    // Over the field; under it when there's no room above.
    const above = r.top - GAP - b.height >= EDGE;
    const top = above ? r.top - GAP - b.height : r.bottom + GAP;
    const left = Math.max(EDGE, Math.min(r.left, vw - EDGE - b.width));
    bubble.style.top = `${Math.round(top)}px`;
    bubble.style.left = `${Math.round(left)}px`;
    bubble.dataset.side = above ? 'top' : 'bottom';
    // The tip points at the field's start, wherever the bubble had to go.
    const tip = Math.max(10, Math.min(r.left + 14 - left, b.width - 10));
    bubble.style.setProperty('--tip-x', `${Math.round(tip)}px`);
  };

  // The field's verdict changed (React re-rendered its attributes).
  const watcher = new MutationObserver(() => {
    typed = false;
    show();
  });

  const onFocusIn = (e: FocusEvent) => {
    watcher.disconnect();
    hide();
    field = isField(e.target) ? e.target : null;
    typed = false;
    if (!field) return;
    watcher.observe(field, {
      attributes: true,
      attributeFilter: ['aria-invalid', 'data-error'],
    });
    show();
  };

  const onFocusOut = (e: FocusEvent) => {
    if (e.target !== field) return;
    watcher.disconnect();
    hide();
    field = null;
  };

  const onInput = (e: Event) => {
    if (e.target !== field) return;
    typed = true;
    hide();
  };

  // It follows the field on scroll, resize and the phone keyboard.
  const onMove = () => {
    if (bubble.hidden) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(show);
  };

  const vv = window.visualViewport;
  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('focusout', onFocusOut, true);
  document.addEventListener('input', onInput, true);
  window.addEventListener('scroll', onMove, { capture: true, passive: true });
  window.addEventListener('resize', onMove);
  vv?.addEventListener('resize', onMove);
  vv?.addEventListener('scroll', onMove);

  return () => {
    cancelAnimationFrame(frame);
    watcher.disconnect();
    hide();
    document.removeEventListener('focusin', onFocusIn, true);
    document.removeEventListener('focusout', onFocusOut, true);
    document.removeEventListener('input', onInput, true);
    window.removeEventListener('scroll', onMove, { capture: true });
    window.removeEventListener('resize', onMove);
    vv?.removeEventListener('resize', onMove);
    vv?.removeEventListener('scroll', onMove);
    bubble.remove();
  };
}
