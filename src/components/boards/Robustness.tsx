'use client';

import { useState } from 'react';
import { computeKpis, quantileOf, simulate } from '@/engine';
import { generate } from '@/data/generate';
import { Panel } from '@/components/Panel';
import { useFormat, useT } from '@/lib/i18n';

const T = {
  en: {
    title: 'How stable is this result?',
    intro: 'The figures above come from one synthetic week. A different week gives different numbers. This simulates twelve other weeks, each with fresh shipments, delays and documents, and shows the spread.',
    run: 'Run twelve other weeks', running: 'Simulating twelve weeks…', again: 'Run again',
    measure: 'Measure', col: 'Median week', median: 'Median time saved', range: 'Range across weeks', pre: 'Released before arrival', today: 'Today', madoun: 'With Madoun',
    never: 'Shipments no slower than today: {p}.',
    note: 'This varies the random draws, not the assumptions. If the assumptions are wrong, every week is wrong the same way. The spread is a floor on uncertainty, not a measure of it.',
    weeks: '{n} weeks, {m} shipments each',
  },
  ar: {
    title: 'ما مدى ثبات هذه النتيجة؟',
    intro: 'الأرقام أعلاه من أسبوع اصطناعي واحد، وأسبوع آخر يعطي أرقاماً أخرى. هنا نحاكي اثني عشر أسبوعاً آخر، لكل منها شحنات وتأخيرات ومستندات جديدة، ونعرض مدى التفاوت.',
    run: 'تشغيل اثني عشر أسبوعاً آخر', running: 'جارٍ محاكاة اثني عشر أسبوعاً…', again: 'تشغيل مجدداً',
    measure: 'المقياس', col: 'الأسبوع الوسيط', median: 'الوقت الموفَّر عند الوسيط', range: 'المدى عبر الأسابيع', pre: 'الإفراج قبل الوصول', today: 'اليوم', madoun: 'مع مدوّن',
    never: 'الشحنات التي لا تتأخر عن الوضع الحالي: {p}.',
    note: 'يغيّر هذا السحوبات العشوائية لا الافتراضات. فإن كانت الافتراضات خاطئة، فكل الأسابيع تخطئ بالطريقة نفسها. والتفاوت حدٌّ أدنى لعدم اليقين وليس مقياساً له.',
    weeks: '{n} أسابيع، {m} شحنة لكل أسبوع',
  },
};

interface Spread { reduction: number[]; today: number[]; madoun: number[]; noSlower: number; total: number; shipments: number }

function run(weeks = 12, firstSeed = 500, shipments = 240): Spread {
  const out: Spread = { reduction: [], today: [], madoun: [], noSlower: 0, total: 0, shipments };
  for (let i = 0; i < weeks; i++) {
    const g = generate({ seed: firstSeed + i, shipments });
    const sim = simulate({ seed: g.seed, directory: g.directory, shipments: g.shipments, truth: g.truth });
    const k = computeKpis(sim.results);
    out.reduction.push(k.medianReductionPct);
    out.today.push(k.todayPreArrivalPct);
    out.madoun.push(k.madounPreArrivalPct);
    for (const r of sim.results) {
      out.total++;
      if (r.madounHours <= r.todayHours) out.noSlower++;
    }
  }
  return out;
}

export function Robustness() {
  const t = useT(T);
  const f = useFormat();
  const [state, setState] = useState<Spread | 'busy' | null>(null);
  const r = state && state !== 'busy' ? state : null;
  const span = (v: number[]) => `${f.percent(Math.min(...v), 0)} – ${f.percent(Math.max(...v), 0)}`;

  return (
    <section className="mt-8" aria-labelledby="rb-h">
      <Panel title={<span id="rb-h">{t('title')}</span>}>
        <p className="max-w-[68ch] text-muted">{t('intro')}</p>
        <div className="mt-3">
          <button
            type="button"
            className="btn"
            disabled={state === 'busy'}
            onClick={() => {
              setState('busy');
              setTimeout(() => setState(run()), 30);
            }}
          >
            {state === 'busy' ? t('running') : r ? t('again') : t('run')}
          </button>
        </div>
        <div aria-live="polite">
          {r && (
            <div className="mt-5 max-w-[68ch]">
              <table className="table-clean">
                <caption className="sr-only">{t('title')}</caption>
                <thead><tr><th scope="col">{t('measure')}</th><th scope="col">{t('col')}</th><th scope="col">{t('range')}</th></tr></thead>
                <tbody>
                  <tr>
                    <th scope="row" className="!text-start !text-[1rem] font-normal !text-ink">{t('median')}</th>
                    <td className="tabular-nums">{f.percent(quantileOf(r.reduction, 0.5), 0)}</td>
                    <td className="whitespace-nowrap tabular-nums text-muted">{span(r.reduction)}</td>
                  </tr>
                  <tr>
                    <th scope="row" className="!text-start !text-[1rem] font-normal !text-ink">{t('pre')}: {t('today')}</th>
                    <td className="tabular-nums">{f.percent(quantileOf(r.today, 0.5), 0)}</td>
                    <td className="whitespace-nowrap tabular-nums text-muted">{span(r.today)}</td>
                  </tr>
                  <tr>
                    <th scope="row" className="!text-start !text-[1rem] font-normal !text-ink">{t('pre')}: {t('madoun')}</th>
                    <td className="tabular-nums">{f.percent(quantileOf(r.madoun, 0.5), 0)}</td>
                    <td className="whitespace-nowrap tabular-nums text-muted">{span(r.madoun)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-2 text-sm">{t('weeks', { n: f.number(r.reduction.length), m: f.number(r.shipments) })}. {t('never', { p: f.percent((r.noSlower / r.total) * 100, 1) })}</p>
              <p className="mt-2 border-s-2 border-line ps-3 text-sm text-muted">{t('note')}</p>
            </div>
          )}
        </div>
      </Panel>
    </section>
  );
}
