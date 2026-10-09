'use client';

import { useState } from 'react';
import { LaneBadge } from '@/components/LaneBadge';
import type { Lane, ShipmentFile, ShipmentPlan } from '@/engine';
import { useBi, useFormat, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { useLabels } from './labels';

const T = {
  en: {
    title: 'Lane and why',
    p_pre: 'Pre-arrival release: no physical check is planned. The file can be released before the goods land if approvals are complete.',
    p_targeted: 'Targeted checks: specific checks are recommended on top of the approvals, then release.',
    p_physical: 'Physical inspection: the goods are to be inspected before release.',
    engine: 'Madoun recommends', effective: 'Lane in effect', audit: 'Flagged for post-clearance audit',
    auditText: 'This does not hold the shipment. A customs auditor reviews the file after release and feeds what they find back into risk rules.',
    reasons: 'Reasons', reasonsHint: 'Points add to a risk score, minus points lower it. Only objective criteria are used: goods, origin, value, trader history and transport mode.',
    points: 'points', per: 'Score by authority', authority: 'Authority', score: 'Score', lane: 'Lane', signals: 'Signals',
    conflicts: 'Authorities disagree', rule: 'Rule applied', checks: 'Recommended checks', noChecks: 'No extra checks are recommended.',
    override: 'Officer override', overrideHint: 'Set the lane yourself. The reason is kept in the audit trail and Madoun\'s recommendation stays visible.',
    chooseLane: 'New lane', reason: 'Reason (required)', save: 'Save override', saved: 'Override saved. Lane is now {lane}.', needReason: 'Write a reason before saving.',
    overriddenBy: 'Overridden by {who}', at: 'at {t}', why: 'Reason',
    green: 'Green', amber: 'Amber', red: 'Red', adds: 'adds risk', lowers: 'lowers risk',
  },
  ar: {
    title: 'المسار وأسبابه',
    p_pre: 'إفراج قبل الوصول: لا فحص مادي مخطط. يمكن الإفراج عن الملف قبل وصول البضائع إذا اكتملت الموافقات.',
    p_targeted: 'فحوصات موجهة: يُوصى بفحوصات محددة إضافة إلى الموافقات، ثم الإفراج.',
    p_physical: 'فحص مادي: ستُفحص البضائع قبل الإفراج.',
    engine: 'توصية مدوّن', effective: 'المسار المعمول به', audit: 'مُعلَّمة للتدقيق بعد الإفراج',
    auditText: 'هذا لا يوقف الشحنة. يراجع المدقق الملف بعد الإفراج، وتعود النتائج لتغذي قواعد المخاطر.',
    reasons: 'الأسباب', reasonsHint: 'النقاط الموجبة ترفع درجة الخطورة والسالبة تخفضها. تُستخدم معايير موضوعية فقط: البضائع والمنشأ والقيمة وسجل التاجر ووسيلة النقل.',
    points: 'نقطة', per: 'الدرجة حسب الجهة', authority: 'الجهة', score: 'الدرجة', lane: 'المسار', signals: 'المؤشرات',
    conflicts: 'الجهات غير متفقة', rule: 'القاعدة المطبقة', checks: 'الفحوصات الموصى بها', noChecks: 'لا توجد فحوصات إضافية موصى بها.',
    override: 'تعديل الضابط', overrideHint: 'حدّد المسار بنفسك. يُحفظ السبب في سجل التدقيق وتبقى توصية مدوّن ظاهرة.',
    chooseLane: 'المسار الجديد', reason: 'السبب (إلزامي)', save: 'حفظ التعديل', saved: 'تم حفظ التعديل. المسار الآن {lane}.', needReason: 'اكتب سبباً قبل الحفظ.',
    overriddenBy: 'عدّله {who}', at: 'في {t}', why: 'السبب',
    green: 'أخضر', amber: 'كهرماني', red: 'أحمر', adds: 'يرفع الخطورة', lowers: 'يخفض الخطورة',
  },
};

const LANES: Lane[] = ['green', 'amber', 'red'];
const PATH = { 'pre-arrival-release': 'p_pre', 'targeted-checks': 'p_targeted', 'physical-inspection': 'p_physical' } as const;

export function LaneWhy({ file, plan }: { file: ShipmentFile; plan: ShipmentPlan }) {
  const t = useT(T);
  const f = useFormat();
  const bi = useBi();
  const s = useStore();
  const L = useLabels();
  const a = plan.assessment;
  const eff = s.laneOf(file);
  const [lane, setLane] = useState<Lane>(eff);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState(false);
  const max = Math.max(1, ...a.reasons.map((r) => Math.abs(r.points)));

  const groups = a.recommendedChecks.reduce<Record<string, typeof a.recommendedChecks>>((m, c) => {
    (m[c.authorityId] ??= []).push(c);
    return m;
  }, {});

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) { setErr(true); setMsg(t('needReason')); return; }
    setErr(false);
    s.overrideLane(file.shipment.id, lane, reason.trim());
    setMsg(t('saved', { lane: t(lane) }));
    setReason('');
  };

  return (
    <section className="panel" aria-labelledby="lane-h">
      <header className="border-b border-line px-4 py-3"><h2 id="lane-h" className="text-[1.05rem]">{t('title')}</h2></header>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 p-4 lg:grid-cols-2">
        <div className="min-w-0 space-y-6">
          <div>
            <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
              <p className="text-sm text-muted">{t('effective')}: <span className="ms-1 text-base"><LaneBadge lane={eff} /></span></p>
              <p className="text-sm text-muted">{t('engine')}: <span className="ms-1 text-base"><LaneBadge lane={a.lane} /></span></p>
            </div>
            <p className="mt-2 max-w-[62ch]">{t(PATH[a.pathway])}</p>
            {file.override && (
              <p className="mt-3 border-s-2 border-ink ps-3 text-[0.95rem]">
                <span className="font-semibold">{t('overriddenBy', { who: L.owner(file.override.officerId) })}</span>, {t('at', { t: f.dateTime(file.override.at) })}.
                <span className="block text-muted">{t('why')}: {file.override.reason}</span>
              </p>
            )}
            {a.auditFlag && (
              <div className="mt-3 border border-s-4 p-3" style={{ borderColor: 'light-dark(#1f5fbf, #6db3ff)' }}>
                <p className="font-semibold" style={{ color: 'light-dark(#1f5fbf, #6db3ff)' }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" className="me-2 inline" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M6 5.2V9M6 3v.1" stroke="currentColor" strokeWidth="1.6" /></svg>
                  {t('audit')}
                </p>
                <p className="mt-1 max-w-[60ch] text-sm">{t('auditText')}</p>
              </div>
            )}
          </div>

          <div>
            <h3 className="text-base">{t('reasons')}</h3>
            <p className="mb-2 max-w-[62ch] text-sm text-muted">{t('reasonsHint')}</p>
            <ul className="space-y-2">
              {a.reasons.map((r, i) => (
                <li key={i} className="grid grid-cols-[3.2rem_5rem_minmax(0,1fr)] items-start gap-x-3">
                  <span className="mono text-end font-medium" title={r.points >= 0 ? t('adds') : t('lowers')}>{r.points > 0 ? '+' : r.points < 0 ? '−' : ''}{f.number(Math.abs(r.points))}</span>
                  <span className="mt-2 h-[6px] bg-panel2" aria-hidden="true">
                    <span className="block h-full" style={{ width: `${(Math.abs(r.points) / max) * 100}%`, background: r.points >= 0 ? 'var(--ink)' : 'transparent', border: r.points >= 0 ? 'none' : '1.5px solid var(--muted)', boxSizing: 'border-box' }} />
                  </span>
                  <span className="text-[0.95rem]">{bi(r.text, r.textAr)} <span className="text-sm text-muted">({L.authority(r.authorityId)})</span></span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="min-w-0 space-y-6">
          <div>
            <h3 className="mb-1 text-base">{t('per')}</h3>
            <div className="overflow-x-auto">
              <table className="table-clean text-[0.95rem]">
                <thead><tr><th scope="col">{t('authority')}</th><th scope="col">{t('score')}</th><th scope="col">{t('lane')}</th><th scope="col">{t('signals')}</th></tr></thead>
                <tbody>
                  {a.perAuthority.map((p) => (
                    <tr key={p.authorityId}>
                      <th scope="row" className="!font-normal !text-ink">{L.authority(p.authorityId)}</th>
                      <td className="mono">{f.number(p.score)}</td>
                      <td><LaneBadge lane={p.lane} size="sm" /></td>
                      <td>{f.number(p.signals.length)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {a.conflicts.length > 0 && (
            <div>
              <h3 className="text-base">{t('conflicts')}</h3>
              <ul className="mt-1 space-y-2">
                {a.conflicts.map((c, i) => (
                  <li key={i} className="text-[0.95rem]">
                    <span className="flex flex-wrap gap-x-4">
                      {c.authorities.map((id, j) => <span key={id} className="inline-flex items-center gap-2">{L.authority(id)} <LaneBadge lane={c.lanes[j]} size="sm" /></span>)}
                    </span>
                    <span className="block text-muted">{t('rule')}: {bi(c.rule, c.ruleAr)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h3 className="text-base">{t('checks')}</h3>
            {a.recommendedChecks.length === 0 ? <p className="text-muted">{t('noChecks')}</p> : (
              <div className="mt-1 space-y-3">
                {Object.entries(groups).map(([id, list]) => (
                  <div key={id}>
                    <p className="text-sm font-medium">{L.authority(id)}</p>
                    <ul className="list-disc ps-5 text-[0.95rem]">{list.map((c, i) => <li key={i}>{bi(c.text, c.textAr)}</li>)}</ul>
                  </div>
                ))}
              </div>
            )}
          </div>

          <form onSubmit={save} className="border-t border-line pt-4" aria-labelledby="ov-h" noValidate>
            <h3 id="ov-h" className="text-base">{t('override')}</h3>
            <p className="mb-3 max-w-[60ch] text-sm text-muted">{t('overrideHint')}</p>
            <fieldset className="mb-3">
              <legend className="mb-1 text-sm text-muted">{t('chooseLane')}</legend>
              <div className="flex flex-wrap gap-2">
                {LANES.map((l) => (
                  <label key={l} className={`btn cursor-pointer !py-1 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus)] ${lane === l ? '!border-ink !bg-panel' : ''}`}>
                    <input type="radio" name="lane" value={l} checked={lane === l} onChange={() => setLane(l)} className="sr-only" />
                    <LaneBadge lane={l} size="sm" />
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block text-sm text-muted" htmlFor="ov-reason">{t('reason')}</label>
            <textarea id="ov-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={err} aria-describedby="ov-msg"
              className="mt-1 w-full rounded-[3px] border border-line bg-panel px-3 py-2 text-ink" />
            <div className="mt-2 flex flex-wrap items-center gap-4">
              <button type="submit" className="btn btn-primary">{t('save')}</button>
              <p id="ov-msg" role="status" aria-live="polite" className={`text-sm ${err ? 'font-semibold' : ''}`}>{msg}</p>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
