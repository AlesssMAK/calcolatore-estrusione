import { format } from 'date-fns';
import { it, enUS, es } from 'date-fns/locale';
import type { Locale } from 'date-fns';
import { splitDuration } from './calculator';
import type { SupportedLanguage } from '../i18n';

const LOCALES: Record<SupportedLanguage, Locale> = {
  it,
  en: enUS,
  es,
};

export function getDateFnsLocale(lang: string): Locale {
  const key = (['it', 'en', 'es'] as const).find((l) => l === lang) ?? 'it';
  return LOCALES[key];
}

export function formatDateTime(date: Date, lang: string): string {
  return format(date, 'd MMMM yyyy, HH:mm', { locale: getDateFnsLocale(lang) });
}

export function formatShortDateTime(date: Date, lang: string): string {
  return format(date, 'dd.MM.yyyy HH:mm', { locale: getDateFnsLocale(lang) });
}

interface UnitLabels {
  day: string;
  hour: string;
  minute: string;
}

export function formatDuration(
  totalMinutes: number,
  units: UnitLabels,
  options: { alwaysShowMinutes?: boolean } = {},
): string {
  const { days, hours, minutes } = splitDuration(totalMinutes);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}${units.day}`);
  if (hours > 0) parts.push(`${hours}${units.hour}`);
  if (minutes > 0 || options.alwaysShowMinutes || parts.length === 0) {
    parts.push(`${minutes}${units.minute}`);
  }
  return parts.join(' ');
}
