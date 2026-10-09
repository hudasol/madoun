'use client';

import { useState } from 'react';
import type { EvalReport } from '@/engine';
import { Panel } from '@/components/Panel';
import { useFormat, useT } from '@/lib/i18n';
import { runEvaluation } from '@/lib/evaluation';

const T = {
  en: {
    title: 'Model check',
    intro: 'Does the rule engine actually separate risky shipments from safe ones? This replays eight fresh synthetic weeks, compares each shipment\'s lane with a hidden ground truth that the engine never sees, and sets the rules against simpler and learned alternatives.',
    caveat: 'Read with care. The synthetic data decides who breaks the rules from the same facts the engine reads, so scores here are optimistic. The check can expose a weak or uneven rule set. It cannot prove one works on real traffic.',
    run: 'Run the model check', running: 'Running eight synthetic weeks…', again: 'Run again',
    summary: '{n} shipments, {v} with a hidden violation ({r}). Madoun checks {b} of shipments and catches {c} of the violations (range {lo} to {hi}). {m} violations passed through the green lane.',
    lanes: 'Does each lane carry more risk than the one below?', lane: 'Lane', ships: 'Shipments', viol: 'With a violation', rate: 'Rate', range: 'Plausible range',
    green: 'Green', amber: 'Amber', red: 'Red',
    methods: 'Rules against simpler and learned alternatives', methodsNote: 'Scored on {n} shipments the learned model never saw. Area under the ROC curve: 0.5 is a coin toss, 1 is perfect. "Same effort" lets each method check as many shipments as the rules do and counts the violations it finds.',
    method: 'Method', auc: 'Ranking quality (AUC)', same: 'Violations found at the same effort',
    m_rules: 'Madoun rules (hand-set weights)', m_challenger: 'Learned challenger (advisory only)', m_trader: 'Trader compliance score alone', m_value: 'Declared value alone', m_random: 'Random',
    chNote: 'The learned challenger scores {a} where the rules score {b}. It is not used to decide lanes. Promoting it would need a stable gain on held-out data, calibrated probabilities (its error is {br} against {bb} for always guessing the average), no worse burden on any group, and a person\'s sign-off.',
    seg: 'Who bears the checks?', segNote: 'Share of each group\'s shipments that were checked, and how many of those checks found nothing. Every shipment from a low-compliance trader is checked by design; that is a policy choice worth stating openly.',
    group: 'Group', checked: 'Checked', nothing: 'Checks that found nothing',
    s_low: 'Trader compliance below 60', s_mid: 'Trader compliance 60 to 79', s_high: 'Trader compliance 80 and above', s_yes: 'Authorised operators', s_no: 'Other traders',
    footer: 'Eight seeds, four to fit the learned model and four to score it. Everything is deterministic: the same click gives the same numbers.',
  },
  ar: {
    title: 'فحص النموذج',
    intro: 'هل يفصل محرك القواعد فعلاً بين الشحنات الخطرة والآمنة؟ يعيد هذا الفحص تشغيل ثمانية أسابيع اصطناعية جديدة، ويقارن مسار كل شحنة بحقيقة مخفية لا يراها المحرك، ويضع القواعد في مواجهة بدائل أبسط وأخرى متعلَّمة.',
    caveat: 'اقرأ بحذر. البيانات الاصطناعية تحدد من يخالف انطلاقاً من الوقائع نفسها التي يقرؤها المحرك، لذا فالنتائج هنا متفائلة. يمكن للفحص أن يكشف قواعد ضعيفة أو غير متوازنة، لكنه لا يثبت صلاحيتها على حركة حقيقية.',
    run: 'تشغيل فحص النموذج', running: 'جارٍ تشغيل ثمانية أسابيع اصطناعية…', again: 'تشغيل مجدداً',
    summary: '{n} شحنة، منها {v} فيها مخالفة مخفية ({r}). يفحص مدوّن {b} من الشحنات ويرصد {c} من المخالفات (المدى {lo} إلى {hi}). ومرّت {m} مخالفة عبر المسار الأخضر.',
    lanes: 'هل يحمل كل مسار خطراً أعلى من الذي دونه؟', lane: 'المسار', ships: 'الشحنات', viol: 'فيها مخالفة', rate: 'النسبة', range: 'المدى المحتمل',
    green: 'أخضر', amber: 'كهرماني', red: 'أحمر',
    methods: 'القواعد مقابل بدائل أبسط وأخرى متعلَّمة', methodsNote: 'التقييم على {n} شحنة لم يرها النموذج المتعلَّم. المساحة تحت منحنى ROC: 0.5 كرمي العملة و1 هو الأمثل. وفي "الجهد نفسه" تفحص كل طريقة عدد الشحنات نفسه الذي تفحصه القواعد ويُحسب ما تجده من مخالفات.',
    method: 'الطريقة', auc: 'جودة الترتيب (AUC)', same: 'المخالفات المرصودة بالجهد نفسه',
    m_rules: 'قواعد مدوّن (أوزان يدوية)', m_challenger: 'منافس متعلَّم (استشاري فقط)', m_trader: 'درجة امتثال المستورد وحدها', m_value: 'القيمة المصرح بها وحدها', m_random: 'عشوائي',
    chNote: 'يسجل المنافس المتعلَّم {a} بينما تسجل القواعد {b}. ولا يُستخدم في تحديد المسارات. ويتطلب اعتماده مكسباً ثابتاً على بيانات لم يرها، واحتمالات معايرة (خطؤه {br} مقابل {bb} لتخمين المتوسط دائماً)، وعدم زيادة العبء على أي فئة، وموافقة شخص.',
    seg: 'من يتحمل الفحوصات؟', segNote: 'نسبة شحنات كل فئة التي فُحصت، وكم من هذه الفحوصات لم يجد شيئاً. كل شحنة لمستورد منخفض الامتثال تُفحص بحكم التصميم؛ وهذا خيار سياسي يجدر إعلانه صراحة.',
    group: 'الفئة', checked: 'نسبة الفحص', nothing: 'فحوصات لم تجد شيئاً',
    s_low: 'امتثال المستورد دون 60', s_mid: 'امتثال المستورد من 60 إلى 79', s_high: 'امتثال المستورد 80 فأكثر', s_yes: 'المشغلون المعتمدون', s_no: 'مستوردون آخرون',
    footer: 'ثمانية بذور، أربعة لملاءمة النموذج المتعلَّم وأربعة لتقييمه. كل شيء حتمي: النقرة نفسها تعطي الأرقام نفسها.',
  },
};

