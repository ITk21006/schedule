// -----------------------------------------------------------------------------
// GREEDY SCHEDULE AUTOFILL
// -----------------------------------------------------------------------------
// Shared between `schedules.new.tsx` (creation) and `schedules.$id_.edit.tsx`
// (editing).
//
// Hard constraints:
//   1. Never overwrite an existing shift or leave day.
//   2. Skip days when the store is closed (Latvian holidays defined in
//      `STORE_CLOSED_DAYS` in schedule-constants.ts).
//   3. A single employee may not work more than MAX_CONSECUTIVE_WORK_DAYS
//      days in a row (default 4). After hitting the cap, the employee is
//      forced to rest, regardless of coverage gaps.
//   4. A single employee may not work more than MAX_CONSECUTIVE_10H_DAYS
//      solo 10-hour shifts in a row (default 3).
//
// Soft preferences (rotation pattern: 2–4 work days, then 1–3 days off):
//   • Greedy choice rule per day: among eligible employees, pick the one with
//     (a) the shortest current consecutive-work streak, then
//     (b) the fewest hours assigned so far (load balance), then
//     (c) the longest current consecutive-rest streak (well-rested first).
//
// Coverage rules:
//   • Each open day must have at least one shift starting at STORE_OPEN_TIME
//     (the "opener") and at least one shift ending at STORE_CLOSE_TIME (the
//     "closer").
//   • If 2+ employees are eligible: opener works 10:00–19:00 (8h), closer
//     works 12:00–21:00 (8h). 7-hour midday overlap with two people on
//     shift.
//   • If only 1 employee is eligible: assign a single 10h shift
//     (10:00–21:00) — covers both opener and closer roles.
//   • If 0 employees are eligible (all on leave / hit work-streak cap), the
//     day is reported as uncovered.
// -----------------------------------------------------------------------------

import { LEAVE_HOURS, isStoreClosed } from './schedule-constants';

export type ShiftData = { start: string; hours: string; leave: string };

export type EmployeeForAutofill = {
  id: string;
  firstName: string;
  lastName: string;
};

export type AutofillResult = {
  shifts: { [key: string]: ShiftData };
  assigned: number;
  uncoveredDays: number;
};

export const STORE_OPEN_TIME = '10:00';
export const STORE_CLOSE_TIME = '21:00';
export const CLOSER_START_TIME = '12:00';

// Hard constraint — no employee may work more than this many days in a row.
export const MAX_CONSECUTIVE_WORK_DAYS = 4;
// Hard constraint — no employee may take more than this many solo 10h shifts in a row.
export const MAX_CONSECUTIVE_10H_DAYS = 3;
// Default per-shift hours when filling a normal opener / closer.
const SHIFT_HOURS_NORMAL = 8;
// Hours assigned when a single employee covers the whole day.
const SHIFT_HOURS_SOLO = 10;

// Soft preference — try to give an employee at least this many days off after
// they have worked the maximum streak. (Used to score eligible candidates.)
export const MIN_REST_AFTER_MAX_STREAK = 1;

