'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Locale = 'en' | 'ar';
export type Dict = Record<string, string>;
export type Bilingual<T extends Dict = Dict> = { en: T; ar: T };

interface LocaleCtx {
  locale: Locale;
  dir: 'ltr' | 'rtl';
  setLocale: (l: Locale) => void;
}

const Ctx = createContext<LocaleCtx>({ locale: 'en', dir: 'ltr', setLocale: () => {} });

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('madoun.locale');
      if (saved === 'ar' || saved === 'en') setLocaleState(saved);
    } catch {
      /* storage unavailable: stay with the default */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem('madoun.locale', l);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(() => ({ locale, dir: locale === 'ar' ? ('rtl' as const) : ('ltr' as const), setLocale }), [locale, setLocale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLocale() {
  return useContext(Ctx);
}

/**
 * Per-page dictionaries keep pages independent:
 *   const T = { en: { title: 'Exceptions' }, ar: { title: 'الاستثناءات' } };
 *   const t = useT(T);  t('title')
 * Supports {name} placeholders: t('hello', { name: 'Huda' }).
 */
export function useT<T extends Dict>(dict: Bilingual<T>) {
  const { locale } = useLocale();
  return useCallback(
    (key: keyof T & string, vars?: Record<string, string | number>) => {
      let s: string = dict[locale][key] ?? dict.en[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
      return s;
    },
    [dict, locale],
  );
}

/** Pick the right text from an engine value that has an English and an Arabic form. */
export function useBi() {
  const { locale } = useLocale();
  return useCallback((en: string, ar?: string) => (locale === 'ar' && ar ? ar : en), [locale]);
}

export function useFormat() {
  const { locale } = useLocale();
  return useMemo(() => {
    const tag = locale === 'ar' ? 'ar-AE-u-nu-latn' : 'en-GB';
    const tz = 'Asia/Dubai';
    return {
      number: (n: number, digits = 0) => new Intl.NumberFormat(tag, { maximumFractionDigits: digits }).format(n),
      percent: (n: number, digits = 0) => `${new Intl.NumberFormat(tag, { maximumFractionDigits: digits }).format(n)}%`,
      dateTime: (iso: string) =>
        new Intl.DateTimeFormat(tag, { timeZone: tz, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)),
      date: (iso: string) => new Intl.DateTimeFormat(tag, { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)),
      time: (iso: string) => new Intl.DateTimeFormat(tag, { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)),
      /** 3.5 -> "3h 30m" / "3س 30د" */
      hours: (h: number) => {
        const neg = h < 0;
        const abs = Math.abs(h);
        const hh = Math.floor(abs);
        const mm = Math.round((abs - hh) * 60);
        const hl = locale === 'ar' ? 'س' : 'h';
        const ml = locale === 'ar' ? 'د' : 'm';
        const body = hh === 0 ? `${mm}${ml}` : mm === 0 ? `${hh}${hl}` : `${hh}${hl} ${mm}${ml}`;
        return neg ? `−${body}` : body;
      },
    };
  }, [locale]);
}
