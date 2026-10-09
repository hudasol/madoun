'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Lane } from '@/engine';
import { LaneBadge } from '@/components/LaneBadge';
import { useLabels } from '@/components/shipment/labels';
import { useBi, useFormat, useT } from '@/lib/i18n';
import { useStore, type InFlight } from '@/lib/store';
import { Track, TrackLegend } from './Track';

const T = {
  en: {
    legendElapsed: 'Time used', legendReview: 'Review finished', legendArrival: 'Arrival', legendRelease: 'Predicted release (modelled)',
    filterLane: 'Filter by lane', all: 'All lanes', atRisk: 'Only at risk', atRiskHint: 'Predicted to clear after arrival',
    showing: 'Showing {n} of {total} shipments', showAll: 'Show all {n}', showFewer: 'Show the next {n} only',
    clearsBefore: 'Clears {h} before arrival', after: 'Predicted {h} after arrival', late: 'Late', onTrack: 'On track',
    arrives: 'Arrives {t}', reviews: '{done} of {total} reviews done', empty: 'No in-flight shipment matches these filters. Choose all lanes or turn off the at-risk filter.',
    listLabel: 'In-flight shipments by arrival time',
  },
  ar: {
    legendElapsed: 'الوقت المستهلك', legendReview: 'مراجعة منتهية', legendArrival: 'الوصول', legendRelease: 'الإفراج المتوقع (نمذجة)',
    filterLane: 'تصفية حسب المسار', all: 'كل المسارات', atRisk: 'المعرّضة للتأخر فقط', atRiskHint: 'يُتوقع الإفراج عنها بعد الوصول',
    showing: 'عرض {n} من {total} شحنة', showAll: 'عرض الكل ({n})', showFewer: 'عرض الأقرب وصولاً فقط ({n})',
    clearsBefore: 'يتم الإفراج قبل الوصول بـ {h}', after: 'يُتوقع الإفراج بعد الوصول بـ {h}', late: 'متأخرة', onTrack: 'في الموعد',
    arrives: 'تصل {t}', reviews: 'اكتملت {done} من {total} مراجعات', empty: 'لا توجد شحنة قيد الإجراء تطابق هذه المرشحات. اختر كل المسارات أو أوقف مرشح المعرّضة للتأخر.',
    listLabel: 'الشحنات قيد الإجراء حسب موعد الوصول',
  },
};

const PAGE = 14;

function Row({ x }: { x: InFlight }) {
  const t = useT(T);
  const f = useFormat();
  const bi = useBi();
  const s = useStore();
  const L = useLabels();
  const sh = x.file.shipment;
  const trader = s.directory!.traders[sh.traderId];
  const done = Object.values(x.file.reviews).filter((r) => r.completedAt);
  const late = x.slackHours < 0;
  return (
    <li className="border-b border-line last:border-b-0">
      <Link
        href={`/shipments/${sh.id}`}
        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-panel2 lg:grid-cols-[14rem_5.5rem_minmax(0,1fr)_16rem]"
      >
        <div className="min-w-0">
          <div className="mono font-medium">{sh.declarationRef}</div>
          <div className="truncate text-sm">{trader ? bi(trader.name, trader.nameAr) : sh.traderId}</div>
          <div className="truncate text-sm text-muted">{L.entry(sh.entryPoint)} / {L.mode(sh.mode)}</div>
        </div>
        <div className="justify-self-end lg:justify-self-start"><LaneBadge lane={x.lane as Lane} size="sm" /></div>
        <div className="col-span-2 lg:col-span-1">
          <Track filedAt={sh.filedAt} eta={sh.eta} at={s.at} predictedAt={x.predictedReleaseAt} doneAt={done.map((d) => d.completedAt!)} />
        </div>
        <div className="col-span-2 text-sm lg:col-span-1">
          {late ? (
            <p className="font-semibold [text-wrap:balance]">
              <span className="mb-1 me-2 inline-flex items-center gap-1 border border-ink px-1.5 text-[0.8rem]">
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1v4.5L7.5 7" fill="none" stroke="currentColor" strokeWidth="1.5" /><circle cx="5" cy="5" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
                {t('late')}
              </span>
              {t('after', { h: f.hours(-x.slackHours) })}
            </p>
          ) : (
            <p>{t('clearsBefore', { h: f.hours(x.slackHours) })}</p>
          )}
          <p className="text-muted">{t('arrives', { t: f.dateTime(sh.eta) })}</p>
          <p className="text-muted">{t('reviews', { done: done.length, total: x.plan.reviewPlan.reviews.length })}</p>
        </div>
      </Link>
    </li>
  );
}

export function ArrivalBoard() {
  const t = useT(T);
  const s = useStore();
  const [lane, setLane] = useState<'all' | Lane>('all');
  const [risk, setRisk] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const rows = s.inFlight.filter((x) => (lane === 'all' || x.lane === lane) && (!risk || x.slackHours < 0));
  const shown = showAll ? rows : rows.slice(0, PAGE);
  const lanes: ('all' | Lane)[] = ['all', 'green', 'amber', 'red'];

  return (
    <section className="panel" aria-labelledby="board-h">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line px-4 py-3">
        <h2 id="board-h" className="sr-only">{t('listLabel')}</h2>
        <div role="group" aria-label={t('filterLane')} className="flex flex-wrap gap-2">
          {lanes.map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={lane === l}
              onClick={() => setLane(l)}
              className={`btn !py-1 ${lane === l ? '!border-ink !bg-panel2' : ''}`}
            >
              {l === 'all' ? t('all') : <LaneBadge lane={l} size="sm" />}
            </button>
          ))}
        </div>
        <button type="button" aria-pressed={risk} onClick={() => setRisk((r) => !r)} className={`btn !py-1 ${risk ? '!border-ink !bg-panel2' : ''}`} title={t('atRiskHint')}>
          <span aria-hidden="true" className={`inline-block h-3 w-3 border border-ink ${risk ? 'bg-ink' : ''}`} />
          {t('atRisk')}
        </button>
        <p className="ms-auto text-sm text-muted" aria-live="polite">{t('showing', { n: shown.length, total: rows.length })}</p>
      </div>
      <div className="border-b border-line px-4 py-2"><TrackLegend labels={{ elapsed: t('legendElapsed'), review: t('legendReview'), arrival: t('legendArrival'), release: t('legendRelease') }} /></div>
      {rows.length === 0 ? (
        <p className="p-6 text-muted">{t('empty')}</p>
      ) : (
        <ul aria-label={t('listLabel')}>{shown.map((x) => <Row key={x.file.shipment.id} x={x} />)}</ul>
      )}
      {rows.length > PAGE && (
        <div className="border-t border-line p-3">
          <button type="button" className="btn" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
            {showAll ? t('showFewer', { n: PAGE }) : t('showAll', { n: rows.length })}
          </button>
        </div>
      )}
    </section>
  );
}
