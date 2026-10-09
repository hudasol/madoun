import { round1 } from './time';
import type {
  Authority,
  EvidenceCheck,
  PlannedReview,
  Requirement,
  RequirementInstance,
  ReviewMode,
  ReviewPlan,
} from './types';

interface PlanInput {
  instances: RequirementInstance[];
  checks: EvidenceCheck[];
  requirements: Record<string, Requirement>;
  authorities: Record<string, Authority>;
  /** Requirement ids already completed on this file (cost nothing more). */
  completed?: Set<string>;
}

function modeFor(verdict: EvidenceCheck['verdict']): ReviewMode {
  switch (verdict) {
    case 'satisfied-own':
      return 'no-action';
    case 'satisfied-reuse':
    case 'expires-before-eta':
      return 'accept-receipt';
    default:
      return 'full-review';
  }
}

/** Resolve '*regulators' and drop dependencies that do not apply to this shipment. */
function resolveDeps(
  req: Requirement,
  present: Map<string, RequirementInstance>,
  authorities: Record<string, Authority>,
  requirements: Record<string, Requirement>,
): string[] {
  const out: string[] = [];
  for (const d of req.dependsOn) {
    if (d === '*regulators') {
      for (const [id, inst] of present) {
        if (authorities[inst.authorityId]?.role === 'regulator') out.push(id);
      }
    } else if (d === '*blocking') {
      for (const [id] of present) {
        if (id !== req.id && requirements[id]?.blocksRelease && !requirements[id].dependsOn.includes('*blocking')) out.push(id);
      }
    } else if (present.has(d)) {
      out.push(d);
    }
  }
  return out;
}

/**
 * Builds the parallel schedule (Madoun) and the sequential baseline (today).
 *
 * Assumptions, stated so they can be challenged:
 *  - Today: every review waits in its authority's queue, runs one after another in a fixed order
 *    (customs documents, regulators in turn, customs release, terminal), and each regulator
 *    re-checks shared documents (duplicateCheckHours).
 *  - Madoun: reviews whose dependencies are met start together; trusted receipts are accepted
 *    instead of re-reviewed; shared documents are not re-checked. Queue waits for full reviews
 *    are NOT reduced: savings come from parallelism, reuse and removed duplicates only.
 */
export function buildReviewPlan(input: PlanInput): ReviewPlan {
  const { instances, checks, requirements, authorities, completed = new Set() } = input;
  const present = new Map(instances.map((i) => [i.requirementId, i]));
  const checkById = new Map(checks.map((c) => [c.requirementId, c]));

  const nodes = new Map<string, PlannedReview>();
  for (const inst of instances) {
    const req = requirements[inst.requirementId];
    const check = checkById.get(inst.requirementId)!;
    const done = completed.has(inst.requirementId);
    let mode: ReviewMode = done ? 'no-action' : modeFor(check.verdict);
    const relied = (req.relyOn ?? []).filter((id) => present.has(id));
    const deps = resolveDeps(req, present, authorities, requirements);
    if (mode === 'full-review' && relied.length > 0 && !done) {
      // Rely on another authority's verification in this same file instead of repeating it.
      mode = 'accept-receipt';
      for (const id of relied) if (!deps.includes(id)) deps.push(id);
    }
    const hours = mode === 'full-review' ? req.reviewHours : mode === 'accept-receipt' ? req.acceptHours : 0;
    nodes.set(inst.requirementId, {
      requirementId: inst.requirementId,
      authorityId: inst.authorityId,
      dependsOn: deps,
      reliesOn: relied.length ? relied : undefined,
      mode,
      hours,
      layer: 0,
      startHour: 0,
      endHour: 0,
      onCriticalPath: false,
      blocksRelease: req.blocksRelease,
      verdict: done ? 'satisfied-own' : check.verdict,
    });
  }

  // Topological scheduling with cycle protection.
  const visiting = new Set<string>();
  const done = new Set<string>();
  const schedule = (id: string): void => {
    if (done.has(id)) return;
    if (visiting.has(id)) throw new Error(`Dependency cycle at ${id}`);
    visiting.add(id);
    const n = nodes.get(id)!;
    let start = 0;
    let layer = 0;
    for (const d of n.dependsOn) {
      schedule(d);
      const dn = nodes.get(d)!;
      start = Math.max(start, dn.endHour);
      layer = Math.max(layer, dn.layer + 1);
    }
    const auth = authorities[n.authorityId];
    const wait = n.mode === 'full-review' ? auth.queueWaitHours : n.mode === 'accept-receipt' ? auth.queueWaitHours * 0.25 : 0;
    n.layer = layer;
    n.startHour = start;
    n.endHour = start + wait + n.hours;
    visiting.delete(id);
    done.add(id);
  };
  for (const id of nodes.keys()) schedule(id);

  const reviews = [...nodes.values()].sort((a, b) => a.layer - b.layer || a.startHour - b.startHour);

  // Critical path: trace back from the latest-ending blocking review.
  const blocking = reviews.filter((r) => r.blocksRelease);
  const last = blocking.reduce<PlannedReview | undefined>((acc, r) => (!acc || r.endHour > acc.endHour ? r : acc), undefined);
  const criticalPath: string[] = [];
  let cursor = last;
  while (cursor) {
    cursor.onCriticalPath = true;
    criticalPath.unshift(cursor.requirementId);
    const deps = cursor.dependsOn.map((d) => nodes.get(d)!);
    cursor = deps.reduce<PlannedReview | undefined>((acc, r) => (!acc || r.endHour > acc.endHour ? r : acc), undefined);
  }

  const layers: string[][] = [];
  for (const r of reviews) (layers[r.layer] ??= []).push(r.requirementId);

  const parallelHours = last ? last.endHour : 0;

  // Sequential baseline (today): full queue wait + full review + duplicate re-checks for every blocking item.
  let sequential = 0;
  for (const inst of instances) {
    const req = requirements[inst.requirementId];
    if (!req.blocksRelease) continue;
    // Approvals an authority already holds for itself cost nothing today either.
    if (checkById.get(inst.requirementId)?.verdict === 'satisfied-own') continue;
    const auth = authorities[inst.authorityId];
    sequential += auth.queueWaitHours + req.reviewHours + req.duplicateCheckHours;
  }

  let duplicateChecksAvoided = 0;
  let reused = 0;
  for (const r of reviews) {
    const req = requirements[r.requirementId];
    if (req.duplicateCheckHours > 0 && r.verdict !== 'satisfied-own') duplicateChecksAvoided++;
    if (r.mode === 'accept-receipt' && req.evidenceTypes.length > 0) reused++;
  }

  return {
    reviews,
    layers,
    criticalPath,
    sequentialHours: round1(sequential),
    parallelHours: round1(parallelHours),
    hoursSaved: round1(Math.max(0, sequential - parallelHours)),
    duplicateChecksAvoided: duplicateChecksAvoided + reused,
  };
}
