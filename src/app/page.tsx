'use client';

import { Loading, PageTitle } from '@/components/Panel';
import { ArrivalBoard } from '@/components/tower/ArrivalBoard';
import { ClearedSoFar, NeedsOwner } from '@/components/tower/Sidebar';
import { useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';

const T = {
  en: {
    title: 'Control tower',
    intro: 'Each line is a shipment on its way in. The line runs from when the file was opened to its arrival, and shows whether the approvals are predicted to finish first.',
  },
  ar: {
    title: 'برج المراقبة',
    intro: 'كل سطر شحنة في طريقها إلينا. يمتد الخط من فتح الملف حتى الوصول، ويبيّن هل يُتوقع اكتمال الموافقات قبل ذلك.',
  },
};

export default function Page() {
  const t = useT(T);
  const s = useStore();
  if (!s.ready || !s.kpis) return <Loading />;
  return (
    <>
      <PageTitle title={t('title')} intro={t('intro')} />
      <ArrivalBoard />
      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        <NeedsOwner />
        <ClearedSoFar />
      </div>
    </>
  );
}
