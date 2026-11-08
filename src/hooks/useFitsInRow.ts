import { useLayoutEffect, useState, type RefObject } from 'react';

/** Whether the children of `ref` fit side by side on one line at their own
 *  width (nothing squeezed or wrapped), `gap` px apart. Measured again as the
 *  box resizes and as its content changes (language, badge counts) — so a row
 *  of buttons can drop to a full-width column as soon as it stops fitting. */
export function useFitsInRow(
  ref: RefObject<HTMLElement | null>,
  gap: number,
): boolean {
  const [fits, setFits] = useState(false);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => {
      let need = 0;
      let count = 0;
      for (const el of Array.from(node.children) as HTMLElement[]) {
        if (el.getClientRects().length === 0) continue; // not shown
        // Its natural width, whatever the current layout gives it.
        const { width, flex } = el.style;
        el.style.width = 'max-content';
        el.style.flex = 'none';
        need += el.getBoundingClientRect().width;
        el.style.width = width;
        el.style.flex = flex;
        count++;
      }
      need += gap * Math.max(0, count - 1);
      setFits(need <= node.getBoundingClientRect().width);
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(node);
    const content = new MutationObserver(measure);
    content.observe(node, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    void document.fonts?.ready.then(measure);
    return () => {
      resize.disconnect();
      content.disconnect();
    };
  }, [ref, gap]);

  return fits;
}
