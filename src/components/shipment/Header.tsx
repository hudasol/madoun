'use client';

import { LaneBadge } from '@/components/LaneBadge';
import { addHours, hoursBetween, type ShipmentFile, type ShipmentPlan } from '@/engine';
import { useBi, useFormat, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { useLabels } from './labels';

const T = {
  en: {
    trader: 'Trader', mode: 'Transport', conveyance: 'Vessel, flight or truck', entry: 'Entry point', containers: 'Containers', docs: 'Transport document', filed: 'File opened', eta: 'Arrival',
    status: 'Status', lane: 'Lane', declaration: 'Declaration', back: 'All shipments',
    canClear: 'Can it clear before arrival?', yes: 'Yes. Release is predicted {h} before arrival.', no: 'Not at the current pace. Release is predicted {h} after arrival.',
    modelled: 'Modelled from review times in the sample data, not measured.',
    doneBefore: 'Cleared {t}, {h} before arrival.', doneAfter: 'Cleared {t}, {h} after arrival.',
    gaps: '{n} approval(s) have a gap that needs action.', gapsDone: '{n} approval(s) show a gap in the evidence record.', noGaps: 'No evidence gaps are blocking this file.',
    approvalsHint: 'Details are in the approvals section below.',
  },
  ar: {
    trader: 'التاجر', mode: 'وسيلة النقل', conveyance: 'السفينة أو الرحلة أو الشاحنة', entry: 'نقطة الدخول', containers: 'الحاويات', docs: 'مستند النقل', filed: 'فتح الملف', eta: 'الوصول',
    status: 'الحالة', lane: 'المسار', declaration: 'البيان الجمركي', back: 'كل الشحنات',
    canClear: 'هل يمكن الإفراج قبل الوصول؟', yes: 'نعم. يُتوقع الإفراج قبل الوصول بـ {h}.', no: 'ليس بالوتيرة الحالية. يُتوقع الإفراج بعد الوصول بـ {h}.',
    modelled: 'نمذجة من أزمنة المراجعة في البيانات التجريبية، وليست قياساً.',
    doneBefore: 'تم الإفراج {t}، قبل الوصول بـ {h}.', doneAfter: 'تم الإفراج {t}، بعد الوصول بـ {h}.',
    gaps: '{n} موافقة بها نقص يحتاج إجراءً.', gapsDone: '{n} موافقة بها نقص في سجل الأدلة.', noGaps: 'لا توجد فجوات في الأدلة تعطّل هذا الملف.',
    approvalsHint: 'التفاصيل في قسم الموافقات أدناه.',
  },
};

export function ShipmentHeader({ file, plan, gapCount }: { file: ShipmentFile; plan: ShipmentPlan; gapCount: number }) {
  const t = useT(T);
  const f = useFormat();
  const bi = useBi();
  const s = useStore();
  const L = useLabels();
  const sh = file.shipment;
  const tr = s.directory!.traders[sh.traderId];
  const containers = sh.consignments.flatMap((c) => c.containerIds);
  const docs = sh.consignments.map((c) => c.transportDocRef);
  const slack = hoursBetween(addHours(s.at, plan.reviewPlan.parallelHours), sh.eta);

  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{t('declaration')}</p>
          <h1 className="mono text-[1.75rem] font-medium">{sh.declarationRef}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="text-sm text-muted">{t('status')}: <span className="text-ink">{L.status(file)}</span></span>
          <span className="inline-flex items-center gap-2 text-sm text-muted">{t('lane')}: <LaneBadge lane={s.laneOf(file)} /></span>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 border-y border-line py-4 sm:grid-cols-2 lg:grid-cols-4">
        {([
          ['trader', tr ? bi(tr.name, tr.nameAr) : sh.traderId],
          ['mode', `${L.mode(sh.mode)}, ${sh.carrier}`],
          ['conveyance', <span key="c" className="mono">{sh.conveyance}</span>],
          ['entry', L.entry(sh.entryPoint)],
          ['filed', f.dateTime(sh.filedAt)],
          ['eta', f.dateTime(sh.eta)],
        ] as const).map(([k, v]) => (
          <div key={k}><dt className="text-sm text-muted">{t(k)}</dt><dd>{v}</dd></div>
        ))}
        <div className="sm:col-span-2">
          <dt className="text-sm text-muted">{containers.length ? t('containers') : t('docs')}</dt>
          <dd className="mono flex flex-wrap gap-x-4 text-[0.92rem]">{containers.length ? containers.map((c) => <span key={c}>{c}</span>) : docs.map((c) => <span key={c}>{c}</span>)}</dd>
        </div>
      </dl>

      <div className="mt-4 max-w-[70ch]" aria-label={t('canClear')}>
        <h2 className="text-base">{t('canClear')}</h2>
        {file.cleared ? (
          <p>{t(file.cleared.preArrival ? 'doneBefore' : 'doneAfter', { t: f.dateTime(file.cleared.at), h: f.hours(Math.abs(hoursBetween(file.cleared.at, sh.eta))) })}</p>
        ) : (
          <>
            <p className="font-medium">{slack >= 0 ? t('yes', { h: f.hours(slack) }) : t('no', { h: f.hours(-slack) })}</p>
            <p className="text-sm text-muted">{t('modelled')}</p>
          </>
        )}
        <p className="mt-1">{gapCount > 0 ? <span className="font-medium">{t(file.cleared ? 'gapsDone' : 'gaps', { n: gapCount })}</span> : t('noGaps')} <a href="#approvals" className="underline underline-offset-2">{t('approvalsHint')}</a></p>
      </div>
    </header>
  );
}
