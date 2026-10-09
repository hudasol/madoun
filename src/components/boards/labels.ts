'use client';

import { useCallback } from 'react';
import type { EvidenceMethod, EvidenceType, ExceptionKind } from '@/engine';
import { useBi, useLocale } from '@/lib/i18n';
import { useStore } from '@/lib/store';

type Pair = [string, string];

const EVIDENCE_TYPES: Record<EvidenceType, Pair> = {
  'commercial-invoice': ['Commercial invoice', 'الفاتورة التجارية'],
  'packing-list': ['Packing list', 'قائمة التعبئة'],
  'transport-document': ['Transport document', 'وثيقة النقل'],
  'certificate-of-origin': ['Certificate of origin', 'شهادة المنشأ'],
  'health-certificate': ['Health certificate', 'شهادة صحية'],
  'lab-result': ['Laboratory result', 'نتيجة مختبر'],
  'conformity-certificate': ['Conformity certificate', 'شهادة مطابقة'],
  'type-approval': ['Type approval', 'اعتماد النوع'],
  'import-permit': ['Import permit', 'تصريح استيراد'],
  'safety-data-sheet': ['Safety data sheet', 'صحيفة بيانات السلامة'],
  'inspection-result': ['Inspection result', 'نتيجة فحص'],
  'release-order': ['Release order', 'أمر الإفراج'],
};

const METHODS: Record<EvidenceMethod, Pair> = {
  'document-check': ['Document check', 'فحص مستندات'],
  'lab-test': ['Laboratory test', 'اختبار مخبري'],
  'system-lookup': ['System lookup', 'استعلام من نظام'],
  'officer-inspection': ['Officer inspection', 'فحص بواسطة ضابط'],
  'robotic-inspection': ['Robotic inspection', 'فحص آلي'],
  'scanner-review': ['Scanner review', 'مراجعة صورة الماسح'],
};

const KINDS: Record<ExceptionKind, Pair> = {
  'idle-review': ['Idle review', 'مراجعة متوقفة'],
  'missing-evidence': ['Missing evidence', 'دليل ناقص'],
  'evidence-expiring': ['Evidence expiring', 'دليل قارب على الانتهاء'],
  'authority-conflict': ['Authority conflict', 'خلاف بين الجهات'],
  'unowned-handoff': ['Unowned handoff', 'تسليم بلا مسؤول'],
};

const CATEGORIES: Record<string, Pair> = {
  food: ['Food', 'أغذية'],
  electronics: ['Electronics', 'إلكترونيات'],
  wireless: ['Wireless devices', 'أجهزة لاسلكية'],
  pharma: ['Pharmaceuticals', 'أدوية'],
  'medical-device': ['Medical devices', 'أجهزة طبية'],
  chemicals: ['Chemicals', 'مواد كيميائية'],
  textiles: ['Textiles', 'منسوجات'],
  machinery: ['Machinery', 'آلات'],
  cosmetics: ['Cosmetics', 'مستحضرات تجميل'],
  general: ['General goods', 'بضائع عامة'],
  'high-risk-food': ['Higher-risk food', 'أغذية عالية الخطورة'],
  perishable: ['Perishable goods', 'بضائع سريعة التلف'],
  'cold-chain': ['Cold-chain goods', 'بضائع سلسلة التبريد'],
  hazardous: ['Hazardous goods', 'بضائع خطرة'],
  controlled: ['Controlled goods', 'بضائع خاضعة للرقابة'],
};

const SIGNALS: Record<string, Pair> = {
  'value:undervalued': ['Declared value looks low', 'القيمة المصرح بها تبدو منخفضة'],
  'value:overvalued': ['Declared value looks high', 'القيمة المصرح بها تبدو مرتفعة'],
  'trader-history:low': ['Trader with a low compliance score', 'مستورد بدرجة امتثال منخفضة'],
  'trader-history:medium': ['Trader with a moderate compliance score', 'مستورد بدرجة امتثال متوسطة'],
  'prior-findings:many': ['Many confirmed past findings for the trader', 'مخالفات مؤكدة كثيرة سابقة للمستورد'],
  'prior-findings:some': ['Some confirmed past findings for the trader', 'بعض المخالفات المؤكدة السابقة للمستورد'],
  'authorised-operator': ['Authorised operator status', 'صفة المشغل المعتمد'],
  'origin:first-time': ['First shipment from this origin for the trader', 'أول شحنة من هذا المنشأ للمستورد'],
  'transport-mode:land': ['Road consignment', 'شحنة برية'],
};

const VERDICTS: Record<string, Pair> = {
  missing: ['Document missing at filing', 'مستند ناقص عند التقديم'],
  expired: ['Evidence expired', 'دليل منتهي الصلاحية'],
  'expires-before-eta': ['Evidence expires before arrival', 'دليل ينتهي قبل الوصول'],
  'scope-partial': ['Evidence covers only part of the goods', 'الدليل يغطي جزءاً من البضائع'],
  'not-shared': ['Evidence not shared with this authority', 'الدليل غير متاح لهذه الجهة'],
  revoked: ['Evidence revoked', 'دليل ملغى'],
  pending: ['Evidence pending', 'دليل قيد الانتظار'],
};

