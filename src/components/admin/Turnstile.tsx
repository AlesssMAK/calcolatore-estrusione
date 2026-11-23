import { useEffect, useRef, useState } from 'react';
import { TURNSTILE_SITE_KEY } from '../../lib/signup';

// Cloudflare Turnstile — the sign-up's "not a bot" check. Its token goes with
// the form; the server (company-signup) asks Cloudflare whether it's genuine.

type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_URL =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let scriptLoad: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  scriptLoad ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptLoad = null;
      s.remove();
      reject(new Error('Turnstile not loaded'));
    };
    document.head.appendChild(s);
  });
  return scriptLoad;
}

/** The check; `onToken(null)` when its token expires or fails. A token works
 *  once: after a sending, remount it (a new `key`) for a fresh one. */
export default function Turnstile({
  onToken,
}: {
  onToken: (token: string | null) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let id: string | undefined;
    let gone = false;
    loadScript().then(
      () => {
        if (gone || !box.current || !window.turnstile) return;
        id = window.turnstile.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          language: 'it',
          theme: 'light',
          // Its normal width (300px) doesn't fit a 320px phone's card.
          size: box.current.clientWidth < 300 ? 'compact' : 'flexible',
          callback: (token: string) => onToken(token),
          'expired-callback': () => onToken(null),
          'error-callback': () => onToken(null),
        });
      },
      () => {
        if (!gone) setFailed(true);
      }
    );
    return () => {
      gone = true;
      if (id) window.turnstile?.remove(id);
    };
  }, [onToken]);

  if (failed)
    return (
      <p
        role="alert"
        className="rounded-md bg-red-50 px-3 py-2 text-sm text-danger"
      >
        ⚠ Verifica anti-bot non caricata: controlla la connessione e ricarica la
        pagina.
      </p>
    );
  return <div ref={box} className="min-h-[65px]" />;
}
