import { redirect, data, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import { Form, useLoaderData, Link } from 'react-router';
import { requireUserId } from '~/lib/session.server';
import { getCurrentUser } from '~/lib/auth.server';
import { prisma } from '~/lib/db.server';
import { useState, useMemo } from 'react';
import {
  LEAVE_TYPES, LEAVE_HOURS, MONTHLY_WORK_HOURS,
  getLeaveTypeByLabel, getCellColor, getCellBgColor, DAY_NAMES,
} from '~/lib/schedule-constants';

type ShiftData = { start: string; hours: string; leave: string };

const END_LIMIT = 21 * 60;

const START_TIMES = (() => {
  const times: string[] = [];
  for (let h = 9; h <= 21; h++) {
    times.push(`${h.toString().padStart(2, '0')}:00`);
    if (h < 21) times.push(`${h.toString().padStart(2, '0')}:30`);
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

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const user = await getCurrentUser(userId);

  if (!user || user.role !== 'MANAGER') {
    throw new Response('Unauthorized', { status: 403 });
  }

  const schedule = await prisma.schedule.findUnique({
    where: { id: params.id },
    include: {
      entries: {
        include: { user: true },
      },
    },
  });

  if (!schedule || schedule.storeId !== user.storeId) {
    throw new Response('Not found', { status: 404 });
  }

  if (!['DRAFT', 'PENDING', 'REJECTED', 'APPROVED'].includes(schedule.status)) {
    throw new Response('This schedule cannot be edited', { status: 403 });
  }

  const employees = await prisma.user.findMany({
    where: { storeId: user.storeId, role: 'EMPLOYEE' },
    select: { id: true, firstName: true, lastName: true, email: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  // Convert entries to initial shifts state
  const initialShifts: { [key: string]: { start: string; hours: string; leave: string } } = {};
  schedule.entries.forEach((entry: any) => {
    const entryDate = new Date(entry.date);
    const day = entryDate.getDate();
    const key = `${entry.userId}_${day}`;

    const leaveType = getLeaveTypeByLabel(entry.shiftType);
    if (leaveType) {
      initialShifts[key] = { start: '', hours: '', leave: leaveType.code };
    } else {
      // Reverse-calculate working hours from start/end times
      const [sH, sM] = entry.startTime.split(':').map(Number);
      const [eH, eM] = entry.endTime.split(':').map(Number);
      let totalH = (eH + eM / 60) - (sH + sM / 60);
      if (totalH < 0) totalH += 24;
      const workingH = totalH > 7 ? totalH - 1 : totalH;
      initialShifts[key] = {
        start: entry.startTime,
        hours: String(Math.round(workingH)),
        leave: '',
      };
    }
  });

  const weekStart = new Date(schedule.weekStart);
  const monthYear = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}`;

  return data({ user, schedule, employees, initialShifts, monthYear });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const user = await getCurrentUser(userId);

  if (!user || user.role !== 'MANAGER') {
    throw new Response('Unauthorized', { status: 403 });
  }

  const schedule = await prisma.schedule.findUnique({ where: { id: params.id } });
  if (!schedule || schedule.storeId !== user.storeId) {
    throw new Response('Not found', { status: 404 });
  }

  const formData = await request.formData();
  const monthYear = formData.get('monthYear');
  const actionType = formData.get('action');
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

        entriesData.push({ userId: empId, date, startTime, endTime, shiftType });
      }
    }
  }

  if (entriesData.length === 0) {
    return data({ error: 'Please add at least one shift' }, { status: 400 });
  }

  // Server-side hour validation for submit
  if (actionType === 'submit') {
    const normHours = MONTHLY_WORK_HOURS[monthYear];
    if (normHours) {
      const empHours: { [empId: string]: number } = {};
      for (const entry of entriesData) {
        const isLeave = LEAVE_TYPES.some(lt => lt.label === entry.shiftType);
        if (isLeave) {
          empHours[entry.userId] = (empHours[entry.userId] || 0) + LEAVE_HOURS;
          continue;
        }
        const [sH, sM] = entry.startTime.split(':').map(Number);
        const [eH, eM] = entry.endTime.split(':').map(Number);
        let totalH = (eH + eM / 60) - (sH + sM / 60);
        if (totalH < 0) totalH += 24;
        const workingH = totalH > 7 ? totalH - 1 : totalH;
        empHours[entry.userId] = (empHours[entry.userId] || 0) + workingH;
      }
      const violations = Object.entries(empHours).filter(([_, h]) => Math.round(h) !== normHours);
      if (violations.length > 0) {
        return data({ error: `Employee hours must match the monthly norm of ${normHours}h.` }, { status: 400 });
      }
    }
  }

  // Update: delete old entries, create new ones, update schedule
  await prisma.$transaction([
    prisma.scheduleEntry.deleteMany({ where: { scheduleId: params.id } }),
    prisma.schedule.update({
      where: { id: params.id },
      data: {
        weekStart: startDate,
        weekEnd: endDate,
        status: actionType === 'submit' ? 'PENDING' : 'DRAFT',
        notes: notes || null,
        entries: { create: entriesData },
      },
    }),
    // If submitting, create a new approval record
    ...(actionType === 'submit'
      ? [prisma.approval.create({ data: { scheduleId: params.id!, status: 'PENDING' } })]
      : []),
  ]);

  return redirect(`/schedules/${params.id}`);
}

export default function EditSchedule() {
  const { user, schedule, employees, initialShifts, monthYear: loadedMonthYear } = useLoaderData<typeof loader>();

  const [monthYear] = useState(loadedMonthYear);
  const [shifts, setShifts] = useState<{ [key: string]: ShiftData }>(initialShifts);

  const getDaysInMonth = () => {
    if (!monthYear) return [];
    const [year, month] = monthYear.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const dates = [];
    for (let i = 1; i <= daysInMonth; i++) {
      dates.push(new Date(year, month - 1, i));
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
      [key]: { start: prev[key]?.start || '', hours, leave: '' },
    }));
  };

  const handleLeave = (empId: string, day: number, leave: string) => {
    const key = `${empId}_${day}`;
    setShifts(prev => ({
      ...prev,
      [key]: { start: '', hours: '', leave },
    }));
  };

  const calculateDayHours = (shift: ShiftData | undefined): { total: number; working: number } => {
    if (!shift) return { total: 0, working: 0 };
    if (shift.leave) return { total: LEAVE_HOURS, working: LEAVE_HOURS };
    if (!shift.start || !shift.hours) return { total: 0, working: 0 };
    const hours = parseFloat(shift.hours);
    const lunchBreak = hours > 6 ? 1 : 0;
    return { total: hours + lunchBreak, working: hours };
  };

  const calculateEmployeeTotal = (empId: string) => {
    let totalHours = 0, workingHours = 0;
    monthDates.forEach((_, idx) => {
      const { total, working } = calculateDayHours(shifts[`${empId}_${idx + 1}`]);
      totalHours += total;
      workingHours += working;
    });
    return { total: totalHours, working: workingHours };
  };

  const calculateDayTotals = (day: number) => {
    let totalHours = 0, workingHours = 0;
    employees.forEach((emp: any) => {
      const { total, working } = calculateDayHours(shifts[`${emp.id}_${day}`]);
      totalHours += total;
      workingHours += working;
    });
    return { total: totalHours, working: workingHours };
  };

  const monthNormHours = MONTHLY_WORK_HOURS[monthYear] || 0;

  const employeeHourErrors = useMemo(() => {
    if (!monthNormHours) return {};
    const errors: { [empId: string]: string } = {};
    employees.forEach((emp: any) => {
      const { working } = calculateEmployeeTotal(emp.id);
      if (working > 0 && working !== monthNormHours) {
        errors[emp.id] = working < monthNormHours
          ? `${working}h / ${monthNormHours}h (${monthNormHours - working}h short)`
          : `${working}h / ${monthNormHours}h (${working - monthNormHours}h over)`;
      }
    });
    return errors;
  }, [shifts, monthNormHours, employees, monthDates]);

  const hasHourErrors = Object.keys(employeeHourErrors).length > 0;
  const hasAnyAssignedShifts = employees.some((emp: any) => calculateEmployeeTotal(emp.id).working > 0);
  const canSubmit = !hasHourErrors || !hasAnyAssignedShifts;

  const getLeaveType = (code: string) => LEAVE_TYPES.find(l => l.code === code);

  return (
    <div className="min-h-screen bg-gray-50" style={{ overflowX: 'hidden' }}>
      <header className="bdheader">
        <div className="bdlogo">
          <span className="text-white text-xl font-bold">Schedule Manager</span>
        </div>
        <div className="userNameContainer">
          <span className="userName">{user.firstName} {user.lastName}</span>
          <Form method="post" action="/logout" style={{ display: 'inline' }}>
            <button type="submit" className="ml-4 px-3 py-1 bg-white text-sm rounded hover:bg-gray-100" style={{ color: 'var(--primary-color)' }}>
              Logout
            </button>
          </Form>
        </div>
      </header>

      <main className="p-6">
        <div style={{ maxWidth: '100%', overflow: 'hidden' }}>
          <div className="flex items-center gap-4 mb-2">
            <Link to={`/schedules/${schedule.id}`} className="text-sm hover:underline" style={{ color: 'var(--primary-color)' }}>
              &larr; Back to Schedule
            </Link>
          </div>

          <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--primary-color)' }}>
            Edit Schedule: {monthDates[0]?.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
          </h2>

          <Form method="post" className="space-y-6">
            <input type="hidden" name="monthYear" value={monthYear} />

            <div className="bg-white rounded-lg shadow p-6">
              <div className="mb-4 p-4 bg-gray-50 rounded">
                <h3 className="font-semibold mb-2">How to fill:</h3>
                <div className="text-sm space-y-1">
                  <p>• Select <strong>shift start</strong> time and <strong>working hours</strong> from dropdowns</p>
                  <p>• Or select a <strong>leave type</strong> from the top dropdown (counts as {LEAVE_HOURS}h)</p>
                  <p>• End time is calculated automatically (adds 1h lunch if &gt;6h working)</p>
                  <p>• Leave all dropdowns empty for day off</p>
                  <div className="flex flex-wrap gap-3 mt-2">
                    <span><span className="inline-block w-4 h-3 bg-gray-50 border border-gray-300 align-middle mr-1"></span> Weekday</span>
                    <span><span className="inline-block w-4 h-3 bg-blue-50 border border-gray-300 align-middle mr-1"></span> Weekend</span>
                    <span><span className="inline-block w-4 h-3 bg-red-100 border border-gray-300 align-middle mr-1"></span> Holiday</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {LEAVE_TYPES.map(lt => (
                      <span key={lt.code} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold" style={{ backgroundColor: lt.bg, color: lt.color }}>
                        {lt.code} — {lt.label}
                      </span>
                    ))}
                  </div>
                </div>
                {monthNormHours > 0 && (
                  <div className="mt-2 text-sm font-medium">
                    Monthly norm: <strong>{monthNormHours}h</strong> working hours per employee
                  </div>
                )}
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="border-collapse" style={{ fontSize: '12px', minWidth: '100%' }}>
                  <thead>
                    <tr>
                      <td className="border border-gray-300 px-2 py-1 font-semibold bg-gray-100" rowSpan={3}>Vārds</td>
                      <td className="border border-gray-300 px-2 py-1 font-semibold bg-gray-100" rowSpan={3}>Uzvārds</td>
                      <td className="border border-gray-300 px-2 py-1 font-semibold bg-gray-100" rowSpan={3}>P.k.</td>
                      <td className="border border-gray-300 px-2 py-1 text-center bg-gray-100" colSpan={monthDates.length}>
                        Period: {monthDates[0]?.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
                      </td>
                      <td className="border border-gray-300 px-2 py-1 text-center bg-gray-100" rowSpan={3}>Total</td>
                    </tr>
                    <tr>
                      {monthDates.map((date, idx) => (
                        <td key={idx} className="border border-gray-300 px-1 py-1 text-center text-xs" style={{ backgroundColor: getCellBgColor(date) }}>
                          {DAY_NAMES[date.getDay()]}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      {monthDates.map((date, idx) => (
                        <td key={idx} className="border border-gray-300 px-1 py-1 text-center font-semibold" style={{ backgroundColor: getCellBgColor(date) }}>
                          {date.getDate()}
                        </td>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((emp: any) => {
                      const empTotals = calculateEmployeeTotal(emp.id);
                      return (
                        <tr key={emp.id}>
                          <td className="border border-gray-300 px-2 py-1">{emp.firstName}</td>
                          <td className="border border-gray-300 px-2 py-1">{emp.lastName}</td>
                          <td className="border border-gray-300 px-2 py-1 text-xs">{emp.email.split('@')[0]}</td>
                          {monthDates.map((date, idx) => {
                            const day = idx + 1;
                            const key = `${emp.id}_${day}`;
                            const shift = shifts[key];
                            const hasLeave = !!shift?.leave;
                            const leaveInfo = hasLeave ? getLeaveType(shift.leave) : null;
                            const endTime = !hasLeave && shift?.start && shift?.hours ? calcEndTime(shift.start, shift.hours) : '';
                            const shiftValue = !hasLeave && shift?.start && shift?.hours ? `${shift.start}-${endTime}` : '';
                            return (
                              <td key={idx} className="border border-gray-300 p-0" style={{ backgroundColor: getCellBgColor(date) }}>
                                <div className="flex flex-col items-center gap-0" style={{ minWidth: '44px' }}>
                                  {/* Leave type selector — disabled when hours/start are set */}
                                  <select
                                    value={shift?.leave || ''}
                                    onChange={(e) => {
                                      if (e.target.value) {
                                        handleLeave(emp.id, day, e.target.value);
                                      } else {
                                        setShifts(prev => ({ ...prev, [key]: { start: '', hours: '', leave: '' } }));
                                      }
                                    }}
                                    disabled={!!(shift?.start || shift?.hours)}
                                    className="w-full border-0 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    style={{
                                      fontSize: '10px', padding: '1px 0', appearance: 'none', textAlign: 'center',
                                      cursor: (shift?.start || shift?.hours) ? 'not-allowed' : 'pointer',
                                      backgroundColor: leaveInfo ? leaveInfo.bg : 'transparent',
                                      color: leaveInfo ? leaveInfo.color : 'inherit',
                                      fontWeight: leaveInfo ? 700 : 400,
                                      opacity: (shift?.start || shift?.hours) ? 0.4 : 1,
                                    }}
                                    title={leaveInfo ? leaveInfo.label : 'Leave type'}
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
                                    title="Working hours"
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
                                    title="Shift start"
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
                                {shiftValue && <input type="hidden" name={`shift_${emp.id}_${day}`} value={shiftValue} />}
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
                                {monthNormHours > 0 && <div style={{ fontSize: '9px', fontWeight: 'normal' }}>/ {monthNormHours}h</div>}
                              </div>
                            ) : ''}
                          </td>
                        </tr>
                      );
                    })}

                    <tr className="bg-gray-100 font-semibold">
                      <td colSpan={3} className="border border-gray-300 px-2 py-1 text-right">Total hours in day:</td>
                      {monthDates.map((_, idx) => {
                        const dayTotals = calculateDayTotals(idx + 1);
                        return (
                          <td key={idx} className="border border-gray-300 px-1 py-1 text-center">
                            {dayTotals.working > 0 ? dayTotals.working.toFixed(0) : ''}
                          </td>
                        );
                      })}
                      <td className="border border-gray-300 px-2 py-1 text-center bg-yellow-100">
                        {employees.reduce((sum: number, emp: any) => sum + calculateEmployeeTotal(emp.id).working, 0).toFixed(0)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-2">
                Notes / Comments
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                defaultValue={schedule.notes || ''}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Add any notes about this schedule..."
              />
            </div>

            {hasHourErrors && hasAnyAssignedShifts && (
              <div className="p-4 bg-red-50 border border-red-300 rounded-lg">
                <h3 className="font-semibold text-red-700 mb-2">Hour validation errors:</h3>
                <ul className="text-sm text-red-600 space-y-1">
                  {employees.filter((emp: any) => employeeHourErrors[emp.id]).map((emp: any) => (
                    <li key={emp.id}>
                      <strong>{emp.firstName} {emp.lastName}</strong>: {employeeHourErrors[emp.id]}
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-red-500 mt-2">
                  Each employee's working hours must match the monthly norm of <strong>{monthNormHours}h</strong> to submit.
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button type="submit" name="action" value="draft" className="px-6 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600">
                Save as Draft
              </button>
              <button
                type="submit" name="action" value="submit" disabled={!canSubmit}
                className={`px-6 py-2 text-white rounded-md ${!canSubmit ? 'opacity-50 cursor-not-allowed' : ''}`}
                style={{ backgroundColor: 'var(--primary-color)' }}
              >
                Submit for Approval
              </button>
            </div>
          </Form>
        </div>
      </main>
    </div>
  );
}
