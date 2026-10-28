'use client';

import { Panel } from '@/components/Panel';
import { REFERENCE_POINTS, NOT_PUBLISHED } from '@/data/baselines';
import { useFormat, useLocale, useT } from '@/lib/i18n';
import sensitivity from '../../../docs/data/sensitivity.json';

const T = {
  en: {
    title: 'How this compares with published figures',
    intro: 'The result above comes from synthetic data and stated assumptions. These are the real figures we could find, and what each one does not tell you.',
    figure: 'Figure', value: 'Value', source: 'Source', limits: 'What it does not tell you',
    survive: 'How much of the saving survives different assumptions',
    scenario: 'Assumption set', reduction: 'Median release time saved', pre: 'Released before arrival, today to with Madoun',
    asModelled: 'As modelled: customs review 90 minutes plus a 3 hour queue',
    published: 'Customs at the published 13.86 minutes, lead time matched to the published 71% pre-arrival share',
    grid: 'Range over {n} combinations of customs speed, regulator queues and lead time',
    note: 'The direction holds in every combination. The size depends mostly on how slow customs is assumed to be, and nobody publishes the other authorities\' times, so treat the percentages as the output of stated assumptions, not as an expected saving.',
    missing: 'Looked for and not published',
    more: 'Full method and every combination: docs/baselines.md',
  },
  ar: {
    title: 'كيف يقارن هذا بالأرقام المنشورة',
    intro: 'النتيجة أعلاه مبنية على بيانات اصطناعية وافتراضات معلنة. هذه هي الأرقام الحقيقية التي وجدناها، وما لا يخبرك به كل رقم.',
    figure: 'الرقم', value: 'القيمة', source: 'المصدر', limits: 'ما لا يخبرك به',
    survive: 'ما يبقى من الوفر عند تغيير الافتراضات',
    scenario: 'مجموعة الافتراضات', reduction: 'الوقت الموفَّر من زمن الإفراج عند الوسيط', pre: 'الإفراج قبل الوصول، اليوم ثم مع مدوّن',
    asModelled: 'كما في النموذج: مراجعة جمركية 90 دقيقة وطابور 3 ساعات',
    published: 'الجمارك عند الرقم المنشور 13.86 دقيقة، وزمن التقديم مطابق لنسبة الإنجاز قبل الوصول المنشورة 71%',
    grid: 'المدى عبر {n} تركيبة من سرعة الجمارك وطوابير الجهات وزمن التقديم',
    note: 'الاتجاه ثابت في كل التركيبات. أما الحجم فيعتمد غالباً على مدى بطء الجمارك المفترض، ولا أحد ينشر أزمنة الجهات الأخرى، فاعتبر النسب ناتج افتراضات معلنة لا وفراً متوقعاً.',
    missing: 'بحثنا عنه ولم نجده منشوراً',
    more: 'المنهج الكامل وكل التركيبات: docs/baselines.md',
  },
};

const UNIT = {
  en: { minutes: 'minutes', percent: 'percent', 'score out of 5': 'out of 5' } as Record<string, string>,
  ar: { minutes: 'دقيقة', percent: 'بالمئة', 'score out of 5': 'من 5' } as Record<string, string>,
};

const NOT_PUBLISHED_AR = [
  'أزمنة المراجعة والطوابير لدى الجهات الأخرى (سلامة الغذاء، المطابقة، الصحة، الاتصالات، البيئة) لبضائع أبوظبي.',
  'نسبة الحاويات في أبوظبي التي تُفحص فعلياً أو تُمسح بالأشعة.',
  'نتائج دراسة زمن الإفراج في أبوظبي: غطّت التجربة تسع رحلات في ميناء خليفة بثلاث وعشرين نقطة زمنية لكل رحلة، لكن الأزمنة غير منشورة.',
  'الوسيط والمئين التسعين لزمن الإفراج لكل مسار.',
];

const cell = 'align-top text-sm';

export function ReferencePoints() {
  const t = useT(T);
  const f = useFormat();
  const { locale } = useLocale();
  const ar = locale === 'ar';
  const unit = UNIT[locale];
  const grid = sensitivity.grid.map((g) => g.kpis.medianReductionPct);
  const rows = [
    { label: t('asModelled'), k: sensitivity.baseline.kpis },
    { label: t('published'), k: sensitivity.calibratedWithPublishedCustomsSpeed.kpis },
  ];
  const span = (lo: number, hi: number) => `${f.percent(lo, 1)} – ${f.percent(hi, 1)}`;
  const points = REFERENCE_POINTS.filter((r) => r.id !== 'adc-clearance-time-h1-2023');

  return (
    <section className="mt-8" aria-labelledby="rp-h">
      <Panel title={<span id="rp-h">{t('title')}</span>}>
        <p className="max-w-[68ch] text-muted">{t('intro')}</p>
        <div className="mt-4 overflow-x-auto">
          <table className="table-clean">
            <caption className="sr-only">{t('title')}</caption>
            <thead>
              <tr><th scope="col">{t('figure')}</th><th scope="col">{t('value')}</th><th scope="col">{t('source')}</th><th scope="col">{t('limits')}</th></tr>
            </thead>
            <tbody>
              {points.map((r) => (
                <tr key={r.id}>
                  <th scope="row" className={`${cell} !text-start !text-[0.95rem] font-normal !text-ink`}>
                    {ar ? r.labelAr : r.label}
                    <span className="block text-xs text-muted">{ar ? r.periodAr : r.period}</span>
                  </th>
                  <td className={`${cell} whitespace-nowrap tabular-nums`}>{f.number(r.value, 2)} {unit[r.unit]}</td>
                  <td className={cell}>
                    <a href={r.source.url} target="_blank" rel="noopener noreferrer">{ar ? r.source.publisherAr : r.source.publisher}</a>
                  </td>
                  <td className={`${cell} max-w-[44ch] text-muted`}>{ar ? r.doesNotMeasureAr : r.doesNotMeasure}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="mt-6 text-base font-semibold">{t('survive')}</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="table-clean">
            <caption className="sr-only">{t('survive')}</caption>
            <thead>
              <tr><th scope="col">{t('scenario')}</th><th scope="col">{t('reduction')}</th><th scope="col">{t('pre')}</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <th scope="row" className={`${cell} max-w-[44ch] !text-start !text-[0.95rem] font-normal !text-ink`}>{r.label}</th>
                  <td className={`${cell} tabular-nums`}>{f.percent(r.k.medianReductionPct, 1)}</td>
                  <td className={`${cell} whitespace-nowrap tabular-nums`}>{f.percent(r.k.todayPreArrivalPct, 1)} → {f.percent(r.k.madounPreArrivalPct, 1)}</td>
                </tr>
              ))}
              <tr>
                <th scope="row" className={`${cell} max-w-[44ch] !text-start !text-[0.95rem] font-normal !text-ink`}>{t('grid', { n: f.number(sensitivity.grid.length) })}</th>
                <td className={`${cell} whitespace-nowrap tabular-nums`}>{span(Math.min(...grid), Math.max(...grid))}</td>
                <td className={cell} />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 max-w-[68ch] border-s-2 border-line ps-3 text-sm text-muted">{t('note')}</p>

        <h3 className="mt-5 text-base font-semibold">{t('missing')}</h3>
        <ul className="mt-1 max-w-[68ch] list-disc ps-5 text-sm text-muted">
          {(ar ? NOT_PUBLISHED_AR : NOT_PUBLISHED).map((x) => <li key={x}>{x}</li>)}
        </ul>
        <p className="mt-3 text-sm text-muted">{t('more')}</p>
      </Panel>
    </section>
  );
}
