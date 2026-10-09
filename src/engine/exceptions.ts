import type { Directory } from './directory';
import { planShipment } from './plan';
import { hoursBetween } from './time';
import type { ExceptionItem, ShipmentFile, World } from './types';

export const ESCALATE_EVERY_HOURS = 12;
const SUPPRESS_AFTER_RESOLVE_HOURS = 12;

function make(
  f: ShipmentFile,
  kind: ExceptionItem['kind'],
  ownerId: string,
  since: string,
  now: string,
  detail: string,
  detailAr: string,
  requirementId?: string,
  authorityId?: string,
): ExceptionItem {
  const clock = Math.max(0, hoursBetween(since, now));
  return {
    id: `${f.shipment.id}:${kind}:${requirementId ?? ''}`,
    shipmentId: f.shipment.id,
    kind,
    requirementId,
    authorityId,
    ownerId,
    openedAt: since,
    clockHours: Math.round(clock * 10) / 10,
    escalationLevel: Math.floor(clock / ESCALATE_EVERY_HOURS),
    state: 'open',
    detail,
    detailAr,
  };
}

/**
 * Derives open exceptions from the current world. Nothing here is stored: it is a view,
 * so exceptions disappear when their cause is fixed. Every exception has a named owner.
 */
export function detectExceptions(world: World, dir: Directory, now: string): ExceptionItem[] {
  const out: ExceptionItem[] = [];

  for (const f of Object.values(world.shipments)) {
    if (f.cleared) continue;
    const plan = planShipment(world, dir, f.shipment, now);
    const doneAt = (reqId: string) => f.reviews[reqId]?.completedAt;
    const recentlyResolved = (id: string) =>
      f.exceptions.some(
        (e) => e.id === id && e.state === 'resolved' && e.resolvedAt && hoursBetween(e.resolvedAt, now) < SUPPRESS_AFTER_RESOLVE_HOURS,
      );

    for (const rv of plan.reviewPlan.reviews) {
      const req = dir.requirementById[rv.requirementId];
      const auth = dir.authorities[rv.authorityId];
      const state = f.reviews[rv.requirementId];
      if (state?.completedAt) continue;

      // Missing evidence
      if (rv.verdict === 'missing') {
        const e = make(f, 'missing-evidence', auth.dutyOfficer, f.registeredAt, now,
          `${req.label}: required document not submitted`, `${req.labelAr}: لم يتم تقديم المستند المطلوب`, req.id, auth.id);
        if (!recentlyResolved(e.id)) out.push(e);
      }

      // Expiring evidence
      if (rv.verdict === 'expires-before-eta') {
        const e = make(f, 'evidence-expiring', auth.dutyOfficer, f.registeredAt, now,
          `${req.label}: receipt expires before arrival`, `${req.labelAr}: ينتهي الإيصال قبل الوصول`, req.id, auth.id);
        if (!recentlyResolved(e.id)) out.push(e);
      }

      // Ready to start? All dependencies complete.
      const depsDone = rv.dependsOn.every((d) => doneAt(d) || plan.reviewPlan.reviews.find((x) => x.requirementId === d)?.mode === 'no-action');
      if (!depsDone) continue;
      const readyAt = rv.dependsOn.reduce<string>(
        (acc, d) => {
          const t = doneAt(d);
          return t && t > acc ? t : acc;
        },
        f.registeredAt,
      );

      if (!state?.startedAt && rv.mode !== 'no-action' && rv.verdict !== 'missing') {
        const waited = hoursBetween(readyAt, now);
        if (waited > auth.queueWaitHours) {
          const e = make(f, 'unowned-handoff', auth.dutyOfficer, readyAt, now,
            `${req.label}: ready for ${auth.name} but nobody has started it`, `${req.labelAr}: جاهز لدى ${auth.nameAr} ولم يبدأ أحد`, req.id, auth.id);
          if (!recentlyResolved(e.id)) out.push(e);
        }
      } else if (state?.startedAt && !state.completedAt) {
        const elapsed = hoursBetween(state.startedAt, now);
        if (elapsed > auth.slaHours) {
          const e = make(f, 'idle-review', state.startedBy ?? auth.dutyOfficer, state.startedAt, now,
            `${req.label}: review open ${Math.round(elapsed)}h, past the ${auth.slaHours}h commitment`, `${req.labelAr}: المراجعة مفتوحة ${Math.round(elapsed)} ساعة وتجاوزت ${auth.slaHours} ساعة`, req.id, auth.id);
          if (!recentlyResolved(e.id)) out.push(e);
        }
      }
    }

    if (plan.assessment.conflicts.length > 0 && !f.override) {
      const e = make(f, 'authority-conflict', 'adc:duty', plan.assessment.assessedAt, now,
        'Authorities disagree on the lane for this shipment', 'الجهات غير متفقة على مسار هذه الشحنة');
      if (!recentlyResolved(e.id)) out.push(e);
    }
  }

  return out.sort((a, b) => b.escalationLevel - a.escalationLevel || b.clockHours - a.clockHours);
}
