'use client';

import { useId, useState } from 'react';
import type { EvidenceReceipt } from '@/engine';
import { useT } from '@/lib/i18n';

const T = {
  en: {
    copy: 'Copy inclusion proof',
    working: 'Fetching the proof from the ledger.',
    copied: 'Inclusion proof copied. Save it as proof.json and run: node scripts/verify-proof.mjs proof.json <ledger public key>. Take the key from docs/key-custody.md, not from this page or the server that made the proof.',
    manual: 'The browser did not allow copying. Select the proof below and copy it.',
    local: 'This receipt exists only in this browser\'s demo changes, so the server ledger holds no proof for it. Proofs exist for receipts in the server ledger.',
    failed: 'The proof could not be fetched. Try again.',
    proof: 'Inclusion proof (JSON)',
    note: 'The proof ties this receipt to the latest signed checkpoint of the server ledger and is checked offline. It proves the hashed fields (identity, type, subject, issuer, verifier, method, scope, validity, sharing), not the summary text or the current status. Demo key: it proves the mechanism, not identity.',
  },
  ar: {
    copy: 'نسخ إثبات التضمين',
    working: 'جارٍ جلب الإثبات من السجل.',
    copied: 'تم نسخ إثبات التضمين. احفظه باسم proof.json ثم شغّل: node scripts/verify-proof.mjs proof.json <المفتاح العام للسجل>. خذ المفتاح من docs/key-custody.md، لا من هذه الصفحة ولا من الخادم الذي أصدر الإثبات.',
    manual: 'لم يسمح المتصفح بالنسخ. حدّد الإثبات أدناه وانسخه.',
    local: 'هذا الإيصال موجود فقط في التغييرات التجريبية لهذا المتصفح، لذلك لا يحتفظ سجل الخادم بإثبات له. تتوفر الإثباتات للإيصالات الموجودة في سجل الخادم.',
    failed: 'تعذّر جلب الإثبات. أعد المحاولة.',
    proof: 'إثبات التضمين (JSON)',
    note: 'يربط الإثبات هذا الإيصال بأحدث نقطة تحقق موقّعة من سجل الخادم، ويُتحقق منه دون اتصال. ويثبت الحقول المشمولة بالبصمة (المعرّف والنوع والموضوع والمُصدر والجهة المتحققة والطريقة والنطاق والصلاحية والمشاركة)، لا نص الملخص ولا الحالة الحالية. المفتاح تجريبي: يثبت الآلية لا الهوية.',
  },
};

/** Fetches the server's inclusion proof for one receipt (signed with the ledger key the server is configured with) and copies it. */
export function ProofCopy({ receipt }: { receipt: EvidenceReceipt }) {
  const t = useT(T);
  const uid = useId();
  const [msg, setMsg] = useState('');
  const [fallback, setFallback] = useState('');

  const copy = async () => {
    setFallback('');
    setMsg(t('working'));
    let text: string;
    try {
      const res = await fetch(`/api/v1/receipts/${encodeURIComponent(receipt.id)}/proof`);
      if (res.status === 404) return setMsg(t('local'));
      if (!res.ok) return setMsg(t('failed'));
      text = JSON.stringify(await res.json(), null, 2);
    } catch {
      return setMsg(t('failed'));
    }
    try {
      await navigator.clipboard.writeText(text);
      setMsg(t('copied'));
    } catch {
      setFallback(text);
      setMsg(t('manual'));
    }
  };

  return (
    <div className="mt-4">
      <button type="button" className="btn" onClick={copy}>{t('copy')}</button>
      <p role="status" aria-live="polite" className={msg ? 'mt-2 break-words text-sm' : 'sr-only'}>{msg}</p>
      {fallback && (
        <label className="mt-2 flex flex-col gap-1 text-sm text-muted" htmlFor={`${uid}p`}>
          {t('proof')}
          <textarea id={`${uid}p`} readOnly rows={8} value={fallback} dir="ltr" className="mono rounded-[3px] border border-line bg-panel px-2 py-1 text-[0.8rem] text-ink" />
        </label>
      )}
      <p className="mt-2 max-w-[60ch] text-sm text-muted">{t('note')}</p>
    </div>
  );
}
