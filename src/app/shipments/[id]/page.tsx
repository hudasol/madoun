'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Loading } from '@/components/Panel';
import { ApprovalsSection, isGap } from '@/components/shipment/Approvals';
import { AuditTrail, GoodsTable } from '@/components/shipment/GoodsAudit';
import { ShipmentHeader } from '@/components/shipment/Header';
import { LaneWhy } from '@/components/shipment/LaneWhy';
import { ExceptionsSection, InspectionSection, needsInspection } from '@/components/shipment/Operations';
import { Timeline } from '@/components/shipment/Timeline';
import { useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';

const T = {
  en: { back: 'All shipments', nfTitle: 'This shipment is not in the file', nfBody: 'No shipment has the reference "{id}" at the time you are viewing. Move the time slider to Latest, or pick one from the list.' },
  ar: { back: 'كل الشحنات', nfTitle: 'هذه الشحنة غير موجودة في الملف', nfBody: 'لا توجد شحنة بالمرجع "{id}" في الوقت المعروض. حرّك شريط الوقت إلى الأحدث، أو اختر شحنة من القائمة.' },
};

export default function Page() {
  const t = useT(T);
  const s = useStore();
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(Array.isArray(params.id) ? params.id[0] : params.id);
  if (!s.ready || !s.world) return <Loading />;

  const file = s.world.shipments[id] ?? Object.values(s.world.shipments).find((f) => f.shipment.declarationRef === id);
  const plan = file ? s.plan(file.shipment.id) : undefined;
  if (!file || !plan) {
    return (
      <div className="panel max-w-[60ch] p-6">
        <h1 className="text-xl">{t('nfTitle')}</h1>
        <p className="mt-2 text-muted">{t('nfBody', { id })}</p>
        <Link href="/shipments" className="btn mt-4">{t('back')}</Link>
      </div>
    );
  }
  const gapCount = plan.checks.filter((c) => isGap(c.verdict)).length;
  const lane = s.laneOf(file);

  return (
    <>
      <p className="mb-3 text-sm"><Link href="/shipments" className="text-muted underline underline-offset-2 hover:text-ink">{t('back')}</Link></p>
      <ShipmentHeader file={file} plan={plan} gapCount={gapCount} />
      <div className="space-y-6">
        <ApprovalsSection file={file} plan={plan} />
        <LaneWhy key={file.shipment.id} file={file} plan={plan} />
        <Timeline plan={plan} />
        <ExceptionsSection file={file} />
        {needsInspection(file, plan, lane) && <InspectionSection file={file} />}
        <GoodsTable file={file} />
        <AuditTrail file={file} />
      </div>
    </>
  );
}
