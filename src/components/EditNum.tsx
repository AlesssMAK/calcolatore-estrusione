import type { ReactNode } from 'react';

/** A value in a TapToEdit text: dotted underline (it opens on a tap), and
 *  which field it opens (`name`). `className`: its own look (a produced
 *  count's blinking red). */
export default function EditNum({
  name,
  className = 'font-medium',
  children,
}: {
  name: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      data-edit={name}
      className={`underline decoration-neutral-400 decoration-dotted underline-offset-4 ${className}`}
    >
      {children}
    </span>
  );
}
