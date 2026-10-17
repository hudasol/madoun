'use client';

import results from '../../../docs/cell-results.json';
import { useBi, useT } from '@/lib/i18n';
import { Modelled } from './Figures';

const T = {
  en: {
    title: 'Inspection cell comparison',
    intro: 'A digital twin of a red lane inspection area, run for 30 seeds of one synthetic week each. Values are means over seeds with a 95 percent interval. The predictions were committed in a separate commit before the model; {hits} of {n} hit and {misses} missed.',
    tag: 'Model with assumed parameters',
    caption: 'Inspection cell scenarios compared on the same synthetic arrivals',
    na: 'not applicable', h: 'h', scenario: 'Scenario', lead: 'Median lead time', p90: '90th percentile lead time', handsOn: 'Median hands on time per container', officer: 'Officer hours per container', missed: 'Violations missed',
    caveat: 'Every parameter (arrival rate, staffing, service times, detection rates, battery, faults, confirmation time) is an assumption, not a measurement of a real robot, scanner, officer team or port. Under these assumptions the robot cell is faster and frees officer time, but it misses more violations than officers alone. Full report: docs/cell-experiment.md in the repository.',
  },
  ar: {
    title: 'مقارنة خلايا الفحص',
    intro: 'نموذج رقمي مماثل لمنطقة فحص المسار الأحمر، شُغّل بثلاثين بذرة لكل منها أسبوع اصطناعي واحد. القيم متوسطات عبر البذور مع فترة ثقة 95 بالمئة. سُجّلت التوقعات في إيداع مستقل قبل إيداع النموذج؛ أصاب منها {hits} من {n} وأخطأ {misses}.',
    tag: 'نموذج بمعطيات مفترضة',
    caption: 'مقارنة سيناريوهات خلية الفحص على الوصولات الاصطناعية نفسها',
    na: 'لا ينطبق', h: 'س', scenario: 'السيناريو', lead: 'الوسيط لمدة الإنجاز', p90: 'المئين التسعون لمدة الإنجاز', handsOn: 'الوسيط لوقت الفحص الفعلي لكل حاوية', officer: 'ساعات الضباط لكل حاوية', missed: 'المخالفات الفائتة',
    caveat: 'كل معطى (معدل الوصول، والتوظيف، وأزمنة الخدمة، ومعدلات الكشف، والبطارية، والأعطال، ووقت التأكيد) افتراض وليس قياساً لروبوت أو ماسح أو فريق ضباط أو ميناء حقيقي. وفق هذه الافتراضات تكون الخلية الروبوتية أسرع وتوفر وقت الضباط، لكنها تفوّت مخالفات أكثر من الضباط وحدهم. التقرير الكامل: docs/cell-experiment.md في المستودع.',
  },
};

type Iv = { mean: number | null; lo: number | null; hi: number | null };

/** Compact table of the preregistered cell experiment, read from the generated docs/cell-results.json. */
export function CellComparison() {
  const t = useT(T);
  const bi = useBi();
  // Fixed decimals so every cell reads the same way and matches docs/cell-experiment.md; digits are Latin in both languages.
  const n2 = (x: number | null) => (x ?? 0).toFixed(2);
  const p1 = (x: number | null) => ((x ?? 0) * 100).toFixed(1);
  const hours = (i: Iv) => (i.mean === null ? t('na') : `${n2(i.mean)} [${n2(i.lo)}, ${n2(i.hi)}]`);
  const share = (i: Iv) => (i.mean === null ? t('na') : `${p1(i.mean)}% [${p1(i.lo)}, ${p1(i.hi)}]`);
  const cols: { key: 'medianLead' | 'p90Lead' | 'medianHandsOn' | 'officerHoursPerContainer' | 'missedViolationShare'; label: string; fmt: (i: Iv) => string }[] = [
    { key: 'medianLead', label: `${t('lead')} (${t('h')})`, fmt: hours },
    { key: 'p90Lead', label: `${t('p90')} (${t('h')})`, fmt: hours },
    { key: 'medianHandsOn', label: `${t('handsOn')} (${t('h')})`, fmt: hours },
    { key: 'officerHoursPerContainer', label: t('officer'), fmt: hours },
    { key: 'missedViolationShare', label: t('missed'), fmt: share },
  ];
  return (
    <section className="mt-10" aria-labelledby="cell-h">
      <h2 id="cell-h" className="text-[1.1rem]">{t('title')} <Modelled>{t('tag')}</Modelled></h2>
      <p className="mt-1 max-w-[80ch] text-muted">{t('intro', { hits: results.hits, n: results.predictionCount, misses: results.misses })}</p>
      <div className="panel relative mt-3 overflow-x-auto">
        <table className="table-clean min-w-[860px]">
          <caption className="sr-only">{t('caption')}</caption>
          <thead>
            <tr><th scope="col">{t('scenario')}</th>{cols.map((c) => <th key={c.key} scope="col">{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {results.scenarios.map((s) => (
              <tr key={s.id}>
                <th scope="row" className="!text-start !text-[1rem] font-normal !text-ink">{bi(s.name, s.nameAr)}</th>
                {cols.map((c) => <td key={c.key} className="whitespace-nowrap tabular-nums" dir="ltr">{c.fmt(s.summary[c.key] as Iv)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 max-w-[80ch] border-s-2 border-line ps-3 text-sm text-muted">{t('caveat')}</p>
    </section>
  );
}