const NAME: Record<string, 'm_rules' | 'm_challenger' | 'm_trader' | 'm_value' | 'm_random'> = {
  rules: 'm_rules', challenger: 'm_challenger', 'trader-only': 'm_trader', 'value-only': 'm_value', random: 'm_random',
};
const SEG: Record<string, 's_low' | 's_mid' | 's_high' | 's_yes' | 's_no'> = {
  'band:low': 's_low', 'band:mid': 's_mid', 'band:high': 's_high', 'aeo:yes': 's_yes', 'aeo:no': 's_no',
};

export function ModelCheck() {
  const t = useT(T);
  const f = useFormat();
  const [state, setState] = useState<EvalReport | 'busy' | null>(null);
  const pct = (x: number) => f.percent(x * 100);
  const r = state && state !== 'busy' ? state : null;

  return (
    <section className="mt-10" aria-labelledby="mc-h">
      <Panel title={<span id="mc-h">{t('title')}</span>}>
        <p className="max-w-[70ch]">{t('intro')}</p>
        <p className="mt-2 max-w-[70ch] border-s-2 border-line ps-3 text-sm text-muted">{t('caveat')}</p>
        <div className="mt-4">
          <button
            type="button"
            className="btn"
            disabled={state === 'busy'}
            onClick={() => {
              setState('busy');
              // Eight simulated weeks take a second or two; yield so the busy state paints first.
              setTimeout(() => setState(runEvaluation(8)), 30);
            }}
          >
            {state === 'busy' ? t('running') : r ? t('again') : t('run')}
          </button>
        </div>
        <div aria-live="polite">
          {r && (
            <div className="mt-6 space-y-8">
              <p className="max-w-[70ch]">
                {t('summary', {
                  n: f.number(r.shipments), v: f.number(r.violations), r: pct(r.baseRate.rate), b: pct(r.policy.burden), c: pct(r.policy.recall),
                  lo: pct(r.policy.recallCI.lo), hi: pct(r.policy.recallCI.hi), m: f.number(r.policy.missedInGreen),
                })}
              </p>

              <div>
                <h3 className="text-base">{t('lanes')}</h3>
                <div className="relative mt-2 overflow-x-auto">
                  <table className="table-clean min-w-[520px]">
                    <caption className="sr-only">{t('lanes')}</caption>
                    <thead><tr><th scope="col">{t('lane')}</th><th scope="col">{t('ships')}</th><th scope="col">{t('viol')}</th><th scope="col">{t('rate')}</th><th scope="col">{t('range')}</th></tr></thead>
                    <tbody>
                      {r.lanes.map((x) => (
                        <tr key={x.lane}>
                          <th scope="row" className="!text-start !text-[1rem] font-normal !text-ink">{t(x.lane)}</th>
                          <td className="tabular-nums">{f.number(x.n)}</td>
                          <td className="tabular-nums">{f.number(x.violations)}</td>
                          <td className="tabular-nums">{pct(x.rate)}</td>
                          <td className="whitespace-nowrap tabular-nums text-muted">{pct(x.lo)} – {pct(x.hi)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="text-base">{t('methods')}</h3>
                <p className="mt-1 max-w-[70ch] text-sm text-muted">{t('methodsNote', { n: f.number(r.testShipments) })}</p>
                <div className="relative mt-2 overflow-x-auto">
                  <table className="table-clean min-w-[560px]">
                    <caption className="sr-only">{t('methods')}</caption>
                    <thead><tr><th scope="col">{t('method')}</th><th scope="col">{t('auc')}</th><th scope="col">{t('same')}</th></tr></thead>
                    <tbody>
                      {r.methods.map((m) => (
                        <tr key={m.name}>
                          <th scope="row" className="!text-start !text-[1rem] font-normal !text-ink">{t(NAME[m.name])}</th>
                          <td className="whitespace-nowrap tabular-nums">{f.number(m.auroc, 2)} <span className="text-muted">({f.number(m.aurocCI.lo, 2)} – {f.number(m.aurocCI.hi, 2)})</span></td>
                          <td className="tabular-nums">{pct(m.recallAtSameBurden)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 max-w-[70ch] text-sm">
                  {t('chNote', {
                    a: f.number(r.methods.find((m) => m.name === 'challenger')?.auroc ?? 0, 2), b: f.number(r.methods.find((m) => m.name === 'rules')?.auroc ?? 0, 2),
                    br: f.number(r.challenger.brier, 3), bb: f.number(r.challenger.baselineBrier, 3),
                  })}
                </p>
              </div>

              <div>
                <h3 className="text-base">{t('seg')}</h3>
                <p className="mt-1 max-w-[70ch] text-sm text-muted">{t('segNote')}</p>
                <div className="relative mt-2 overflow-x-auto">
                  <table className="table-clean min-w-[560px]">
                    <caption className="sr-only">{t('seg')}</caption>
                    <thead><tr><th scope="col">{t('group')}</th><th scope="col">{t('ships')}</th><th scope="col">{t('checked')}</th><th scope="col">{t('nothing')}</th></tr></thead>
                    <tbody>
                      {r.segments.map((x) => (
                        <tr key={x.key}>
                          <th scope="row" className="!text-start !text-[1rem] font-normal !text-ink">{t(SEG[x.key])}</th>
                          <td className="tabular-nums">{f.number(x.n)}</td>
                          <td className="tabular-nums">{pct(x.flaggedPct)}</td>
                          <td className="whitespace-nowrap tabular-nums">{x.flagged ? pct(x.falseFlagRate) : '–'} {x.flagged > 0 && <span className="text-muted">({pct(x.lo)} – {pct(x.hi)})</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="text-sm text-muted">{t('footer')}</p>
            </div>
          )}
        </div>
      </Panel>
    </section>
  );
}
