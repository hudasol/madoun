import type { ISODate } from './types';

export const HOUR_MS = 3_600_000;

export function ms(d: ISODate): number {
  const t = Date.parse(d);
  if (Number.isNaN(t)) throw new Error(`Invalid date: ${d}`);
  return t;
}

export function addHours(d: ISODate, h: number): ISODate {
  return new Date(ms(d) + h * HOUR_MS).toISOString();
}

/** Signed hours from a to b. */
export function hoursBetween(a: ISODate, b: ISODate): number {
  return (ms(b) - ms(a)) / HOUR_MS;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
