import type { GoodsCategory } from '@/engine/types';

/**
 * SAMPLE RISK TABLES. Illustrative starting points only. Every factor here is an objective
 * criterion of the kind the WTO Trade Facilitation Agreement (Art. 7.4) treats as permissible:
 * tariff code / goods type, origin, value, trader compliance history, transport mode.
 * There is intentionally no country-level risk list: origin matters only as "new for this trader",
 * and any further origin signal must come from recorded outcomes (see the learning module).
 */

export const LANE_THRESHOLDS = { amber: 28, red: 48 } as const;

/** Base points by goods category for customs. */
export const CUSTOMS_CATEGORY_POINTS: Record<GoodsCategory, number> = {
  general: 0,
  textiles: 6,
  food: 5,
  electronics: 8,
  wireless: 8,
  cosmetics: 8,
  machinery: 6,
  chemicals: 14,
  pharma: 12,
  'medical-device': 10,
};

/** Reference unit value per category in AED, used only to flag unusually low or high declared values. */
export const REFERENCE_UNIT_VALUE: Record<GoodsCategory, number> = {
  general: 40,
  textiles: 35,
  food: 12,
  electronics: 520,
  wireless: 380,
  cosmetics: 60,
  machinery: 4200,
  chemicals: 90,
  pharma: 150,
  'medical-device': 1800,
};

export const VALUE_BANDS = { under: 0.5, over: 2.5 } as const;

/** Points added by regulators for their own domain. */
export const REGULATOR_FLAG_POINTS: Record<string, { authorityId: string; points: number; reason: string; reasonAr: string }> = {
  'high-risk-food': {
    authorityId: 'adafsa',
    points: 18,
    reason: 'Higher-risk food type needs laboratory evidence',
    reasonAr: 'نوع غذاء عالي الخطورة يتطلب دليلاً مخبرياً',
  },
  perishable: {
    authorityId: 'adafsa',
    points: 4,
    reason: 'Perishable goods: time-sensitive handling',
    reasonAr: 'بضائع سريعة التلف: مناولة حساسة للوقت',
  },
  'cold-chain': {
    authorityId: 'mohap',
    points: 8,
    reason: 'Cold-chain product: temperature record matters',
    reasonAr: 'منتج سلسلة تبريد: سجل الحرارة مهم',
  },
  controlled: {
    authorityId: 'mohap',
    points: 20,
    reason: 'Controlled substance handling',
    reasonAr: 'التعامل مع مواد خاضعة للرقابة',
  },
  hazardous: {
    authorityId: 'moccae',
    points: 18,
    reason: 'Hazardous chemical: safety data must match the load',
    reasonAr: 'مادة كيميائية خطرة: يجب أن تطابق بيانات السلامة الحمولة',
  },
};
