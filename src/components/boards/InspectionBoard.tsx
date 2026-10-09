'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { createInspectionTask, type InspectionResult, type InspectionTask } from '@/engine';
import { LaneBadge } from '@/components/LaneBadge';
import { Loading, PageTitle, Panel } from '@/components/Panel';
import { useBi, useFormat, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { Modelled } from './Figures';
import { useLabels } from './labels';

const T = {
  en: {
    title: 'Inspection',
    intro: 'When a shipment lands in the red lane, Madoun issues an inspection task. Any performer can carry it out: an officer, a scanner, a drone or a ground robot. The result becomes a shareable evidence receipt and an outcome that feeds learning.',
    waiting: 'Waiting for inspection', waitingNone: 'No shipment is waiting for an inspection at this moment.',
    waitingCaption: 'Shipments waiting for inspection', shipment: 'Shipment', lane: 'Lane', scope: 'What to check', constraints: 'Constraints', priority: 'Priority', high: 'High', normal: 'Normal', noScope: 'Full physical inspection', noCons: 'None', containers: 'Containers',
    run: 'Run inspection cell', ran: 'Inspection cell finished for {id}. The result is now under Completed.', cellNote: 'The cell is a simulator. It stands in for a real performer.',
    completed: 'Completed', completedNone: 'No inspection has been completed yet.', completedCaption: 'Completed inspections',
    performer: 'Performed by', seal: 'Seal', intact: 'intact', broken: 'broken', findings: 'Findings', time: 'Completed', receipt: 'Receipt', openReceipt: 'Open receipt',
    byKind: 'By performer kind', kind: 'Performer', count: 'Inspections', withFindings: 'With findings', sealsBroken: 'Broken seals',
    contract: 'The contract', contractIntro: 'This is the whole interface between Madoun and whatever does the inspecting. Both messages below come from live data on this page.',
    taskTitle: 'InspectionTask: what Madoun asks for', resultTitle: 'InspectionResult: what the performer returns', example: 'Example from {id}',
    today: 'Today the performer is a simulator. A ROS 2 bridge adapter would replace it: it would take the task, drive a robot or drone, and return the same result. Nothing else in Madoun would change.',
    params: 'Detection rates in the simulator are parameters we set, not claims about any real device. No real robot, drone or scanner is connected.',
    sample: 'Synthetic data throughout.',
  },
  ar: {
    title: 'الفحص',
    intro: 'عندما تقع شحنة في المسار الأحمر يصدر مدوّن مهمة فحص. ويمكن لأي منفّذ إجراؤها: ضابط أو ماسح أو طائرة مسيّرة أو روبوت أرضي. وتتحول النتيجة إلى إيصال دليل قابل للمشاركة ونتيجة تغذي التعلّم.',
    waiting: 'بانتظار الفحص', waitingNone: 'لا توجد شحنة بانتظار الفحص في هذه اللحظة.',
    waitingCaption: 'الشحنات بانتظار الفحص', shipment: 'الشحنة', lane: 'المسار', scope: 'ما المطلوب فحصه', constraints: 'القيود', priority: 'الأولوية', high: 'عالية', normal: 'عادية', noScope: 'فحص مادي كامل', noCons: 'لا يوجد', containers: 'الحاويات',
    run: 'تشغيل خلية الفحص', ran: 'انتهت خلية الفحص من الشحنة {id}. النتيجة الآن ضمن المكتملة.', cellNote: 'الخلية محاكاة، وهي تحل محل منفّذ حقيقي.',
    completed: 'المكتملة', completedNone: 'لم يكتمل أي فحص بعد.', completedCaption: 'عمليات الفحص المكتملة',
    performer: 'المنفّذ', seal: 'الختم', intact: 'سليم', broken: 'مكسور', findings: 'الملاحظات', time: 'وقت الإكمال', receipt: 'الإيصال', openReceipt: 'فتح الإيصال',
    byKind: 'حسب نوع المنفّذ', kind: 'المنفّذ', count: 'عمليات الفحص', withFindings: 'مع ملاحظات', sealsBroken: 'أختام مكسورة',
    contract: 'العقد', contractIntro: 'هذه هي الواجهة الكاملة بين مدوّن وأي جهة تنفذ الفحص. الرسالتان أدناه من بيانات حية في هذه الصفحة.',
    taskTitle: 'InspectionTask: ما يطلبه مدوّن', resultTitle: 'InspectionResult: ما يعيده المنفّذ', example: 'مثال من {id}',
    today: 'المنفّذ اليوم محاكاة. وسيحل محلها محوّل جسر ROS 2: يستلم المهمة ويشغّل روبوتاً أو طائرة مسيّرة ويعيد النتيجة نفسها. ولا يتغير أي شيء آخر في مدوّن.',
    params: 'معدلات الكشف في المحاكاة معطيات نحن من حدّدها، وليست ادعاءً عن أي جهاز حقيقي. لا يوجد روبوت أو طائرة أو ماسح حقيقي متصل.',
    sample: 'بيانات اصطناعية بالكامل.',
  },
};

export function InspectionBoard() {
  const s = useStore();
  const t = useT(T);
  const f = useFormat();
  const bi = useBi();
  const L = useLabels();
  const [message, setMessage] = useState('');

  const waiting = useMemo(
    () => s.inFlight.filter((x) => !x.file.inspectionResult && (x.lane === 'red' || (x.lane === 'amber' && x.plan.assessment.recommendedChecks.length > 0))),
    [s.inFlight],
  );
  const done = useMemo(
    () => Object.values(s.world?.shipments ?? {}).filter((x) => x.inspectionResult).sort((a, b) => Date.parse(b.inspectionResult!.completedAt) - Date.parse(a.inspectionResult!.completedAt)),
    [s.world],
  );

  const summary = useMemo(() => {
    const m = new Map<string, { n: number; fnd: number; broken: number }>();
    for (const d of done) {
      const r = d.inspectionResult!;
      const e = m.get(r.performerKind) ?? { n: 0, fnd: 0, broken: 0 };
      e.n++;
      if (r.findings.some((x) => x.kind !== 'none')) e.fnd++;
      if (!r.seal.intact) e.broken++;
      m.set(r.performerKind, e);
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [done]);

  if (!s.ready || !s.world) return <Loading />;

  const exampleResult: InspectionResult | undefined = done[0]?.inspectionResult;
  const exampleTask: InspectionTask | undefined =
    (exampleResult && done[0].inspectionTask) || (waiting[0] ? createInspectionTask(waiting[0].file.shipment, waiting[0].plan.assessment, s.at) : undefined);
  const exampleId = exampleTask?.shipmentId ?? '';

  const run = (id: string) => {
    s.runInspection(id);
    setMessage(t('ran', { id }));
  };
  const receiptExists = (taskId: string) => s.world!.receipts.some((r) => r.id === `rcpt-${taskId}`);

  return (
    <div>
      <PageTitle title={t('title')} intro={t('intro')} />
      <p role="status" aria-live="polite" className={message ? 'mb-4 rounded-[3px] border border-line bg-panel2 px-3 py-2 text-sm' : 'sr-only'}>{message}</p>

      <section aria-labelledby="wait">
        <h2 id="wait" className="mb-1 text-[1.1rem]">{t('waiting')}</h2>
        <p className="mb-3 text-sm text-muted">{t('cellNote')}</p>
        {waiting.length === 0 ? <Panel><p className="text-muted">{t('waitingNone')}</p></Panel> : (
          <div className="panel relative overflow-x-auto">
            <table className="table-clean min-w-[820px]">
              <caption className="sr-only">{t('waitingCaption')}</caption>
              <thead><tr><th scope="col">{t('shipment')}</th><th scope="col">{t('lane')}</th><th scope="col">{t('scope')}</th><th scope="col">{t('constraints')}</th><th scope="col">{t('priority')}</th><th scope="col"><span className="sr-only">{t('run')}</span></th></tr></thead>
              <tbody>
                {waiting.map((w) => {
                  const task = createInspectionTask(w.file.shipment, w.plan.assessment, s.at);
                  const checks = w.plan.assessment.recommendedChecks.filter((c, i, a) => a.findIndex((d) => d.text === c.text && d.authorityId === c.authorityId) === i);
                  return (
                    <tr key={w.file.shipment.id}>
                      <td>
                        <Link href={`/shipments/${w.file.shipment.id}`} className="mono whitespace-nowrap underline underline-offset-2">{w.file.shipment.id}</Link>
                        <div className="mono text-sm text-muted" dir="ltr">{task.containerIds.slice(0, 2).join(', ')}{task.containerIds.length > 2 ? ` +${task.containerIds.length - 2}` : ''}</div>
                      </td>
                      <td><LaneBadge lane={w.lane} size="sm" /></td>
                      <td className="max-w-[34ch]">
                        {checks.length === 0 ? t('noScope') : (
                          <ul className="list-disc ps-4">{checks.map((c, i) => <li key={i}>{bi(c.text, c.textAr)} <span className="text-muted">({L.authority(c.authorityId)})</span></li>)}</ul>
                        )}
                      </td>
                      <td className="max-w-[26ch]">
                        {task.constraints.length === 0 ? <span className="text-muted">{t('noCons')}</span> : <ul className="list-disc ps-4">{task.constraints.map((c) => <li key={c}>{L.constraint(c)}</li>)}</ul>}
                      </td>
                      <td>{task.priority === 'high' ? t('high') : t('normal')}</td>
                      <td><button type="button" className="btn" onClick={() => run(w.file.shipment.id)}>{t('run')}</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-8" aria-labelledby="done">
        <h2 id="done" className="mb-3 text-[1.1rem]">{t('completed')}</h2>
        {done.length === 0 ? <Panel><p className="text-muted">{t('completedNone')}</p></Panel> : (
          <div className="panel relative overflow-x-auto">
            <table className="table-clean min-w-[820px]">
              <caption className="sr-only">{t('completedCaption')}</caption>
              <thead><tr><th scope="col">{t('shipment')}</th><th scope="col">{t('performer')}</th><th scope="col">{t('seal')}</th><th scope="col">{t('findings')}</th><th scope="col">{t('time')}</th><th scope="col">{t('receipt')}</th></tr></thead>
              <tbody>
                {done.map((d) => {
                  const r = d.inspectionResult!;
                  return (
                    <tr key={d.shipment.id}>
                      <td><Link href={`/shipments/${d.shipment.id}`} className="mono whitespace-nowrap underline underline-offset-2">{d.shipment.id}</Link></td>
                      <td>{L.performer(r.performerKind)} <span className="mono text-sm text-muted" dir="ltr">{r.performedBy}</span></td>
                      <td><span className="mono text-sm" dir="ltr">{r.seal.id}</span> {r.seal.intact ? t('intact') : <strong>{t('broken')}</strong>}</td>
                      <td>
                        <ul>{r.findings.map((x, i) => <li key={i}>{L.finding(x.kind)}{x.kind !== 'none' && <span className="text-muted"> ({L.severity(x.severity)})</span>}</li>)}</ul>
                      </td>
                      <td className="whitespace-nowrap">{f.dateTime(r.completedAt)}</td>
                      <td>{receiptExists(r.taskId) ? <Link href={`/evidence?receipt=rcpt-${r.taskId}`} className="whitespace-nowrap underline underline-offset-2">{t('openReceipt')}</Link> : <span className="text-muted">–</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {summary.length > 0 && (
        <section className="mt-8 max-w-[640px]" aria-labelledby="kinds">
          <h2 id="kinds" className="mb-3 text-[1.1rem]">{t('byKind')}</h2>
          <div className="relative overflow-x-auto"><table className="table-clean min-w-[420px]">
            <caption className="sr-only">{t('byKind')}</caption>
            <thead><tr><th scope="col">{t('kind')}</th><th scope="col">{t('count')}</th><th scope="col">{t('withFindings')}</th><th scope="col">{t('sealsBroken')}</th></tr></thead>
            <tbody>
              {summary.map(([k, v]) => (
                <tr key={k}><th scope="row" className="!text-start !text-[1rem] font-normal !text-ink">{L.performer(k)}</th><td className="tabular-nums">{f.number(v.n)}</td><td className="tabular-nums">{f.number(v.fnd)}</td><td className="tabular-nums">{f.number(v.broken)}</td></tr>
              ))}
            </tbody>
          </table></div>
        </section>
      )}

      <section className="mt-10" aria-labelledby="contract">
        <h2 id="contract" className="text-[1.1rem]">{t('contract')}</h2>
        <p className="mt-1 max-w-[68ch] text-muted">{t('contractIntro')} {exampleId && <Modelled>{t('example', { id: exampleId })}</Modelled>}</p>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="min-w-0">
            <h3 className="mb-1 text-base">{t('taskTitle')}</h3>
            <pre className="mono panel overflow-x-auto p-3 text-[0.82rem] leading-relaxed" dir="ltr" tabIndex={0}>{exampleTask ? JSON.stringify(exampleTask, null, 2) : '–'}</pre>
          </div>
          <div className="min-w-0">
            <h3 className="mb-1 text-base">{t('resultTitle')}</h3>
            <pre className="mono panel overflow-x-auto p-3 text-[0.82rem] leading-relaxed" dir="ltr" tabIndex={0}>{exampleResult ? JSON.stringify(exampleResult, null, 2) : '–'}</pre>
          </div>
        </div>
        <div className="mt-5 max-w-[68ch] space-y-3">
          <p>{t('today')}</p>
          <p className="border-s-2 border-line ps-3 text-muted">{t('params')}</p>
          <p className="text-sm text-muted">{t('sample')}</p>
        </div>
      </section>
    </div>
  );
}
