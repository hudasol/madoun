'use client';

import Link from 'next/link';
import { LaneBadge } from '@/components/LaneBadge';
import { Panel } from '@/components/Panel';
import { useLabels } from '@/components/shipment/labels';
import type { Lane } from '@/engine';
import { useBi, useFormat, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';

const T = {
  en: {
    needsOwner: 'Needs an owner now', seeAll: 'All exceptions', none: 'No open exceptions at this moment.',
    open: '{n} open in total', clock: 'waiting {h}', owner: 'Owner', escalated: 'Escalated level {n}',
    cleared: 'Cleared so far', modelled: 'modelled', basis: 'Based on {n} cleared shipments. Both columns are modelled on synthetic data, not measured.',
    metric: 'Measure', today: 'Today', madoun: 'With Madoun', before: 'Cleared before arrival', median: 'Median release time',
    repeats: 'Repeat checks avoided', repeatsText: '{n} checks did not have to be done twice (modelled).',
    mix: 'Lane mix of shipments in flight', mixSr: '{g} green, {a} amber, {r} red',
  },
  ar: {
    needsOwner: 'تحتاج مسؤولاً الآن', seeAll: 'كل الاستثناءات', none: 'لا توجد استثناءات مفتوحة حالياً.',
    open: '{n} مفتوحة في المجموع', clock: 'منتظرة منذ {h}', owner: 'المسؤول', escalated: 'تصعيد من المستوى {n}',
    cleared: 'ما تم الإفراج عنه حتى الآن', modelled: 'نمذجة', basis: 'بناءً على {n} شحنة تم الإفراج عنها. العمودان نمذجة على بيانات اصطناعية وليسا قياساً فعلياً.',
    metric: 'المؤشر', today: 'اليوم', madoun: 'مع مدوّن', before: 'الإفراج قبل الوصول', median: 'وسيط زمن الإفراج',
    repeats: 'فحوصات مكررة تم تجنبها', repeatsText: '{n} فحصاً لم يلزم إجراؤه مرتين (نمذجة).',
    mix: 'توزيع المسارات للشحنات قيد الإجراء', mixSr: '{g} أخضر، {a} كهرماني، {r} أحمر',
  },
};

const LANES: Lane[] = ['green', 'amber', 'red'];
const FILL: Record<Lane, string> = { green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)' };

export function NeedsOwner() {
  const t = useT(T);
  const f = useFormat();
  const bi = useBi();
  const s = useStore();
  const L = useLabels();
  const top = [...s.exceptions].sort((a, b) => b.escalationLevel - a.escalationLevel || b.clockHours - a.clockHours).slice(0, 5);
  return (
    <Panel title={t('needsOwner')} aside={<Link href="/exceptions" className="underline underline-offset-2 hover:text-ink">{t('seeAll')}</Link>}>
      {top.length === 0 ? (
        <p className="text-muted">{t('none')}</p>
      ) : (
        <>
          <ul className="divide-y divide-line">
            {top.map((e) => {
              const file = s.world!.shipments[e.shipmentId];
              return (
                <li key={e.id} className="py-3 first:pt-0">
                  <p className="font-medium">{L.kind(e.kind)}</p>
                  <p className="text-sm text-muted">{bi(e.detail, e.detailAr)}</p>
                  <p className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm">
                    <Link href={`/shipments/${e.shipmentId}`} className="mono underline underline-offset-2">{file?.shipment.declarationRef ?? e.shipmentId}</Link>
                    <span><span className="text-muted">{t('owner')}:</span> {L.owner(e.ownerId)}</span>
                    <span className="text-muted">{t('clock', { h: f.hours(e.clockHours) })}</span>
                    {e.escalationLevel > 0 && <span className="font-semibold">{t('escalated', { n: e.escalationLevel })}</span>}
                  </p>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-sm text-muted">{t('open', { n: s.exceptions.length })}</p>
        </>
      )}
    </Panel>
  );
}

export function ClearedSoFar() {
  const t = useT(T);
  const f = useFormat();
  const s = useStore();
  const k = s.kpis!;
  const counts = { green: 0, amber: 0, red: 0 } as Record<Lane, number>;
  for (const x of s.inFlight) counts[x.lane]++;
  const total = s.inFlight.length || 1;
  return (
    <Panel title={t('cleared')} aside={<span className="border border-line px-1.5 text-sm">{t('modelled')}</span>}>
      <div className="overflow-x-auto"><table className="table-clean text-[0.95rem]">
        <thead>
          <tr><th scope="col">{t('metric')}</th><th scope="col">{t('today')}</th><th scope="col">{t('madoun')}</th></tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row" className="!text-ink !font-normal">{t('before')}</th>
            <td>{f.percent(k.todayPreArrivalPct, 0)}</td>
            <td className="font-semibold">{f.percent(k.madounPreArrivalPct, 0)}</td>
          </tr>
          <tr>
            <th scope="row" className="!text-ink !font-normal">{t('median')}</th>
            <td>{f.hours(k.todayMedianHours)}</td>
            <td className="font-semibold">{f.hours(k.madounMedianHours)}</td>
          </tr>
        </tbody>
      </table></div>
      <p className="mt-3 text-sm text-muted">{t('basis', { n: f.number(k.shipments) })}</p>
      <p className="mt-3"><span className="font-medium">{t('repeats')}.</span> {t('repeatsText', { n: f.number(k.repeatChecksAvoided) })}</p>

      <h3 className="mt-5 text-base">{t('mix')}</h3>
      <div role="img" aria-label={t('mixSr', { g: counts.green, a: counts.amber, r: counts.red })} className="mt-2 flex h-3 gap-[2px]">
        {LANES.map((l) => counts[l] > 0 && (
          <span key={l} style={{ flexGrow: counts[l], background: FILL[l], flexBasis: 0 }} className="rounded-[1px]" />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {LANES.map((l) => (
          <li key={l} className="inline-flex items-center gap-2">
            <LaneBadge lane={l} size="sm" /><span className="font-semibold">{f.number(counts[l])}</span>
            <span className="text-muted">({f.percent((counts[l] / total) * 100)})</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
