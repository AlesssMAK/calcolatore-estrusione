import { useFormContext } from 'react-hook-form';
import type { FormValues } from '../formSchema';
import { reasonSnapshot, type PauseReason } from '../lib/pauseReasons';

/** Puts a pause after order `idx`: a company reason (its fixed duration filled
 *  in, still editable) or, with null, a free pause. */
export function usePauseSetter() {
  const { setValue } = useFormContext<FormValues>();
  return (idx: number, reason: PauseReason | null) => {
    const opts = { shouldDirty: true, shouldValidate: true };
    setValue(`orders.${idx}.gapEnabled`, true, opts);
    setValue(`orders.${idx}.gapReason`, reason ? reasonSnapshot(reason) : undefined, opts);
    if (reason?.durationMin != null) {
      setValue(`orders.${idx}.gapAfterMin`, reason.durationMin, opts);
    }
  };
}
