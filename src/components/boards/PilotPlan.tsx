'use client';

import { useId, useState, type ReactNode } from 'react';
import { sampleSizeForProportion } from '@/engine';
import { PageTitle } from '@/components/Panel';
import { useFormat, useT } from '@/lib/i18n';

const T = {
  en: {
    title: 'Pilot plan',
    intro: 'How this prototype becomes a real trial: one corridor, ninety days, three modes of increasing effect, with measured gates and written reasons to stop. Thresholds are proposals to agree with customs and the authorities, not findings.',
    scopeT: 'Scope',
    scope1: 'One entry point and one corridor, for example a sea or air flow with a mix of food, electronics and regulated goods that touches at least three authorities.',
    scope2: 'Customs and each participating authority keep every legal decision. Madoun supplies a shared file, a parallel plan and a lane suggestion.',
    scope3: 'Data stays in the UAE, on infrastructure the government chooses. Madoun reads from ATLP and MAMAR through adapters and does not replace either.',
    gatesT: 'Gates', gateCol: 'Gate', whenCol: 'When', modeCol: 'Effect on real decisions', passCol: 'Passes when',
    g0: 'Gate 0: ready', g0w: 'Before day 1', g0m: 'None', g0p: 'Baseline release times measured with the WCO Time Release Study method; data-sharing agreement signed; security review and AI impact assessment signed off.',
    g1: 'Gate 1: shadow', g1w: 'Days 1 to 30', g1m: 'None. Runs beside real decisions.', g1p: 'At least 95% of declarations map without manual repair; API answers within 500 ms for 95% of calls; no high-severity security finding; lane agreement with officers measured and reported.',
    g2: 'Gate 2: advisory', g2w: 'Days 31 to 60', g2m: 'Officers see the parallel plan and owners. Nothing is automatic.', g2p: 'Every waiting step has a named owner; officers use the shared evidence file in most reviews; override rate stays under 40% and every override carries a reason.',
    g3: 'Gate 3: limited effect', g3w: 'Days 61 to 90', g3m: 'Pre-arrival release for green shipments of authorised operators only.', g3p: 'Median release time falls against the baseline with the whole 95% interval below zero; audits of green releases show a violation rate within the agreed tolerance; no group bears a clearly higher share of checks that find nothing.',
    stopT: 'Stop criteria',
    stop1: 'The violation rate found by post-release audits of green shipments rises above the agreed tolerance.',
    stop2: 'Any high-severity security or privacy incident.',
    stop3: 'Sustained override rate above 40%, which means officers do not trust the lanes.',
    stop4: 'Data quality too poor to assess fairly, for example more than 5% of declarations unmappable.',
    stop5: 'A legal or policy objection from any participating authority. Their veto holds.',
    rolesT: 'What changes on day one', roleCol: 'Who', changeCol: 'What they see and do',
    rc: 'Customs officer', rcw: 'Opens one file per shipment with lane, reasons, owners and clocks. Overrides a lane with a reason. Resolves exceptions.',
    rr: 'Regulator officer', rrw: 'Sees only the evidence shared with their authority, reuses a receipt instead of asking again, and records their own approval in parallel.',
    ro: 'Trader or agent', row: 'Sees the status of their own shipment and what is missing, earlier. Does not see other parties\' receipts.',
    ra: 'Auditor', raw: 'Reads the full trail and exports a clearance record. Cannot change anything.',
    rb: 'Inspection operator', rbw: 'Receives inspection tasks from any performer: officer, scanner, drone or robot. A person confirms any serious finding a machine reports.',
    trlT: 'Where each part stands', partCol: 'Part', trlCol: 'Readiness', gapCol: 'What is missing',
    p1: 'Rule engine, event log, review plan', p1t: 'Level 4: validated on synthetic data in a lab', p1g: 'Validation on real, labelled history.',
    p2: 'Evidence receipts and signatures', p2t: 'Level 3 to 4', p2g: 'Real key custody in each authority, external anchoring of the ledger head.',
    p3: 'Integration API', p3t: 'Level 3: mock', p3g: 'Authentication, connection to ATLP and MAMAR, load testing.',
    p4: 'Learning loop and model check', p4t: 'Level 3', p4g: 'Real outcomes, audit sample large enough to trust, drift monitoring.',
    p5: 'Robotic inspection seam', p5t: 'Level 2 to 3: contract and simulation only', p5g: 'A real robot, a safety case, terminal access, officer confirmation rules.',
    p6: 'Adapters to ATLP and MAMAR', p6t: 'Level 1 to 2: designed, not built', p6g: 'Access to interface specifications and a test environment.',
    szT: 'How many audits would the pilot need?',
    szIntro: 'To trust the violation rate in the green lane, the pilot must audit enough green shipments. Enter the rate you expect and how close you need to be.',
    szRate: 'Expected violation rate (%)', szMargin: 'Acceptable margin (± percentage points)',
    szOut: 'About {n} audited green shipments are needed to know the rate within ±{m} points with 95% confidence.',
    szNote: 'At 1 to 3 violations per 100 and a margin of one point this takes several hundred to over a thousand audits, which is why audits start in shadow mode, long before any release changes. If it is too many for one corridor, widen the margin or the corridor.',
    needT: 'What the pilot needs from partners',
    n1: 'Customs: baseline timestamps, read access to declarations, an officer lead and a decision on lane policy.',
    n2: 'Each authority: one named reviewer, its evidence-sharing rules, and the right to stop.',
    n3: 'Technology partners: a test environment, key management, and a robot cell for the research track.',
    n4: 'Legal and privacy: lawful basis, retention and audit rules, and sign-off on the AI impact assessment.',
    docs: 'Fuller detail is in the repository: pilot plan, research programme, AI impact assessment, governance, threat model, model card.',
  },
  ar: {
    title: 'خطة التجربة',
    intro: 'كيف يتحول هذا النموذج الأولي إلى تجربة حقيقية: ممر واحد، تسعون يوماً، ثلاثة أوضاع متدرجة الأثر، ببوابات قياس وأسباب مكتوبة للتوقف. العتبات مقترحات للاتفاق عليها مع الجمارك والجهات، وليست نتائج.',
    scopeT: 'النطاق',
    scope1: 'منفذ دخول واحد وممر واحد، مثل حركة بحرية أو جوية تجمع الأغذية والإلكترونيات والبضائع المنظمة وتمس ثلاث جهات على الأقل.',
    scope2: 'تحتفظ الجمارك وكل جهة مشاركة بكل قرار قانوني. ويوفر مدوّن ملفاً مشتركاً وخطة موازية واقتراح مسار.',
    scope3: 'تبقى البيانات داخل الدولة على بنية تحتية تختارها الحكومة. ويقرأ مدوّن من أطلب ومعمار عبر موائمات ولا يستبدل أياً منهما.',
    gatesT: 'البوابات', gateCol: 'البوابة', whenCol: 'الموعد', modeCol: 'الأثر على القرارات الفعلية', passCol: 'تُجتاز عندما',
    g0: 'البوابة 0: الجاهزية', g0w: 'قبل اليوم الأول', g0m: 'لا أثر', g0p: 'قياس أزمنة الإفراج المرجعية بمنهجية دراسة زمن الإفراج لمنظمة الجمارك العالمية؛ توقيع اتفاقية مشاركة البيانات؛ اعتماد المراجعة الأمنية وتقييم أثر الذكاء الاصطناعي.',
    g1: 'البوابة 1: الظل', g1w: 'الأيام 1 إلى 30', g1m: 'لا أثر. يعمل بجانب القرارات الفعلية.', g1p: 'ما لا يقل عن 95٪ من البيانات الجمركية تُحوَّل دون إصلاح يدوي؛ استجابة الواجهة خلال 500 مللي ثانية في 95٪ من الطلبات؛ لا ملاحظة أمنية عالية الخطورة؛ قياس ورفع نسبة توافق المسارات مع الضباط.',
    g2: 'البوابة 2: الاستشارة', g2w: 'الأيام 31 إلى 60', g2m: 'يرى الضباط الخطة الموازية والمسؤولين. لا شيء تلقائياً.', g2p: 'لكل خطوة منتظرة مسؤول مسمّى؛ يستخدم الضباط ملف الأدلة المشترك في أغلب المراجعات؛ تبقى نسبة التجاوز دون 40٪ ولكل تجاوز سبب.',
    g3: 'البوابة 3: أثر محدود', g3w: 'الأيام 61 إلى 90', g3m: 'إفراج قبل الوصول للشحنات الخضراء للمشغلين المعتمدين فقط.', g3p: 'ينخفض وسيط زمن الإفراج عن المرجع ويقع كامل مدى 95٪ تحت الصفر؛ تُظهر عمليات تدقيق الإفراجات الخضراء نسبة مخالفات ضمن الحد المتفق عليه؛ ولا تتحمل فئة نصيباً أعلى بوضوح من الفحوصات التي لا تجد شيئاً.',
    stopT: 'معايير التوقف',
    stop1: 'ارتفاع نسبة المخالفات المرصودة في تدقيق الشحنات الخضراء بعد الإفراج فوق الحد المتفق عليه.',
    stop2: 'أي حادث أمني أو خصوصية عالي الخطورة.',
    stop3: 'نسبة تجاوز مستمرة فوق 40٪، أي أن الضباط لا يثقون بالمسارات.',
    stop4: 'جودة بيانات لا تسمح بتقييم عادل، مثل تعذر تحويل أكثر من 5٪ من البيانات الجمركية.',
    stop5: 'اعتراض قانوني أو سياسي من أي جهة مشاركة. ويسري حقها في الاعتراض.',
    rolesT: 'ما الذي يتغير في اليوم الأول', roleCol: 'من', changeCol: 'ماذا يرى وماذا يفعل',
    rc: 'ضابط الجمارك', rcw: 'يفتح ملفاً واحداً لكل شحنة فيه المسار والأسباب والمسؤولون والمهل. يتجاوز المسار بسبب. ويحل الاستثناءات.',
    rr: 'ضابط جهة تنظيمية', rrw: 'يرى الأدلة المتاحة لجهته فقط، ويعيد استخدام إيصال بدل السؤال من جديد، ويسجل موافقته بالتوازي.',
    ro: 'المستورد أو الوكيل', row: 'يرى حالة شحنته وما ينقصها مبكراً. ولا يرى إيصالات الأطراف الأخرى.',
    ra: 'المدقق', raw: 'يقرأ المسار كاملاً ويصدّر سجل التخليص. ولا يستطيع تغيير شيء.',
    rb: 'مشغل الفحص', rbw: 'يتلقى مهام الفحص من أي منفذ: ضابط أو ماسح أو طائرة مسيّرة أو روبوت. ويؤكد شخص أي ملاحظة جسيمة تبلغ عنها آلة.',
    trlT: 'أين يقف كل جزء', partCol: 'الجزء', trlCol: 'مستوى الجاهزية', gapCol: 'ما الناقص',
    p1: 'محرك القواعد وسجل الأحداث وخطة المراجعة', p1t: 'المستوى 4: مُتحقَّق منه على بيانات اصطناعية في المختبر', p1g: 'التحقق على تاريخ حقيقي موسوم.',
    p2: 'إيصالات الأدلة والتوقيعات', p2t: 'المستوى 3 إلى 4', p2g: 'حفظ حقيقي للمفاتيح لدى كل جهة، وتثبيت خارجي لرأس السجل.',
    p3: 'واجهة التكامل', p3t: 'المستوى 3: نموذج محاكى', p3g: 'المصادقة والربط مع أطلب ومعمار واختبار الحمل.',
    p4: 'حلقة التعلّم وفحص النموذج', p4t: 'المستوى 3', p4g: 'نتائج حقيقية، وعينة تدقيق كافية للوثوق بها، ورصد الانحراف.',
    p5: 'منفذ الفحص الروبوتي', p5t: 'المستوى 2 إلى 3: عقد ومحاكاة فقط', p5g: 'روبوت حقيقي، وملف سلامة، وإذن دخول للمحطة، وقواعد تأكيد الضابط.',
    p6: 'موائمات أطلب ومعمار', p6t: 'المستوى 1 إلى 2: مصمَّمة ولم تُبنَ', p6g: 'الاطلاع على مواصفات الواجهات وبيئة اختبار.',
    szT: 'كم عملية تدقيق تحتاجها التجربة؟',
    szIntro: 'للوثوق بنسبة المخالفات في المسار الأخضر يجب أن تدقق التجربة عدداً كافياً من الشحنات الخضراء. أدخل النسبة المتوقعة ومدى الدقة المطلوب.',
    szRate: 'نسبة المخالفات المتوقعة (٪)', szMargin: 'هامش الخطأ المقبول (± نقطة مئوية)',
    szOut: 'يلزم نحو {n} شحنة خضراء مدققة لمعرفة النسبة ضمن ±{m} نقطة بثقة 95٪.',
    szNote: 'عند 1 إلى 3 مخالفات لكل 100 وهامش نقطة واحدة يلزم من عدة مئات إلى أكثر من ألف عملية تدقيق، ولهذا يبدأ التدقيق في وضع الظل قبل أي تغيير في الإفراج بوقت طويل. وإن كان العدد كبيراً على ممر واحد، فوسّع الهامش أو الممر.',
    needT: 'ما تحتاجه التجربة من الشركاء',
    n1: 'الجمارك: أزمنة مرجعية، وصول للقراءة إلى البيانات الجمركية، وضابط مسؤول، وقرار بشأن سياسة المسارات.',
    n2: 'كل جهة: مراجع مسمّى، وقواعد مشاركة أدلتها، وحق الإيقاف.',
    n3: 'شركاء التقنية: بيئة اختبار، وإدارة مفاتيح، وخلية روبوتية لمسار البحث.',
    n4: 'الشؤون القانونية والخصوصية: الأساس القانوني، وقواعد الاحتفاظ والتدقيق، واعتماد تقييم أثر الذكاء الاصطناعي.',
    docs: 'التفاصيل الأوفى في المستودع: خطة التجربة، وبرنامج البحث، وتقييم أثر الذكاء الاصطناعي، والحوكمة، ونموذج التهديدات، وبطاقة النموذج.',
  },
};

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-10">
      <h2 id={id} className="mb-3 text-[1.2rem]">{title}</h2>
      {children}
    </section>
  );
}

