import { data, type LoaderFunctionArgs } from 'react-router';
import { Link, useLoaderData, Form } from 'react-router';
import { requireUserId } from '~/lib/session.server';
import { getCurrentUser } from '~/lib/auth.server';
import { prisma } from '~/lib/db.server';
import {
  LEAVE_TYPES, LEAVE_HOURS, MONTHLY_WORK_HOURS,
  getLeaveTypeByLabel, getCellColor, getCellBgColor, DAY_NAMES,
} from '~/lib/schedule-constants';
import { useT, useLang, dayNamesFor, localeFor } from '~/lib/i18n';
import { LanguageToggle } from '~/components/LanguageToggle';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const user = await getCurrentUser(userId);
  if (!user) throw new Response('Not found', { status: 404 });

  const schedule = await prisma.schedule.findUnique({
    where: { id: params.id },
    include: {
      store: true,
      createdBy: true,
      entries: {
        include: { user: true },
        orderBy: [{ user: { lastName: 'asc' } }, { date: 'asc' }],
      },
      approvals: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!schedule) throw new Response('Not found', { status: 404 });

  // Employees can only view accepted schedules
  if (user.role === 'EMPLOYEE' && schedule.status !== 'APPROVED') {
    throw new Response('Unauthorized', { status: 403 });
  }

  return data({ user, schedule });
}

export default function ScheduleView() {
  const { user, schedule } = useLoaderData<typeof loader>();
  const t = useT();
  const lang = useLang();
  const locale = localeFor(lang);
  const dayNames = dayNamesFor(lang);

  // Derive month range from schedule
  const weekStart = new Date(schedule.weekStart);
  const weekEnd = new Date(schedule.weekEnd);
  const year = weekStart.getFullYear();
  const month = weekStart.getMonth(); // 0-indexed

  // Build month dates array
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthDates: Date[] = [];
  for (let i = 1; i <= daysInMonth; i++) {
    monthDates.push(new Date(year, month, i));
  }

  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthNormHours = MONTHLY_WORK_HOURS[monthKey] || 0;

  // Get unique employees from entries
  const employeeMap = new Map<string, { id: string; firstName: string; lastName: string; email: string }>();
  schedule.entries.forEach((entry: any) => {
    if (!employeeMap.has(entry.userId)) {
      employeeMap.set(entry.userId, {
        id: entry.userId,
        firstName: entry.user.firstName,
        lastName: entry.user.lastName,
        email: entry.user.email,
      });
    }
  });
  const employees = Array.from(employeeMap.values()).sort((a, b) =>
    a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
  );

  // Build lookup: empId_day -> entry
  const entryLookup = new Map<string, any>();
  schedule.entries.forEach((entry: any) => {
    const entryDate = new Date(entry.date);
    const day = entryDate.getDate();
    entryLookup.set(`${entry.userId}_${day}`, entry);
  });

  // Calculate hours for an entry
  const calcEntryHours = (entry: any | undefined): { total: number; working: number } => {
    if (!entry) return { total: 0, working: 0 };
    const leaveType = getLeaveTypeByLabel(entry.shiftType);
    if (leaveType && leaveType.code === 'X') return { total: 0, working: 0 };
    if (leaveType) return { total: LEAVE_HOURS, working: LEAVE_HOURS };
    const [sH, sM] = entry.startTime.split(':').map(Number);
    const [eH, eM] = entry.endTime.split(':').map(Number);
    let totalH = (eH + eM / 60) - (sH + sM / 60);
    if (totalH < 0) totalH += 24;
    const workingH = totalH > 7 ? totalH - 1 : totalH;
    return { total: totalH, working: workingH };
  };

  const calcEmployeeTotal = (empId: string) => {
    let total = 0, working = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const entry = entryLookup.get(`${empId}_${d}`);
      const h = calcEntryHours(entry);
      total += h.total;
      working += h.working;
    }
    return { total, working };
  };

  const calcDayTotals = (day: number) => {
    let total = 0, working = 0;
    employees.forEach(emp => {
      const entry = entryLookup.get(`${emp.id}_${day}`);
      const h = calcEntryHours(entry);
      total += h.total;
      working += h.working;
    });
    return { total, working };
  };

  const getStatusStyle = (status: string): { [key: string]: string } => {
    switch (status) {
      case 'APPROVED': return { backgroundColor: '#dcfce7', color: '#166534' };
      case 'PENDING': return { backgroundColor: '#fef3c7', color: '#92400e' };
      case 'REJECTED': return { backgroundColor: '#fee2e2', color: '#991b1b' };
      default: return { backgroundColor: '#e5e7eb', color: '#1f2937' };
    }
  };

  // Submission timestamp (approval createdAt for PENDING, or schedule updatedAt)
  const pendingApproval = schedule.approvals?.[0];
  const submittedAt = schedule.status === 'PENDING' && pendingApproval
    ? new Date(pendingApproval.createdAt)
    : null;

  const canEdit = user.role === 'MANAGER' && ['DRAFT', 'PENDING', 'REJECTED', 'APPROVED'].includes(schedule.status);

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
          <div className="flex items-center gap-4 mb-2">
            <Link to="/schedules" className="text-sm hover:underline" style={{ color: 'var(--primary-color)' }}>
              {t('common.backToSchedules')}
            </Link>
          </div>

          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold" style={{ color: 'var(--primary-color)' }}>
              {t('view.scheduleHeading', { month: monthDates[0]?.toLocaleDateString(locale, { year: 'numeric', month: 'long' }) || '' })}
            </h2>
            <div className="flex items-center gap-3">
              {canEdit && (
                <Link
                  to={`/schedules/${schedule.id}/edit`}
                  className="px-4 py-2 text-white rounded-md text-sm font-medium hover:opacity-90"
                  style={{ backgroundColor: 'var(--primary-color)' }}
                >
                  <i className="fas fa-edit mr-1"></i> {t('view.editSchedule')}
                </Link>
              )}
              <div className="text-right">
                <span className="px-3 py-1 rounded-full text-xs font-semibold" style={getStatusStyle(schedule.status)}>
                  {t(`status.${schedule.status}`)}
                </span>
                {submittedAt && (
                  <div className="text-xs text-gray-500 mt-1">
                    {t('common.submitted')}: {submittedAt.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })} {submittedAt.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="mb-4 text-sm text-gray-600">
              <span><strong>{t('common.store')}:</strong> {schedule.store.name}</span>
              <span className="ml-4"><strong>{t('common.createdBy')}:</strong> {schedule.createdBy.firstName} {schedule.createdBy.lastName}</span>
              {monthNormHours > 0 && (
                <span className="ml-4"><strong>{t('common.monthlyNorm')}:</strong> {monthNormHours}h</span>
              )}
            </div>

            {/* Legend */}
            <div className="mb-4 flex flex-wrap gap-3 text-xs">
              <span><span className="inline-block w-4 h-3 bg-gray-50 border border-gray-300 align-middle mr-1"></span> {t('common.weekday')}</span>
              <span><span className="inline-block w-4 h-3 bg-blue-50 border border-gray-300 align-middle mr-1"></span> {t('common.weekend')}</span>
              <span><span className="inline-block w-4 h-3 bg-red-100 border border-gray-300 align-middle mr-1"></span> {t('common.holiday')}</span>
              {LEAVE_TYPES.map(lt => (
                <span key={lt.code} className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-semibold" style={{ backgroundColor: lt.bg, color: lt.color }}>
                  {lt.code} — {lt.label}
                </span>
              ))}
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="border-collapse" style={{ fontSize: '12px', minWidth: '100%' }}>
                <thead>
                  <tr>
                    <td className="border border-gray-300 px-2 py-1 font-semibold bg-gray-100" rowSpan={3}>{t('common.firstName')}</td>
                    <td className="border border-gray-300 px-2 py-1 font-semibold bg-gray-100" rowSpan={3}>{t('common.lastName')}</td>
                    <td className="border border-gray-300 px-2 py-1 font-semibold bg-gray-100" rowSpan={3}>{t('common.username')}</td>
                    <td className="border border-gray-300 px-2 py-1 text-center bg-gray-100" colSpan={monthDates.length}>
                      {t('common.period')}: {monthDates[0]?.toLocaleDateString(locale, { year: 'numeric', month: 'long' })}
                    </td>
                    <td className="border border-gray-300 px-2 py-1 text-center bg-gray-100" rowSpan={3}>{t('common.total')}</td>
                  </tr>
                  <tr>
                    {monthDates.map((date, idx) => (
                      <td key={idx} className="border border-gray-300 px-1 py-1 text-center text-xs" style={{ backgroundColor: getCellBgColor(date) }}>
                        {dayNames[date.getDay()]}
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
                  {employees.map(emp => {
                    const empTotals = calcEmployeeTotal(emp.id);
                    const hoursDiff = monthNormHours ? empTotals.working - monthNormHours : 0;
                    const isMatch = monthNormHours > 0 && empTotals.working === monthNormHours;
                    const isOff = monthNormHours > 0 && empTotals.working > 0 && empTotals.working !== monthNormHours;
                    // Thicker bottom border separates each employee row.
                    const rowDivider = { borderBottom: '2px solid #4b5563' };
                    return (
                      <tr key={emp.id}>
                        <td className="border border-gray-300 px-2 py-1" style={rowDivider}>{emp.firstName}</td>
                        <td className="border border-gray-300 px-2 py-1" style={rowDivider}>{emp.lastName}</td>
                        <td className="border border-gray-300 px-2 py-1 text-xs" style={rowDivider}>{emp.email.split('@')[0]}</td>
                        {monthDates.map((date, idx) => {
                          const day = idx + 1;
                          const entry = entryLookup.get(`${emp.id}_${day}`);
                          const leaveType = entry ? getLeaveTypeByLabel(entry.shiftType) : null;

                          return (
                            <td key={idx} className="border border-gray-300 p-0 text-center" style={{ backgroundColor: getCellBgColor(date), minWidth: '44px', ...rowDivider }}>
                              {entry ? (
                                leaveType ? (
                                  <div
                                    className="px-1 py-1 font-bold"
                                    style={{ backgroundColor: leaveType.bg, color: leaveType.color, fontSize: '11px' }}
                                    title={leaveType.label}
                                  >
                                    {leaveType.code}
                                  </div>
                                ) : (
                                  <div className="px-1 py-0.5" style={{ fontSize: '10px', lineHeight: 1.3 }}>
                                    <div>{entry.startTime}</div>
                                    <div>{entry.endTime}</div>
                                  </div>
                                )
                              ) : (
                                <div style={{ fontSize: '10px', color: '#ccc' }}>—</div>
                              )}
                            </td>
                          );
                        })}
                        <td className={`border border-gray-300 px-2 py-1 text-center font-semibold ${isOff ? 'bg-red-100 text-red-700' : isMatch ? 'bg-green-100 text-green-700' : 'bg-yellow-50'}`}
                          style={rowDivider}
                          title={monthNormHours ? `Norm: ${monthNormHours}h` : ''}
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
                    <td colSpan={3} className="border border-gray-300 px-2 py-1 text-right">{t('common.totalHoursInDay')}</td>
                    {monthDates.map((_, idx) => {
                      const dayTotals = calcDayTotals(idx + 1);
                      return (
                        <td key={idx} className="border border-gray-300 px-1 py-1 text-center">
                          {dayTotals.working > 0 ? dayTotals.working.toFixed(0) : ''}
                        </td>
                      );
                    })}
                    <td className="border border-gray-300 px-2 py-1 text-center bg-yellow-100">
                      {employees.reduce((sum, emp) => sum + calcEmployeeTotal(emp.id).working, 0).toFixed(0)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Notes section */}
          {schedule.notes && (
            <div className="bg-white rounded-lg shadow p-6 mt-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">{t('common.notes')}</h3>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{schedule.notes}</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
