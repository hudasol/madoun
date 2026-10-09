'use client';

import { Stamp, type StampTone } from '@/components/Stamp';
import type { EvidenceCheck, EvidenceReceipt, EvidenceType, EvidenceVerdict, ShipmentFile, ShipmentPlan } from '@/engine';
import { useBi, useFormat, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { useLabels } from './labels';

const T = {
  en: {
    title: 'Approvals and evidence', summary: '{ok} of {n} approvals are in place. {gaps} need action before release.', summaryNone: 'All {n} approvals are in place.', summaryDone: '{ok} of {n} approvals have a receipt on file. {gaps} show a gap in the record.',
    reuseNote: 'Evidence receipts record who verified a document, what it covers and until when. The document stays with the authority that holds it.',
    approval: 'Approval', verdict: 'Verdict and next step', receipt: 'Receipt',
    full: 'Full review', accept: 'Accept receipt', done: 'Already done', hours: '{h} of review work', approved: 'Approved {t}', gapTag: 'Gap',
    covers: 'Covers {a} of {b} goods lines', verifiedBy: 'Verified by {a}', reusedFrom: 'Verified by {a}, reused here by {b}', relies: 'Relies on: {x}',
    noReceipt: 'No receipt on file', notShared: 'not shared', revoked: 'revoked', expired: 'expired', partial: 'partial scope', lapses: 'expires before arrival',
    v_satisfied_own: 'Verified', v_satisfied_reuse: 'Reused receipt', v_missing: 'Missing', v_expired: 'Expired', v_expires_before_eta: 'Expires before arrival',
    v_scope_partial: 'Partly covered', v_not_shared: 'Not shared', v_revoked: 'Revoked', v_pending: 'Pending verification', v_awaiting_review: 'Submitted, awaiting review',
    n_missing: 'Next: ask the trader or forwarder to submit {types}.', n_expired: 'Next: ask the issuer for a renewed document and submit it.',
    n_expires_before_eta: 'Next: get the document renewed before arrival, or the approval lapses at the border.',
    n_scope_partial: 'Next: submit evidence for the {n} goods line(s) the receipt does not cover.',
    n_not_shared: 'Next: ask {a} to share this receipt, or run a full review here.', n_revoked: 'Next: a new document is needed, the old one was withdrawn.',
    n_pending: 'Next: wait for the verifying authority to finish.',
    et_commercial_invoice: 'Commercial invoice', et_packing_list: 'Packing list', et_transport_document: 'Transport document', et_certificate_of_origin: 'Certificate of origin',
    et_health_certificate: 'Health certificate', et_lab_result: 'Lab result', et_conformity_certificate: 'Conformity certificate', et_type_approval: 'Type approval',
    et_import_permit: 'Import permit', et_safety_data_sheet: 'Safety data sheet', et_inspection_result: 'Inspection result', et_release_order: 'Release order',
  },
  ar: {
    title: 'الموافقات والأدلة', summary: '{ok} من {n} موافقات جاهزة. و{gaps} تحتاج إجراءً قبل الإفراج.', summaryNone: 'كل الموافقات ({n}) جاهزة.', summaryDone: '{ok} من {n} موافقات لها إيصال مسجّل. و{gaps} بها نقص في السجل.',
    reuseNote: 'يسجّل إيصال الدليل من تحقق من المستند وما يغطيه وحتى متى. ويبقى المستند لدى الجهة التي تحتفظ به.',
    approval: 'الموافقة', verdict: 'الحكم والخطوة التالية', receipt: 'الإيصال',
    full: 'مراجعة كاملة', accept: 'قبول الإيصال', done: 'تمت سابقاً', hours: '{h} من العمل', approved: 'تمت الموافقة {t}', gapTag: 'نقص',
    covers: 'يغطي {a} من {b} بنود', verifiedBy: 'تحقق منه {a}', reusedFrom: 'تحقق منه {a} وأعادت {b} استخدامه هنا', relies: 'يعتمد على: {x}',
    noReceipt: 'لا يوجد إيصال', notShared: 'غير مشارك', revoked: 'ملغى', expired: 'منتهٍ', partial: 'نطاق جزئي', lapses: 'ينتهي قبل الوصول',
    v_satisfied_own: 'تم التحقق', v_satisfied_reuse: 'إيصال معاد استخدامه', v_missing: 'ناقص', v_expired: 'منتهي الصلاحية', v_expires_before_eta: 'ينتهي قبل الوصول',
    v_scope_partial: 'تغطية جزئية', v_not_shared: 'غير مشارك', v_revoked: 'ملغى', v_pending: 'بانتظار التحقق', v_awaiting_review: 'مقدَّم وبانتظار المراجعة',
    n_missing: 'التالي: اطلب من التاجر أو المخلّص تقديم {types}.', n_expired: 'التالي: اطلب من الجهة المصدرة مستنداً مجدداً وقدّمه.',
    n_expires_before_eta: 'التالي: جدّد المستند قبل الوصول وإلا انتهت الموافقة عند الحدود.',
    n_scope_partial: 'التالي: قدّم أدلة للبنود ({n}) التي لا يغطيها الإيصال.',
    n_not_shared: 'التالي: اطلب من {a} مشاركة هذا الإيصال، أو أجرِ مراجعة كاملة هنا.', n_revoked: 'التالي: يلزم مستند جديد، فقد سُحب المستند السابق.',
    n_pending: 'التالي: انتظر حتى تنتهي الجهة المتحققة.',
    et_commercial_invoice: 'الفاتورة التجارية', et_packing_list: 'قائمة التعبئة', et_transport_document: 'مستند النقل', et_certificate_of_origin: 'شهادة المنشأ',
    et_health_certificate: 'الشهادة الصحية', et_lab_result: 'نتيجة المختبر', et_conformity_certificate: 'شهادة المطابقة', et_type_approval: 'اعتماد النوع',
    et_import_permit: 'تصريح الاستيراد', et_safety_data_sheet: 'نشرة بيانات السلامة', et_inspection_result: 'نتيجة الفحص', et_release_order: 'أمر الإفراج',
  },
};

const key = (v: string) => v.replaceAll('-', '_');
const GAPS: EvidenceVerdict[] = ['missing', 'expired', 'expires-before-eta', 'scope-partial', 'not-shared', 'revoked'];
export const isGap = (v: EvidenceVerdict) => GAPS.includes(v);


export function ApprovalsSection({ file, plan }: { file: ShipmentFile; plan: ShipmentPlan }) {
  const t = useT(T);
  const f = useFormat();
  const bi = useBi();
  const s = useStore();
  const L = useLabels();
  const dir = s.directory!;
  const receipts = s.world!.receipts;
  const total = plan.instances.reduce((n, _) => n + 1, 0);
  const itemsTotal = file.shipment.consignments.flatMap((c) => c.items).length;
  const gaps = plan.checks.filter((c) => isGap(c.verdict)).length;
  const ok = plan.checks.filter((c) => c.verdict === 'satisfied-own' || c.verdict === 'satisfied-reuse').length;
  const etLabel = (e: EvidenceType) => t(`et_${key(e)}` as 'et_lab_result');

  return (
    <section id="approvals" className="panel scroll-mt-4" aria-labelledby="appr-h">
      <header className="border-b border-line px-4 py-4">
        <h2 id="appr-h" className="text-[1.35rem]">{t('title')}</h2>
        <p className="mt-1 font-medium">{gaps ? t(file.cleared ? 'summaryDone' : 'summary', { ok, n: total, gaps }) : t('summaryNone', { n: total })}</p>
        <p className="mt-1 max-w-[70ch] text-sm text-muted">{t('reuseNote')}</p>
      </header>
      <ul>
        {plan.instances.map((inst) => {
          const req = dir.requirementById[inst.requirementId];
          const check = plan.checks.find((c) => c.requirementId === inst.requirementId) as EvidenceCheck;
          const rv = plan.reviewPlan.reviews.find((r) => r.requirementId === inst.requirementId);
          const rec: EvidenceReceipt | undefined = check.receiptId ? receipts.find((r) => r.id === check.receiptId) : undefined;
          const state = file.reviews[inst.requirementId];
          const gap = isGap(check.verdict);
          const v = check.verdict;
          let tone: StampTone | null = null;
          let stampNote: string | undefined;
          if (rec) {
            if (v === 'satisfied-own') tone = 'verified';
            else if (v === 'satisfied-reuse') tone = 'reuse';
            else if (v === 'expires-before-eta') { tone = 'warn'; }
            else if (v === 'scope-partial') { tone = 'warn'; }
            else if (v === 'expired') { tone = 'void'; stampNote = t('expired'); }
            else if (v === 'revoked') { tone = 'void'; stampNote = t('revoked'); }
            else if (v === 'not-shared') { tone = 'void'; stampNote = t('notShared'); }
          }
          const reliesOn = rv?.reliesOn?.length ? rv.reliesOn.map((id) => { const r = dir.requirementById[id]; return r ? bi(r.label, r.labelAr) : id; }).join(', ') : '';
          const nextKey = `n_${key(v)}` as 'n_missing';
          const hasNext = gap || v === 'pending';
          return (
            <li key={inst.requirementId} className={`grid gap-x-6 gap-y-3 border-b border-line px-4 py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_13rem] ${gap ? 'border-s-4 border-s-ink bg-panel2 ps-3' : ''}`}>
              <div>
                <h3 className="text-base">{bi(req.label, req.labelAr)}</h3>
                <p className="text-sm text-muted">{L.authority(inst.authorityId)}</p>
                <p className="mt-1 text-sm">
                  {rv && (rv.mode === 'full-review' ? t('full') : rv.mode === 'accept-receipt' ? t('accept') : t('done'))}
                  {rv && rv.mode !== 'no-action' && <span className="text-muted">, {t('hours', { h: f.hours(rv.hours) })}</span>}
                </p>
                {state?.completedAt && <p className="text-sm text-muted">{t('approved', { t: f.dateTime(state.completedAt) })}</p>}
              </div>
              <div>
                <p className="font-semibold">
                  {gap && (
                    <span className="me-2 inline-flex items-center gap-1 border border-ink px-1.5 text-[0.8rem]">
                      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1 9.5 9H.5z" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M5 4v2.4M5 7.4v.4" stroke="currentColor" strokeWidth="1.2" /></svg>
                      {t('gapTag')}
                    </span>
                  )}
                  {t(`v_${key(v)}` as 'v_missing')}
                </p>
                <p className="max-w-[60ch] text-[0.95rem]">{bi(check.reason, check.reasonAr)}</p>
                {check.verdict === 'scope-partial' && check.uncoveredItemIds && (
                  <p className="text-sm text-muted">{t('covers', { a: itemsTotal - check.uncoveredItemIds.length, b: itemsTotal })}</p>
                )}
                {hasNext && (
                  <p className="mt-1 max-w-[60ch] text-[0.95rem] font-medium">
                    {t(nextKey, {
                      types: req.evidenceTypes.map(etLabel).join(', '),
                      n: check.uncoveredItemIds?.length ?? 0,
                      a: rec ? L.authority(rec.verifiedBy) : L.authority(check.reusedFrom ?? inst.authorityId),
                    })}
                    {v === 'revoked' && rec?.revokedReason ? ` ${rec.revokedReason}` : ''}
                  </p>
                )}
              </div>
              <div className="pt-1">
                {rec && tone ? (
                  <>
                    <Stamp
                      authority={L.authority(tone === 'reuse' ? inst.authorityId : rec.verifiedBy)}
                      label={etLabel(rec.type)}
                      validUntil={tone === 'void' ? undefined : rec.validUntil}
                      tone={tone}
                      note={tone === 'void' ? stampNote : tone === 'warn' ? undefined : undefined}
                    />
                    <p className="mt-2 text-sm text-muted">
                      {tone === 'reuse' ? t('reusedFrom', { a: L.authority(rec.verifiedBy), b: L.authority(inst.authorityId) }) : t('verifiedBy', { a: L.authority(rec.verifiedBy) })}
                    </p>
                    <p className="mono text-xs text-muted">{rec.subjectRef}</p>
                  </>
                ) : reliesOn && (v === 'awaiting-review' || v === 'satisfied-reuse') ? (
                  <Stamp authority={L.authority(inst.authorityId)} label={t('relies', { x: reliesOn })} tone="reuse" />
                ) : (
                  <p className="text-sm text-muted">{t('noReceipt')}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
