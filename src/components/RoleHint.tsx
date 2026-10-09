'use client';

import { useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import type { Action } from '@/lib/roles';
import { useLabels } from '@/components/boards/labels';

const T = {
  en: {
    'override-lane': 'Only customs officers can change a lane.',
    'resolve-exception': 'Only customs, or the authority that owns this item, can resolve it.',
    'run-inspection': 'Only customs officers can request an inspection.',
    'approve-suggestion': 'Only customs officers can approve a rule change.',
    as: 'You are viewing as {who}.',
  },
  ar: {
    'override-lane': 'يمكن لضباط الجمارك فقط تغيير المسار.',
    'resolve-exception': 'يمكن للجمارك أو للجهة المسؤولة عن البند فقط حلّه.',
    'run-inspection': 'يمكن لضباط الجمارك فقط طلب الفحص.',
    'approve-suggestion': 'يمكن لضباط الجمارك فقط اعتماد تغيير القاعدة.',
    as: 'أنت تعرض بصفة {who}.',
  },
};

/** Explains why an action is unavailable for the current role. Renders nothing when the action is allowed. */
export function RoleHint({ action, authorityId, className = '' }: { action: Action; authorityId?: string; className?: string }) {
  const t = useT(T);
  const s = useStore();
  const L = useLabels();
  if (s.can(action, authorityId)) return null;
  return (
    <p className={`text-sm text-muted ${className}`} role="note">
      {t(action)} {t('as', { who: L.role(s.viewAs) })}
    </p>
  );
}
