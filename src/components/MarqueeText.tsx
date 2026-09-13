import { useEffect, useRef, useState, type CSSProperties } from 'react';

/**
 * Text that horizontally scrolls (marquee) when it overflows its container, so
 * long strings — product names in the picker and in the results breakdown —
 * stay fully readable on narrow screens. Static when it fits, or when the user
 * prefers reduced motion (CSS-gated via `.marquee-anim`).
 *
 * `className` styles the (inner) text — font size / weight / colour; the outer
 * wrapper is a `flex-1 min-w-0` block so it clips and scrolls inside a flex row.
 */
function MarqueeText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  'use no memo';
  const outerRef = useRef<HTMLSpanElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);
  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const measure = () => {
      const over = inner.scrollWidth - outer.clientWidth;
      setShift(over > 4 ? over : 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(outer);
    return () => ro.disconnect();
  }, [text]);
  const dur = Math.max(3, Math.round(shift / 25)); // slow: ~25px/s
  return (
    <span ref={outerRef} className="block min-w-0 flex-1 overflow-hidden">
      <span
        ref={innerRef}
        className={`inline-block whitespace-nowrap${
          className ? ` ${className}` : ''
        }${shift > 0 ? ' marquee-anim' : ''}`}
        style={
          shift > 0
            ? ({
                '--marquee-shift': `-${shift}px`,
                '--marquee-dur': `${dur}s`,
              } as CSSProperties)
            : undefined
        }
      >
        {text}
      </span>
    </span>
  );
}

export default MarqueeText;
