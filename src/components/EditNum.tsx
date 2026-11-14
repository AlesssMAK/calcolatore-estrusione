import type { ReactNode } from 'react';

/** A value in a TapToEdit text: dotted underline (it opens on a tap), and
 *  which field it opens (`name`). */
export default function EditNum({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) {
  return (
    <span
      data-edit={name}
      className="font-medium underline decoration-neutral-400 decoration-dotted underline-offset-4"
    >
      {children}
    </span>
  );
}
