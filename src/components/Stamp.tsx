'use client';

import { useFormat, useT } from '@/lib/i18n';

const T = {
  en: { until: 'valid to', reused: 'accepted by', expired: 'expired', revoked: 'revoked', soon: 'expires soon' },
  ar: { until: 'ساري حتى', reused: 'قبلته', expired: 'منتهي', revoked: 'ملغى', soon: 'ينتهي قريباً' },
};

export type StampTone = 'verified' | 'reuse' | 'warn' | 'void';

/**
 * The signature element. A verified evidence receipt reads like a customs stamp:
 * who verified it, what it covers, and until when. Reused receipts carry a lighter stamp.
 */
export function Stamp({
  authority, label, validUntil, tone = 'verified', note,
}: { authority: string; label: string; validUntil?: string; tone?: StampTone; note?: string }) {
  const t = useT(T);
  const f = useFormat();
  const cls = tone === 'reuse' ? 'stamp stamp-reuse' : tone === 'warn' ? 'stamp stamp-warn' : tone === 'void' ? 'stamp stamp-void' : 'stamp';
  return (
    <span className={cls} role="img" aria-label={`${authority}: ${label}${validUntil ? `, ${t('until')} ${f.date(validUntil)}` : ''}`}>
      <span>{authority}</span>
      <small>{label}</small>
      {validUntil && <small>{tone === 'void' ? note ?? t('expired') : `${t('until')} ${f.date(validUntil)}`}</small>}
      {!validUntil && note && <small>{note}</small>}
    </span>
  );
}
