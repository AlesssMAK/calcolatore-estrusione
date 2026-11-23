import type { ReactNode } from 'react';

/** The sign-in pages' centred card, with the way back to the calculator — a
 *  full load (the catalog reads ?company= when the app loads). */
export default function AuthCard({
  children,
  backHref = '/',
}: {
  children: ReactNode;
  backHref?: string;
}) {
  return (
    <div className="min-h-full bg-surface-alt">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-8">
        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
          {children}
          <p className="mt-6 text-center text-xs text-ink-soft">
            <a href={backHref} className="hover:text-brand-700">
              ← Torna al calcolatore
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
