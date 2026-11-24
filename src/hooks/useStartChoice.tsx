import { useCallback, useState, type ReactNode } from 'react';
import StartChoiceModal from '../components/StartChoiceModal';
import { currentSchedule } from '../lib/companyEdit';
import type { SavedCalculation } from '../lib/calcHistory';
import type { CompanySettings } from '../lib/catalog';
import { startsLaterAt } from '../utils/advance';

/**
 * Before ▶ starts a paused calc again: when the schedule has the line off or
 * still warming up right now, ask whether it's producing already («Avvia
 * adesso») or starts at the next shift. `ask` resolves true = start now,
 * false = as the schedule says (also: nothing to ask — pausing, or it would
 * start now anyway), null = closed (do nothing). Render `modal`.
 */
export function useStartChoice(): {
  ask: (
    calc: Pick<SavedCalculation, 'values' | 'snapshot'>,
    company: Pick<
      CompanySettings,
      'schedule' | 'warmupMinutes' | 'shutdownMinutes'
    > | null
  ) => Promise<boolean | null>;
  modal: ReactNode;
} {
  const [pending, setPending] = useState<{
    at: Date;
    resolve: (startNow: boolean | null) => void;
  } | null>(null);

  const ask = useCallback(
    (
      calc: Pick<SavedCalculation, 'values' | 'snapshot'>,
      company: Pick<
        CompanySettings,
        'schedule' | 'warmupMinutes' | 'shutdownMinutes'
      > | null
    ): Promise<boolean | null> => {
      if (!calc.values?.settings.frozen) return Promise.resolve(false);
      const at = startsLaterAt(new Date(), currentSchedule(calc, company));
      if (!at) return Promise.resolve(false);
      return new Promise(resolve => setPending({ at, resolve }));
    },
    []
  );

  const modal = pending ? (
    <StartChoiceModal
      at={pending.at}
      onChoose={startNow => {
        pending.resolve(startNow);
        setPending(null);
      }}
    />
  ) : null;
  return { ask, modal };
}
