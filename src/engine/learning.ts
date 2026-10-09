import type { EvidenceType, Outcome } from './types';

export interface FactorStat {
  key: string;
  interventions: number;
  confirmed: number;
  falseAlarms: number;
  hitRate: number;
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
}

export interface LearningReport {
  factors: FactorStat[];
  missingEvidence: MissingEvidenceStat[];
  suggestions: Suggestion[];
  falseInterventionRate: number;
  interventions: number;
}

const MIN_CASES_LOWER = 12;
const MIN_CASES_RAISE = 10;

/**
 * Turns recorded outcomes into counted statistics and human-reviewable suggestions.
 * Nothing is applied automatically: an officer approves a suggestion through an event.
 */
export function computeLearning(outcomes: Outcome[], approvedKeys: Record<string, number> = {}): LearningReport {
  const stats = new Map<string, FactorStat>();
  let interventions = 0;
  let falseInterventions = 0;

  for (const o of outcomes) {
    if (o.result === 'not-inspected') continue;
    interventions++;
    if (o.result === 'false-alarm') falseInterventions++;
    for (const k of new Set(o.triggerKeys)) {
      const s = stats.get(k) ?? { key: k, interventions: 0, confirmed: 0, falseAlarms: 0, hitRate: 0 };
      s.interventions++;
      if (o.result === 'confirmed') s.confirmed++;
      else s.falseAlarms++;
      stats.set(k, s);
    }
  }
  const factors = [...stats.values()]
    .map((s) => ({ ...s, hitRate: s.interventions ? s.confirmed / s.interventions : 0 }))
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
    if (f.interventions >= MIN_CASES_LOWER && f.hitRate < 0.15) {
      suggestions.push({
        id: `lower:${f.key}`,
        kind: 'lower-weight',
        key: f.key,
        multiplier: 0.6,
        rationale: `"${f.key}" triggered ${f.interventions} interventions and only ${f.confirmed} were confirmed (${Math.round(f.hitRate * 100)}%). Consider lowering its weight by 40%.`,
        rationaleAr: `"${f.key}" أدى إلى ${f.interventions} تدخلاً وتأكد منها ${f.confirmed} فقط (${Math.round(f.hitRate * 100)}٪). يُقترح خفض وزنه 40٪.`,
      });
    } else if (f.interventions >= MIN_CASES_RAISE && f.hitRate >= 0.6) {
      suggestions.push({
        id: `raise:${f.key}`,
        kind: 'raise-weight',
        key: f.key,
        multiplier: 1.25,
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
  };
}
