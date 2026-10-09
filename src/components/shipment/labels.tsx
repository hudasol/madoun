'use client';

import { useCallback } from 'react';
import type { ExceptionKind, ShipmentFile, TransportMode } from '@/engine';
import { actorName, inlineActors } from '@/lib/actors';
import { useBi, useLocale, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';

const T = {
  en: {
    sea: 'Sea', air: 'Air', land: 'Land',
    'khalifa port': 'Khalifa Port', 'zayed port': 'Zayed Port', 'air cargo terminal': 'Air cargo terminal', 'land border crossing': 'Land border crossing',
    'idle-review': 'Review past its time limit', 'missing-evidence': 'Document missing', 'evidence-expiring': 'Evidence expires before arrival',
    'authority-conflict': 'Authorities disagree', 'unowned-handoff': 'Ready but not started',
    dutyOfficer: '{name} duty officer', you: 'You (demo officer)', system: 'Madoun system',
    inReview: 'In review', beforeArrival: 'Cleared before arrival', afterArrival: 'Cleared after arrival',
  },
  ar: {
    sea: 'بحري', air: 'جوي', land: 'بري',
    'khalifa port': 'ميناء خليفة', 'zayed port': 'ميناء زايد', 'air cargo terminal': 'محطة الشحن الجوي', 'land border crossing': 'المنفذ البري',
    'idle-review': 'مراجعة تجاوزت مهلتها', 'missing-evidence': 'مستند ناقص', 'evidence-expiring': 'دليل ينتهي قبل الوصول',
    'authority-conflict': 'الجهات غير متفقة', 'unowned-handoff': 'جاهز ولم يبدأ',
    dutyOfficer: 'مناوب {name}', you: 'أنت (ضابط تجريبي)', system: 'نظام مدوّن',
    inReview: 'قيد المراجعة', beforeArrival: 'أُفرج عنها قبل الوصول', afterArrival: 'أُفرج عنها بعد الوصول',
  },
};

export type StatusKey = 'inReview' | 'beforeArrival' | 'afterArrival';

export function statusOf(file: ShipmentFile): StatusKey {
  return !file.cleared ? 'inReview' : file.cleared.preArrival ? 'beforeArrival' : 'afterArrival';
}

/** Small shared label helpers: mode, entry point, exception kind, owner, authority and status names. */
export function useLabels() {
  const t = useT(T);
  const { locale } = useLocale();
  const bi = useBi();
  const s = useStore();
  const dir = s.directory;
  const mode = useCallback((m: TransportMode) => t(m), [t]);
  const entry = useCallback((e: string) => {
    const k = e.toLowerCase();
    return k in T.en ? t(k as 'sea') : e;
  }, [t]);
  const kind = useCallback((k: ExceptionKind) => t(k), [t]);
  const authority = useCallback((id: string) => {
    const a = dir?.authorities[id];
    return a ? bi(a.name, a.nameAr) : id;
  }, [dir, bi]);
  const owner = useCallback((id: string) => actorName(id, locale, dir), [dir, locale]);
  const actorsIn = useCallback((text: string) => inlineActors(text, locale, dir), [dir, locale]);
  const status = useCallback((f: ShipmentFile) => t(statusOf(f)), [t]);
  return { mode, entry, kind, authority, owner, actorsIn, status };
}
