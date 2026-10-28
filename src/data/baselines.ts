/**
 * Published reference points that Madoun's synthetic model can be held against.
 *
 * Every entry names who published it, what it measures and what it does not, and when it was read.
 * Nothing here is an input to the simulator. They are checks on it, shown in the interface (Today vs
 * Madoun) and in docs/baselines.md, which scripts/baselines.ts generates from this file.
 */
export interface ReferencePoint {
  id: string;
  label: string;
  labelAr: string;
  value: number;
  unit: 'minutes' | 'percent' | 'score out of 5';
  period: string;
  /** What the publisher says the figure covers. */
  measures: string;
  /** What the figure does not tell you, so nobody leans on it for a claim it cannot carry. */
  doesNotMeasure: string;
  source: { title: string; publisher: string; url: string; retrievedOn: string };
}

const ADC_H1_2024 = {
  title: 'Abu Dhabi Customs Records Growth in Digital and Proactive Transactions in the First Half of 2024',
  publisher: 'Abu Dhabi Customs',
  url: 'https://www.adcustoms.gov.ae/Media-Centre/News/Abu-Dhabi-Customs-Records-Growth-in-Digital-and-Proactive-Transactions-in-the-First-Half-of-2024',
  retrievedOn: '2026-10-28',
};

export const REFERENCE_POINTS: ReferencePoint[] = [
  {
    id: 'adc-clearance-time-h1-2024',
    label: 'Time taken for customs clearance transactions',
    labelAr: 'الزمن المستغرق لمعاملات التخليص الجمركي',
    value: 13.86,
    unit: 'minutes',
    period: 'First half of 2024',
    measures: 'The average time for customs clearance transactions, as reported by Abu Dhabi Customs.',
    doesNotMeasure:
      'The announcement does not define which steps are included. It is not stated to be the WCO release time (arrival to physical release), and it gives no median, spread, split by lane, time spent with other authorities or time for physical inspection.',
    source: ADC_H1_2024,
  },
  {
    id: 'adc-clearance-time-h1-2023',
    label: 'Time taken for customs clearance transactions',
    labelAr: 'الزمن المستغرق لمعاملات التخليص الجمركي',
    value: 15.47,
    unit: 'minutes',
    period: 'First half of 2023',
    measures: 'The same measure for the same months a year earlier, given as the comparison in the same announcement.',
    doesNotMeasure: 'Same limits as the 2024 figure.',
    source: ADC_H1_2024,
  },
  {
    id: 'adc-prearrival-share-h1-2024',
    label: 'Pre-arrival share of customs clearance transactions',
    labelAr: 'حصة المعاملات الجمركية المنجزة قبل الوصول',
    value: 71,
    unit: 'percent',
    period: 'First half of 2024',
    measures: 'Pre-arrival customs clearance transactions as a share of all customs clearance transactions.',
    doesNotMeasure:
      'It counts customs transactions, not shipments, and says nothing about whether other authorities had also approved before arrival. Madoun counts a shipment as pre-arrival only when every blocking approval is in before it arrives.',
    source: ADC_H1_2024,
  },
  {
    id: 'lpi-uae-customs-2023',
    label: 'Logistics Performance Index, efficiency of customs clearance',
    labelAr: 'مؤشر الأداء اللوجستي، كفاءة التخليص الجمركي',
    value: 3.7,
    unit: 'score out of 5',
    period: '2023 edition (survey year 2022)',
    measures: 'Survey based score from freight forwarders and express carriers, 1 low to 5 high, for the United Arab Emirates.',
    doesNotMeasure: 'It is perception of the whole country, not Abu Dhabi alone, and not a measured time. Past editions are in docs/data/worldbank-lpi.json.',
    source: {
      title: 'Logistics Performance Index: Efficiency of customs clearance process (LP.LPI.CUST.XQ)',
      publisher: 'World Bank',
      url: 'https://api.worldbank.org/v2/country/ARE/indicator/LP.LPI.CUST.XQ?format=json',
      retrievedOn: '2026-10-28',
    },
  },
];

/** Figures we looked for and could not find in public sources. Stated so their absence is not mistaken for oversight. */
export const NOT_PUBLISHED: string[] = [
  'Review times and queue times of the other authorities (food safety, conformity, health, telecoms, environment) for Abu Dhabi cargo. Madoun\'s modelled gain depends on these, and they are assumptions.',
  'The share of Abu Dhabi containers that are physically inspected or scanned.',
  'Results of the Abu Dhabi time release study. The pilot covered nine journeys at Khalifa Port and recorded 23 time points per journey, but the durations are not in the public article.',
  'Median and 90th percentile release times by lane.',
];

export const byId = (id: string): ReferencePoint | undefined => REFERENCE_POINTS.find((r) => r.id === id);
