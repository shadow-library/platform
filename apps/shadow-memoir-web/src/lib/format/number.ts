import { DEFAULT_LOCALE } from '@shadow-library/ui';

/** The server stores water in millilitres; every surface shows litres. */
export function convertMlToLitres(valueMl: number): number {
  return valueMl / 1000;
}

/** The inverse of {@link convertMlToLitres} — convert a litres value typed or parsed on the client back to the millilitres the server stores. */
export function litresToMl(valueLitres: number): number {
  return Math.round(valueLitres * 1000);
}

/** "1 meal" / "4 meals" — `count` is locale-formatted, so large counts still read correctly. */
export function formatCount(count: number, singular: string, plural: string, locale: string = DEFAULT_LOCALE): string {
  return `${count.toLocaleString(locale)} ${count === 1 ? singular : plural}`;
}

export interface CompactMoneyOptions {
  locale?: string;
}

/** A rounded, tight-space amount ("€1.2K"); an exact total still belongs to `formatMinor`. */
export function formatCompactMoney(amountMinor: number, currency: string, options: CompactMoneyOptions = {}): string {
  const major = amountMinor / 100;
  return new Intl.NumberFormat(options.locale ?? DEFAULT_LOCALE, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(major);
}
