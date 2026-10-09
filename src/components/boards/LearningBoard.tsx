'use client';

import { RoleHint } from '@/components/RoleHint';
import { useState } from 'react';
import type { Suggestion } from '@/engine';
import { Loading, PageTitle, Panel } from '@/components/Panel';
import { useBi, useFormat, useT } from '@/lib/i18n';
import { useStore, type SuggestionPreview } from '@/lib/store';
import { Figures } from './Figures';
import { useLabels } from './labels';

const T = {
  en: {
    title: 'Learning',
    intro: 'Inspection outcomes flow back as suggestions. A person approves every change; nothing edits itself.',
    fir: 'False-intervention rate', firNote: 'Interventions that found nothing', interventions: 'Interventions', basis: 'Counted from recorded outcomes',
    factors: 'How each risk factor performed', factorsCaption: 'Risk factors by number of interventions', factor: 'Risk factor', ints: 'Interventions', confirmed: 'Confirmed', fa: 'False alarms', hit: 'Hit rate',
    noFactors: 'No inspection outcomes are recorded at this moment.',
    missing: 'Recurring missing evidence', missingIntro: 'Documents that the same forwarder leaves out again and again.', forwarder: 'Forwarder', doc: 'Missing document', times: 'Times missing', of: 'of {n} shipments',
    noMissing: 'No recurring gaps yet.',
    sugg: 'Suggestions waiting for a decision', noSugg: 'No suggestion is waiting. Either every factor is performing within range, or the suggestions have been approved.',
    preview: 'Preview effect', previewing: 'Replaying…', approve: 'Approve change', advisory: 'Advisory only. Madoun does not apply this by itself.',
    contact: 'Who to contact: {fw}. Ask them to include the {doc} when they file, or add a check before submission.',
    replayTitle: 'Replay on synthetic data',
    replayBody: 'The same synthetic week was replayed with this change. This is a test on sample data, not a prediction.',
    before: 'Before', after: 'After with change', ri: 'Interventions', rc: 'Confirmed findings', rm: 'Confirmed findings that would have gone un-inspected',
    lower: 'Lower the weight', raise: 'Raise the weight', pre: 'Pre-check a forwarder', mult: 'Weight × {m}',
    approved: 'Approved changes', approvedNone: 'No change has been approved yet.', approvedNote: 'New shipments use these weights from now on. Shipments already assessed keep their original lane unless an officer changes it.',
    signal: 'Signal', change: 'Weight change',
    done: 'Approved: {k} now carries weight × {m} for new shipments.',
    sample: 'Synthetic data. Thresholds for suggestions are sample values.',
  },
  ar: {
    title: 'التعلّم',
    intro: 'تعود نتائج الفحص على شكل اقتراحات. يعتمد شخص كل تغيير؛ ولا شيء يعدّل نفسه.',
    fir: 'نسبة التدخلات الخاطئة', firNote: 'تدخلات لم تجد شيئاً', interventions: 'التدخلات', basis: 'محسوبة من النتائج المسجلة',
    factors: 'أداء كل عامل خطورة', factorsCaption: 'عوامل الخطورة حسب عدد التدخلات', factor: 'عامل الخطورة', ints: 'التدخلات', confirmed: 'المؤكدة', fa: 'إنذارات خاطئة', hit: 'نسبة الإصابة',
    noFactors: 'لا توجد نتائج فحص مسجلة في هذه اللحظة.',
    missing: 'نقص متكرر في الأدلة', missingIntro: 'مستندات يغفلها الوكيل نفسه مراراً.', forwarder: 'الوكيل الملاحي', doc: 'المستند الناقص', times: 'مرات النقص', of: 'من {n} شحنة',
    noMissing: 'لا توجد فجوات متكررة حتى الآن.',
    sugg: 'اقتراحات بانتظار القرار', noSugg: 'لا يوجد اقتراح معلق. إما أن كل العوامل ضمن المعدل المقبول، أو أن الاقتراحات اعتُمدت.',
    preview: 'معاينة الأثر', previewing: 'جارٍ إعادة التشغيل…', approve: 'اعتماد التغيير', advisory: 'للاستشارة فقط. لا يطبّقه مدوّن من تلقاء نفسه.',
    contact: 'جهة التواصل: {fw}. اطلب منهم إرفاق {doc} عند التقديم، أو إضافة فحص قبل الإرسال.',
    replayTitle: 'إعادة تشغيل على بيانات اصطناعية',
    replayBody: 'أُعيد تشغيل الأسبوع الاصطناعي نفسه مع هذا التغيير. هذا اختبار على بيانات تجريبية وليس تنبؤاً.',
    before: 'قبل', after: 'بعد التغيير', ri: 'التدخلات', rc: 'الملاحظات المؤكدة', rm: 'ملاحظات مؤكدة كانت ستمر دون فحص',
    lower: 'خفض الوزن', raise: 'رفع الوزن', pre: 'فحص مسبق لوكيل', mult: 'الوزن × {m}',
    approved: 'التغييرات المعتمدة', approvedNone: 'لم يُعتمد أي تغيير بعد.', approvedNote: 'تستخدم الشحنات الجديدة هذه الأوزان من الآن. أما الشحنات التي قُيّمت فتبقى في مسارها ما لم يغيّره ضابط.',
    signal: 'الإشارة', change: 'تغيير الوزن',
    done: 'تم الاعتماد: أصبح وزن {k} × {m} للشحنات الجديدة.',
    sample: 'بيانات اصطناعية. حدود الاقتراحات قيم تجريبية.',
  },
};