function calcEndTime(start: string, hours: string): string {
  if (!start || !hours) return '';
  const [h, m] = start.split(':').map(Number);
  const numHours = parseFloat(hours);
  const lunchBreak = numHours > 6 ? 1 : 0;
  const totalMinutes = h * 60 + m + (numHours + lunchBreak) * 60;
  const endH = Math.floor(totalMinutes / 60) % 24;
  const endM = totalMinutes % 60;
  return `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
}

export function autoFillSchedule(
  currentShifts: { [key: string]: ShiftData },
  monthDates: Date[],
  employees: EmployeeForAutofill[],
  // Latvia 2026 monthly working-hours norm. 0 disables the cap. Leave hours
  // (treated as 8h each) count against this budget, matching the labour
  // code's view of paid leave time.
  monthNormHours: number = 0
): AutofillResult {
  const newShifts: { [key: string]: ShiftData } = { ...currentShifts };
  const keyFor = (empId: string, day: number) => `${empId}_${day}`;

  // ---- Helper predicates -------------------------------------------------
  const isCellTaken = (empId: string, day: number): boolean => {
    const s = newShifts[keyFor(empId, day)];
    return !!(s && (s.leave || s.start || s.hours));
  };

  // "Working" = an actual shift (not leave, not "X" non-employment).
  const isWorkingDay = (empId: string, day: number): boolean => {
    const s = newShifts[keyFor(empId, day)];
    if (!s) return false;
    if (s.leave) return false;
    return !!(s.start && s.hours);
  };

  const consecutiveWorkBefore = (empId: string, day: number): number => {
    let streak = 0;
    for (let d = day - 1; d >= 1; d--) {
      if (isWorkingDay(empId, d)) streak++;
      else break;
    }
    return streak;
  };

  const consecutiveOffBefore = (empId: string, day: number): number => {
    let streak = 0;
    for (let d = day - 1; d >= 1; d--) {
      if (!isWorkingDay(empId, d)) streak++;
      else break;
    }
    return streak;
  };

  const consecutive10hBefore = (empId: string, day: number): number => {
    let streak = 0;
    for (let d = day - 1; d >= 1; d--) {
      const s = newShifts[keyFor(empId, d)];
      const isTen =
        s && !s.leave && s.start === STORE_OPEN_TIME && parseInt(s.hours || '0') === 10;
      if (isTen) streak++;
      else break;
    }
    return streak;
  };

  const employeeWorkingHours = (empId: string): number => {
    let total = 0;
    monthDates.forEach((_, idx) => {
      const s = newShifts[keyFor(empId, idx + 1)];
      if (!s) return;
      if (s.leave) {
        if (s.leave !== 'X') total += LEAVE_HOURS;
      } else if (s.start && s.hours) {
        total += parseInt(s.hours);
      }
    });
    return total;
  };

  // How many extra working hours the employee can still receive this month.
  // `Infinity` when no monthly norm is enforced.
  const remainingBudget = (empId: string): number => {
    if (!monthNormHours) return Infinity;
    return monthNormHours - employeeWorkingHours(empId);
  };

  const setShift = (empId: string, day: number, start: string, hours: string) => {
    newShifts[keyFor(empId, day)] = { start, hours, leave: '' };
  };

  const dayHasOpener = (day: number): boolean =>
    employees.some(emp => {
      const s = newShifts[keyFor(emp.id, day)];
      return !!(s && !s.leave && s.start === STORE_OPEN_TIME);
    });

  const dayHasCloser = (day: number): boolean =>
    employees.some(emp => {
      const s = newShifts[keyFor(emp.id, day)];
      if (!s || s.leave || !s.start || !s.hours) return false;
      return calcEndTime(s.start, s.hours) === STORE_CLOSE_TIME;
    });

  // ---- Main pass: chronological greedy day-by-day assignment -------------
  let assignedCount = 0;
  let uncoveredDays = 0;

  for (let day = 1; day <= monthDates.length; day++) {
    const date = monthDates[day - 1];
    if (isStoreClosed(date)) continue;

    const needsOpener = !dayHasOpener(day);
    const needsCloser = !dayHasCloser(day);
    if (!needsOpener && !needsCloser) continue;

    // Eligible = available + under work-streak cap + still has budget for an
    // 8h shift this month (if the monthly norm is enforced).
    const eligible = employees
      .filter(emp => !isCellTaken(emp.id, day))
      .filter(emp => consecutiveWorkBefore(emp.id, day) < MAX_CONSECUTIVE_WORK_DAYS)
      .filter(emp => remainingBudget(emp.id) >= SHIFT_HOURS_NORMAL);

    // Greedy ordering — see header comment for rule details.
    eligible.sort((a, b) => {
      const aWork = consecutiveWorkBefore(a.id, day);
      const bWork = consecutiveWorkBefore(b.id, day);
      if (aWork !== bWork) return aWork - bWork;

      const aHours = employeeWorkingHours(a.id);
      const bHours = employeeWorkingHours(b.id);
      if (aHours !== bHours) return aHours - bHours;

      const aOff = consecutiveOffBefore(a.id, day);
      const bOff = consecutiveOffBefore(b.id, day);
      return bOff - aOff;
    });

    if (eligible.length === 0) {
      uncoveredDays++;
      continue;
    }

    if (needsOpener && needsCloser) {
      if (eligible.length === 1) {
        // Solo coverage path. A 10h shift covers both opener and closer roles —
        // but only if the employee's 10h streak and remaining monthly budget
        // both allow it.
        const emp = eligible[0];
        const tenStreak = consecutive10hBefore(emp.id, day);
        const canDoTen =
          tenStreak < MAX_CONSECUTIVE_10H_DAYS &&
          remainingBudget(emp.id) >= SHIFT_HOURS_SOLO;
        if (canDoTen) {
          setShift(emp.id, day, STORE_OPEN_TIME, String(SHIFT_HOURS_SOLO));
          assignedCount++;
        } else {
          // Fall back to an 8h opener — closer stays uncovered for the day.
          setShift(emp.id, day, STORE_OPEN_TIME, String(SHIFT_HOURS_NORMAL));
          assignedCount++;
          uncoveredDays++;
        }
      } else {
        // 2-person coverage: opener 10:00–19:00, closer 12:00–21:00.
        const opener = eligible[0];
        const closer = eligible[1];
        setShift(opener.id, day, STORE_OPEN_TIME, String(SHIFT_HOURS_NORMAL));
        setShift(closer.id, day, CLOSER_START_TIME, String(SHIFT_HOURS_NORMAL));
        assignedCount += 2;
      }
    } else if (needsOpener) {
      setShift(eligible[0].id, day, STORE_OPEN_TIME, String(SHIFT_HOURS_NORMAL));
      assignedCount++;
    } else if (needsCloser) {
      setShift(eligible[0].id, day, CLOSER_START_TIME, String(SHIFT_HOURS_NORMAL));
      assignedCount++;
    }
  }

  return { shifts: newShifts, assigned: assignedCount, uncoveredDays };
}

export function autofillSummaryMessage(result: AutofillResult): string {
  if (result.assigned === 0 && result.uncoveredDays === 0) {
    return 'Autofill: nothing to do — every open day already has full coverage.';
  }
  if (result.uncoveredDays > 0) {
    return (
      `Autofill complete: ${result.assigned} shift(s) added.\n` +
      `${result.uncoveredDays} day(s) could not be fully covered ` +
      `(no eligible employee — either all on leave, already scheduled, ` +
      `the 4-day work / 3-day 10h-streak cap was hit, or every employee ` +
      `has reached the monthly hours norm).`
    );
  }
  return `Autofill complete: ${result.assigned} shift(s) added.`;
}
