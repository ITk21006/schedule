export const LEAVE_HOURS = 8;

export const LEAVE_TYPES: { code: string; label: string; bg: string; color: string }[] = [
  { code: 'A',  label: 'Atvaļinājums',                  bg: '#fef3c7', color: '#92400e' },
  { code: 'SA', label: 'Slimības lapa A',                bg: '#a8d5a2', color: '#1a5c14' },
  { code: 'SB', label: 'Slimības lapa B',                bg: '#bfdbfe', color: '#1e40af' },
  { code: 'TA', label: 'Tēva atvaļinājums',              bg: '#fef3c7', color: '#92400e' },
  { code: 'PA', label: 'Papildatvaļinājums',             bg: '#fef3c7', color: '#92400e' },
  { code: 'O',  label: 'Bērna kopšanas atvaļinājums',    bg: '#fef3c7', color: '#92400e' },
  { code: 'X',  label: 'Nav uzsāktas vai beigušās darba attiecības', bg: '#ffffff', color: '#333' },
];

export function getLeaveTypeByCode(code: string) {
  return LEAVE_TYPES.find(l => l.code === code);
}

export function getLeaveTypeByLabel(label: string) {
  return LEAVE_TYPES.find(l => l.label === label);
}

// 2026 Latvia monthly working hours norm (from tavirekini.lv)
export const MONTHLY_WORK_HOURS: { [key: string]: number } = {
  '2026-01': 168,
  '2026-02': 160,
  '2026-03': 176,
  '2026-04': 158,
  '2026-05': 152,
  '2026-06': 159,
  '2026-07': 184,
  '2026-08': 168,
  '2026-09': 176,
  '2026-10': 176,
  '2026-11': 159,
  '2026-12': 158,
};

// Days the shopping center is FULLY CLOSED — no work scheduled.
// In practice the centre only closes on New Year's Day and Jāņi (Midsummer).
// Other national holidays are visually flagged but the centre stays open.
export const STORE_CLOSED_DAYS: string[] = [
  '2026-01-01', // New Year's Day
  '2026-06-23', // Līgo (Midsummer Eve)
  '2026-06-24', // Jāņi (Midsummer Day)
];

// Latvia 2026 official public holidays (svētku dienas / brīvdienas) plus the
// commemorative days that show up in red on the national work-day calendar.
// Source: https://www.tavirekini.lv/noderigi/2026-gada-darba-dienu-kalendars
//
// These are highlighted red in the schedule UI for visibility, but unlike
// STORE_CLOSED_DAYS they do not block scheduling — most retail centres still
// operate (with holiday-rate pay) on these dates. The Latvian monthly
// working-hours norm in MONTHLY_WORK_HOURS already accounts for these days.
export const PUBLIC_HOLIDAYS_2026: { [date: string]: string } = {
  '2026-01-01': 'Jaunais gads',
  '2026-04-03': 'Lielā Piektdiena',
  '2026-04-05': 'Lieldienas',
  '2026-04-06': 'Otrās Lieldienas',
  '2026-05-01': 'Darba svētki',
  '2026-05-04': 'Latvijas Republikas Neatkarības atjaunošanas diena',
  '2026-05-10': 'Mātes diena',
  '2026-05-24': 'Vasarsvētki',
  '2026-06-23': 'Līgo',
  '2026-06-24': 'Jāņu diena',
  '2026-11-18': 'Latvijas Republikas proklamēšanas diena',
  '2026-12-24': 'Ziemassvētku vakars',
  '2026-12-25': 'Pirmie Ziemassvētki',
  '2026-12-26': 'Otrie Ziemassvētki',
  '2026-12-31': 'Vecgada vakars',
};

// Days the shopping center is open with shortened hours. Rare — leave empty unless
// the centre announces shortened hours for a specific date.
export const STORE_SHORTENED_DAYS: string[] = [];

export function dateToKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function isStoreClosed(date: Date): boolean {
  return STORE_CLOSED_DAYS.includes(dateToKey(date));
}

export function isStoreShortened(date: Date): boolean {
  return STORE_SHORTENED_DAYS.includes(dateToKey(date));
}

export function isPublicHoliday(date: Date): boolean {
  return dateToKey(date) in PUBLIC_HOLIDAYS_2026;
}

export function getPublicHolidayName(date: Date): string | undefined {
  return PUBLIC_HOLIDAYS_2026[dateToKey(date)];
}

export function getCellColor(date: Date): string {
  if (isStoreClosed(date) || isPublicHoliday(date)) return 'bg-red-100';
  if (isStoreShortened(date)) return 'bg-amber-50';
  const day = date.getDay();
  if (day === 0 || day === 6) return 'bg-blue-50';
  return 'bg-gray-50';
}

export function getCellBgColor(date: Date): string {
  // Public holidays (incl. store closures) win first — they overlay weekends.
  if (isStoreClosed(date) || isPublicHoliday(date)) return '#fee2e2'; // red-100
  if (isStoreShortened(date)) return '#fef3c7';                       // amber-100
  const day = date.getDay();
  if (day === 6) return '#cbd5e1';                                    // slate-300 – Saturday
  if (day === 0) return '#b0bec5';                                    // darker blue-gray – Sunday
  return '#f9fafb';                                                   // gray-50 – weekday
}

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
