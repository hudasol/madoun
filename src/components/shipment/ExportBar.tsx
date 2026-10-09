'use client';

import { auditCsv, clearanceRecord, download } from '@/lib/export';
import { useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import type { ShipmentFile, ShipmentPlan } from '@/engine';

const T = {
  en: { label: 'Clearance record', json: 'Download JSON', csv: 'Download audit trail (CSV)', print: 'Print', hint: 'For post-clearance audit. Synthetic data in this demo.' },
  ar: { label: 'سجل الإفراج', json: 'تنزيل JSON', csv: 'تنزيل سجل التدقيق (CSV)', print: 'طباعة', hint: 'للتدقيق بعد الإفراج. بيانات تجريبية في هذا العرض.' },
};

export function ExportBar({ file, plan }: { file: ShipmentFile; plan: ShipmentPlan }) {
  const t = useT(T);
  const s = useStore();
  const ref = file.shipment.declarationRef;
  return (
    <div className="no-print mt-4 flex flex-wrap items-center gap-2" role="group" aria-label={t('label')}>
      <span className="me-1 text-sm text-muted">{t('label')}</span>
      <button type="button" className="btn !py-1" onClick={() => download(`${ref}.record.json`, 'application/json', JSON.stringify(clearanceRecord(s.world!, s.directory!, file, plan, s.laneOf(file), s.at), null, 2))}>{t('json')}</button>
      <button type="button" className="btn !py-1" onClick={() => download(`${ref}.audit.csv`, 'text/csv', auditCsv(file))}>{t('csv')}</button>
      <button type="button" className="btn !py-1" onClick={() => window.print()}>{t('print')}</button>
      <span className="text-sm text-muted">{t('hint')}</span>
    </div>
  );
}
