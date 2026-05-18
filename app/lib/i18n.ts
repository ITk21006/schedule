// -----------------------------------------------------------------------------
// SITE TRANSLATIONS — English / Latvian
// -----------------------------------------------------------------------------
// Language is stored in the `lang` cookie (server-side, set by /set-language
// action). The root loader reads it and exposes it to every page via
// useRouteLoaderData('root'). Components call `useT()` to get a translation
// function bound to the current language.
// -----------------------------------------------------------------------------

import { useRouteLoaderData } from 'react-router';

export type Lang = 'en' | 'lv';

type Dict = { [key: string]: string };

const en: Dict = {
  // Common
  'common.appTitle': 'Schedule Manager',
  'common.logout': 'Logout',
  'common.back': '← Back',
  'common.backToSchedule': '← Back to Schedule',
  'common.backToSchedules': '← Back to Schedules',
  'common.cancel': 'Cancel',
  'common.confirm': 'Confirm',
  'common.loading': 'Loading…',
  'common.notes': 'Notes',
  'common.notesField': 'Notes / Comments',
  'common.notesPlaceholder': 'Add any notes about this schedule…',
  'common.store': 'Store',
  'common.createdBy': 'Created by',
  'common.monthlyNorm': 'Monthly norm',
  'common.period': 'Period',
  'common.total': 'Total',
  'common.totalHoursInDay': 'Total hours in day:',
  'common.firstName': 'Vārds',
  'common.lastName': 'Uzvārds',
  'common.username': 'P.k.',
  'common.submitted': 'Submitted',
  'common.weekday': 'Weekday',
  'common.weekend': 'Weekend',
  'common.holiday': 'Holiday',

  // Roles
  'role.EMPLOYEE': 'Employee',
  'role.MANAGER': 'Manager',
  'role.ALL_STORE_MANAGER': 'Senior Manager',

  // Status
  'status.DRAFT': 'DRAFT',
  'status.PENDING': 'PENDING',
  'status.APPROVED': 'ACCEPTED',
  'status.REJECTED': 'REJECTED',
  'status.PUBLISHED': 'PUBLISHED',

  // Login
  'login.title': 'Store Schedule Manager',
  'login.email': 'Email',
  'login.password': 'Password',
  'login.signIn': 'Sign In',
  'login.demoAccounts': 'Demo Accounts:',
  'login.demoAdmin': 'Admin: admin@example.com / password123',
  'login.demoManager': 'Manager: manager@example.com / password123',
  'login.demoEmployee': 'Employee: employee@example.com / password123',
  'login.errorInvalid': 'Invalid email or password',
  'login.errorForm': 'Invalid form submission',

  // Schedules list
  'schedules.mySchedules': 'My Schedules',
  'schedules.storeSchedules': 'Store Schedules',
  'schedules.newSchedule': 'New Schedule',
  'schedules.empty': 'No schedules available',
  'schedules.edit': 'Edit',

  // Schedule view
  'view.scheduleHeading': 'Schedule: {month}',
  'view.editSchedule': 'Edit Schedule',

  // Schedule edit / create
  'edit.heading': 'Edit Schedule: {month}',
  'edit.createHeading': 'Create Monthly Schedule',
  'edit.selectMonth': 'Select Month',
  'edit.monthlyNormDetail': 'Monthly norm: {h}h working hours per employee',
  'edit.autofillButton': 'Autofill empty days',
  'edit.autofillTooltip': 'Fills empty days while respecting existing shifts and leave',
  'edit.autofillConfirm': 'Autofill empty days using the greedy algorithm?\n\n• Existing shifts and leave days will not be changed\n• Each open day gets a 10:00 opener and a 21:00 closer\n• Pattern: 2–4 work days, then 1–3 days off (max 4 in a row)\n• Solo days become a single 10h shift (max 3 in a row)',
  'edit.saveDraft': 'Save as Draft',
  'edit.submitForApproval': 'Submit for Approval',

  // Closing-coverage warning
  'warn.closingTitle': '⚠ Closing coverage warnings',
  'warn.closingBody': 'The following day(s) have shifts assigned but nobody working until 21:00 (closing time):',
  'warn.closingHint': 'Add a shift ending at 21:00 (e.g. start 12:00 + 8h, or start 13:00 + 7h) on each flagged day.',

  // Hour validation
  'err.hourTitle': 'Hour validation errors:',
  'err.hourBody': "Each employee's working hours must match the monthly norm of {h}h to submit.",
  'err.hoursOver': '{w}h / {n}h ({d}h over)',
  'err.hoursShort': '{w}h / {n}h ({d}h short)',

  // Approvals
  'approvals.heading': 'Pending Approvals',
  'approvals.empty': 'No pending approvals',
  'approvals.commentLabel': 'Comment',
  'approvals.commentRequired': '(required for rejection)',
  'approvals.commentPlaceholder': 'Add a comment…',
  'approvals.accept': 'Accept Schedule',
  'approvals.reject': 'Reject',
  'approvals.commentMandatory': 'A comment is required when rejecting a schedule.',

  // Tooltips inside cells
  'cell.leaveTitle': 'Leave type',
  'cell.workingHours': 'Working hours',
  'cell.shiftStart': 'Shift start',

  // Notifications
  'notif.heading': 'Notifications',
  'notif.unreadSuffix': '({n} unread)',
  'notif.markAllRead': 'Mark all read',
  'notif.markRead': 'Mark read',
  'notif.dismiss': 'Dismiss',
  'notif.view': 'View',
  'notif.empty': 'No notifications',
};

