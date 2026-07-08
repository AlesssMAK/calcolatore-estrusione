import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Props {
  /** Object URL of the image to crop. */
  src: string;
  /** Called with a canvas of the chosen region (or the whole image). */
  onCrop: (canvas: HTMLCanvasElement) => void;
  onCancel: () => void;
  busy?: boolean;
  progress?: number; // 0..1
  progressLabel?: string;
}

// Draw a region of the loaded <img> (given in displayed CSS px relative to the
// image box) into a fresh canvas at the image's natural resolution — better
// OCR than downscaled pixels.
function cropToCanvas(img: HTMLImageElement, sel: Rect | null): HTMLCanvasElement {
  const scaleX = img.naturalWidth / img.clientWidth;
  const scaleY = img.naturalHeight / img.clientHeight;
  const region: Rect = sel
    ? {
        x: sel.x * scaleX,
        y: sel.y * scaleY,
        w: sel.w * scaleX,
        h: sel.h * scaleY,
      }
    : { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(region.w));
  canvas.height = Math.max(1, Math.round(region.h));
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(
      img,
      region.x,
      region.y,
      region.w,
      region.h,
      0,
      0,
      canvas.width,
      canvas.height,
    );
  }
  return canvas;
}

function ImageCropper({
  src,
  onCrop,
  onCancel,
  busy = false,
  progress = 0,
  progressLabel,
}: Props) {
  const { t } = useTranslation();
  const imgRef = useRef<HTMLImageElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<Rect | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const relativePoint = (e: ReactPointerEvent) => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
    const y = Math.min(Math.max(e.clientY - rect.top, 0), rect.height);
    return { x, y };
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (busy) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragStart.current = relativePoint(e);
    setSel(null);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!dragStart.current) return;
    const p = relativePoint(e);
    const s = dragStart.current;
    setSel({
      x: Math.min(s.x, p.x),
      y: Math.min(s.y, p.y),
      w: Math.abs(p.x - s.x),
      h: Math.abs(p.y - s.y),
    });
  };

  const onPointerUp = () => {
    dragStart.current = null;
    // Discard a tiny accidental drag — treat as "no selection".
    setSel((s) => (s && s.w > 8 && s.h > 8 ? s : null));
  };

  const doCrop = () => {
    if (imgRef.current) onCrop(cropToCanvas(imgRef.current, sel));
  };

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3 shadow-sm">
      <p className="mb-2 text-xs text-ink-soft">{t('piramide.photo.crop')}</p>

      <div
        ref={boxRef}
        className="relative inline-block max-w-full touch-none select-none overflow-hidden rounded-md border border-neutral-300"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <img
          ref={imgRef}
          src={src}
          alt=""
          draggable={false}
          className="block max-h-[60vh] max-w-full object-contain"
        />
        {/* Outline the selection; the dim ring around it (huge spread box
            shadow) darkens everything OUTSIDE the rectangle to focus the eye. */}
        {sel && (
          <div
            className="pointer-events-none absolute border-2 border-brand-500"
            style={{
              left: sel.x,
              top: sel.y,
              width: sel.w,
              height: sel.h,
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)',
            }}
          />
        )}
        {busy && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/80 text-sm text-ink">
            <span>{progressLabel ?? t('piramide.photo.reading')}</span>
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-neutral-200">
              <div
                className="h-full bg-brand-600 transition-all"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={doCrop}
          disabled={busy}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {sel ? t('piramide.photo.confirmCrop') : t('piramide.photo.wholeImage')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-ink-soft shadow-sm transition hover:border-brand-500 hover:text-brand-600 disabled:opacity-60"
        >
          {t('piramide.photo.cancel')}
        </button>
      </div>
    </div>
  );
}

export default ImageCropper;
