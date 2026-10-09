'use client';

import type { ReactNode } from 'react';
import { PageTitle } from '@/components/Panel';
import { useT } from '@/lib/i18n';

const T = {
  en: {
    title: 'Method',
    intro: 'How Madoun works, what it leaves to people, and what in this demo is sample data. Written for a customs officer, not for a pitch.',
    isTitle: 'What Madoun is and is not',
    is1: 'Madoun is a layer on top of the systems Abu Dhabi already runs, such as ATLP and MAMAR. It gives each shipment one shared file: what each authority needs, what is already verified, who is holding it up, and for how long.',
    is2: 'It does not replace those systems and it is not a new declaration portal. It is not a central database either. The authority that issued or checked a document keeps it; Madoun keeps a receipt that says who verified what, for which goods and until when.',
    is3: 'Madoun does not make legal decisions. It recommends, gives the reasons, and keeps the clock. An officer decides.',
    rootTitle: 'Five root causes, five answers',
    rootIntro: 'Challenge profile 21 names five causes of slow, repeated clearance. Each has a direct answer in the product.',
    cause: 'Root cause', answer: 'What Madoun does', rootCaption: 'Root causes from challenge profile 21 and the matching feature',
    r1: 'No shared decision points, no view of dependencies, no one accountable end to end.', r1a: 'A shipment file with the reviews and their dependencies, and one named owner for every step.',
    r2: 'Evidence is not governed for reuse: unclear provenance, validity, acceptance rules and custodian.', r2a: 'Evidence receipts that record issuer, scope, validity and who may rely on them. Another authority can accept a valid receipt instead of checking again.',
    r3: 'Risk definitions and thresholds differ between authorities.', r3a: 'Each authority keeps its own risk signals. They are combined by a stated rule, and disagreements are shown, not hidden.',
    r4: 'Routine and complex cargo follow the same steps.', r4a: 'Green, amber and red lanes with different pathways, plus a flag for post-clearance audit.',
    r5: 'Outcomes do not feed a shared learning cycle.', r5a: 'Inspection results, false interventions and recurring missing documents become suggestions that an officer can approve.',
    flowTitle: 'How a shipment moves through it', flowIntro: 'These steps happen in this order.',
    s1: 'File opened. The shipment file is created as soon as the declaration is filed, often days before arrival.',
    s2: 'Evidence checked. Madoun matches the goods to the approvals they need and looks for valid receipts. Anything missing, expired or too narrow is named with the reason.',
    s3: 'Lane recommended. Risk signals from each authority are combined into a lane, with the reasons written out.',
    s4: 'Reviews run in parallel. Reviews that do not depend on each other start together. A review that must wait for another waits only for that one.',
    s5: 'Release. When every blocking review is done the file is ready for release. Release can be separated from final duty determination.',
    s6: 'Outcome recorded. What an inspection found, or did not find, goes back to the learning loop.',
    useTitle: 'Responsible use',
    u1: 'Risk factors are limited to objective criteria that WTO Trade Facilitation Agreement Article 7.4 allows: tariff code, type of goods, origin, shipping country, value, the trader’s compliance history and transport mode.',
    u2: 'Every recommendation comes with its reasons in plain language.',
    u3: 'An officer can override any lane. The override is recorded with the officer’s name and a written reason.',
    u4: 'Learning only suggests. A person approves each change to a rule weight, and the change is listed on the Learning page.',
    sampleTitle: 'What is synthetic, and what needs validating',
    sa1: 'Every shipment, trader, forwarder, receipt and outcome in this demo is synthetic. No real data is used.',
    sa2: 'The rules that map goods to the approvals they need, the authorities’ response times, and the risk weights are illustrative. They come from secondary public sources.',
    sa3: 'The release times on the Today vs Madoun page are modelled, not measured.',
    sa4: 'Before any real use, Abu Dhabi Customs and each authority must confirm which approvals block release at each entry point, the legal basis for one authority to rely on another’s check, which risk factors may be shared, and whether ATLP exposes the status and validity checks Madoun needs.',
    robTitle: 'Robotics extension',
    rob1: 'When a shipment lands in the red lane, Madoun issues an inspection task: what to check, which containers, and any constraints such as hazardous goods or a cold chain that must stay intact. A person, a scanner, a drone or a ground robot can carry it out.',
    rob2: 'Today the performer is a simulator. A ROS 2 bridge would replace it and return the same result message. The result becomes an evidence receipt that other authorities can rely on, so a robot’s finding is not trapped in one system.',
    srcTitle: 'Sources',
    src1: 'WTO Trade Facilitation Agreement, Article 7', src2: 'WCO Data Model, main class levels', src3: 'Swedish Customs, multiple-level data filing', src4: 'WCO News, Customs-Ports partnership in Abu Dhabi',
    src5: 'FreightWaves, Blurred single windows', src6: 'Port of Barcelona, the closure of TradeLens', src7: 'Project repository',
  },
  ar: {
    title: 'المنهجية',
    intro: 'كيف يعمل مدوّن، وما الذي يتركه للبشر، وما الذي هو بيانات تجريبية في هذا العرض. مكتوبة لضابط جمارك لا لعرض ترويجي.',
    isTitle: 'ما هو مدوّن وما ليس هو',
    is1: 'مدوّن طبقة فوق الأنظمة التي تعمل بها أبوظبي أصلاً، مثل ATLP وMAMAR. يمنح كل شحنة ملفاً مشتركاً واحداً: ما تحتاجه كل جهة، وما تم التحقق منه، ومن يعطّل الشحنة، ومنذ متى.',
    is2: 'لا يحل محل تلك الأنظمة وليس بوابة تصريح جديدة. وليس قاعدة بيانات مركزية كذلك. فالجهة التي أصدرت المستند أو فحصته تحتفظ به، ويحتفظ مدوّن بإيصال يبين من تحقق من ماذا، ولأي بضائع، وحتى متى.',
    is3: 'لا يتخذ مدوّن قرارات قانونية. إنه يوصي ويذكر الأسباب ويحفظ الوقت. أما القرار فللضابط.',
    rootTitle: 'خمسة أسباب جذرية وخمس إجابات',
    rootIntro: 'يحدد ملف التحدي 21 خمسة أسباب لبطء التخليص وتكراره. ولكل سبب إجابة مباشرة في المنتج.',
    cause: 'السبب الجذري', answer: 'ما يفعله مدوّن', rootCaption: 'الأسباب الجذرية في ملف التحدي 21 والميزة المقابلة',
    r1: 'لا نقاط قرار مشتركة، ولا رؤية للاعتماديات، ولا مسؤول عن الرحلة من أولها إلى آخرها.', r1a: 'ملف شحنة يضم المراجعات واعتمادياتها، ومسؤولاً معلوماً لكل خطوة.',
    r2: 'الأدلة غير محكومة لإعادة الاستخدام: المصدر والصلاحية وقواعد القبول والجهة الحافظة غير واضحة.', r2a: 'إيصالات أدلة تسجل المصدر والنطاق والصلاحية ومن يحق له الاعتماد عليها. ويمكن لجهة أخرى قبول إيصال ساري بدل الفحص من جديد.',
    r3: 'تعريفات الخطورة وحدودها تختلف بين الجهات.', r3a: 'تحتفظ كل جهة بإشارات الخطورة الخاصة بها. وتُجمع بقاعدة معلنة، وتُعرض الخلافات ولا تُخفى.',
    r4: 'البضائع الروتينية والمعقدة تمر بالخطوات نفسها.', r4a: 'مسارات أخضر وكهرماني وأحمر لكل منها مسار عمل مختلف، مع علامة للتدقيق اللاحق للتخليص.',
    r5: 'النتائج لا تغذي دورة تعلّم مشتركة.', r5a: 'نتائج الفحص والتدخلات الخاطئة والمستندات الناقصة المتكررة تتحول إلى اقتراحات يعتمدها ضابط.',
    flowTitle: 'كيف تمر الشحنة عبره', flowIntro: 'تتم هذه الخطوات بهذا الترتيب.',
    s1: 'فتح الملف. يُنشأ ملف الشحنة فور تقديم البيان، غالباً قبل الوصول بأيام.',
    s2: 'فحص الأدلة. يطابق مدوّن البضائع مع الموافقات التي تحتاجها ويبحث عن إيصالات سارية. وكل ما هو ناقص أو منتهٍ أو ضيق النطاق يُذكر مع سببه.',
    s3: 'اقتراح المسار. تُجمع إشارات الخطورة من كل جهة في مسار واحد مع كتابة الأسباب.',
    s4: 'مراجعات متوازية. تبدأ المراجعات غير المعتمدة على بعضها معاً. والمراجعة التي يجب أن تنتظر أخرى تنتظر تلك فقط.',
    s5: 'الإفراج. عند اكتمال كل المراجعات المانعة يصبح الملف جاهزاً للإفراج. ويمكن فصل الإفراج عن التحديد النهائي للرسوم.',
    s6: 'تسجيل النتيجة. ما وجده الفحص أو لم يجده يعود إلى دورة التعلّم.',
    useTitle: 'الاستخدام المسؤول',
    u1: 'تقتصر عوامل الخطورة على المعايير الموضوعية التي تجيزها المادة 7.4 من اتفاقية تيسير التجارة لمنظمة التجارة العالمية: البند الجمركي ونوع البضائع والمنشأ وبلد الشحن والقيمة وسجل امتثال المستورد ووسيلة النقل.',
    u2: 'كل توصية تأتي مع أسبابها بلغة واضحة.',
    u3: 'يمكن للضابط تجاوز أي مسار. ويسجَّل التجاوز باسم الضابط وسبب مكتوب.',
    u4: 'التعلّم يقترح فقط. ويعتمد شخص كل تغيير في وزن قاعدة، ويظهر التغيير في صفحة التعلّم.',
    sampleTitle: 'ما هو اصطناعي وما يحتاج إلى تحقق',
    sa1: 'كل شحنة ومستورد ووكيل وإيصال ونتيجة في هذا العرض اصطناعية. ولا تُستخدم أي بيانات حقيقية.',
    sa2: 'القواعد التي تربط البضائع بالموافقات التي تحتاجها، وأزمنة استجابة الجهات، وأوزان الخطورة، كلها توضيحية ومأخوذة من مصادر عامة ثانوية.',
    sa3: 'أزمنة الإفراج في صفحة اليوم مقابل مدوّن محاكاة وليست قياسات.',
    sa4: 'قبل أي استخدام حقيقي، يجب أن تؤكد جمارك أبوظبي وكل جهة: أي الموافقات تمنع الإفراج في كل منفذ، والأساس القانوني لاعتماد جهة على فحص جهة أخرى، وأي عوامل الخطورة يجوز تبادلها، وهل يتيح ATLP فحوص الحالة والصلاحية التي يحتاجها مدوّن.',
    robTitle: 'امتداد الروبوتات',
    rob1: 'عندما تقع شحنة في المسار الأحمر يصدر مدوّن مهمة فحص: ما المطلوب فحصه، وأي الحاويات، وأي قيود مثل البضائع الخطرة أو سلسلة تبريد يجب أن تبقى سليمة. ويمكن لشخص أو ماسح أو طائرة مسيّرة أو روبوت أرضي تنفيذها.',
    rob2: 'المنفّذ اليوم محاكاة. وسيحل محلها جسر ROS 2 يعيد رسالة النتيجة نفسها. وتتحول النتيجة إلى إيصال دليل يمكن للجهات الأخرى الاعتماد عليه، فلا تبقى ملاحظة الروبوت حبيسة نظام واحد.',
    srcTitle: 'المصادر',
    src1: 'اتفاقية تيسير التجارة لمنظمة التجارة العالمية، المادة 7', src2: 'نموذج بيانات المنظمة العالمية للجمارك، مستويات الفئات الرئيسية', src3: 'الجمارك السويدية، التصريح متعدد المستويات', src4: 'أخبار المنظمة العالمية للجمارك، شراكة الجمارك والموانئ في أبوظبي',
    src5: 'FreightWaves، النوافذ الموحدة الضبابية', src6: 'ميناء برشلونة، إغلاق TradeLens', src7: 'مستودع المشروع',
  },
};

