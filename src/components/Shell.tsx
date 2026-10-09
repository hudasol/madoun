'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useFormat, useLocale, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';

const T = {
  en: {
    tower: 'Control tower', shipments: 'Shipments', exceptions: 'Exceptions', evidence: 'Evidence', learning: 'Learning',
    inspection: 'Inspection', simulator: 'Today vs Madoun', method: 'Method',
    banner: 'Sample data: every shipment is synthetic and every rule is illustrative.',
    viewing: 'Viewing', now: 'Latest', scrub: 'Move through time', theme: 'Switch theme', lang: 'العربية', reset: 'Reset demo changes',
    skip: 'Skip to content', changes: '{n} demo change(s)',
  },
  ar: {
    tower: 'برج المراقبة', shipments: 'الشحنات', exceptions: 'الاستثناءات', evidence: 'الأدلة', learning: 'التعلّم',
    inspection: 'الفحص', simulator: 'اليوم مقابل مدوّن', method: 'المنهجية',
    banner: 'بيانات تجريبية: كل الشحنات اصطناعية وكل القواعد توضيحية.',
    viewing: 'العرض عند', now: 'الأحدث', scrub: 'التنقل عبر الزمن', theme: 'تبديل المظهر', lang: 'English', reset: 'إعادة ضبط تغييرات العرض',
    skip: 'انتقل إلى المحتوى', changes: '{n} تغيير(ات) تجريبية',
  },
};

const NAV: { href: string; key: keyof typeof T.en }[] = [
  { href: '/', key: 'tower' },
  { href: '/shipments', key: 'shipments' },
  { href: '/exceptions', key: 'exceptions' },
  { href: '/evidence', key: 'evidence' },
  { href: '/learning', key: 'learning' },
  { href: '/inspection', key: 'inspection' },
  { href: '/simulator', key: 'simulator' },
  { href: '/method', key: 'method' },
];

export function Shell({ children }: { children: ReactNode }) {
  const t = useT(T);
  const f = useFormat();
  const { locale, setLocale } = useLocale();
  const path = usePathname();
  const s = useStore();
  const [theme, setTheme] = useState<'auto' | 'dark' | 'light'>('auto');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('madoun.theme');
      if (saved === 'dark' || saved === 'light') setTheme(saved);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    try {
      localStorage.setItem('madoun.theme', next);
    } catch {
      /* ignore */
    }
  };

  const STEP_MS = 30 * 60 * 1000;
  const steps = s.ready ? Math.max(1, Math.round((Date.parse(s.endAt) - Date.parse(s.startAt)) / STEP_MS)) : 1;
  const idx = s.ready ? Math.round((Date.parse(s.at) - Date.parse(s.startAt)) / STEP_MS) : steps;

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-panel focus:p-3">{t('skip')}</a>
      <header className="site-header">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2.5">
          <Link href="/" className="inline-flex items-baseline gap-2" aria-label="Madoun">
            <span className="stamp !py-1 !px-2.5 text-[1.05rem] tracking-tight">Madoun<small className="!text-[0.7rem]">مدوّن</small></span>
          </Link>
          <nav aria-label="Main" className="nav-scroll order-3 -mx-4 w-[calc(100%+2rem)] overflow-x-auto px-4 md:order-none md:mx-0 md:w-auto md:flex-1 md:px-0">
            <ul className="flex gap-1 whitespace-nowrap">
              {NAV.map((n) => {
                const active = n.href === '/' ? path === '/' : path.startsWith(n.href);
                return (
                  <li key={n.href}>
                    <Link
                      href={n.href}
                      aria-current={active ? 'page' : undefined}
                      className="nav-link"
                    >
                      {t(n.key)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="ms-auto flex items-center gap-2">
            <button type="button" className="btn !py-1.5" onClick={() => setLocale(locale === 'en' ? 'ar' : 'en')} lang={locale === 'en' ? 'ar' : 'en'}>
              {t('lang')}
            </button>
            <button type="button" className="btn !py-1.5" onClick={toggleTheme} aria-label={t('theme')} title={t('theme')}>
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M8 2a6 6 0 0 0 0 12z" fill="currentColor" /></svg>
            </button>
          </div>
        </div>
        {s.ready && (
          <div className="border-t border-line">
            <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-sm">
              <label htmlFor="scrub" className="text-muted">{t('viewing')}</label>
              <span className="mono min-w-[9ch] font-medium">{f.dateTime(s.at)}</span>
              <input
                id="scrub"
                type="range"
                min={0}
                max={steps}
                value={Math.min(steps, Math.max(0, idx))}
                aria-label={t('scrub')}
                onChange={(e) => s.setAt(new Date(Date.parse(s.startAt) + Number(e.target.value) * STEP_MS).toISOString())}
                className="scrub min-w-[160px] flex-1"
                style={{ ["--p" as string]: `${(Math.min(steps, Math.max(0, idx)) / steps) * 100}%` }}
              />
              <button type="button" className="btn !py-1" onClick={() => s.setAt(s.endAt)} disabled={s.at === s.endAt}>{t('now')}</button>
              {s.overlayCount > 0 && (
                <button type="button" className="btn !py-1" onClick={s.resetDemo} title={t('reset')}>{t('changes', { n: s.overlayCount })}</button>
              )}
            </div>
          </div>
        )}
      </header>
      <p className="border-b border-line bg-panel2/60 px-4 py-1.5 text-center text-[0.82rem] text-muted">{t('banner')}</p>
      <main id="main" className="mx-auto max-w-[1280px] px-4 py-8">{children}</main>
    </div>
  );
}
