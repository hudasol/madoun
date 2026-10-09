'use client';

import type { Lane } from '@/engine';
import { useT } from '@/lib/i18n';

const T = {
  en: { green: 'Green', amber: 'Amber', red: 'Red', greenHint: 'Clears before arrival', amberHint: 'Targeted checks', redHint: 'Physical inspection' },
  ar: { green: 'أخضر', amber: 'كهرماني', red: 'أحمر', greenHint: 'إفراج قبل الوصول', amberHint: 'فحوصات موجهة', redHint: 'فحص مادي' },
};

const COLOR: Record<Lane, string> = { green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)' };

/** Colour is never the only signal: the lane name is always written, and each lane has its own shape. */
export function LaneBadge({ lane, withHint = false, size = 'md' }: { lane: Lane; withHint?: boolean; size?: 'sm' | 'md' }) {
  const t = useT(T);
  const c = COLOR[lane];
  const d = size === 'sm' ? 9 : 11;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap" style={{ color: c }}>
      <svg width={d} height={d} viewBox="0 0 10 10" aria-hidden="true">
        {lane === 'green' && <circle cx="5" cy="5" r="4.5" fill="currentColor" />}
        {lane === 'amber' && <path d="M5 .5 9.5 9H.5z" fill="currentColor" />}
        {lane === 'red' && <rect x=".5" y=".5" width="9" height="9" fill="currentColor" />}
      </svg>
      <span className="font-medium">{t(lane)}</span>
      {withHint && <span className="text-muted font-normal">{t(`${lane}Hint` as 'greenHint')}</span>}
    </span>
  );
}

export const LANE_COLOR = COLOR;
