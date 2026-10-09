import type { EvidenceReceipt } from '@/engine';

/**
 * Demo role lens. This is NOT access control: the browser holds the whole synthetic world.
 * It shows the permissions model a real deployment would enforce on the server:
 * who may act, and which evidence a role may see under each receipt's sharing policy.
 */
export type ViewAs = 'customs' | 'auditor' | 'operator' | `reg:${string}`;
export type Action = 'override-lane' | 'resolve-exception' | 'run-inspection' | 'approve-suggestion';

export const DEFAULT_VIEW_AS: ViewAs = 'customs';
export const CUSTOMS_ID = 'adc';

export function parseViewAs(v: string | null | undefined): ViewAs {
  if (v === 'customs' || v === 'auditor' || v === 'operator') return v;
  if (v && /^reg:[a-z0-9-]+$/.test(v)) return v as ViewAs;
  return DEFAULT_VIEW_AS;
}

export function authorityOf(v: ViewAs): string | undefined {
  if (v === 'customs') return CUSTOMS_ID;
  if (v.startsWith('reg:')) return v.slice(4);
  return undefined;
}

/** Who may do what. A regulator may only resolve exceptions that belong to its own authority. */
export function can(v: ViewAs, action: Action, authorityId?: string): boolean {
  if (v === 'customs') return true;
  if (v.startsWith('reg:')) return action === 'resolve-exception' && !!authorityId && authorityId === authorityOf(v);
  return false;
}

/** Evidence visibility follows the custodian's sharing policy; auditors see all (post-clearance audit, TFA 7.5). */
export function canSeeReceipt(v: ViewAs, r: Pick<EvidenceReceipt, 'verifiedBy' | 'sharedWith'>): boolean {
  if (v === 'auditor') return true;
  if (v === 'operator') return false;
  const a = authorityOf(v);
  if (!a) return false;
  return r.verifiedBy === a || r.sharedWith === 'all' || r.sharedWith.includes(a);
}

export function actorId(v: ViewAs): string {
  const a = authorityOf(v);
  return a ? `${a}:officer-you` : v === 'auditor' ? 'auditor:you' : 'operator:you';
}
