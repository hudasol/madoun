import { wilson } from './stats';
import type { EvidenceType, Outcome } from './types';

export interface FactorStat {
  key: string;
  interventions: number;
  confirmed: number;
  falseAlarms: number;
  hitRate: number;
  /** 95% Wilson interval for hitRate. Wide means the sample is too small to say much. */
  lo: number;
  hi: number;
}

export interface MissingEvidenceStat {
  forwarderId: string;
  type: EvidenceType;
  count: number;
  totalShipments: number;
}

export interface Suggestion {
  id: string;
  kind: 'lower-weight' | 'raise-weight' | 'pre-check-forwarder';
  key: string;
  multiplier?: number;
  forwarderId?: string;
  evidenceType?: EvidenceType;
  rationale: string;
  rationaleAr: string;
  /**
   * How firmly the data supports the suggestion. 'strong' only when the whole 95% interval of the hit
   * rate sits on the suggested side of the decision threshold; otherwise 'weak': the plausible range
   * still includes the other side, so more outcomes are needed before the change is well founded.
   */
  evidence?: { strength: 'strong' | 'weak'; hits: number; n: number; lo: number; hi: number };
}

/** The unbiased base rate from random audits of green traffic (the only sample not chosen by a rule). */
export interface AuditBaseline {
  n: number;
  confirmed: number;
  rate: number;
  lo: number;
  hi: number;
}

export interface LearningReport {
  factors: FactorStat[];
  missingEvidence: MissingEvidenceStat[];
  suggestions: Suggestion[];
  falseInterventionRate: number;
  interventions: number;
  /**
   * Outcomes only exist for shipments something chose to check, so factor hit rates describe a
   * selected sample, not all traffic. This is the random-audit sample that anchors them.
   */
  audit: AuditBaseline;
  /** Of the shipments that were checked, how many came from each sampling route. */
  sampling: { risk: number; randomAudit: number; historyAudit: number };
}

const MIN_CASES_LOWER = 12;
const MIN_CASES_RAISE = 10;
const LOWER_BELOW = 0.15;
const RAISE_AT_OR_ABOVE = 0.6;

/**
 * Turns recorded outcomes into counted statistics and human-reviewable suggestions.
 * Nothing is applied automatically: an officer approves a suggestion through an event.
 */
export function computeLearning(outcomes: Outcome[], approvedKeys: Record<string, number> = {}): LearningReport {
  const stats = new Map<string, FactorStat>();
  let interventions = 0;
  let falseInterventions = 0;

  const sampling = { risk: 0, randomAudit: 0, historyAudit: 0 };
  let auditN = 0;
  let auditHits = 0;
  for (const o of outcomes) {
    if (o.result === 'not-inspected') continue;
    if (o.sampling === 'random-audit') {
      sampling.randomAudit++;
      auditN++;
      if (o.result === 'confirmed') auditHits++;
      continue; // audited green traffic is a sample of the base rate, not an intervention the rules caused
    }
    if (o.sampling === 'history-audit') {
      sampling.historyAudit++;
      continue;
    }
    sampling.risk++;
    interventions++;
    if (o.result === 'false-alarm') falseInterventions++;
    for (const k of new Set(o.triggerKeys)) {
      const s = stats.get(k) ?? { key: k, interventions: 0, confirmed: 0, falseAlarms: 0, hitRate: 0, lo: 0, hi: 1 };
      s.interventions++;
      if (o.result === 'confirmed') s.confirmed++;
      else s.falseAlarms++;
      stats.set(k, s);
    }
  }
  const factors = [...stats.values()]
    .map((s) => {
      const ci = wilson(s.confirmed, s.interventions);
      return { ...s, hitRate: s.interventions ? s.confirmed / s.interventions : 0, lo: ci.lo, hi: ci.hi };
    })
    .sort((a, b) => b.interventions - a.interventions);

  // Recurring missing evidence per forwarder.
  const perForwarder = new Map<string, number>();
  const missing = new Map<string, MissingEvidenceStat>();
  for (const o of outcomes) {
    perForwarder.set(o.forwarderId, (perForwarder.get(o.forwarderId) ?? 0) + 1);
    for (const t of o.missingEvidence) {
      const k = `${o.forwarderId}|${t}`;
      const m = missing.get(k) ?? { forwarderId: o.forwarderId, type: t, count: 0, totalShipments: 0 };
      m.count++;
      missing.set(k, m);
    }
  }
  const missingEvidence = [...missing.values()]
    .map((m) => ({ ...m, totalShipments: perForwarder.get(m.forwarderId) ?? m.count }))
    .sort((a, b) => b.count - a.count);

  const suggestions: Suggestion[] = [];
  for (const f of factors) {
    if (approvedKeys[f.key] !== undefined) continue;
    if (f.interventions >= MIN_CASES_LOWER && f.hitRate < LOWER_BELOW) {
      suggestions.push({
        id: `lower:${f.key}`,
        kind: 'lower-weight',
        key: f.key,
        multiplier: 0.6,
        evidence: { strength: f.hi < LOWER_BELOW ? 'strong' : 'weak', hits: f.confirmed, n: f.interventions, lo: f.lo, hi: f.hi },
        rationale: `"${f.key}" triggered ${f.interventions} interventions and only ${f.confirmed} were confirmed (${Math.round(f.hitRate * 100)}%). Consider lowering its weight by 40%.`,
        rationaleAr: `"${f.key}" أدى إلى ${f.interventions} تدخلاً وتأكد منها ${f.confirmed} فقط (${Math.round(f.hitRate * 100)}٪). يُقترح خفض وزنه 40٪.`,
      });
    } else if (f.interventions >= MIN_CASES_RAISE && f.hitRate >= RAISE_AT_OR_ABOVE) {
      suggestions.push({
        id: `raise:${f.key}`,
        kind: 'raise-weight',
        key: f.key,
        multiplier: 1.25,
        evidence: { strength: f.lo >= RAISE_AT_OR_ABOVE ? 'strong' : 'weak', hits: f.confirmed, n: f.interventions, lo: f.lo, hi: f.hi },
        rationale: `"${f.key}" was confirmed in ${f.confirmed} of ${f.interventions} interventions (${Math.round(f.hitRate * 100)}%). Consider raising its weight by 25%.`,
        rationaleAr: `"${f.key}" تأكد في ${f.confirmed} من ${f.interventions} تدخلاً (${Math.round(f.hitRate * 100)}٪). يُقترح رفع وزنه 25٪.`,
      });
    }
  }
  for (const m of missingEvidence) {
    if (m.count >= 4 && m.count / Math.max(1, m.totalShipments) >= 0.3) {
      suggestions.push({
        id: `precheck:${m.forwarderId}:${m.type}`,
        kind: 'pre-check-forwarder',
        key: `missing:${m.type}`,
        forwarderId: m.forwarderId,
        evidenceType: m.type,
        rationale: `Forwarder ${m.forwarderId} omitted "${m.type}" on ${m.count} of ${m.totalShipments} shipments. Add an automatic pre-submission check for this forwarder.`,
        rationaleAr: `الوكيل ${m.forwarderId} أغفل "${m.type}" في ${m.count} من ${m.totalShipments} شحنات. يُقترح فحص مسبق تلقائي لهذا الوكيل.`,
      });
    }
  }

  return {
    factors,
    missingEvidence,
    suggestions,
    falseInterventionRate: interventions ? falseInterventions / interventions : 0,
    interventions,
    audit: { n: auditN, confirmed: auditHits, rate: auditN ? auditHits / auditN : 0, ...wilson(auditHits, auditN) },
    sampling,
  };
}
