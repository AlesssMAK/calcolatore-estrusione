import { createContext } from 'react';

/** "Ferma fino a…" of a tracked calc: opens the window that stops the line
 *  until a moment — offered on the size in production. None: not here (a fresh
 *  form, a read-only / fixed calc). */
export const HaltContext = createContext<(() => void) | undefined>(undefined);
