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

export const HOLIDAYS_2026: string[] = [
  '2026-01-01',
  '2026-04-03',
  '2026-04-05',
  '2026-04-06',
  '2026-05-01',
  '2026-05-04',
  '2026-06-23',
  '2026-06-24',
  '2026-11-18',
  '2026-12-24',
  '2026-12-25',
  '2026-12-26',
  '2026-12-31',
];

export const PRE_HOLIDAY_DAYS: string[] = [
  '2026-04-02',
  '2026-04-30',
  '2026-06-22',
  '2026-11-17',
  '2026-12-23',
  '2026-12-30',
];

export function dateToKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function isHoliday(date: Date): boolean {
  return HOLIDAYS_2026.includes(dateToKey(date));
}

export function isPreHoliday(date: Date): boolean {
  return PRE_HOLIDAY_DAYS.includes(dateToKey(date));
}

export function getCellColor(date: Date): string {
  if (isHoliday(date)) return 'bg-red-100';
  const day = date.getDay();
  if (day === 0 || day === 6) return 'bg-blue-50';
  return 'bg-gray-50';
}

export function getCellBgColor(date: Date): string {
  if (isHoliday(date)) return '#fee2e2';       // red-100
  const day = date.getDay();
  if (day === 6) return '#cbd5e1';              // slate-300 – Saturday
  if (day === 0) return '#b0bec5';              // darker blue-gray – Sunday
  return '#f9fafb';                             // gray-50 – weekday
}

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