function HitBar({ rate }: { rate: number }) {
  const f = useFormat();
  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative inline-block h-2 w-20 border border-line" aria-hidden="true">
        <span className="absolute inset-y-0 start-0" style={{ width: `${Math.round(rate * 100)}%`, background: 'var(--muted)' }} />
      </span>
      <span className="tabular-nums">{f.percent(rate * 100)}</span>
    </span>
  );
}

export function LearningBoard() {
  const s = useStore();
  const t = useT(T);
  const f = useFormat();
  const bi = useBi();
  const L = useLabels();
  const [previews, setPreviews] = useState<Record<string, SuggestionPreview | 'busy'>>({});
  const [message, setMessage] = useState('');

  const learning = s.learning;
  if (!s.ready || !learning || !s.world) return <Loading />;

  const runPreview = (g: Suggestion) => {
    setPreviews((p) => ({ ...p, [g.id]: 'busy' }));
    setTimeout(() => {
      const r = s.previewSuggestion(g);
      setPreviews((p) => {
        const n = { ...p };
        if (r) n[g.id] = r; else delete n[g.id];
        return n;
      });
    }, 30);
  };

  const approve = (g: Suggestion) => {
    s.approveSuggestion(g);
    setMessage(t('done', { k: L.signal(g.key), m: f.number(g.multiplier ?? 1, 2) }));
  };

  const overrides = Object.entries(s.world.weightOverrides);
  const kindLabel = (k: Suggestion['kind']) => (k === 'lower-weight' ? t('lower') : k === 'raise-weight' ? t('raise') : t('pre'));

  return (
    <div>
      <PageTitle title={t('title')} intro={t('intro')} />
      <p role="status" aria-live="polite" className={message ? 'mb-4 rounded-[3px] border border-line bg-panel2 px-3 py-2 text-sm' : 'sr-only'}>{message}</p>
      <Figures
        items={[
          { label: t('fir'), value: f.percent(learning.falseInterventionRate * 100), note: t('firNote') },
          { label: t('interventions'), value: f.number(learning.interventions), note: t('basis') },
        ]}
      />

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel title={t('factors')}>
          {learning.factors.length === 0 ? <p className="text-muted">{t('noFactors')}</p> : (
            <div className="relative overflow-x-auto">
              <table className="table-clean min-w-[560px]">
                <caption className="sr-only">{t('factorsCaption')}</caption>
                <thead><tr><th scope="col">{t('factor')}</th><th scope="col">{t('ints')}</th><th scope="col">{t('confirmed')}</th><th scope="col">{t('fa')}</th><th scope="col">{t('hit')}</th></tr></thead>
                <tbody>
                  {learning.factors.map((x) => (
                    <tr key={x.key}>
                      <th scope="row" className="!text-start !text-[1rem] font-normal !text-ink">{L.signal(x.key)}</th>
                      <td className="tabular-nums">{f.number(x.interventions)}</td>
                      <td className="tabular-nums">{f.number(x.confirmed)}</td>
                      <td className="tabular-nums">{f.number(x.falseAlarms)}</td>
                      <td><HitBar rate={x.hitRate} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title={t('missing')}>
          <p className="mb-3 text-muted">{t('missingIntro')}</p>
          {learning.missingEvidence.length === 0 ? <p className="text-muted">{t('noMissing')}</p> : (
            <div className="relative overflow-x-auto">
              <table className="table-clean">
                <caption className="sr-only">{t('missing')}</caption>
                <thead><tr><th scope="col">{t('forwarder')}</th><th scope="col">{t('doc')}</th><th scope="col">{t('times')}</th></tr></thead>
                <tbody>
                  {learning.missingEvidence.slice(0, 8).map((m) => (
                    <tr key={`${m.forwarderId}${m.type}`}>
                      <td>{L.forwarder(m.forwarderId)}</td>
                      <td>{L.evidenceType(m.type)}</td>
                      <td className="whitespace-nowrap tabular-nums">{f.number(m.count)} <span className="text-muted">{t('of', { n: f.number(m.totalShipments) })}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <section className="mt-8" aria-labelledby="sugg">
        <h2 id="sugg" className="mb-3 text-[1.1rem]">{t('sugg')}</h2>
        {learning.suggestions.length === 0 ? <Panel><p className="max-w-[60ch] text-muted">{t('noSugg')}</p></Panel> : (
          <ul className="space-y-4">
            {learning.suggestions.map((g) => {
              const p = previews[g.id];
              const advisory = g.kind === 'pre-check-forwarder';
              const humanise = (txt: string, sg: typeof g) => {
                let out = txt.split(`"${sg.key}"`).join(`"${L.signal(sg.key)}"`);
                if (sg.evidenceType) out = out.split(`"${sg.evidenceType}"`).join(`"${L.evidenceType(sg.evidenceType)}"`);
                if (sg.forwarderId) out = out.split(sg.forwarderId).join(L.forwarder(sg.forwarderId));
                return out;
              };
              return (
                <li key={g.id} className="panel p-4">
                  <p className="text-sm text-muted">{kindLabel(g.kind)}{g.multiplier ? `: ${t('mult', { m: f.number(g.multiplier, 2) })}` : ''}</p>
                  <h3 className="mt-0.5 text-base">{L.signal(g.key)}</h3>
                  <p className="mt-2 max-w-[70ch]">{humanise(bi(g.rationale, g.rationaleAr), g)}</p>
                  {advisory ? (
                    <div className="mt-3 max-w-[70ch] border-s-2 border-line ps-3">
                      <p>{t('contact', { fw: L.forwarder(g.forwarderId), doc: L.evidenceType(g.evidenceType ?? '').toLowerCase() })}</p>
                      <p className="mt-1 text-sm text-muted">{t('advisory')}</p>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" className="btn" disabled={p === 'busy'} onClick={() => runPreview(g)}>{p === 'busy' ? t('previewing') : t('preview')}</button>
                      <button type="button" className="btn btn-primary" disabled={!s.can('approve-suggestion')} onClick={() => approve(g)}>{t('approve')}</button>
                      <RoleHint action="approve-suggestion" className="basis-full" />
                    </div>
                  )}
                  <div aria-live="polite">
                    {p && p !== 'busy' && (
                      <div className="mt-4 max-w-[640px] border border-line p-3">
                        <h4 className="font-semibold">{t('replayTitle')}</h4>
                        <p className="text-sm text-muted">{t('replayBody')}</p>
                        <table className="table-clean mt-2">
                          <thead><tr><th scope="col"><span className="sr-only">{t('signal')}</span></th><th scope="col">{t('before')}</th><th scope="col">{t('after')}</th></tr></thead>
                          <tbody>
                            <tr><th scope="row" className="!text-start !text-[1rem] font-normal !text-ink">{t('ri')}</th><td className="tabular-nums">{f.number(p.interventionsBefore)}</td><td className="tabular-nums">{f.number(p.interventionsAfter)}</td></tr>
                            <tr><th scope="row" className="!text-start !text-[1rem] font-normal !text-ink">{t('rc')}</th><td className="tabular-nums">{f.number(p.confirmedBefore)}</td><td className="tabular-nums">{f.number(p.confirmedAfter)}</td></tr>
                            <tr><th scope="row" className="!text-start !text-[1rem] font-normal !text-ink">{t('rm')}</th><td className="tabular-nums">{f.number(0)}</td><td className="tabular-nums font-semibold">{f.number(p.missedConfirmed)}</td></tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-8 max-w-[68ch]" aria-labelledby="appr">
        <h2 id="appr" className="text-[1.1rem]">{t('approved')}</h2>
        {overrides.length === 0 ? <p className="mt-2 text-muted">{t('approvedNone')}</p> : (
          <>
            <table className="table-clean mt-2">
              <caption className="sr-only">{t('approved')}</caption>
              <thead><tr><th scope="col">{t('signal')}</th><th scope="col">{t('change')}</th></tr></thead>
              <tbody>
                {overrides.map(([k, m]) => (
                  <tr key={k}><td>{L.signal(k)}</td><td className="tabular-nums">{t('mult', { m: f.number(m, 2) })}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-muted">{t('approvedNote')}</p>
          </>
        )}
        <p className="mt-6 text-sm text-muted">{t('sample')}</p>
      </section>
    </div>
  );
}
