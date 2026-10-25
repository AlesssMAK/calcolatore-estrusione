import { useEffect, useRef, type MouseEvent, type PointerEvent } from 'react';

/** Hold-to-trigger (touch or mouse): `onLongPress` fires after `ms` of holding
 *  still — moving / scrolling / lifting earlier cancels it. Spread `handlers` on
 *  the element; in its onClick, `wasLongPress()` tells the click that ends a
 *  hold apart from a normal tap (so a link doesn't also navigate). */
export function useLongPress(onLongPress: () => void, ms = 2000) {
  const state = useRef({ timer: 0, fired: false });

  useEffect(() => {
    const s = state.current;
    return () => window.clearTimeout(s.timer);
  }, []);

  const cancel = () => window.clearTimeout(state.current.timer);

  return {
    handlers: {
      onPointerDown: (e: PointerEvent) => {
        if (e.button !== 0) return;
        const s = state.current;
        s.fired = false;
        window.clearTimeout(s.timer);
        s.timer = window.setTimeout(() => {
          s.fired = true;
          navigator.vibrate?.(30);
          onLongPress();
        }, ms);
      },
      onPointerUp: cancel,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
      // No "save image" / link-preview menu while holding.
      onContextMenu: (e: MouseEvent) => e.preventDefault(),
    },
    wasLongPress: () => {
      const fired = state.current.fired;
      state.current.fired = false;
      return fired;
    },
  };
}
