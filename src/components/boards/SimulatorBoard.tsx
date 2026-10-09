'use client';

import { useMemo, useState } from 'react';
import { computeKpis, ms, type Lane } from '@/engine';
import { LaneBadge } from '@/components/LaneBadge';
import { Loading, PageTitle, Panel } from '@/components/Panel';
import { useFormat, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { Modelled } from './Figures';
import { ReleaseChart } from './ReleaseChart';
import { ValuePanel } from './ValuePanel';

const T = {
  en: {
    title: 'Today vs Madoun', modelled: 'modelled',
    intro: 'The same synthetic shipments, run through two processes: reviews one after another as they are today, and reviews side by side with evidence reuse.',
    headline: 'Across {n} synthetic shipments, {b}% would clear before arrival with Madoun against {a}% today, and the median release time falls from {tm} to {mm}.',
    headlineNone: 'No shipment has cleared at this moment. Move the time slider forward to see the comparison.',
    kpis: 'Five measures', kpiCaption: 'Today and with Madoun, modelled on synthetic shipments cleared so far', measure: 'Measure', today: 'Today', with: 'With Madoun', change: 'Change',
    k1: 'Cleared before arrival', k2: 'Median release time', k3: '90th percentile release time', k4: 'Hours waiting with nobody working on it', k5: 'Repeat checks avoided',
    k4n: 'Added up over all shipments', k3n: 'Nine in ten shipments are released sooner than this',
    pts: '{n} points', pct: '{n}%', ptsUp: '+{n} points', less: '{n}% less', more: '{n} more',
    chart: 'Each shipment, today and with Madoun', chartIntro: 'Each vertical pair is one shipment. The dashed line is its arrival: a pair is released before arrival where it sits under the line.',
    laneFilter: 'Lane', all: 'All lanes', table: 'Show the chart data as a table', tableCaption: 'Release hours for each shipment, today and with Madoun, modelled',
    shipment: 'Shipment', lead: 'Hours to arrival', th: 'Today (hours)', mh: 'With Madoun (hours)',
    summary: 'In the selected lanes, {a} of {n} shipments are released before arrival today and {b} with Madoun.',
    byLane: 'By lane', laneCaption: 'Results by risk lane, modelled', lane: 'Lane', count: 'Shipments', tMed: 'Today, median', mMed: 'Madoun, median', mPre: 'Madoun, cleared before arrival',
    assume: 'Assumptions', assumeIntro: 'The comparison is built to avoid flattering Madoun. What it counts, and what it holds equal:',
    a1: 'Queue waits are not reduced for full reviews. An officer takes the same time to start and finish a review in both modes.',
    a2: 'Extra checks for amber and red lanes cost the same hours in both modes.',
    a3: 'Stalls happen to the same shipments for the same time in both modes.',
    a4: 'A missing document costs the same chasing time in both modes. The only difference is when it is noticed: Madoun sees it at filing, today it is found when the owning authority first picks the file up.',
    a5: 'An authority accepting its own earlier approval is free in both modes.',
    a6: 'What Madoun removes: waiting between reviews that could run side by side, and regulators re-checking documents another authority already verified.',
    disclaimer: 'All figures here are modelled on synthetic data. They are not measurements of any real customs operation, and no real shipment is involved.',
    hoursUnit: 'Modelled hours', sub: 'a {x}',
  },
  ar: {
    title: 'اليوم مقابل مدوّن', modelled: 'محاكاة',
    intro: 'الشحنات الاصطناعية نفسها مرّت بعمليتين: مراجعات متتابعة كما هي اليوم، ومراجعات متوازية مع إعادة استخدام الأدلة.',
    headline: 'في {n} شحنة اصطناعية، يُفرج عن {b}٪ قبل الوصول مع مدوّن مقابل {a}٪ اليوم، وينخفض الزمن الوسيط للإفراج من {tm} إلى {mm}.',
    headlineNone: 'لم تُفرج أي شحنة في هذه اللحظة. حرّك شريط الزمن إلى الأمام لتظهر المقارنة.',
    kpis: 'خمسة مقاييس', kpiCaption: 'اليوم ومع مدوّن، محاكاة على الشحنات الاصطناعية المفرج عنها حتى الآن', measure: 'المقياس', today: 'اليوم', with: 'مع مدوّن', change: 'التغيير',
    k1: 'إفراج قبل الوصول', k2: 'الزمن الوسيط للإفراج', k3: 'زمن الإفراج عند المئين التسعين', k4: 'ساعات انتظار دون أن يعمل عليها أحد', k5: 'فحوص مكررة تم تجنبها',
    k4n: 'مجموع كل الشحنات', k3n: 'تسع من كل عشر شحنات تُفرج قبل هذا الزمن',
    pts: '{n} نقطة', pct: '{n}٪', ptsUp: '+{n} نقطة', less: 'أقل بنسبة {n}٪', more: '{n} أكثر',
    chart: 'كل شحنة، اليوم ومع مدوّن', chartIntro: 'كل زوج عمودي شحنة واحدة. الخط المتقطع هو موعد الوصول: يُفرج عن الشحنة قبل وصولها حيث يقع زوجها تحت الخط.',
    laneFilter: 'المسار', all: 'كل المسارات', table: 'عرض بيانات الرسم كجدول', tableCaption: 'ساعات الإفراج لكل شحنة، اليوم ومع مدوّن، محاكاة',
    shipment: 'الشحنة', lead: 'الساعات حتى الوصول', th: 'اليوم (ساعات)', mh: 'مع مدوّن (ساعات)',
    summary: 'في المسارات المحددة، يُفرج عن {a} من {n} شحنة قبل الوصول اليوم و{b} مع مدوّن.',
    byLane: 'حسب المسار', laneCaption: 'النتائج حسب مسار الخطورة، محاكاة', lane: 'المسار', count: 'الشحنات', tMed: 'اليوم، الوسيط', mMed: 'مدوّن، الوسيط', mPre: 'مدوّن، إفراج قبل الوصول',
    assume: 'الافتراضات', assumeIntro: 'بُنيت المقارنة بحيث لا تحابي مدوّن. ما تحتسبه وما تثبّته في الحالتين:',
    a1: 'لا تُخفَّض أوقات الانتظار في الطوابير للمراجعات الكاملة. يستغرق الضابط الوقت نفسه لبدء المراجعة وإنهائها في الحالتين.',
    a2: 'الفحوص الإضافية للمسارين الكهرماني والأحمر تكلّف الساعات نفسها في الحالتين.',
    a3: 'التعطلات تصيب الشحنات نفسها للمدة نفسها في الحالتين.',
    a4: 'المستند الناقص يكلّف وقت المتابعة نفسه في الحالتين. الفرق الوحيد هو متى يُلاحظ: يراه مدوّن عند التقديم، أما اليوم فيُكتشف حين تستلم الجهة المعنية الملف.',
    a5: 'قبول الجهة موافقتها السابقة بلا كلفة في الحالتين.',
    a6: 'ما يزيله مدوّن: الانتظار بين مراجعات يمكن إجراؤها معاً، وإعادة الجهات التنظيمية فحص مستندات سبق أن تحققت منها جهة أخرى.',
    disclaimer: 'كل الأرقام هنا محاكاة على بيانات اصطناعية. وهي ليست قياسات لأي عملية جمركية حقيقية، ولا توجد أي شحنة حقيقية.',
    hoursUnit: 'ساعات محاكاة', sub: '',
  },
};

type LaneFilter = 'all' | Lane;

export function SimulatorBoard() {
  const s = useStore();
  const t = useT(T);
  const f = useFormat();
  const [lane, setLane] = useState<LaneFilter>('all');

  const results = useMemo(() => (s.sim && s.at ? s.sim.results.filter((r) => ms(r.clearedAt) <= ms(s.at)) : []), [s.sim, s.at]);
  const k = useMemo(() => computeKpis(results), [results]);
  const shown = useMemo(() => (lane === 'all' ? results : results.filter((r) => r.lane === lane)), [results, lane]);
  const preToday = shown.filter((r) => r.todayPreArrival).length;
  const preMadoun = shown.filter((r) => r.madounPreArrival).length;

  if (!s.ready || !s.sim) return <Loading />;

  const pctLess = (a: number, b: number) => (a ? Math.round(((a - b) / a) * 100) : 0);
  const rows: { key: string; label: string; note?: string; today: string; madoun: string; change: string }[] = [
    { key: 'k1', label: t('k1'), today: f.percent(k.todayPreArrivalPct, 1), madoun: f.percent(k.madounPreArrivalPct, 1), change: t('ptsUp', { n: f.number(k.madounPreArrivalPct - k.todayPreArrivalPct, 1) }) },
    { key: 'k2', label: t('k2'), today: f.hours(k.todayMedianHours), madoun: f.hours(k.madounMedianHours), change: t('less', { n: f.number(pctLess(k.todayMedianHours, k.madounMedianHours)) }) },
    { key: 'k3', label: t('k3'), note: t('k3n'), today: f.hours(k.todayP90Hours), madoun: f.hours(k.madounP90Hours), change: t('less', { n: f.number(pctLess(k.todayP90Hours, k.madounP90Hours)) }) },
    { key: 'k4', label: t('k4'), note: t('k4n'), today: f.hours(k.todayInactionHours), madoun: f.hours(k.madounInactionHours), change: t('less', { n: f.number(pctLess(k.todayInactionHours, k.madounInactionHours)) }) },
    { key: 'k5', label: t('k5'), today: f.number(0), madoun: f.number(k.repeatChecksAvoided), change: t('more', { n: f.number(k.repeatChecksAvoided) }) },
  ];

  const lanes: Lane[] = ['green', 'amber', 'red'];
  const filters: LaneFilter[] = ['all', ...lanes];

  return (
    <div>
      <PageTitle title={<>{t('title')} <Modelled>{t('modelled')}</Modelled></>} intro={t('intro')} />

      {k.shipments === 0 ? (
        <Panel><p className="text-muted">{t('headlineNone')}</p></Panel>
      ) : (
        <>
          <p className="max-w-[60ch] text-[1.25rem] font-medium leading-snug">
            {t('headline', { n: f.number(k.shipments), a: f.number(k.todayPreArrivalPct, 0), b: f.number(k.madounPreArrivalPct, 0), tm: f.hours(k.todayMedianHours), mm: f.hours(k.madounMedianHours) })}
          </p>

          <section className="mt-6" aria-labelledby="kp">
            <h2 id="kp" className="mb-2 text-[1.1rem]">{t('kpis')} <Modelled>{t('modelled')}</Modelled></h2>
            <div className="panel relative overflow-x-auto">
              <table className="table-clean min-w-[470px]">
                <caption className="sr-only">{t('kpiCaption')}</caption>
                <thead><tr><th scope="col">{t('measure')}</th><th scope="col">{t('today')}</th><th scope="col">{t('with')}</th><th scope="col">{t('change')}</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key}>
                      <th scope="row" className="!text-start !text-[1rem] font-normal !text-ink">{r.label}{r.note && <span className="block text-sm text-muted">{r.note}</span>}</th>
                      <td className="tabular-nums">{r.today}</td>
                      <td className="tabular-nums font-semibold">{r.madoun}</td>
                      <td className="whitespace-nowrap tabular-nums">{r.change}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-8" aria-labelledby="ch">
            <h2 id="ch" className="text-[1.1rem]">{t('chart')} <Modelled>{t('modelled')}</Modelled></h2>
            <p className="mt-1 max-w-[68ch] text-muted">{t('chartIntro')}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label={t('laneFilter')}>
              {filters.map((x) => (
                <button key={x} type="button" className="btn !py-1" aria-pressed={lane === x} style={lane === x ? { borderColor: 'var(--ink)' } : undefined} onClick={() => setLane(x)}>
                  {x === 'all' ? t('all') : <LaneBadge lane={x} size="sm" />}
                </button>
              ))}
            </div>
            <div className="panel mt-3 p-4">
              <ReleaseChart rows={shown} />
              <p className="mt-2 text-sm" aria-live="polite">{t('summary', { a: f.number(preToday), b: f.number(preMadoun), n: f.number(shown.length) })}</p>
              <details className="mt-3">
                <summary className="cursor-pointer text-sm underline underline-offset-2">{t('table')}</summary>
                <div className="mt-2 max-h-80 overflow-auto">
                  <table className="table-clean text-sm">
                    <caption className="sr-only">{t('tableCaption')}</caption>
                    <thead><tr><th scope="col">{t('shipment')}</th><th scope="col">{t('lane')}</th><th scope="col">{t('lead')}</th><th scope="col">{t('th')}</th><th scope="col">{t('mh')}</th></tr></thead>
                    <tbody>
                      {shown.map((r) => (
                        <tr key={r.shipmentId}>
                          <td className="mono whitespace-nowrap">{r.shipmentId}</td><td><LaneBadge lane={r.lane} size="sm" /></td>
                          <td className="tabular-nums">{f.number(r.leadHours, 1)}</td><td className="tabular-nums">{f.number(r.todayHours, 1)}</td><td className="tabular-nums">{f.number(r.madounHours, 1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          </section>

          <section className="mt-8" aria-labelledby="bl">
            <h2 id="bl" className="mb-2 text-[1.1rem]">{t('byLane')} <Modelled>{t('modelled')}</Modelled></h2>
            <div className="panel relative overflow-x-auto">
              <table className="table-clean min-w-[560px]">
                <caption className="sr-only">{t('laneCaption')}</caption>
                <thead><tr><th scope="col">{t('lane')}</th><th scope="col">{t('count')}</th><th scope="col">{t('tMed')}</th><th scope="col">{t('mMed')}</th><th scope="col">{t('mPre')}</th></tr></thead>
                <tbody>
                  {lanes.map((l) => (
                    <tr key={l}>
                      <th scope="row" className="!text-start"><LaneBadge lane={l} /></th>
                      <td className="tabular-nums">{f.number(k.byLane[l].count)}</td>
                      <td className="tabular-nums">{k.byLane[l].count ? f.hours(k.byLane[l].todayMedian) : '–'}</td>
                      <td className="tabular-nums">{k.byLane[l].count ? f.hours(k.byLane[l].madounMedian) : '–'}</td>
                      <td className="tabular-nums">{k.byLane[l].count ? f.percent(k.byLane[l].madounPreArrivalPct, 1) : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <ValuePanel avgHoursSaved={results.length ? results.reduce((a, r) => a + (r.todayHours - r.madounHours), 0) / results.length : 0} />
        </>
      )}

      <section className="mt-8 max-w-[68ch]" aria-labelledby="as">
        <h2 id="as" className="text-[1.1rem]">{t('assume')}</h2>
        <p className="mt-1 text-muted">{t('assumeIntro')}</p>
        <ul className="mt-3 list-disc space-y-2 ps-5">
          {(['a1', 'a2', 'a3', 'a4', 'a5', 'a6'] as const).map((x) => <li key={x}>{t(x)}</li>)}
        </ul>
        <p className="mt-4 border-s-2 border-line ps-3 font-medium">{t('disclaimer')}</p>
      </section>
    </div>
  );
}
