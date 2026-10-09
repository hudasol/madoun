import { sha256Hex } from './hash';
import {
  CUSTOMS_CATEGORY_POINTS,
  LANE_THRESHOLDS,
  REFERENCE_UNIT_VALUE,
  REGULATOR_FLAG_POINTS,
  VALUE_BANDS,
} from '@/data/risk';
import type {
  Authority,
  AuthorityRisk,
  EvidenceCheck,
  Lane,
  LaneConflict,
  RequirementInstance,
  RiskAssessment,
  RiskSignal,
  Shipment,
  Trader,
} from './types';
import { allItems } from './types';

const CATEGORY_AR: Record<string, string> = {
  food: 'الأغذية', electronics: 'الإلكترونيات', wireless: 'الأجهزة اللاسلكية', pharma: 'الأدوية', 'medical-device': 'الأجهزة الطبية',
  chemicals: 'المواد الكيميائية', textiles: 'المنسوجات', machinery: 'الآلات', cosmetics: 'مستحضرات التجميل', general: 'البضائع العامة',
};

/** Arabic country name for an ISO 3166-1 alpha-2 code; falls back to the code when the runtime has no Arabic region data. */
function countryAr(code: string): string {
  try {
    return new Intl.DisplayNames('ar', { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

export interface RiskContext {
  trader: Trader;
  /** Origins this trader has shipped from before. */
  knownOrigins: string[];
  instances: RequirementInstance[];
  checks: EvidenceCheck[];
  authorities: Record<string, Authority>;
  /** Approved multipliers per signal key (from the learning loop). */
  weightOverrides: Record<string, number>;
  now: string;
}

const LANE_ORDER: Record<Lane, number> = { green: 0, amber: 1, red: 2 };

export function laneFromScore(score: number): Lane {
  if (score >= LANE_THRESHOLDS.red) return 'red';
  if (score >= LANE_THRESHOLDS.amber) return 'amber';
  return 'green';
}

function maxLane(a: Lane, b: Lane): Lane {
  return LANE_ORDER[a] >= LANE_ORDER[b] ? a : b;
}

function sig(
  authorityId: string,
  factor: RiskSignal['factor'],
  key: string,
  points: number,
  reason: string,
  reasonAr: string,
  overrides: Record<string, number>,
): RiskSignal {
  const mult = overrides[key] ?? 1;
  return { authorityId, factor, key, points: Math.round(points * mult * 10) / 10, reason, reasonAr };
}

/** Deterministic random selection (TFA 7.4 allows random selection): about 1 in 20 green shipments. */
export function isRandomAudit(shipmentId: string): boolean {
  return parseInt(sha256Hex('audit:' + shipmentId).slice(0, 4), 16) % 20 === 0;
}

export function assessRisk(shipment: Shipment, ctx: RiskContext): RiskAssessment {
  const items = allItems(shipment);
  const o = ctx.weightOverrides;
  const signals: RiskSignal[] = [];
  const trader = ctx.trader;

  /* ---------- Customs ---------- */
  const catSeen = new Set<string>();
  for (const it of items) {
    if (catSeen.has(it.category)) continue;
    catSeen.add(it.category);
    const pts = CUSTOMS_CATEGORY_POINTS[it.category];
    if (pts > 0)
      signals.push(
        sig('adc', 'goods-category', `goods-category:${it.category}`, pts,
          `Goods category "${it.category}" is subject to heightened customs controls`,
          `فئة البضائع "${CATEGORY_AR[it.category] ?? it.category}" تخضع لضوابط جمركية مشددة`, o),
      );
  }

  for (const it of items) {
    const ref = REFERENCE_UNIT_VALUE[it.category];
    const unit = it.value / Math.max(1, it.quantity);
    const ratio = unit / ref;
    if (ratio < VALUE_BANDS.under) {
      signals.push(
        sig('adc', 'value', 'value:undervalued', 18,
          `Declared unit value is ${Math.round(ratio * 100)}% of the reference for "${it.description}"`,
          `القيمة المصرح بها للوحدة ${Math.round(ratio * 100)}٪ من المرجع لـ "${it.descriptionAr ?? it.description}"`, o),
      );
      break;
    }
    if (ratio > VALUE_BANDS.over) {
      signals.push(
        sig('adc', 'value', 'value:overvalued', 8,
          `Declared unit value is ${ratio.toFixed(1)}× the reference for "${it.description}"`,
          `القيمة المصرح بها للوحدة ${ratio.toFixed(1)} ضعف المرجع لـ "${it.descriptionAr ?? it.description}"`, o),
      );
      break;
    }
  }

  if (trader.complianceScore < 60)
    signals.push(sig('adc', 'trader-history', 'trader-history:low', 16, `Trader compliance score is low (${trader.complianceScore}/100)`, `درجة امتثال المستورد منخفضة (${trader.complianceScore}/100)`, o));
  else if (trader.complianceScore < 80)
    signals.push(sig('adc', 'trader-history', 'trader-history:medium', 6, `Trader compliance score is moderate (${trader.complianceScore}/100)`, `درجة امتثال المستورد متوسطة (${trader.complianceScore}/100)`, o));

  if (trader.pastFindings >= 3)
    signals.push(sig('adc', 'prior-findings', 'prior-findings:many', 12, `${trader.pastFindings} confirmed findings in the last 24 months`, `${trader.pastFindings} مخالفات مؤكدة خلال 24 شهراً`, o));
  else if (trader.pastFindings >= 1)
    signals.push(sig('adc', 'prior-findings', 'prior-findings:some', 5, `${trader.pastFindings} confirmed finding(s) in the last 24 months`, `${trader.pastFindings} مخالفة مؤكدة خلال 24 شهراً`, o));

  if (trader.aeo) {
    signals.push(sig('adc', 'authorised-operator', 'authorised-operator', -15, 'Authorised operator: verified supply-chain and compliance record', 'مشغل معتمد: سجل امتثال وسلسلة إمداد موثقة', o));
    for (const a of Object.values(ctx.authorities))
      if (a.role === 'regulator')
        signals.push(sig(a.id, 'authorised-operator', 'authorised-operator', -8, 'Authorised operator status shared by customs', 'صفة المشغل المعتمد مشتركة من الجمارك', o));
  }

  const newOrigins = [...new Set(items.map((i) => i.origin))].filter((c) => !ctx.knownOrigins.includes(c));
  if (newOrigins.length)
    signals.push(sig('adc', 'origin', 'origin:first-time', 5, `First shipment from ${newOrigins.join(', ')} for this trader`, `أول شحنة من ${newOrigins.map(countryAr).join('، ')} لهذا المستورد`, o));

  if (shipment.mode === 'land')
    signals.push(sig('adc', 'transport-mode', 'transport-mode:land', 3, 'Road consignment: fewer pre-arrival data points', 'شحنة برية: بيانات مسبقة أقل', o));

  /* ---------- Regulators: own-domain flags and trader history ---------- */
  const flagSeen = new Set<string>();
  for (const it of items) {
    for (const f of it.flags) {
      const rule = REGULATOR_FLAG_POINTS[f];
      if (!rule || flagSeen.has(f)) continue;
      flagSeen.add(f);
      signals.push(sig(rule.authorityId, 'goods-category', `goods-category:${f}`, rule.points, rule.reason, rule.reasonAr, o));
    }
  }
  const activeRegulators = new Set(ctx.instances.map((i) => i.authorityId).filter((id) => ctx.authorities[id]?.role === 'regulator'));
  for (const aid of activeRegulators) {
    if (trader.complianceScore < 60)
      signals.push(sig(aid, 'trader-history', 'trader-history:low', 8, `Trader compliance score is low (${trader.complianceScore}/100)`, `درجة امتثال المستورد منخفضة (${trader.complianceScore}/100)`, o));
    if (trader.pastFindings >= 3)
      signals.push(sig(aid, 'prior-findings', 'prior-findings:many', 6, `${trader.pastFindings} confirmed findings in the last 24 months`, `${trader.pastFindings} مخالفات مؤكدة خلال 24 شهراً`, o));
  }

  /* ---------- Documentation completeness (per owning authority) ---------- */
  for (const c of ctx.checks) {
    const inst = ctx.instances.find((i) => i.requirementId === c.requirementId);
    if (!inst) continue;
    const pts = c.verdict === 'missing' ? 12 : c.verdict === 'expired' || c.verdict === 'revoked' ? 10 : c.verdict === 'scope-partial' || c.verdict === 'not-shared' ? 6 : 0;
    if (pts)
      signals.push(sig(inst.authorityId, 'documentation-completeness', `documentation-completeness:${c.verdict}`, pts, c.reason, c.reasonAr, o));
  }

  /* ---------- Combine ---------- */
  const authorityIds = new Set<string>(['adc', ...activeRegulators]);
  const perAuthority: AuthorityRisk[] = [...authorityIds].map((aid) => {
    const mine = signals.filter((s) => s.authorityId === aid);
    const score = Math.max(0, Math.round(mine.reduce((a, s) => a + s.points, 0) * 10) / 10);
    return { authorityId: aid, score, lane: laneFromScore(score), signals: mine };
  });

  const lane = perAuthority.reduce<Lane>((acc, a) => maxLane(acc, a.lane), 'green');

  const conflicts: LaneConflict[] = [];
  const reds = perAuthority.filter((a) => a.lane === 'red');
  const greens = perAuthority.filter((a) => a.lane === 'green');
  if (reds.length && greens.length) {
    conflicts.push({
      authorities: [...reds, ...greens].map((a) => a.authorityId),
      lanes: [...reds, ...greens].map((a) => a.lane),
      rule: 'Highest lane applies, but the extra checks stay with the authority that raised them. Other authorities continue in parallel.',
      ruleAr: 'تسري أعلى مسار، لكن الفحوصات الإضافية تبقى مع الجهة التي طلبتها. تستمر الجهات الأخرى بالتوازي.',
    });
  }

  const reasons = perAuthority
    .flatMap((a) => a.signals.map((s) => ({ text: s.reason, textAr: s.reasonAr, points: s.points, authorityId: a.authorityId })))
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
    .slice(0, 8);

  const recommendedChecks: RiskAssessment['recommendedChecks'] = [];
  const addCheck = (authorityId: string, text: string, textAr: string) => {
    if (!recommendedChecks.some((c) => c.authorityId === authorityId && c.text === text)) recommendedChecks.push({ authorityId, text, textAr });
  };
  for (const a of perAuthority) {
    if (a.lane === 'green') continue;
    for (const s of a.signals) {
      if (s.points <= 0) continue;
      if (s.key === 'value:undervalued') addCheck(a.authorityId, 'Verify declared value against the invoice and a market reference', 'التحقق من القيمة المصرح بها مقابل الفاتورة ومرجع السوق');
      else if (s.key === 'value:overvalued') addCheck(a.authorityId, 'Confirm the invoice value and any related-party pricing', 'تأكيد قيمة الفاتورة وأي تسعير بين أطراف ذات صلة');
      else if (s.key === 'goods-category:high-risk-food') addCheck(a.authorityId, 'Take a sample for laboratory testing', 'أخذ عينة للفحص المخبري');
      else if (s.key === 'goods-category:hazardous') addCheck(a.authorityId, 'Check the safety data sheet against container labelling', 'مطابقة بيانات السلامة مع ملصقات الحاوية');
      else if (s.key === 'goods-category:controlled') addCheck(a.authorityId, 'Verify permit quantity against the load', 'مطابقة كمية التصريح مع الحمولة');
      else if (s.key === 'goods-category:cold-chain') addCheck(a.authorityId, 'Review the temperature log before release', 'مراجعة سجل الحرارة قبل الإفراج');
      else if (s.key === 'origin:first-time') addCheck(a.authorityId, 'Confirm supplier and origin documents', 'تأكيد مستندات المورد والمنشأ');
      else if (s.factor === 'documentation-completeness') addCheck(a.authorityId, 'Obtain the missing or renewed document before arrival', 'الحصول على المستند الناقص أو المجدد قبل الوصول');
      else if (s.factor === 'trader-history' || s.factor === 'prior-findings') addCheck(a.authorityId, 'Compare the load with the declaration (targeted check)', 'مقارنة الحمولة بالبيان (فحص موجه)');
    }
    if (a.lane === 'red') addCheck(a.authorityId, 'Physical inspection of the consignment', 'فحص مادي للشحنة');
  }

  const auditFlag = lane === 'green' && (trader.pastFindings > 0 || isRandomAudit(shipment.id));

  return {
    shipmentId: shipment.id,
    lane,
    perAuthority,
    conflicts,
    reasons,
    recommendedChecks,
    pathway: lane === 'green' ? 'pre-arrival-release' : lane === 'amber' ? 'targeted-checks' : 'physical-inspection',
    auditFlag,
    assessedAt: ctx.now,
  };
}
