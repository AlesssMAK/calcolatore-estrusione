export const numericSetValueAs = (v: unknown): number | undefined => {
  if (v === '' || v === null || v === undefined) return undefined;
  const raw = typeof v === 'string' ? v.replace(',', '.') : v;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
};
