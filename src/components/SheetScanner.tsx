import { useRef, useState, type ChangeEvent } from 'react';
import type { TFunction } from 'i18next';
import ImageCropper from './piramide/ImageCropper';
import { recognizeSheets, type OcrRow } from '../lib/ocr';

interface Props {
  /** Called with the parsed {length, qty} rows after a successful scan. */
  onRows: (rows: OcrRow[]) => void;
  t: TFunction;
}

// Photo → crop → OCR flow (shared model with /piramide) that reads a table of
// "Lunghezza + Quantità" and hands back the parsed rows. Used to fill an
// order's sizes from a photo of the paper order.
function SheetScanner({ onRows, t }: Props) {
  const [photoSrc, setPhotoSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<{
    kind: 'ok' | 'warn' | 'err';
    msg: string;
  } | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const onPickFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setStatus(null);
    setPhotoSrc(URL.createObjectURL(file));
  };

  const closePhoto = () => {
    if (photoSrc) URL.revokeObjectURL(photoSrc);
    setPhotoSrc(null);
    setBusy(false);
    setProgress(0);
  };

  const onCrop = async (canvas: HTMLCanvasElement) => {
    setBusy(true);
    setProgress(0);
    try {
      const result = await recognizeSheets(canvas, (p) => {
        if (p.status === 'recognizing text') setProgress(p.progress);
      });
      if (result.rows.length === 0) {
        setStatus({ kind: 'warn', msg: t('piramide.photo.readEmpty') });
      } else {
        onRows(result.rows);
        setStatus({
          kind: 'ok',
          msg: t('piramide.photo.readOk', { count: result.rows.length }),
        });
      }
    } catch {
      setStatus({ kind: 'err', msg: t('piramide.photo.readError') });
    } finally {
      closePhoto();
    }
  };

  return (
    <div>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onPickFile}
      />
      <input
        ref={uploadRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPickFile}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-md border border-brand-300 bg-white px-3 py-1.5 text-sm font-medium text-brand-700 shadow-sm transition hover:border-brand-600 hover:bg-brand-50"
        >
          <span aria-hidden>📷</span>
          <span>{t('orders.scan.take')}</span>
        </button>
        <button
          type="button"
          onClick={() => uploadRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-ink-soft shadow-sm transition hover:border-brand-500 hover:text-brand-600"
        >
          <span aria-hidden>🖼</span>
          <span>{t('orders.scan.upload')}</span>
        </button>
      </div>

      {status && (
        <p
          className={`mt-2 rounded-md px-3 py-2 text-sm ${
            status.kind === 'ok'
              ? 'bg-green-50 text-success'
              : status.kind === 'warn'
                ? 'bg-amber-50 text-amber-700'
                : 'bg-red-50 text-danger'
          }`}
        >
          {status.msg}
        </p>
      )}

      {photoSrc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-full w-full max-w-2xl overflow-auto rounded-xl bg-white p-3 shadow-xl sm:p-4">
            <p className="mb-2 text-sm text-ink-soft">
              {t('orders.scan.hint')}
            </p>
            <ImageCropper
              src={photoSrc}
              onCrop={(c) => void onCrop(c)}
              onCancel={closePhoto}
              busy={busy}
              progress={progress}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default SheetScanner;
