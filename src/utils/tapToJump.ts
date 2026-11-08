import type { MouseEvent } from 'react';

// An order's card in the form and its result jump to each other on a tap —
// a tap on the card itself, not on what's in it: a field, a button, a list,
// a link. Nor a text selection, nor the tap that ends an edit (it closes the
// phone keyboard / leaves the field: the next one jumps).

const CONTROLS =
  'input, textarea, select, button, a, label, summary, [role="button"], [role="option"], [role="listbox"], [role="tab"], [contenteditable="true"]';

const isEditing = (el: Element | null) =>
  (el instanceof HTMLInputElement &&
    !['button', 'checkbox', 'radio', 'submit', 'reset'].includes(el.type)) ||
  el instanceof HTMLTextAreaElement ||
  el instanceof HTMLSelectElement ||
  (el instanceof HTMLElement && el.isContentEditable);

// What had the focus when the tap began (one pointer at a time: a module
// value, so a re-render between press and click — a blur validates — can't
// lose it).
let editingAtPress = false;

/** onPointerDownCapture of a jumping element. */
export const notePress = () => {
  editingAtPress = isEditing(document.activeElement);
};

/** Is this click a tap on the element itself (see above)? */
export function isJumpTap(e: MouseEvent<HTMLElement>): boolean {
  const editing = editingAtPress;
  editingAtPress = false;
  const target = e.target;
  if (!(target instanceof Element) || !e.currentTarget.contains(target)) {
    return false; // (a portal's content: in the tree, not on the element)
  }
  if (editing || target.closest(CONTROLS)) return false;
  return !window.getSelection()?.toString();
}

/** Brings the elements of `selector` on screen (the first one at the top) and
 *  flashes them. False: none is shown. */
export function revealJump(selector: string): boolean {
  const els = [...document.querySelectorAll<HTMLElement>(selector)].filter(
    (el) => el.getClientRects().length > 0,
  );
  if (els.length === 0) return false;
  els[0].scrollIntoView({ block: 'start' });
  for (const el of els) {
    el.classList.remove('jump-flash');
    void el.offsetWidth; // restart the animation
    el.classList.add('jump-flash');
    el.addEventListener('animationend', () => el.classList.remove('jump-flash'), {
      once: true,
    });
  }
  return true;
}
