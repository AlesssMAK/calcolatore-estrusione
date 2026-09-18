import type { CSSProperties, ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface RenderArgs {
  /** Attach to the outer element that moves. */
  setNodeRef: (el: HTMLElement | null) => void;
  style: CSSProperties;
  /** Spread onto the drag handle (accessibility + pointer/keyboard listeners). */
  handleProps: Record<string, unknown>;
  isDragging: boolean;
}

interface Props {
  id: string;
  children: (args: RenderArgs) => ReactNode;
}

/** Thin render-prop wrapper around dnd-kit's useSortable, so a list item can
 *  stay inline in its parent while getting drag behaviour. Listeners +
 *  attributes are bundled into `handleProps` for a dedicated drag handle (the
 *  rest of the card stays interactive). */
function SortableItem({ id, children }: Props) {
  'use no memo';
  const {
    setNodeRef,
    transform,
    transition,
    attributes,
    listeners,
    isDragging,
  } = useSortable({ id });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : undefined,
    zIndex: isDragging ? 20 : undefined,
    position: isDragging ? 'relative' : undefined,
  };

  return (
    <>
      {children({
        setNodeRef,
        style,
        handleProps: { ...attributes, ...listeners },
        isDragging,
      })}
    </>
  );
}

export default SortableItem;
