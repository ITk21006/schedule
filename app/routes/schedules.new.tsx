import { redirect, data, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import { Form, useLoaderData } from 'react-router';
import { requireUserId } from '~/lib/session.server';
import { getCurrentUser } from '~/lib/auth.server';
import { prisma } from '~/lib/db.server';
import {
  LEAVE_TYPES, LEAVE_HOURS, MONTHLY_WORK_HOURS,
  getLeaveTypeByCode, getCellBgColor, DAY_NAMES,
} from '~/lib/schedule-constants';
import {
  autoFillSchedule, autofillSummaryMessage,
  type ShiftData,
} from '~/lib/autofill';
import { useT, useLang, dayNamesFor, localeFor } from '~/lib/i18n';
import { LanguageToggle } from '~/components/LanguageToggle';
import { useState, useMemo } from 'react';

const END_LIMIT = 21 * 60; // 21:00 in minutes

const START_TIMES = (() => {
  const times: string[] = [];
  for (let h = 9; h <= 21; h++) {
    times.push(`${h.toString().padStart(2, '0')}:00`);
  }
  return times;
})();

const ALL_HOUR_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function getMaxWorkingHours(start: string): number {
  if (!start) return 12;
  const [h, m] = start.split(':').map(Number);
  const startMinutes = h * 60 + m;
  const availableMinutes = END_LIMIT - startMinutes;
  if (availableMinutes <= 0) return 0;
  // Find max working hours where working + lunch <= available time
  // lunch = 1h if working > 6
  for (let wh = 12; wh >= 1; wh--) {
    const lunch = wh > 6 ? 60 : 0;
    if (wh * 60 + lunch <= availableMinutes) return wh;
  }
  return 0;
}

function getHourOptions(start: string): number[] {
  const max = getMaxWorkingHours(start);
  return ALL_HOUR_OPTIONS.filter(h => h <= max);
}

function calcEndTime(start: string, hours: string): string {
  if (!start || !hours) return '';
  const [h, m] = start.split(':').map(Number);
  const numHours = parseFloat(hours);
  const lunchBreak = numHours > 6 ? 1 : 0;
  const totalMinutes = (h * 60 + m) + (numHours + lunchBreak) * 60;
  const endH = Math.floor(totalMinutes / 60) % 24;
  const endM = totalMinutes % 60;
  return `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const user = await getCurrentUser(userId);
  
  if (!user || user.role !== 'MANAGER') {
    throw new Response('Unauthorized', { status: 403 });
  }

  const employees = await prisma.user.findMany({
    where: {
      storeId: user.storeId,
      role: 'EMPLOYEE',
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    },
    orderBy: [
      { lastName: 'asc' },
      { firstName: 'asc' },
    ],
  });

  return data({ user, employees });
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const user = await getCurrentUser(userId);
  
  if (!user || user.role !== 'MANAGER') {
    throw new Response('Unauthorized', { status: 403 });
  }

  const formData = await request.formData();
  const monthYear = formData.get('monthYear');
  const action = formData.get('action');
  const notes = (formData.get('notes') as string) || '';

  if (typeof monthYear !== 'string') {
    return data({ error: 'Invalid date' }, { status: 400 });
  }

  const [year, month] = monthYear.split('-').map(Number);
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  const entriesData: any[] = [];
  
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('shift_')) {
      const [_, empId, day] = key.split('_');
      const shiftValue = value.toString();
      
      if (shiftValue && shiftValue !== '' && shiftValue !== 'X') {
        const date = new Date(year, month - 1, parseInt(day));

        let startTime = '08:00';
        let endTime = '16:00';
        let shiftType = 'Day Shift';

        if (shiftValue.startsWith('LEAVE:')) {
          const leaveCode = shiftValue.replace('LEAVE:', '');
          const lt = LEAVE_TYPES.find(l => l.code === leaveCode);
          startTime = '00:00';
          endTime = '00:00';
          shiftType = lt ? lt.label : leaveCode;
        } else if (shiftValue.includes('-')) {
          const [start, end] = shiftValue.split('-');
          startTime = start.trim();
          endTime = end.trim();
          shiftType = 'Custom Shift';
        } else if (shiftValue.match(/^\d+$/)) {
          const hours = parseInt(shiftValue);
          startTime = '08:00';
          const endHour = 8 + hours + (hours > 6 ? 1 : 0);
          endTime = `${endHour.toString().padStart(2, '0')}:00`;
          shiftType = 'Day Shift';
        }

        entriesData.push({
          userId: empId,
          date: date,
          startTime: startTime,
          endTime: endTime,
          shiftType: shiftType,
        });
      }
    }
  }

  if (entriesData.length === 0) {
    return data({ error: 'Please add at least one shift' }, { status: 400 });
  }

  // Server-side hour validation for submit (not draft)
  if (action === 'submit') {
    const normHours = MONTHLY_WORK_HOURS[monthYear];
    if (normHours) {
      const empHours: { [empId: string]: number } = {};
      for (const entry of entriesData) {
        // Leave types count as 8 working hours
        const isLeave = LEAVE_TYPES.some(lt => lt.label === entry.shiftType || lt.code === entry.shiftType);
        if (isLeave) {
          empHours[entry.userId] = (empHours[entry.userId] || 0) + LEAVE_HOURS;
          continue;
        }
        const [sH, sM] = entry.startTime.split(':').map(Number);
        const [eH, eM] = entry.endTime.split(':').map(Number);
        let totalH = (eH + eM / 60) - (sH + sM / 60);
        if (totalH < 0) totalH += 24;
        // Deduct 1h lunch if shift > 6h
        const workingH = totalH > 7 ? totalH - 1 : totalH;
        empHours[entry.userId] = (empHours[entry.userId] || 0) + workingH;
      }
      const violations = Object.entries(empHours).filter(([_, h]) => Math.round(h) !== normHours);
      if (violations.length > 0) {
        return data({ error: `Employee hours must match the monthly norm of ${normHours}h. Some employees have incorrect totals.` }, { status: 400 });
      }
    }
  }

  const schedule = await prisma.schedule.create({
    data: {
      weekStart: startDate,
      weekEnd: endDate,
      status: action === 'submit' ? 'PENDING' : 'DRAFT',
      notes: notes || null,
      storeId: user.storeId,
      createdById: user.id,
      entries: {
        create: entriesData,
      },
    },
  });

  if (action === 'submit') {
    await prisma.approval.create({
      data: {
        scheduleId: schedule.id,
        status: 'PENDING',
      },
    });
  }

  return redirect('/schedules');
}

export default function NewSchedule() {
  const { user, employees } = useLoaderData<typeof loader>();
  const t = useT();
  const lang = useLang();
  const locale = localeFor(lang);
  const dayNames = dayNamesFor(lang);
  
  // Set default to current month
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  const [monthYear, setMonthYear] = useState(defaultMonth);
  const [shifts, setShifts] = useState<{[key: string]: ShiftData}>({});

  // Generate month options (current month + next 12 months)
  const getMonthOptions = () => {
    const options = [];
    const current = new Date();
    
    for (let i = 0; i < 12; i++) {
      const date = new Date(current.getFullYear(), current.getMonth() + i, 1);
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
      options.push({ value, label });
    }
    
    return options;
  };

  const getDaysInMonth = () => {
    if (!monthYear) return [];
    const [year, month] = monthYear.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const dates = [];
    
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(year, month - 1, i);
      dates.push(date);
    }
    return dates;
  };

  const monthDates = getDaysInMonth();

  const handleShiftStart = (empId: string, day: number, start: string) => {
    const key = `${empId}_${day}`;
    setShifts(prev => {
      const currentHours = prev[key]?.hours || '';
      const max = getMaxWorkingHours(start);
      const clampedHours = currentHours && parseInt(currentHours) > max ? (max > 0 ? String(max) : '') : currentHours;
      return { ...prev, [key]: { start, hours: clampedHours, leave: '' } };
    });
  };

  const handleShiftHours = (empId: string, day: number, hours: string) => {
    const key = `${empId}_${day}`;
    setShifts(prev => ({
      ...prev,
      [key]: { start: prev[key]?.start || '', hours, leave: '' }
    }));
  };

  const handleLeave = (empId: string, day: number, leave: string) => {
    const key = `${empId}_${day}`;
    setShifts(prev => ({
      ...prev,
      [key]: { start: '', hours: '', leave }
    }));
  };

  const calculateDayHours = (shift: ShiftData | undefined): { total: number; working: number } => {
    if (!shift) return { total: 0, working: 0 };
    // X = no employment relationship, counts as 0 hours
    if (shift.leave === 'X') return { total: 0, working: 0 };
    // Leave day = 8 working hours
    if (shift.leave) return { total: LEAVE_HOURS, working: LEAVE_HOURS };
    if (!shift.start || !shift.hours) return { total: 0, working: 0 };
    const hours = parseFloat(shift.hours);
    const lunchBreak = hours > 6 ? 1 : 0;
    return { total: hours + lunchBreak, working: hours };
  };

  const calculateEmployeeTotal = (empId: string) => {
    let totalHours = 0;
    let workingHours = 0;

    monthDates.forEach((_, idx) => {
      const day = idx + 1;
      const { total, working } = calculateDayHours(shifts[`${empId}_${day}`]);
      totalHours += total;
      workingHours += working;
    });

    return { total: totalHours, working: workingHours };
  };

  const calculateDayTotals = (day: number) => {
    let totalHours = 0;
    let workingHours = 0;

    employees.forEach(emp => {
      const { total, working } = calculateDayHours(shifts[`${emp.id}_${day}`]);
      totalHours += total;
      workingHours += working;
    });

    return { total: totalHours, working: workingHours };
  };

  const monthOptions = getMonthOptions();
  const monthNormHours = MONTHLY_WORK_HOURS[monthYear] || 0;

  // Greedy autofill — see app/lib/autofill.ts for the algorithm and rules.
  // Passing the monthly norm caps each employee's hours so the autofill
  // cannot push someone past the legal monthly working-hours limit.
  const runAutoFill = () => {
    const result = autoFillSchedule(shifts, monthDates, employees, monthNormHours);
    setShifts(result.shifts);
    window.alert(autofillSummaryMessage(result));
  };

  // Validation: check each employee's working hours against the norm
  const employeeHourErrors = useMemo(() => {
    if (!monthNormHours) return {};
    const errors: { [empId: string]: string } = {};
    employees.forEach(emp => {
      const { working } = calculateEmployeeTotal(emp.id);
      if (working > 0 && working !== monthNormHours) {
        errors[emp.id] = working < monthNormHours
          ? t('err.hoursShort', { w: working, n: monthNormHours, d: monthNormHours - working })
          : t('err.hoursOver',  { w: working, n: monthNormHours, d: working - monthNormHours });
      }
    });
    return errors;
  }, [shifts, monthNormHours, employees, monthDates, t]);

  const hasHourErrors = Object.keys(employeeHourErrors).length > 0;
  // Only employees who have at least some hours assigned count for validation
  const hasAnyAssignedShifts = employees.some(emp => calculateEmployeeTotal(emp.id).working > 0);
  const canSubmit = !hasHourErrors || !hasAnyAssignedShifts;

  // Days that have shifts but nobody scheduled to work until 21:00 (closing).
  // Non-blocking warning — the manager may have intentionally closed early,
  // but in practice this almost always indicates a missed shift.
  const closingCoverageWarnings = useMemo(() => {
    const warnings: { day: number; date: Date }[] = [];
    monthDates.forEach((date, idx) => {
      const day = idx + 1;
      let hasAnyShift = false;
      let hasCloser = false;
      employees.forEach(emp => {
        const s = shifts[`${emp.id}_${day}`];
        if (!s || s.leave) return;
        if (s.start && s.hours) {
          hasAnyShift = true;
          if (calcEndTime(s.start, s.hours) === '21:00') hasCloser = true;
        }
      });
      if (hasAnyShift && !hasCloser) warnings.push({ day, date });
    });
    return warnings;
  }, [shifts, monthDates, employees]);

  return (
    <div className="min-h-screen bg-gray-50" style={{ overflowX: 'hidden' }}>
      <header className="bdheader">
        <div className="bdlogo" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <LanguageToggle />
          <span className="text-white text-xl font-bold">{t('common.appTitle')}</span>
        </div>
        <div className="userNameContainer">
          <span className="userName">{user.firstName} {user.lastName}</span>
          <Form method="post" action="/logout" style={{ display: 'inline' }}>
            <button
              type="submit"
              className="ml-4 px-3 py-1 bg-white text-sm rounded hover:bg-gray-100"
              style={{ color: 'var(--primary-color)' }}
            >
              {t('common.logout')}
            </button>
          </Form>
        </div>
      </header>

      <main className="p-6">
        <div style={{ maxWidth: '100%', overflow: 'hidden' }}>
          <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--primary-color)' }}>
            {t('edit.createHeading')}
          </h2>

          <Form method="post" className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="mb-4">
                <label htmlFor="monthYear" className="block text-sm font-medium text-gray-700 mb-2">
                  {t('edit.selectMonth')}
                </label>
                <select
                  id="monthYear"
                  name="monthYear"
                  value={monthYear}
                  onChange={(e) => setMonthYear(e.target.value)}
                  required
                  className="px-3 py-2 border border-gray-300 rounded-md w-64"
                >
                  {monthOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-4 p-4 bg-gray-50 rounded">
                <div className="text-sm space-y-1">
                  <div className="mt-2" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {LEAVE_TYPES.map(lt => (
                      <span key={lt.code} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold" style={{ backgroundColor: lt.bg, color: lt.color, border: lt.code === 'X' ? '1px solid #d1d5db' : 'none', width: 'fit-content' }}>
                        {lt.code} — {lt.label}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => {
                        const ok = window.confirm(t('edit.autofillConfirm'));
                        if (ok) runAutoFill();
                      }}
                      className="px-4 py-2 text-sm font-medium text-white rounded-md hover:opacity-90"
                      style={{ backgroundColor: 'var(--primary-color)' }}
                      title={t('edit.autofillTooltip')}
                    >
                      {t('edit.autofillButton')}
                    </button>
                  </div>
                </div>
                {monthNormHours > 0 && (
                  <div className="mt-2 text-sm font-medium">
                    {t('edit.monthlyNormDetail', { h: monthNormHours })}
                  </div>
                )}
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="border-collapse" style={{ fontSize: '12px', minWidth: '100%' }}>
                  <thead>
                    {/* Period row */}
                    <tr>
                      <td className="border border-gray-300 px-2 py-1 font-semibold bg-gray-100" rowSpan={3}>
                        {t('common.firstName')}
                      </td>
                      <td className="border border-gray-300 px-2 py-1 font-semibold bg-gray-100" rowSpan={3}>
                        {t('common.lastName')}
                      </td>
                      <td className="border border-gray-300 px-2 py-1 font-semibold bg-gray-100" rowSpan={3}>
                        {t('common.username')}
                      </td>
                      <td className="border border-gray-300 px-2 py-1 text-center bg-gray-100" colSpan={monthDates.length}>
                        {t('common.period')}: {monthDates[0]?.toLocaleDateString(locale, { year: 'numeric', month: 'long' })}
                      </td>
                      <td className="border border-gray-300 px-2 py-1 text-center bg-gray-100" rowSpan={3}>
                        {t('common.total')}
                      </td>
                    </tr>

                    {/* Weekday row */}
                    <tr>
                      {monthDates.map((date, idx) => (
                        <td key={idx} className="border border-gray-300 px-1 py-1 text-center text-xs" style={{ backgroundColor: getCellBgColor(date) }}>
                          {dayNames[date.getDay()]}
                        </td>
                      ))}
                    </tr>
                    
                    {/* Date row */}
                    <tr>
                      {monthDates.map((date, idx) => (
                        <td key={idx} className="border border-gray-300 px-1 py-1 text-center font-semibold" style={{ backgroundColor: getCellBgColor(date) }}>
                          {date.getDate()}
                        </td>
                      ))}
                    </tr>
                  </thead>
                  
                  <tbody>
                    {employees.map((emp) => {
                      const empTotals = calculateEmployeeTotal(emp.id);
                      // Thicker bottom border separates each employee row.
                      const rowDivider = { borderBottom: '2px solid #4b5563' };
                      return (
                        <tr key={emp.id}>
                          <td className="border border-gray-300 px-2 py-1" style={rowDivider}>
                            {emp.firstName}
                          </td>
                          <td className="border border-gray-300 px-2 py-1" style={rowDivider}>
                            {emp.lastName}
                          </td>
                          <td className="border border-gray-300 px-2 py-1 text-xs" style={rowDivider}>
                            {emp.email.split('@')[0]}
                          </td>
                          {monthDates.map((date, idx) => {
                            const day = idx + 1;
                            const key = `${emp.id}_${day}`;
                            const shift = shifts[key];
                            const hasLeave = !!shift?.leave;
                            const leaveInfo = hasLeave ? getLeaveTypeByCode(shift.leave) : null;
                            const endTime = !hasLeave && shift?.start && shift?.hours ? calcEndTime(shift.start, shift.hours) : '';
                            const shiftValue = !hasLeave && shift?.start && shift?.hours ? `${shift.start}-${endTime}` : '';
                            const cellBg = getCellBgColor(date);
                            return (
                              <td key={idx} className="border border-gray-300 p-0" style={{ backgroundColor: cellBg, ...rowDivider }}>
                                <div className="flex flex-col items-center gap-0" style={{ minWidth: '44px' }}>
                                  {/* Leave type selector — disabled when hours/start are set */}
                                  <select
                                    value={shift?.leave || ''}
                                    onChange={(e) => {
                                      if (e.target.value) {
                                        handleLeave(emp.id, day, e.target.value);
                                      } else {
                                        const k = `${emp.id}_${day}`;
                                        setShifts(prev => ({ ...prev, [k]: { start: '', hours: '', leave: '' } }));
                                      }
                                    }}
                                    disabled={!!(shift?.start || shift?.hours)}
                                    className="w-full border-0 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    style={{
                                      fontSize: '10px',
                                      padding: '1px 0',
                                      appearance: 'none',
                                      textAlign: 'center',
                                      cursor: (shift?.start || shift?.hours) ? 'not-allowed' : 'pointer',
                                      // Inherit the cell's date colour so holiday red / weekend tint stays visible
                                      // when no leave is selected. (Browsers treat 'transparent' on <select> as opaque.)
                                      backgroundColor: leaveInfo ? leaveInfo.bg : cellBg,
                                      color: leaveInfo ? leaveInfo.color : 'inherit',
                                      fontWeight: leaveInfo ? 700 : 400,
                                      opacity: (shift?.start || shift?.hours) ? 0.4 : 1,
                                    }}
                                    title={leaveInfo ? leaveInfo.label : t('cell.leaveTitle')}
                                  >
                                    <option value="">—</option>
                                    {LEAVE_TYPES.map(lt => (
                                      <option key={lt.code} value={lt.code}>{lt.code}</option>
                                    ))}
                                  </select>
                                  {/* Hours dropdown — disabled when leave selected */}
                                  <select
                                    value={shift?.hours || ''}
                                    onChange={(e) => handleShiftHours(emp.id, day, e.target.value)}
                                    disabled={hasLeave}
                                    className="w-full border-0 border-t border-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    style={{ backgroundColor: getCellBgColor(date), fontSize: '10px', padding: '1px 0', appearance: 'none', textAlign: 'center', cursor: hasLeave ? 'not-allowed' : 'pointer', opacity: hasLeave ? 0.4 : 1 }}
                                    title={t('cell.workingHours')}
                                  >
                                    <option value="">—</option>
                                    {getHourOptions(shift?.start || '').map(h => <option key={h} value={String(h)}>{h}h</option>)}
                                  </select>
                                  {/* Shift start dropdown — disabled when leave selected */}
                                  <select
                                    value={shift?.start || ''}
                                    onChange={(e) => handleShiftStart(emp.id, day, e.target.value)}
                                    disabled={hasLeave}
                                    className="w-full border-0 border-t border-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    style={{ backgroundColor: getCellBgColor(date), fontSize: '10px', padding: '1px 0', appearance: 'none', textAlign: 'center', cursor: hasLeave ? 'not-allowed' : 'pointer', opacity: hasLeave ? 0.4 : 1 }}
                                    title={t('cell.shiftStart')}
                                  >
                                    <option value="">—</option>
                                    {START_TIMES.map(t => <option key={t} value={t}>{t}</option>)}
                                  </select>
                                  {/* End time indicator */}
                                  {endTime && (
                                    <div style={{ fontSize: '9px', color: '#6b7280', lineHeight: 1, paddingBottom: '1px' }}>
                                      {'\u2192'}{endTime}
                                    </div>
                                  )}
                                  {/* Leave hours label */}
                                  {hasLeave && leaveInfo && shift.leave !== 'X' && (
                                    <div style={{ fontSize: '9px', color: '#6b7280', lineHeight: 1, padding: '2px 0' }}>
                                      {LEAVE_HOURS}h
                                    </div>
                                  )}
                                </div>
                                {/* Hidden inputs for form submission */}
                                {shiftValue && (
                                  <input type="hidden" name={`shift_${emp.id}_${day}`} value={shiftValue} />
                                )}
                                {hasLeave && (
                                  <>
                                    <input type="hidden" name={`shift_${emp.id}_${day}`} value={`LEAVE:${shift.leave}`} />
                                    <input type="hidden" name={`leave_${emp.id}_${day}`} value={shift.leave} />
                                  </>
                                )}
                              </td>
                            );
                          })}
                          <td className={`border border-gray-300 px-2 py-1 text-center font-semibold ${employeeHourErrors[emp.id] ? 'bg-red-100 text-red-700' : empTotals.working === monthNormHours && empTotals.working > 0 ? 'bg-green-100 text-green-700' : 'bg-yellow-50'}`}
                            title={employeeHourErrors[emp.id] || (monthNormHours ? `Norm: ${monthNormHours}h` : '')}
                          >
                            {empTotals.working > 0 ? (
                              <div>
                                <div>{empTotals.working}h</div>
                                {monthNormHours > 0 && (
                                  <div style={{ fontSize: '9px', fontWeight: 'normal' }}>/ {monthNormHours}h</div>
                                )}
                              </div>
                            ) : ''}
                          </td>
                        </tr>
                      );
                    })}
                    
                    {/* Day totals */}
                    <tr className="bg-gray-100 font-semibold">
                      <td colSpan={3} className="border border-gray-300 px-2 py-1 text-right">
                        {t('common.totalHoursInDay')}
                      </td>
                      {monthDates.map((_, idx) => {
                        const day = idx + 1;
                        const dayTotals = calculateDayTotals(day);
                        return (
                          <td key={idx} className="border border-gray-300 px-1 py-1 text-center">
                            {dayTotals.working > 0 ? dayTotals.working.toFixed(0) : ''}
                          </td>
                        );
                      })}
                      <td className="border border-gray-300 px-2 py-1 text-center bg-yellow-100">
                        {employees.reduce((sum, emp) => sum + calculateEmployeeTotal(emp.id).working, 0).toFixed(0)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-2">
                {t('common.notesField')}
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={t('common.notesPlaceholder')}
              />
            </div>

            {closingCoverageWarnings.length > 0 && (
              <div className="p-4 bg-yellow-50 border border-yellow-300 rounded-lg">
                <h3 className="font-semibold text-yellow-800 mb-2">
                  {t('warn.closingTitle')}
                </h3>
                <p className="text-sm text-yellow-800 mb-1">
                  {t('warn.closingBody')}
                </p>
                <ul className="text-sm text-yellow-700 list-disc ml-5">
                  {closingCoverageWarnings.map(w => (
                    <li key={w.day}>
                      {w.date.toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-yellow-700 mt-2">
                  {t('warn.closingHint')}
                </p>
              </div>
            )}

            {hasHourErrors && hasAnyAssignedShifts && (
              <div className="p-4 bg-red-50 border border-red-300 rounded-lg">
                <h3 className="font-semibold text-red-700 mb-2">{t('err.hourTitle')}</h3>
                <ul className="text-sm text-red-600 space-y-1">
                  {employees.filter(emp => employeeHourErrors[emp.id]).map(emp => (
                    <li key={emp.id}>
                      <strong>{emp.firstName} {emp.lastName}</strong>: {employeeHourErrors[emp.id]}
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-red-500 mt-2">
                  {t('err.hourBody', { h: monthNormHours })}
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                name="action"
                value="draft"
                className="px-6 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
              >
                {t('edit.saveDraft')}
              </button>
              <button
                type="submit"
                name="action"
                value="submit"
                disabled={!canSubmit}
                className={`px-6 py-2 text-white rounded-md ${!canSubmit ? 'opacity-50 cursor-not-allowed' : ''}`}
                style={{ backgroundColor: 'var(--primary-color)' }}
              >
                {t('edit.submitForApproval')}
              </button>
            </div>
          </Form>
        </div>
      </main>
    </div>
  );
}