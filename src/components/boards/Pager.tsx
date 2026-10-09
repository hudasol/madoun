'use client';

import { useFormat, useT } from '@/lib/i18n';

const T = {
  en: { prev: 'Previous', next: 'Next', range: 'Showing {a} to {b} of {n}', nav: 'Pages' },
  ar: { prev: 'السابق', next: 'التالي', range: 'عرض {a} إلى {b} من {n}', nav: 'الصفحات' },
};

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const t = useT(T);
  const f = useFormat();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  const a = page * pageSize + 1;
  const b = Math.min(total, (page + 1) * pageSize);
  return (
    <nav aria-label={t('nav')} className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-muted" aria-live="polite">{t('range', { a: f.number(a), b: f.number(b), n: f.number(total) })}</p>
      <div className="flex gap-2">
        <button type="button" className="btn" disabled={page <= 0} onClick={() => onPage(page - 1)}>{t('prev')}</button>
        <button type="button" className="btn" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>{t('next')}</button>
      </div>
    </nav>
  );
}
