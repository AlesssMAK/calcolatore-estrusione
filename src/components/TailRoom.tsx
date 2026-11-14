import { useEffect, useRef, useSyncExternalStore } from 'react';
import { getTailRoom, setTailRoom, subscribeTailRoom } from '../utils/tailRoom';

/** The room added under the page (utils/tailRoom) — at its very end. Gone
 *  once scrolled back up out of sight. */
export default function TailRoom() {
  const height = useSyncExternalStore(subscribeTailRoom, getTailRoom);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (height <= 0) return;
    // Not while the scroll is still on its way down to the element.
    let armed = false;
    const arm = window.setTimeout(() => (armed = true), 1000);
    const onScroll = () => {
      const r = ref.current?.getBoundingClientRect();
      if (armed && r && r.top > window.innerHeight) setTailRoom(0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.clearTimeout(arm);
      window.removeEventListener('scroll', onScroll);
    };
  }, [height]);
  return height > 0 ? (
    <div ref={ref} aria-hidden className="no-print" style={{ height }} />
  ) : null;
}
