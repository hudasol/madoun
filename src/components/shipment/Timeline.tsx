'use client';

import type { ShipmentPlan } from '@/engine';
import { useBi, useFormat, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { useLabels } from './labels';

const T = {
  en: {
    title: 'Review timeline', modelled: 'modelled',
    today: 'Today, one after another', madoun: 'With Madoun, in parallel', saves: 'Madoun saves about {h} on this shipment.', nosave: 'No time is saved on this shipment.',
    avoided: '{n} repeat check(s) avoided by reusing receipts.', basis: 'Both estimates are modelled from sample review times and are not measurements.',
    axis: 'Hours from file opening', critical: 'On the critical path: the release cannot come sooner than this chain finishes.',
    waits: 'Waits for: {x}', starts: 'No dependency, starts at once', actionNone: 'Already done', full: 'Full review', accept: 'Accept receipt',
    legendCrit: 'Critical path', legendOther: 'Other review', range: 'from {a} to {b}', after: 'after release', nonBlock: 'does not block release',
  },
  ar: {
    title: 'الجدول الزمني للمراجعات', modelled: 'نمذجة',
    today: 'اليوم، واحدة تلو الأخرى', madoun: 'مع مدوّن، بالتوازي', saves: 'يوفّر مدوّن نحو {h} في هذه الشحنة.', nosave: 'لا يوفّر مدوّن وقتاً في هذه الشحنة.',
    avoided: 'تم تجنب {n} فحصاً مكرراً بإعادة استخدام الإيصالات.', basis: 'التقديران نمذجة من أزمنة مراجعة تجريبية وليسا قياساً.',
    axis: 'ساعات منذ فتح الملف', critical: 'على المسار الحرج: لا يمكن أن يسبق الإفراج انتهاء هذه السلسلة.',
    waits: 'ينتظر: {x}', starts: 'بلا اعتماد على غيره، يبدأ فوراً', actionNone: 'تمت سابقاً', full: 'مراجعة كاملة', accept: 'قبول الإيصال',
    legendCrit: 'المسار الحرج', legendOther: 'مراجعة أخرى', range: 'من {a} إلى {b}', after: 'بعد الإفراج', nonBlock: 'لا يعطّل الإفراج',
  },
};

export function Timeline({ plan }: { plan: ShipmentPlan }) {
  const t = useT(T);
  const f = useFormat();
  const bi = useBi();
  const s = useStore();
  const L = useLabels();
  const rp = plan.reviewPlan;
  const req = s.directory!.requirementById;
  const label = (id: string) => { const r = req[id]; return r ? bi(r.label, r.labelAr) : id; };
  const end = Math.max(1, rp.sequentialHours, ...rp.reviews.map((r) => r.endHour));
  const rows = [...rp.reviews].sort((a, b) => a.startHour - b.startHour || a.authorityId.localeCompare(b.authorityId));
  const ticks = Array.from({ length: 5 }, (_, i) => (end / 4) * i);
  const pct = (h: number) => `${Math.min(100, (h / end) * 100)}%`;

  return (
    <section className="panel" aria-labelledby="tl-h">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
        <h2 id="tl-h" className="text-[1.05rem]">{t('title')}</h2>
        <span className="border border-line px-1.5 text-sm text-muted">{t('modelled')}</span>
      </header>
      <div className="space-y-4 p-4">
        <div>
          <p className="max-w-[70ch]">
            <span className="font-medium">{rp.hoursSaved > 0 ? t('saves', { h: f.hours(rp.hoursSaved) }) : t('nosave')}</span>{' '}
            {rp.duplicateChecksAvoided > 0 && t('avoided', { n: f.number(rp.duplicateChecksAvoided) })}
          </p>
          <div className="mt-3 space-y-2">
            {([['today', rp.sequentialHours, 'var(--faint)'], ['madoun', rp.parallelHours, 'var(--ink)']] as const).map(([k, h, c]) => (
              <div key={k} className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_4.5rem] items-center gap-3 text-sm">
                <span>{t(k)}</span>
                <span className="h-[8px] bg-panel2" aria-hidden="true"><span className="block h-full" style={{ width: pct(h), background: c }} /></span>
                <span className="mono text-end">{f.hours(h)}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-sm text-muted">{t('basis')}</p>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[40rem]">
            <div className="grid grid-cols-[14rem_minmax(0,1fr)] gap-x-4">
              <p className="text-sm text-muted">{t('axis')}</p>
              <div className="relative h-5 text-xs text-muted" aria-hidden="true">
                {ticks.map((h, i) => (
                  i === ticks.length - 1
                    ? <span key={i} className="absolute" style={{ insetInlineEnd: 0 }}>{f.hours(h)}</span>
                    : <span key={i} className={i === 0 ? 'absolute' : 'absolute -translate-x-1/2 rtl:translate-x-1/2'} style={{ insetInlineStart: pct(h) }}>{f.hours(h)}</span>
                ))}
              </div>
            </div>
            <ul className="mt-1">
              {rows.map((r) => {
                const wait = [...new Set(r.dependsOn)].filter((d) => rows.some((x) => x.requirementId === d));
                const zero = r.mode === 'no-action' || r.endHour <= r.startHour;
                return (
                  <li key={r.requirementId} className="grid grid-cols-[14rem_minmax(0,1fr)] gap-x-4 border-t border-line py-2">
                    <div>
                      <p className="text-sm font-medium">{L.authority(r.authorityId)}</p>
                      <p className="text-sm text-muted">{label(r.requirementId)}</p>
                    </div>
                    <div>
                      <div className="relative h-5" role="img" aria-label={`${label(r.requirementId)}: ${zero ? t('actionNone') : t('range', { a: f.hours(r.startHour), b: f.hours(r.endHour) })}${r.onCriticalPath ? ', ' + t('legendCrit') : ''}`}>
                        {ticks.map((h, i) => <span key={i} className="absolute top-0 h-full w-px bg-line" style={{ insetInlineStart: pct(h) }} />)}
                        {zero ? (
                          <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 border-muted rtl:translate-x-1/2" style={{ insetInlineStart: pct(r.startHour) }} />
                        ) : (
                          <span
                            className="absolute top-[3px] h-[14px] rounded-[2px]"
                            style={{
                              insetInlineStart: pct(r.startHour), width: `max(4px, calc(${pct(r.endHour)} - ${pct(r.startHour)}))`,
                              background: r.onCriticalPath ? 'var(--ink)' : 'var(--panel-2)',
                              border: r.onCriticalPath ? '1px solid var(--ink)' : '1.5px solid var(--muted)',
                            }}
                          />
                        )}
                      </div>
                      <p className="text-[0.8rem] text-muted">
                        {zero ? t('actionNone') : `${r.mode === 'full-review' ? t('full') : t('accept')}, ${f.hours(r.hours)}`}.{' '}
                        {wait.length ? t('waits', { x: [...new Set(wait.map(label))].join(', ') }) : t('starts')}.
                        {!r.blocksRelease && ` ${t('nonBlock')}.`}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
        <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
          <li className="inline-flex items-center gap-2"><span className="inline-block h-[10px] w-6 bg-ink" />{t('legendCrit')}</li>
          <li className="inline-flex items-center gap-2"><span className="inline-block h-[10px] w-6 border-[1.5px] border-muted" />{t('legendOther')}</li>
        </ul>
        <p className="max-w-[70ch] text-sm text-muted">{t('critical')}</p>
      </div>
    </section>
  );
}
