'use client';

import { useId, useState } from 'react';
import { LEDGER_SIGNER_ID, demoPublicKeys, demoSigner, inclusionProofFor, makeCheckpoint, type EvidenceReceipt } from '@/engine';
import { useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';

const T = {
  en: {
    copy: 'Copy inclusion proof',
    copied: 'Inclusion proof copied. Save it as proof.json and run: node scripts/verify-proof.mjs proof.json {key}',
    manual: 'The browser did not allow copying. Select the proof below and copy it.',
    proof: 'Inclusion proof (JSON)',
    note: 'The proof ties this receipt to a signed checkpoint of the ledger as viewed now. It is checked offline with the ledger public key. Demo key: it proves the mechanism, not identity. A proof covers the receipt content, not its current status.',
  },
  ar: {
    copy: 'نسخ إثبات التضمين',
    copied: 'تم نسخ إثبات التضمين. احفظه باسم proof.json ثم شغّل: node scripts/verify-proof.mjs proof.json {key}',
    manual: 'لم يسمح المتصفح بالنسخ. حدّد الإثبات أدناه وانسخه.',
    proof: 'إثبات التضمين (JSON)',
    note: 'يربط الإثبات هذا الإيصال بنقطة تحقق موقّعة من السجل كما يُعرض الآن، ويُتحقق منه دون اتصال باستخدام المفتاح العام للسجل. المفتاح تجريبي: يثبت الآلية لا الهوية. ويغطي الإثبات محتوى الإيصال لا حالته الحالية.',
  },
};

/** Builds a signed checkpoint of the ledger at the viewed moment and an inclusion proof for one receipt. */
export function ProofCopy({ receipt }: { receipt: EvidenceReceipt }) {
  const t = useT(T);
  const s = useStore();
  const uid = useId();
  const [msg, setMsg] = useState('');
  const [fallback, setFallback] = useState('');
  const key = demoPublicKeys([LEDGER_SIGNER_ID])[LEDGER_SIGNER_ID];

  const copy = async () => {
    const ledger = s.world?.receipts ?? [];
    const proof = inclusionProofFor(ledger, receipt.id, makeCheckpoint(ledger, s.at, demoSigner(LEDGER_SIGNER_ID)));
    if (!proof) return;
    const text = JSON.stringify(proof, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setFallback('');
      setMsg(t('copied', { key }));
    } catch {
      setFallback(text);
      setMsg(t('manual'));
    }
  };

  return (
    <div className="mt-4">
      <button type="button" className="btn" onClick={copy}>{t('copy')}</button>
      <p role="status" aria-live="polite" className={msg ? 'mt-2 break-all text-sm' : 'sr-only'}>{msg}</p>
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