const FINDINGS: Record<string, Pair> = {
  none: ['No findings', 'لا ملاحظات'],
  'seal-broken': ['Seal broken', 'ختم مكسور'],
  'undeclared-goods': ['Undeclared goods', 'بضائع غير مصرح بها'],
  'quantity-mismatch': ['Quantity mismatch', 'عدم تطابق الكمية'],
  damage: ['Packaging damage', 'تلف في التغليف'],
  'temperature-excursion': ['Temperature excursion', 'تجاوز في درجة الحرارة'],
  'prohibited-item': ['Prohibited item', 'مادة محظورة'],
};

const SEVERITY: Record<string, Pair> = { info: ['info', 'معلومة'], minor: ['minor', 'طفيف'], major: ['major', 'جسيم'] };

const PERFORMERS: Record<string, Pair> = {
  officer: ['Officer', 'ضابط'],
  scanner: ['Scanner', 'ماسح'],
  drone: ['Drone', 'طائرة مسيّرة'],
  robot: ['Ground robot', 'روبوت أرضي'],
};

const CONSTRAINTS: Record<string, Pair> = {
  'hazardous-materials-protocol': ['Follow the hazardous materials protocol', 'اتباع بروتوكول المواد الخطرة'],
  'keep-cold-chain-intact': ['Keep the cold chain intact', 'الحفاظ على سلسلة التبريد'],
  'time-critical': ['Time-critical cargo', 'شحنة حساسة للوقت'],
};

const EVIDENCE_PREFIX = 'missing:';

/** Bilingual lookups for engine keys that have no Arabic twin of their own. */
export function useLabels() {
  const { locale } = useLocale();
  const bi = useBi();
  const s = useStore();
  const pick = useCallback((p: Pair | undefined, fallback: string) => (p ? p[locale === 'ar' ? 1 : 0] : fallback), [locale]);

  const evidenceType = useCallback((k: string) => pick(EVIDENCE_TYPES[k as EvidenceType], k), [pick]);
  const method = useCallback((k: string) => pick(METHODS[k as EvidenceMethod], k), [pick]);
  const kind = useCallback((k: string) => pick(KINDS[k as ExceptionKind], k), [pick]);
  const finding = useCallback((k: string) => pick(FINDINGS[k], k), [pick]);
  const severity = useCallback((k: string) => pick(SEVERITY[k], k), [pick]);
  const performer = useCallback((k: string) => pick(PERFORMERS[k], k), [pick]);
  const constraint = useCallback((k: string) => pick(CONSTRAINTS[k], k), [pick]);

  const signal = useCallback(
    (key: string) => {
      if (SIGNALS[key]) return pick(SIGNALS[key], key);
      const [head, tail] = key.split(':');
      if (head === 'goods-category' && tail && CATEGORIES[tail]) {
        return locale === 'ar' ? `فئة البضائع: ${CATEGORIES[tail][1]}` : `Goods category: ${CATEGORIES[tail][0]}`;
      }
      if (head === 'documentation-completeness' && VERDICTS[tail]) return pick(VERDICTS[tail], key);
      if (key.startsWith(EVIDENCE_PREFIX) && EVIDENCE_TYPES[key.slice(EVIDENCE_PREFIX.length) as EvidenceType]) {
        const ty = key.slice(EVIDENCE_PREFIX.length);
        return locale === 'ar' ? `يغيب عنه: ${evidenceType(ty)}` : `Often missing: ${evidenceType(ty)}`;
      }
      return key;
    },
    [pick, locale, evidenceType],
  );

  const authority = useCallback(
    (id: string | undefined) => {
      const a = id ? s.directory?.authorities[id] : undefined;
      return a ? bi(a.name, a.nameAr) : id ?? '';
    },
    [s.directory, bi],
  );

  const trader = useCallback(
    (id: string | undefined) => {
      const tr = id ? s.directory?.traders[id] : undefined;
      return tr ? bi(tr.name, tr.nameAr) : id ?? '';
    },
    [s.directory, bi],
  );

  /** 'adafsa:duty' -> "Food Safety Authority, duty officer"; 'adc:officer-3' -> "Abu Dhabi Customs, officer 3". */
  const owner = useCallback(
    (id: string) => {
      const [aid, role = ''] = id.split(':');
      const au = authority(aid);
      const ar = locale === 'ar';
      if (role === 'duty') return `${au}${ar ? '، ضابط المناوبة' : ', duty officer'}`;
      if (role === 'officer-you') return ar ? 'أنت' : 'You';
      const m = role.match(/^officer-(\d+)$/);
      if (m) return `${au}${ar ? `، الضابط ${m[1]}` : `, officer ${m[1]}`}`;
      return id;
    },
    [authority, locale],
  );

  return { evidenceType, method, kind, finding, severity, performer, constraint, signal, authority, trader, owner };
}

export const KIND_ORDER: ExceptionKind[] = ['idle-review', 'missing-evidence', 'evidence-expiring', 'authority-conflict', 'unowned-handoff'];