const th = '!text-start !text-[1rem] font-normal !text-ink align-top';

export function PilotPlan() {
  const t = useT(T);
  const f = useFormat();
  const uid = useId();
  const [rate, setRate] = useState('3');
  const [margin, setMargin] = useState('1');
  const n = sampleSizeForProportion(Number(rate) / 100, Number(margin) / 100);
  const gates = ['g0', 'g1', 'g2', 'g3'] as const;
  const roles = [['rc', 'rcw'], ['rr', 'rrw'], ['ro', 'row'], ['ra', 'raw'], ['rb', 'rbw']] as const;
  const parts = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'] as const;

  return (
    <article>
      <PageTitle title={t('title')} intro={t('intro')} />

      <Section id="p-scope" title={t('scopeT')}>
        <ul className="max-w-[68ch] list-disc space-y-2 ps-5">{(['scope1', 'scope2', 'scope3'] as const).map((k) => <li key={k}>{t(k)}</li>)}</ul>
      </Section>

      <Section id="p-gates" title={t('gatesT')}>
        <div className="panel relative overflow-x-auto">
          <table className="table-clean min-w-[760px]">
            <caption className="sr-only">{t('gatesT')}</caption>
            <thead><tr><th scope="col">{t('gateCol')}</th><th scope="col">{t('whenCol')}</th><th scope="col">{t('modeCol')}</th><th scope="col">{t('passCol')}</th></tr></thead>
            <tbody>
              {gates.map((g) => (
                <tr key={g}>
                  <th scope="row" className={th}>{t(g)}</th>
                  <td className="align-top">{t(`${g}w` as 'g0w')}</td>
                  <td className="align-top">{t(`${g}m` as 'g0m')}</td>
                  <td className="align-top">{t(`${g}p` as 'g0p')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="p-stop" title={t('stopT')}>
        <ul className="max-w-[68ch] list-disc space-y-2 ps-5">{(['stop1', 'stop2', 'stop3', 'stop4', 'stop5'] as const).map((k) => <li key={k}>{t(k)}</li>)}</ul>
      </Section>

      <Section id="p-roles" title={t('rolesT')}>
        <div className="panel relative overflow-x-auto">
          <table className="table-clean min-w-[600px]">
            <caption className="sr-only">{t('rolesT')}</caption>
            <thead><tr><th scope="col">{t('roleCol')}</th><th scope="col">{t('changeCol')}</th></tr></thead>
            <tbody>{roles.map(([a, b]) => <tr key={a}><th scope="row" className={th}>{t(a)}</th><td>{t(b)}</td></tr>)}</tbody>
          </table>
        </div>
      </Section>

      <Section id="p-trl" title={t('trlT')}>
        <div className="panel relative overflow-x-auto">
          <table className="table-clean min-w-[680px]">
            <caption className="sr-only">{t('trlT')}</caption>
            <thead><tr><th scope="col">{t('partCol')}</th><th scope="col">{t('trlCol')}</th><th scope="col">{t('gapCol')}</th></tr></thead>
            <tbody>
              {parts.map((p) => (
                <tr key={p}>
                  <th scope="row" className={th}>{t(p)}</th>
                  <td className="align-top">{t(`${p}t` as 'p1t')}</td>
                  <td className="align-top">{t(`${p}g` as 'p1g')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="p-size" title={t('szT')}>
        <div className="panel max-w-[68ch] p-4">
          <p className="text-muted">{t('szIntro')}</p>
          <div className="mt-3 flex flex-wrap gap-4">
            <label htmlFor={`${uid}r`} className="flex flex-col gap-1 text-sm text-muted">{t('szRate')}
              <input id={`${uid}r`} type="number" inputMode="decimal" min={0} max={100} step={0.5} value={rate} onChange={(e) => setRate(e.target.value)} className="w-32 rounded-[3px] border border-line bg-panel px-3 py-1.5 text-base text-ink" />
            </label>
            <label htmlFor={`${uid}m`} className="flex flex-col gap-1 text-sm text-muted">{t('szMargin')}
              <input id={`${uid}m`} type="number" inputMode="decimal" min={0.1} max={50} step={0.1} value={margin} onChange={(e) => setMargin(e.target.value)} className="w-32 rounded-[3px] border border-line bg-panel px-3 py-1.5 text-base text-ink" />
            </label>
          </div>
          <p className="mt-3 font-medium" aria-live="polite">{Number.isFinite(n) ? t('szOut', { n: f.number(n), m: f.number(Number(margin), 1) }) : '–'}</p>
          <p className="mt-2 text-sm text-muted">{t('szNote')}</p>
        </div>
      </Section>

      <Section id="p-need" title={t('needT')}>
        <ul className="max-w-[68ch] list-disc space-y-2 ps-5">{(['n1', 'n2', 'n3', 'n4'] as const).map((k) => <li key={k}>{t(k)}</li>)}</ul>
        <p className="mt-6 max-w-[68ch] text-sm text-muted">{t('docs')}</p>
      </Section>
    </article>
  );
}