const SOURCES: [string, 'src1' | 'src2' | 'src3' | 'src4' | 'src5' | 'src6' | 'src7'][] = [
  ['https://tfadatabase.org/en/tfa-text/article/7', 'src1'],
  ['https://wiki.datamodel.wcoomd.org/technical-guide/guidance-on-using-Main-Class-Levels', 'src2'],
  ['https://www.tullverket.se/en/startpage/business/applyanddeclare/declarationsupport/multipleleveldatafiling.4.422c8052175b1d827695a88.html', 'src3'],
  ['https://mag.wcoomd.org/magazine/wco-news-102-issue-3-2023/customs-ports-partnership-abu-dhabi/', 'src4'],
  ['https://www.freightwaves.com/news/blurred-single-windows', 'src5'],
  ['https://piernext.portdebarcelona.cat/en/technology/the-closure-of-tradelens/', 'src6'],
  ['https://github.com/hudasol/madoun', 'src7'],
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-10 max-w-[68ch]">
      <h2 id={id} className="mb-3 text-[1.2rem]">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function MethodDoc() {
  const t = useT(T);
  const roots = ['r1', 'r2', 'r3', 'r4', 'r5'] as const;
  const steps = ['s1', 's2', 's3', 's4', 's5', 's6'] as const;
  return (
    <article>
      <PageTitle title={t('title')} intro={t('intro')} />

      <Section id="m-is" title={t('isTitle')}>
        <p>{t('is1')}</p><p>{t('is2')}</p><p>{t('is3')}</p>
      </Section>

      <section aria-labelledby="m-root" className="mt-10">
        <h2 id="m-root" className="mb-2 text-[1.2rem]">{t('rootTitle')}</h2>
        <p className="mb-3 max-w-[68ch] text-muted">{t('rootIntro')}</p>
        <div className="panel relative overflow-x-auto">
          <table className="table-clean min-w-[640px]">
            <caption className="sr-only">{t('rootCaption')}</caption>
            <thead><tr><th scope="col">{t('cause')}</th><th scope="col">{t('answer')}</th></tr></thead>
            <tbody>
              {roots.map((r, i) => (
                <tr key={r}>
                  <th scope="row" className="!text-start !text-[1rem] font-normal !text-ink w-1/2"><span className="mono me-2 text-muted" dir="ltr">R{i + 1}</span>{t(r)}</th>
                  <td>{t(`${r}a` as 'r1a')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Section id="m-flow" title={t('flowTitle')}>
        <p className="text-muted">{t('flowIntro')}</p>
        <ol className="list-decimal space-y-2 ps-6 marker:text-muted">
          {steps.map((s) => <li key={s}>{t(s)}</li>)}
        </ol>
      </Section>

      <Section id="m-use" title={t('useTitle')}>
        <ul className="list-disc space-y-2 ps-5">{(['u1', 'u2', 'u3', 'u4'] as const).map((u) => <li key={u}>{t(u)}</li>)}</ul>
      </Section>

      <Section id="m-sample" title={t('sampleTitle')}>
        <ul className="list-disc space-y-2 ps-5">{(['sa1', 'sa2', 'sa3', 'sa4'] as const).map((u) => <li key={u}>{t(u)}</li>)}</ul>
      </Section>

      <Section id="m-rob" title={t('robTitle')}>
        <p>{t('rob1')}</p><p>{t('rob2')}</p>
      </Section>

      <Section id="m-src" title={t('srcTitle')}>
        <ul className="space-y-2">
          {SOURCES.map(([href, k]) => (
            <li key={href}>
              <a href={href} rel="noopener" className="underline underline-offset-2" style={{ color: 'var(--stamp)' }}>{t(k)}</a>
              <span className="mono block break-all text-sm text-muted" dir="ltr">{href}</span>
            </li>
          ))}
        </ul>
      </Section>
    </article>
  );
}
