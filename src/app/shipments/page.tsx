'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { LaneBadge } from '@/components/LaneBadge';
import { Loading, PageTitle } from '@/components/Panel';
import { statusOf, useLabels, type StatusKey } from '@/components/shipment/labels';
import { allItems, ms, type Lane } from '@/engine';
import { useBi, useFormat, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';

const T = {
  en: {
    title: 'Shipments',
    intro: 'Every declaration in the sample data. Open one to see what approvals it needs, what is missing and who owns it.',
    green: 'Green', amber: 'Amber', red: 'Red',
    search: 'Search', searchHint: 'Reference, trader or goods', lane: 'Lane', status: 'Status', sort: 'Sort by',
    anyLane: 'Any lane', anyStatus: 'Any status', inReview: 'In review', beforeArrival: 'Cleared before arrival', afterArrival: 'Cleared after arrival',
    onlyExc: 'Has an open exception', sortFiled: 'Filed, newest first', sortEtaAsc: 'Arrival, soonest first', sortEtaDesc: 'Arrival, latest first',
    reference: 'Reference', trader: 'Trader', goods: 'Goods', route: 'Mode and entry point', eta: 'Arrival', laneCol: 'Lane', statusCol: 'Status', exc: 'Open exceptions',
    more: '+{n} more', count: '{n} shipments match', range: 'Showing {a} to {b} of {n}', prev: 'Previous page', next: 'Next page', page: 'Page {p} of {n}',
    emptyT: 'No shipment matches these filters', emptyB: 'Clear the search box, set lane and status to any, or turn off the open-exception filter to see more.',
    clear: 'Clear all filters', tableLabel: 'Shipments',
  },
  ar: {
    title: 'الشحنات',
    intro: 'كل البيانات الجمركية في العينة. افتح أي شحنة لترى الموافقات المطلوبة وما ينقصها ومن يملك كل بند.',
    green: 'أخضر', amber: 'كهرماني', red: 'أحمر',
    search: 'بحث', searchHint: 'المرجع أو التاجر أو البضائع', lane: 'المسار', status: 'الحالة', sort: 'الترتيب',
    anyLane: 'أي مسار', anyStatus: 'أي حالة', inReview: 'قيد المراجعة', beforeArrival: 'أُفرج عنها قبل الوصول', afterArrival: 'أُفرج عنها بعد الوصول',
    onlyExc: 'لديها استثناء مفتوح', sortFiled: 'تاريخ التقديم، الأحدث أولاً', sortEtaAsc: 'الوصول، الأقرب أولاً', sortEtaDesc: 'الوصول، الأبعد أولاً',
    reference: 'المرجع', trader: 'التاجر', goods: 'البضائع', route: 'الوسيلة ونقطة الدخول', eta: 'الوصول', laneCol: 'المسار', statusCol: 'الحالة', exc: 'استثناءات مفتوحة',
    more: '+{n} أخرى', count: '{n} شحنة مطابقة', range: 'عرض {a} إلى {b} من {n}', prev: 'الصفحة السابقة', next: 'الصفحة التالية', page: 'الصفحة {p} من {n}',
    emptyT: 'لا توجد شحنة تطابق هذه المرشحات', emptyB: 'امسح خانة البحث، أو اجعل المسار والحالة على أي، أو أوقف مرشح الاستثناء المفتوح لرؤية المزيد.',
    clear: 'مسح كل المرشحات', tableLabel: 'الشحنات',
  },
};

const PER = 25;
type SortKey = 'filed' | 'etaAsc' | 'etaDesc';

const field = 'rounded-[3px] border border-line bg-panel px-3 py-1.5 text-ink';

export default function Page() {
  const t = useT(T);
  const f = useFormat();
  const bi = useBi();
  const s = useStore();
  const L = useLabels();
  const [q, setQ] = useState('');
  const [lane, setLane] = useState<'' | Lane>('');
  const [status, setStatus] = useState<'' | StatusKey>('');
  const [onlyExc, setOnlyExc] = useState(false);
  const [sort, setSort] = useState<SortKey>('filed');
  const [page, setPage] = useState(1);

  const excCount = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of s.exceptions) m[e.shipmentId] = (m[e.shipmentId] ?? 0) + 1;
    return m;
  }, [s.exceptions]);

  const rows = useMemo(() => {
    if (!s.world || !s.directory) return [];
    const needle = q.trim().toLowerCase();
    const out = Object.values(s.world.shipments).filter((file) => {
      const sh = file.shipment;
      if (lane && s.laneOf(file) !== lane) return false;
      if (status && statusOf(file) !== status) return false;
      if (onlyExc && !excCount[sh.id]) return false;
      if (needle) {
        const tr = s.directory!.traders[sh.traderId];
        const hay = [sh.declarationRef, sh.id, tr?.name, tr?.nameAr, ...allItems(sh).flatMap((i) => [i.description, i.descriptionAr, i.hsCode])].join(' ').toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    out.sort((a, b) =>
      sort === 'filed' ? ms(b.shipment.filedAt) - ms(a.shipment.filedAt)
        : sort === 'etaAsc' ? ms(a.shipment.eta) - ms(b.shipment.eta)
        : ms(b.shipment.eta) - ms(a.shipment.eta));
    return out;
  }, [s, q, lane, status, onlyExc, sort, excCount]);

  if (!s.ready || !s.world) return <Loading />;

  const pages = Math.max(1, Math.ceil(rows.length / PER));
  const cur = Math.min(page, pages);
  const slice = rows.slice((cur - 1) * PER, cur * PER);
  const reset = <A,>(set: (v: A) => void) => (v: A) => { set(v); setPage(1); };
  const filtered = q || lane || status || onlyExc;

  return (
    <>
      <PageTitle title={t('title')} intro={t('intro')} />
      <form className="mb-4 flex flex-wrap items-end gap-x-4 gap-y-3" onSubmit={(e) => e.preventDefault()} role="search">
        <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-sm text-muted">
          {t('search')}
          <input type="search" value={q} placeholder={t('searchHint')} onChange={(e) => reset(setQ)(e.target.value)} className={`${field} text-base`} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('lane')}
          <select value={lane} onChange={(e) => reset(setLane)(e.target.value as '' | Lane)} className={field}>
            <option value="">{t('anyLane')}</option>
            <option value="green">{t('green')}</option>
            <option value="amber">{t('amber')}</option>
            <option value="red">{t('red')}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('status')}
          <select value={status} onChange={(e) => reset(setStatus)(e.target.value as '' | StatusKey)} className={field}>
            <option value="">{t('anyStatus')}</option>
            <option value="inReview">{t('inReview')}</option>
            <option value="beforeArrival">{t('beforeArrival')}</option>
            <option value="afterArrival">{t('afterArrival')}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('sort')}
          <select value={sort} onChange={(e) => reset(setSort)(e.target.value as SortKey)} className={field}>
            <option value="filed">{t('sortFiled')}</option>
            <option value="etaAsc">{t('sortEtaAsc')}</option>
            <option value="etaDesc">{t('sortEtaDesc')}</option>
          </select>
        </label>
        <label className="flex items-center gap-2 py-2 text-ink">
          <input type="checkbox" checked={onlyExc} onChange={(e) => reset(setOnlyExc)(e.target.checked)} className="h-4 w-4 accent-[var(--stamp)]" />
          {t('onlyExc')}
        </label>
      </form>

      <p className="mb-2 text-sm text-muted" aria-live="polite">
        {rows.length ? t('range', { a: f.number((cur - 1) * PER + 1), b: f.number(Math.min(rows.length, cur * PER)), n: f.number(rows.length) }) : t('count', { n: 0 })}
      </p>

      {rows.length === 0 ? (
        <div className="panel p-6">
          <h2 className="text-lg">{t('emptyT')}</h2>
          <p className="mt-2 max-w-[60ch] text-muted">{t('emptyB')}</p>
          {filtered && <button type="button" className="btn mt-4" onClick={() => { setQ(''); setLane(''); setStatus(''); setOnlyExc(false); setPage(1); }}>{t('clear')}</button>}
        </div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="table-clean min-w-[62rem] text-[0.95rem]" aria-label={t('tableLabel')}>
            <thead>
              <tr>
                <th scope="col">{t('reference')}</th><th scope="col">{t('trader')}</th><th scope="col">{t('goods')}</th>
                <th scope="col">{t('route')}</th><th scope="col">{t('eta')}</th><th scope="col">{t('laneCol')}</th>
                <th scope="col">{t('statusCol')}</th><th scope="col">{t('exc')}</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((file) => {
                const sh = file.shipment;
                const items = allItems(sh);
                const tr = s.directory!.traders[sh.traderId];
                const n = excCount[sh.id] ?? 0;
                return (
                  <tr key={sh.id}>
                    <td>
                      <Link href={`/shipments/${sh.id}`} className="mono font-medium underline underline-offset-2">{sh.declarationRef}</Link>
                    </td>
                    <td>{tr ? bi(tr.name, tr.nameAr) : sh.traderId}</td>
                    <td className="max-w-[16rem]">
                      <span className="block truncate">{items[0] && bi(items[0].description, items[0].descriptionAr)}</span>
                      {items.length > 1 && <span className="text-sm text-muted">{t('more', { n: items.length - 1 })}</span>}
                    </td>
                    <td>{L.mode(sh.mode)}<span className="block text-sm text-muted">{L.entry(sh.entryPoint)}</span></td>
                    <td className="whitespace-nowrap">{f.dateTime(sh.eta)}</td>
                    <td><LaneBadge lane={s.laneOf(file)} size="sm" /></td>
                    <td>{L.status(file)}</td>
                    <td className={n ? 'font-semibold' : 'text-muted'}>{f.number(n)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav className="mt-4 flex flex-wrap items-center gap-3" aria-label={t('tableLabel')}>
          <button type="button" className="btn" disabled={cur <= 1} onClick={() => setPage(cur - 1)}>{t('prev')}</button>
          <span className="text-sm text-muted">{t('page', { p: f.number(cur), n: f.number(pages) })}</span>
          <button type="button" className="btn" disabled={cur >= pages} onClick={() => setPage(cur + 1)}>{t('next')}</button>
        </nav>
      )}
    </>
  );
}
