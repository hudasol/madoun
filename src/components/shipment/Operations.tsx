'use client';

import { RoleHint } from '@/components/RoleHint';
import { useState } from 'react';
import type { InspectionFinding, ShipmentFile, ShipmentPlan } from '@/engine';
import { useBi, useFormat, useLocale, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { useLabels } from './labels';

const T = {
  en: {
    excTitle: 'Exceptions on this shipment', excNone: 'No open exceptions. Every waiting step has an owner and is within its time limit.',
    owner: 'Owner', waiting: 'Waiting {h}', level: 'Escalation level {n}', note: 'Resolution note', resolve: 'Resolve', needNote: 'Write a short note before resolving.',
    resolved: 'Exception resolved and recorded in the audit trail.',
    inspTitle: 'Inspection', why: 'The effective lane calls for a physical check. The result becomes an evidence receipt other authorities can rely on.',
    request: 'Request inspection', requested: 'Inspection requested and result recorded below.', pending: 'Inspection requested, result not in yet.',
    task: 'Task', containers: 'Containers', scope: 'Scope', priority: 'Priority', by: 'Requested by {w}', high: 'High', normal: 'Normal',
    result: 'Result', performer: 'Performed by', completed: 'Completed', seal: 'Seal', intact: 'intact', broken: 'broken', findings: 'Findings', media: 'Media references',
    robot: 'Robot', drone: 'Drone', scanner: 'Scanner', officer: 'Officer',
    'seal-broken': 'Seal broken', 'undeclared-goods': 'Undeclared goods', 'quantity-mismatch': 'Quantity mismatch', damage: 'Damage', 'temperature-excursion': 'Temperature excursion',
    'prohibited-item': 'Prohibited item', none: 'Nothing found', info: 'Information', minor: 'Minor', major: 'Major',
    receiptNote: 'Recorded as an evidence receipt (method: inspection).',
  },
  ar: {
    excTitle: 'استثناءات هذه الشحنة', excNone: 'لا توجد استثناءات مفتوحة. لكل خطوة منتظرة مسؤول وهي ضمن مهلتها.',
    owner: 'المسؤول', waiting: 'منتظرة منذ {h}', level: 'مستوى التصعيد {n}', note: 'ملاحظة الحل', resolve: 'حل الاستثناء', needNote: 'اكتب ملاحظة قصيرة قبل الحل.',
    resolved: 'تم حل الاستثناء وتسجيله في سجل التدقيق.',
    inspTitle: 'الفحص', why: 'المسار المعمول به يستدعي فحصاً مادياً. وتصبح النتيجة إيصال دليل يمكن للجهات الأخرى الاعتماد عليه.',
    request: 'طلب فحص', requested: 'تم طلب الفحص وسُجّلت النتيجة أدناه.', pending: 'تم طلب الفحص ولم تصل النتيجة بعد.',
    task: 'المهمة', containers: 'الحاويات', scope: 'النطاق', priority: 'الأولوية', by: 'طلبه {w}', high: 'عالية', normal: 'عادية',
    result: 'النتيجة', performer: 'نفّذه', completed: 'اكتمل', seal: 'الختم', intact: 'سليم', broken: 'مكسور', findings: 'الملاحظات', media: 'مراجع الوسائط',
    robot: 'روبوت', drone: 'طائرة مسيّرة', scanner: 'ماسح', officer: 'ضابط',
    'seal-broken': 'ختم مكسور', 'undeclared-goods': 'بضائع غير مصرّح بها', 'quantity-mismatch': 'اختلاف في الكمية', damage: 'تلف', 'temperature-excursion': 'خروج عن درجة الحرارة',
    'prohibited-item': 'صنف محظور', none: 'لم يُعثر على شيء', info: 'معلومة', minor: 'طفيف', major: 'جسيم',
    receiptNote: 'سُجّلت كإيصال دليل (الطريقة: فحص).',
  },
};

export function ExceptionsSection({ file }: { file: ShipmentFile }) {
  const t = useT(T);
  const f = useFormat();
  const bi = useBi();
  const s = useStore();
  const L = useLabels();
  const list = s.exceptions.filter((e) => e.shipmentId === file.shipment.id);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [bad, setBad] = useState('');

  return (
    <section className="panel" aria-labelledby="ex-h">
      <header className="border-b border-line px-4 py-3"><h2 id="ex-h" className="text-[1.05rem]">{t('excTitle')}</h2></header>
      <div className="p-4">
        <p role="status" aria-live="polite" className={msg ? 'mb-3 border-s-2 border-ink ps-3 font-medium' : 'sr-only'}>{msg}</p>
        {list.length === 0 ? <p className="text-muted">{t('excNone')}</p> : (
          <ul className="divide-y divide-line">
            {list.map((e) => (
              <li key={e.id} className="py-4 first:pt-0 last:pb-0">
                <p className="font-semibold">{L.kind(e.kind)}</p>
                <p className="max-w-[70ch] text-[0.95rem]">{bi(e.detail, e.detailAr)}</p>
                <p className="mt-1 flex flex-wrap gap-x-5 text-sm">
                  <span><span className="text-muted">{t('owner')}:</span> {L.owner(e.ownerId)}</span>
                  <span className="text-muted">{t('waiting', { h: f.hours(e.clockHours) })}</span>
                  {e.escalationLevel > 0 && <span className="font-semibold">{t('level', { n: e.escalationLevel })}</span>}
                </p>
                <form
                  className="mt-2 flex flex-wrap items-end gap-3"
                  noValidate
                  onSubmit={(ev) => {
                    ev.preventDefault();
                    const n = (notes[e.id] ?? '').trim();
                    if (!n) { setBad(e.id); setMsg(t('needNote')); return; }
                    setBad('');
                    s.resolveException(e.id, n);
                    setMsg(t('resolved'));
                  }}
                >
                  <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-sm text-muted" htmlFor={`n-${e.id}`}>
                    {t('note')}
                    <input id={`n-${e.id}`} value={notes[e.id] ?? ''} aria-invalid={bad === e.id} onChange={(ev) => setNotes((m) => ({ ...m, [e.id]: ev.target.value }))}
                      className="rounded-[3px] border border-line bg-panel px-3 py-1.5 text-base text-ink" />
                  </label>
                  <button type="submit" className="btn" disabled={!s.can('resolve-exception', e.authorityId)}>{t('resolve')}</button>
                </form>
                <RoleHint action="resolve-exception" authorityId={e.authorityId} className="mt-1" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function needsInspection(file: ShipmentFile, plan: ShipmentPlan, lane: string) {
  return !!file.inspectionTask || !!file.inspectionResult || lane === 'red' || (lane === 'amber' && plan.assessment.recommendedChecks.length > 0);
}

export function InspectionSection({ file }: { file: ShipmentFile }) {
  const t = useT(T);
  const f = useFormat();
  const s = useStore();
  const bi = useBi();
  const { locale } = useLocale();
  const L = useLabels();
  const [msg, setMsg] = useState('');
  const task = file.inspectionTask;
  const res = file.inspectionResult;
  const noneFound = (x: InspectionFinding) => x.kind === 'none';

  return (
    <section className="panel" aria-labelledby="in-h">
      <header className="border-b border-line px-4 py-3"><h2 id="in-h" className="text-[1.05rem]">{t('inspTitle')}</h2></header>
      <div className="space-y-4 p-4">
        <p className="max-w-[70ch] text-[0.95rem]">{t('why')}</p>
        <p role="status" aria-live="polite" className={msg ? 'border-s-2 border-ink ps-3 font-medium' : 'sr-only'}>{msg}</p>
        {!task && !res && (
          <div>
            <button type="button" className="btn btn-primary" disabled={!s.can('run-inspection')} onClick={() => { s.runInspection(file.shipment.id); setMsg(t('requested')); }}>{t('request')}</button>
            <RoleHint action="run-inspection" className="mt-1" />
          </div>
        )}
        {task && (
          <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
            <div><dt className="text-sm text-muted">{t('task')}</dt><dd className="mono text-[0.92rem]">{task.id}</dd><dd className="text-sm text-muted">{t('by', { w: L.owner(task.requestedBy) })}, {f.dateTime(task.requestedAt)}</dd></div>
            <div><dt className="text-sm text-muted">{t('priority')}</dt><dd>{task.priority === 'high' ? t('high') : t('normal')}</dd></div>
            {task.containerIds.length > 0 && <div><dt className="text-sm text-muted">{t('containers')}</dt><dd className="mono text-[0.92rem]">{task.containerIds.join(', ')}</dd></div>}
            <div><dt className="text-sm text-muted">{t('scope')}</dt><dd className="text-[0.95rem]">{(locale === 'ar' && task.scopeAr ? task.scopeAr : task.scope).join(locale === 'ar' ? '؛ ' : '; ')}</dd></div>
          </dl>
        )}
        {task && !res && <p className="font-medium">{t('pending')}</p>}
        {res && (
          <div className="border-t border-line pt-4">
            <h3 className="text-base">{t('result')}</h3>
            <dl className="mt-2 grid gap-x-8 gap-y-2 sm:grid-cols-3">
              <div><dt className="text-sm text-muted">{t('performer')}</dt><dd>{t(res.performerKind)} <span className="text-[0.88rem]">{L.owner(res.performedBy)}</span></dd></div>
              <div><dt className="text-sm text-muted">{t('completed')}</dt><dd>{f.dateTime(res.completedAt)}</dd></div>
              <div><dt className="text-sm text-muted">{t('seal')}</dt><dd><span className="mono text-[0.88rem]">{res.seal.id}</span>, <span className={res.seal.intact ? '' : 'font-semibold'}>{res.seal.intact ? t('intact') : t('broken')}</span></dd></div>
            </dl>
            <h4 className="mt-3 text-sm text-muted">{t('findings')}</h4>
            <ul className="mt-1 space-y-1">
              {res.findings.map((x, i) => (
                <li key={i} className="text-[0.95rem]"><span className="font-medium">{t(x.kind)}</span>{!noneFound(x) && <span className="text-muted"> ({t(x.severity)})</span>}{x.note && <span className="block text-muted">{bi(x.note, x.noteAr)}</span>}</li>
              ))}
            </ul>
            {res.mediaRefs.length > 0 && (
              <p className="mt-3 text-sm"><span className="text-muted">{t('media')}:</span> <span className="mono text-[0.85rem]">{res.mediaRefs.join(', ')}</span></p>
            )}
            <p className="mt-3 text-sm text-muted">{t('receiptNote')}</p>
          </div>
        )}
      </div>
    </section>
  );
}
