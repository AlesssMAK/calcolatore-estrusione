import { createContext } from 'react';

/** A tracked (saved / Produzione) calc's form: its values read as plain text,
 *  each opening its field on a tap (components/TapToEdit). */
export const TextModeContext = createContext(false);
