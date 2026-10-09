import type { Directory } from '@/engine/directory';

type Names = Pick<Directory, 'authorities' | 'traders'>;
type Locale = 'en' | 'ar';

/**
 * Turns the identifiers the engine stores for people and machines into names a reviewer can read.
 *   'adc:duty'          -> "Abu Dhabi Customs duty officer"  /  "ضابط المناوبة، جمارك أبوظبي"
 *   'adafsa:officer-3'  -> "Food Safety Authority officer 3" /  "الضابط 3، هيئة سلامة الغذاء"
 *   'adc:officer-you'   -> "You (demo officer)"              /  "أنت (ضابط تجريبي)"
 *   'cell-A1'           -> "Inspection cell A1"              /  "خلية الفحص A1"
 *   'tr-03 supplier'    -> "Supplier of <trader>"            /  "مورّد لدى <trader>"
 *   'system', 'madoun'  -> "Madoun system"                   /  "نظام مدوّن"
 * Unknown ids are returned unchanged (they are still identifiers, never blank).
 */
export function actorName(id: string, locale: Locale, dir?: Names): string {
  const ar = locale === 'ar';
  if (id === 'system' || id === 'madoun') return ar ? 'نظام مدوّن' : 'Madoun system';

  if (id === 'auditor:you') return ar ? 'أنت (مدقق)' : 'You (auditor)';
  if (id === 'operator:you') return ar ? 'أنت (مستورد/وكيل)' : 'You (trader or agent)';

  const cell = id.match(/^cell-([A-Za-z0-9]+)$/);
  if (cell) return ar ? `خلية الفحص ${cell[1]}` : `Inspection cell ${cell[1]}`;

  const supplier = id.match(/^(\S+) supplier$/);
  if (supplier) {
    const tr = dir?.traders[supplier[1]];
    const who = tr ? (ar ? tr.nameAr : tr.name) : supplier[1];
    return ar ? `مورّد لدى ${who}` : `Supplier of ${who}`;
  }

  const [aid, role = ''] = id.split(':');
  const a = dir?.authorities[aid];
  if (!a) return id;
  const au = ar ? a.nameAr : a.name;
  if (role === 'officer-you') return ar ? 'أنت (ضابط تجريبي)' : 'You (demo officer)';
  if (role === 'duty') return ar ? `ضابط المناوبة، ${au}` : `${au} duty officer`;
  if (role === 'officer') return ar ? `ضابط، ${au}` : `${au} officer`;
  const m = role.match(/^officer-(\d+)$/);
  if (m) return ar ? `الضابط ${m[1]}، ${au}` : `${au} officer ${m[1]}`;
  return id;
}

/** Replace actor ids that appear inside a longer sentence (e.g. an audit line that names the exception owner). */
export function inlineActors(text: string, locale: Locale, dir?: Names): string {
  return text.replace(/\b(?:[a-z]+:(?:duty|officer(?:-\w+)?)|cell-[A-Z0-9]+)\b/g, (m) => actorName(m, locale, dir));
}