const lv: Dict = {
  // Common
  'common.appTitle': 'Grafiku Pārvaldnieks',
  'common.logout': 'Iziet',
  'common.back': '← Atpakaļ',
  'common.backToSchedule': '← Atpakaļ uz grafiku',
  'common.backToSchedules': '← Atpakaļ uz grafikiem',
  'common.cancel': 'Atcelt',
  'common.confirm': 'Apstiprināt',
  'common.loading': 'Notiek ielāde…',
  'common.notes': 'Piezīmes',
  'common.notesField': 'Piezīmes / Komentāri',
  'common.notesPlaceholder': 'Pievienojiet piezīmes par šo grafiku…',
  'common.store': 'Veikals',
  'common.createdBy': 'Izveidoja',
  'common.monthlyNorm': 'Mēneša norma',
  'common.period': 'Periods',
  'common.total': 'Kopā',
  'common.totalHoursInDay': 'Kopējais stundu skaits dienā:',
  'common.firstName': 'Vārds',
  'common.lastName': 'Uzvārds',
  'common.username': 'P.k.',
  'common.submitted': 'Iesniegts',
  'common.weekday': 'Darba diena',
  'common.weekend': 'Brīvdiena',
  'common.holiday': 'Svētku diena',

  // Roles
  'role.EMPLOYEE': 'Darbinieks',
  'role.MANAGER': 'Veikala vadītājs',
  'role.ALL_STORE_MANAGER': 'Visu veikalu vadītājs',

  // Status
  'status.DRAFT': 'MELNRAKSTS',
  'status.PENDING': 'GAIDA',
  'status.APPROVED': 'APSTIPRINĀTS',
  'status.REJECTED': 'NORAIDĪTS',
  'status.PUBLISHED': 'PUBLICĒTS',

  // Login
  'login.title': 'Veikala Grafiku Pārvaldnieks',
  'login.email': 'E-pasts',
  'login.password': 'Parole',
  'login.signIn': 'Pieslēgties',
  'login.demoAccounts': 'Demonstrācijas konti:',
  'login.demoAdmin': 'Administrators: admin@example.com / password123',
  'login.demoManager': 'Vadītājs: manager@example.com / password123',
  'login.demoEmployee': 'Darbinieks: employee@example.com / password123',
  'login.errorInvalid': 'Nepareizs e-pasts vai parole',
  'login.errorForm': 'Nederīga formas iesniegšana',

  // Schedules list
  'schedules.mySchedules': 'Mani grafiki',
  'schedules.storeSchedules': 'Veikala grafiki',
  'schedules.newSchedule': 'Jauns grafiks',
  'schedules.empty': 'Nav pieejamu grafiku',
  'schedules.edit': 'Rediģēt',

  // Schedule view
  'view.scheduleHeading': 'Grafiks: {month}',
  'view.editSchedule': 'Rediģēt grafiku',

  // Schedule edit / create
  'edit.heading': 'Rediģēt grafiku: {month}',
  'edit.createHeading': 'Izveidot mēneša grafiku',
  'edit.selectMonth': 'Izvēlieties mēnesi',
  'edit.monthlyNormDetail': 'Mēneša norma: {h}h darba stundas vienam darbiniekam',
  'edit.autofillButton': 'Aizpildīt tukšās dienas',
  'edit.autofillTooltip': 'Aizpilda tukšās dienas, neskarot esošos ierakstus',
  'edit.autofillConfirm': 'Aizpildīt tukšās dienas izmantojot algoritmu?\n\n• Esošās maiņas un prombūtnes netiks mainītas\n• Katrai atvērtajai dienai tiek piešķirts 10:00 atvērējs un 21:00 slēdzējs\n• Modelis: 2–4 darba dienas, pēc tam 1–3 brīvdienas (maks. 4 pēc kārtas)\n• Vienatnes dienas kļūst par vienu 10h maiņu (maks. 3 pēc kārtas)',
  'edit.saveDraft': 'Saglabāt kā melnrakstu',
  'edit.submitForApproval': 'Iesniegt apstiprināšanai',

  // Closing-coverage warning
  'warn.closingTitle': '⚠ Slēgšanas pārklājuma brīdinājumi',
  'warn.closingBody': 'Šajās dienās ir piešķirtas maiņas, bet neviens nestrādā līdz 21:00 (slēgšanas laikam):',
  'warn.closingHint': 'Pievienojiet maiņu, kas beidzas 21:00 (piem., sākums 12:00 + 8h vai sākums 13:00 + 7h) katrai atzīmētajai dienai.',

  // Hour validation
  'err.hourTitle': 'Stundu skaita kļūdas:',
  'err.hourBody': 'Katra darbinieka darba stundām jāatbilst mēneša normai {h}h, lai iesniegtu.',
  'err.hoursOver': '{w}h / {n}h ({d}h pārsniegts)',
  'err.hoursShort': '{w}h / {n}h (trūkst {d}h)',

  // Approvals
  'approvals.heading': 'Gaidošie apstiprinājumi',
  'approvals.empty': 'Nav gaidošu apstiprinājumu',
  'approvals.commentLabel': 'Komentārs',
  'approvals.commentRequired': '(obligāts noraidīšanai)',
  'approvals.commentPlaceholder': 'Pievienot komentāru…',
  'approvals.accept': 'Apstiprināt grafiku',
  'approvals.reject': 'Noraidīt',
  'approvals.commentMandatory': 'Noraidot grafiku, ir nepieciešams komentārs.',

  // Tooltips inside cells
  'cell.leaveTitle': 'Prombūtnes veids',
  'cell.workingHours': 'Darba stundas',
  'cell.shiftStart': 'Maiņas sākums',

  // Notifications
  'notif.heading': 'Paziņojumi',
  'notif.unreadSuffix': '({n} nelasīti)',
  'notif.markAllRead': 'Atzīmēt visus kā lasītus',
  'notif.markRead': 'Atzīmēt kā lasītu',
  'notif.dismiss': 'Noņemt',
  'notif.view': 'Skatīt',
  'notif.empty': 'Nav paziņojumu',
};

export const translations: Record<Lang, Dict> = { en, lv };

export function translate(lang: Lang, key: string, params?: Record<string, string | number>): string {
  let str = translations[lang]?.[key] ?? translations.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return str;
}

// ---- React hooks ----------------------------------------------------------
export function useLang(): Lang {
  const data = useRouteLoaderData('root') as { lang?: Lang } | undefined;
  return (data?.lang as Lang) || 'en';
}

export function useT(): (key: string, params?: Record<string, string | number>) => string {
  const lang = useLang();
  return (key, params) => translate(lang, key, params);
}

// Locale string for toLocaleDateString / toLocaleTimeString.
export function localeFor(lang: Lang): string {
  return lang === 'lv' ? 'lv-LV' : 'en-US';
}

// Day-name abbreviations matching DAY_NAMES order (Sun→Sat).
export function dayNamesFor(lang: Lang): string[] {
  return lang === 'lv'
    ? ['Sv', 'Pir', 'Otr', 'Tre', 'Cet', 'Pie', 'Ses']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
}
