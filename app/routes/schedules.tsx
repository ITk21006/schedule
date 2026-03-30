import { data, type LoaderFunctionArgs } from 'react-router';
import { Link, useLoaderData, Form } from 'react-router';
import { requireUserId } from '~/lib/session.server';
import { getCurrentUser } from '~/lib/auth.server';
import { prisma } from '~/lib/db.server';
import {
  LEAVE_TYPES, LEAVE_HOURS, MONTHLY_WORK_HOURS,
  getLeaveTypeByLabel, getCellColor, getCellBgColor, DAY_NAMES,
} from '~/lib/schedule-constants';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const user = await getCurrentUser(userId);

  if (!user) throw new Response('Not found', { status: 404 });

  let schedules;

  if (user.role === 'EMPLOYEE') {
    schedules = await prisma.schedule.findMany({
      where: {
        storeId: user.storeId,
        status: 'APPROVED',
        entries: { some: { userId: user.id } },
      },
      include: {
        store: true,
        createdBy: true,
        entries: {
          include: { user: true },
          orderBy: [{ user: { lastName: 'asc' } }, { date: 'asc' }],
        },
        approvals: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { weekStart: 'desc' },
    });
  } else {
    schedules = await prisma.schedule.findMany({
      where: { storeId: user.storeId },
      include: {
        store: true,
        createdBy: true,
        entries: {
          include: { user: true },
          orderBy: [{ user: { lastName: 'asc' } }, { date: 'asc' }],
        },
        approvals: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { weekStart: 'desc' },
    });
  }

  return data({ user, schedules });
}

function ScheduleGrid({ schedule, user }: { schedule: any; user: any }) {
  const weekStart = new Date(schedule.weekStart);
  const year = weekStart.getFullYear();
  const month = weekStart.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthDates: Date[] = [];
  for (let i = 1; i <= daysInMonth; i++) {
    monthDates.push(new Date(year, month, i));
  }

  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthNormHours = MONTHLY_WORK_HOURS[monthKey] || 0;

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

  const entryLookup = new Map<string, any>();
  schedule.entries.forEach((entry: any) => {
    const d = new Date(entry.date);
    entryLookup.set(`${entry.userId}_${d.getDate()}`, entry);
  });

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
      const h = calcEntryHours(entryLookup.get(`${empId}_${d}`));
      total += h.total;
      working += h.working;
    }
    return { total, working };
  };

  const calcDayTotals = (day: number) => {
    let working = 0;
    employees.forEach(emp => {
      working += calcEntryHours(entryLookup.get(`${emp.id}_${day}`)).working;
    });
    return working;
  };

  const isCurrentUser = (empId: string) => user.role === 'EMPLOYEE' && empId === user.id;

  return (
    <div>
      <div className="mb-3 text-sm text-gray-600">
        <span><strong>Store:</strong> {schedule.store.name}</span>
        <span className="ml-4"><strong>Created by:</strong> {schedule.createdBy.firstName} {schedule.createdBy.lastName}</span>
        {monthNormHours > 0 && (
          <span className="ml-4"><strong>Monthly norm:</strong> {monthNormHours}h</span>
        )}
      </div>

      {schedule.notes && (
        <div className="mb-3 p-3 bg-gray-50 rounded text-sm text-gray-600">
          <strong>Notes:</strong> {schedule.notes}
        </div>
      )}

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
            {employees.map(emp => {
              const empTotals = calcEmployeeTotal(emp.id);
              const isMe = isCurrentUser(emp.id);
              const isMatch = monthNormHours > 0 && empTotals.working === monthNormHours;
              const isOff = monthNormHours > 0 && empTotals.working > 0 && empTotals.working !== monthNormHours;
              return (
                <tr key={emp.id} className={isMe ? 'ring-2 ring-blue-400 ring-inset' : ''}>
                  <td className={`border border-gray-300 px-2 py-1 ${isMe ? 'font-bold' : ''}`}>{emp.firstName}</td>
                  <td className={`border border-gray-300 px-2 py-1 ${isMe ? 'font-bold' : ''}`}>{emp.lastName}</td>
                  <td className="border border-gray-300 px-2 py-1 text-xs">{emp.email.split('@')[0]}</td>
                  {monthDates.map((date, idx) => {
                    const day = idx + 1;
                    const entry = entryLookup.get(`${emp.id}_${day}`);
                    const leaveType = entry ? getLeaveTypeByLabel(entry.shiftType) : null;
                    return (
                      <td key={idx} className="border border-gray-300 p-0 text-center" style={{ backgroundColor: getCellBgColor(date), minWidth: '44px' }}>
                        {entry ? (
                          leaveType ? (
                            <div className="px-1 py-1 font-bold" style={{ backgroundColor: leaveType.bg, color: leaveType.color, fontSize: '11px' }} title={leaveType.label}>
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
                  <td className={`border border-gray-300 px-2 py-1 text-center font-semibold ${isOff ? 'bg-red-100 text-red-700' : isMatch ? 'bg-green-100 text-green-700' : 'bg-yellow-50'}`}>
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
                const total = calcDayTotals(idx + 1);
                return (
                  <td key={idx} className="border border-gray-300 px-1 py-1 text-center">
                    {total > 0 ? total.toFixed(0) : ''}
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
  );
}

export default function Schedules() {
  const { user, schedules } = useLoaderData<typeof loader>();

  const getStatusStyle = (status: string): { [key: string]: string } => {
    switch (status) {
      case 'APPROVED': return { backgroundColor: '#dcfce7', color: '#166534' };
      case 'PENDING': return { backgroundColor: '#fef3c7', color: '#92400e' };
      case 'REJECTED': return { backgroundColor: '#fee2e2', color: '#991b1b' };
      default: return { backgroundColor: '#e5e7eb', color: '#1f2937' };
    }
  };

  const getStatusLabel = (status: string) => {
    if (status === 'APPROVED') return 'ACCEPTED';
    return status;
  };

  const formatTimestamp = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <div className="min-h-screen bg-gray-50" style={{ overflowX: 'hidden' }}>
      <header className="bdheader">
        <div className="bdlogo">
          <span className="text-white text-xl font-bold">Schedule Manager</span>
        </div>
        <div className="userNameContainer">
          <span className="userName">{user.firstName} {user.lastName}</span>
          <span className="text-white text-sm">({user.role})</span>
          <Form method="post" action="/logout">
            <button
              type="submit"
              className="ml-4 px-3 py-1 bg-white text-sm rounded hover:bg-gray-100"
              style={{ color: 'var(--primary-color)' }}
            >
              Logout
            </button>
          </Form>
        </div>
      </header>

      <main className="p-6">
        <div style={{ maxWidth: '100%', overflow: 'hidden' }}>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold" style={{ color: 'var(--primary-color)' }}>
              {user.role === 'EMPLOYEE' ? 'My Schedules' : 'Store Schedules'}
            </h2>
            {user.role === 'MANAGER' && (
              <Link to="/schedules/new" className="roundButtonMenu">
                <i className="fas fa-plus mr-2"></i> New Schedule
              </Link>
            )}
          </div>

          <div className="space-y-8">
            {schedules.length === 0 ? (
              <p className="text-gray-500 text-center">No schedules available</p>
            ) : (
              schedules.map((schedule: any) => {
                const canEdit = user.role === 'MANAGER' && ['DRAFT', 'PENDING', 'REJECTED', 'APPROVED'].includes(schedule.status);
                const pendingApproval = schedule.approvals?.[0];
                const submittedAt = schedule.status === 'PENDING' && pendingApproval
                  ? formatTimestamp(pendingApproval.createdAt)
                  : null;

                return (
                  <div key={schedule.id} className="bg-white rounded-lg shadow p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-lg font-semibold">
                          {new Date(schedule.weekStart).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
                        </h3>
                      </div>
                      <div className="flex items-center gap-3">
                        {canEdit && (
                          <Link
                            to={`/schedules/${schedule.id}/edit`}
                            className="px-4 py-2 text-sm font-medium rounded-md text-white"
                            style={{ backgroundColor: 'var(--primary-color)' }}
                          >
                            <i className="fas fa-edit mr-1"></i> Edit
                          </Link>
                        )}
                        <div className="text-right">
                          <span className="px-3 py-1 rounded-full text-xs font-semibold" style={getStatusStyle(schedule.status)}>
                            {getStatusLabel(schedule.status)}
                          </span>
                          {submittedAt && (
                            <div className="text-xs text-gray-500 mt-1">
                              Submitted: {submittedAt}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <ScheduleGrid schedule={schedule} user={user} />
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
