import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useTranslation } from 'react-i18next';

/** Selection stored in NATURAL image pixels, so zoom/pan never invalidate it. */
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

const MAX_ZOOM = 6;
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

// Draw a region (in natural px) of the loaded image into a fresh canvas at the
// image's native resolution — best input for OCR.
function cropToCanvas(img: HTMLImageElement, sel: Rect | null): HTMLCanvasElement {
  const region: Rect = sel ?? {
    x: 0,
    y: 0,
    w: img.naturalWidth,
    h: img.naturalHeight,
  };
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

const segCls = 'px-3 py-1.5 text-xs font-medium transition';
const zoomBtnCls =
  'flex h-8 min-w-8 items-center justify-center rounded-md border border-neutral-300 bg-white px-2 text-sm font-medium text-ink-soft transition hover:border-brand-400 hover:text-ink';

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
  const containerRef = useRef<HTMLDivElement>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [mode, setMode] = useState<'select' | 'move'>('select');
  const [sel, setSel] = useState<Rect | null>(null);
  const gesture = useRef<
    | { type: 'draw'; sx: number; sy: number }
    | { type: 'pan'; cx: number; cy: number; sl: number; st: number }
    | null
  >(null);

  const toNatural = (clientX: number, clientY: number) => {
    const img = imgRef.current;
    if (!img) return { x: 0, y: 0 };
    const r = img.getBoundingClientRect();
    return {
      x: clamp((clientX - r.left) / r.width, 0, 1) * img.naturalWidth,
      y: clamp((clientY - r.top) / r.height, 0, 1) * img.naturalHeight,
    };
  };

  // Non-passive wheel listener so we can zoom without scrolling the page.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => clamp(z * (e.deltaY < 0 ? 1.15 : 0.87), 1, MAX_ZOOM));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (busy || !nat) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    if (mode === 'move') {
      const el = containerRef.current;
      gesture.current = {
        type: 'pan',
        cx: e.clientX,
        cy: e.clientY,
        sl: el?.scrollLeft ?? 0,
        st: el?.scrollTop ?? 0,
      };
    } else {
      const p = toNatural(e.clientX, e.clientY);
      gesture.current = { type: 'draw', sx: p.x, sy: p.y };
      setSel(null);
    }
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    if (g.type === 'pan') {
      const el = containerRef.current;
      if (el) {
        el.scrollLeft = g.sl - (e.clientX - g.cx);
        el.scrollTop = g.st - (e.clientY - g.cy);
      }
    } else {
      const p = toNatural(e.clientX, e.clientY);
      setSel({
        x: Math.min(g.sx, p.x),
        y: Math.min(g.sy, p.y),
        w: Math.abs(p.x - g.sx),
        h: Math.abs(p.y - g.sy),
      });
    }
  };

  const onPointerUp = () => {
    const g = gesture.current;
    gesture.current = null;
    // Discard a tiny accidental drag (in natural px, relative to image size).
    if (g?.type === 'draw' && nat) {
      setSel((s) =>
        s && s.w > nat.w * 0.02 && s.h > nat.h * 0.02 ? s : null,
      );
    }
  };

  const doCrop = () => {
    if (imgRef.current) onCrop(cropToCanvas(imgRef.current, sel));
  };

  const pct = (v: number, total: number) => `${(v / total) * 100}%`;

  return (
    <div className="relative rounded-lg border border-neutral-200 bg-white p-3 shadow-sm">
      <p className="mb-2 text-xs text-ink-soft">{t('piramide.photo.crop')}</p>

      {/* Toolbar: mode toggle + zoom */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-md border border-neutral-300">
          <button
            type="button"
            onClick={() => setMode('select')}
            className={`${segCls} ${
              mode === 'select'
                ? 'bg-brand-600 text-white'
                : 'bg-white text-ink-soft hover:bg-neutral-100'
            }`}
          >
            {t('piramide.photo.select')}
          </button>
          <button
            type="button"
            onClick={() => setMode('move')}
            className={`${segCls} ${
              mode === 'move'
                ? 'bg-brand-600 text-white'
                : 'bg-white text-ink-soft hover:bg-neutral-100'
            }`}
          >
            {t('piramide.photo.move')}
          </button>
        </div>

        <div className="ml-auto inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => setZoom((z) => clamp(z * 0.8, 1, MAX_ZOOM))}
            className={zoomBtnCls}
            aria-label="zoom out"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            className={`${zoomBtnCls} tabular-nums`}
            title={t('piramide.photo.zoomReset')}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => clamp(z * 1.25, 1, MAX_ZOOM))}
            className={zoomBtnCls}
            aria-label="zoom in"
          >
            +
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="max-h-[70vh] touch-none overflow-auto overscroll-contain rounded-md border border-neutral-300 bg-neutral-100"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="relative w-full select-none" style={{ width: `${zoom * 100}%` }}>
          <img
            ref={imgRef}
            src={src}
            alt=""
            draggable={false}
            onLoad={(e) =>
              setNat({
                w: e.currentTarget.naturalWidth,
                h: e.currentTarget.naturalHeight,
              })
            }
            className="block w-full"
            style={{ cursor: mode === 'move' ? 'grab' : 'crosshair' }}
          />
          {sel && nat && (
            <div
              className="pointer-events-none absolute border-2 border-brand-500 bg-brand-500/10"
              style={{
                left: pct(sel.x, nat.w),
                top: pct(sel.y, nat.h),
                width: pct(sel.w, nat.w),
                height: pct(sel.h, nat.h),
              }}
            />
          )}
        </div>
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

      {busy && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-white/85 text-sm text-ink">
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
  );
}

export default ImageCropper;
