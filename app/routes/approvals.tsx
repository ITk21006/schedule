import { data, type LoaderFunctionArgs, type ActionFunctionArgs, redirect } from 'react-router';
import { useLoaderData, Form } from 'react-router';
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

  if (!user || user.role !== 'ALL_STORE_MANAGER') {
    throw new Response('Unauthorized', { status: 403 });
  }

  const pendingSchedules = await prisma.schedule.findMany({
    where: { status: 'PENDING' },
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
    orderBy: { createdAt: 'desc' },
  });

  return data({ user, pendingSchedules });
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const user = await getCurrentUser(userId);

  if (!user || user.role !== 'ALL_STORE_MANAGER') {
    throw new Response('Unauthorized', { status: 403 });
  }

  const formData = await request.formData();
  const action = formData.get('action');
  const scheduleId = formData.get('scheduleId');
  const comment = formData.get('comment');

  if (typeof scheduleId !== 'string' || typeof action !== 'string') {
    return data({ error: 'Invalid request' }, { status: 400 });
  }

  const commentStr = comment?.toString().trim() || '';

  // Reject requires a comment
  if (action === 'reject' && !commentStr) {
    return data({ error: 'A comment is required when rejecting a schedule.', scheduleId }, { status: 400 });
  }

  // Get the schedule to find who created it (for notification)
  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    include: { store: true },
  });
  if (!schedule) {
    return data({ error: 'Schedule not found' }, { status: 404 });
  }

  const monthLabel = new Date(schedule.weekStart).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });

  if (action === 'approve') {
    await prisma.$transaction([
      prisma.approval.create({
        data: {
          scheduleId,
          status: 'APPROVED',
          comment: commentStr || null,
          approvedAt: new Date(),
        },
      }),
      prisma.schedule.update({
        where: { id: scheduleId },
        data: { status: 'APPROVED' },
      }),
    ]);
    try {
      await prisma.notification.create({
        data: {
          userId: schedule.createdById,
          type: 'ACCEPTED',
          title: `Schedule accepted: ${monthLabel}`,
          message: commentStr || null,
          scheduleId,
        },
      });
    } catch { /* Notification table may not exist yet */ }
  } else if (action === 'reject') {
    await prisma.$transaction([
      prisma.approval.create({
        data: {
          scheduleId,
          status: 'REJECTED',
          comment: commentStr,
          approvedAt: new Date(),
        },
      }),
      prisma.schedule.update({
        where: { id: scheduleId },
        data: { status: 'REJECTED' },
      }),
    ]);
    try {
      await prisma.notification.create({
        data: {
          userId: schedule.createdById,
          type: 'REJECTED',
          title: `Schedule rejected: ${monthLabel}`,
          message: commentStr,
          scheduleId,
        },
      });
    } catch { /* Notification table may not exist yet */ }
  }

  return redirect('/approvals');
}

function ApprovalGrid({ schedule }: { schedule: any }) {
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

      <div className="mb-3 text-xs" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {LEAVE_TYPES.map(lt => (
          <span key={lt.code} className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-semibold" style={{ backgroundColor: lt.bg, color: lt.color, border: lt.code === 'X' ? '1px solid #d1d5db' : 'none', width: 'fit-content' }}>
            {lt.code} — {lt.label}
          </span>
        ))}
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
            {employees.map(emp => {
              const empTotals = calcEmployeeTotal(emp.id);
              const isMatch = monthNormHours > 0 && empTotals.working === monthNormHours;
              const isOff = monthNormHours > 0 && empTotals.working > 0 && empTotals.working !== monthNormHours;
              return (
                <tr key={emp.id}>
                  <td className="border border-gray-300 px-2 py-1">{emp.firstName}</td>
                  <td className="border border-gray-300 px-2 py-1">{emp.lastName}</td>
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

export default function Approvals() {
  const { user, pendingSchedules } = useLoaderData<typeof loader>();
  const actionData = (typeof window !== 'undefined' ? undefined : null) as any;

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
          <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--primary-color)' }}>
            Pending Approvals
          </h2>

          {pendingSchedules.length === 0 ? (
            <p className="text-gray-500 text-center">No pending approvals</p>
          ) : (
            <div className="space-y-8">
              {pendingSchedules.map((schedule: any) => {
                const pendingApproval = schedule.approvals?.[0];
                const submittedAt = pendingApproval ? formatTimestamp(pendingApproval.createdAt) : null;

                return (
                  <div key={schedule.id} className="bg-white rounded-lg shadow-md p-6">
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="text-lg font-semibold">
                        {new Date(schedule.weekStart).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
                      </h3>
                      <div className="text-right">
                        <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: '#fef3c7', color: '#92400e' }}>
                          PENDING
                        </span>
                        {submittedAt && (
                          <div className="text-xs text-gray-500 mt-1">
                            Submitted: {submittedAt}
                          </div>
                        )}
                      </div>
                    </div>

                    <ApprovalGrid schedule={schedule} />

                    <Form
                      method="post"
                      className="mt-6 space-y-3 border-t pt-4"
                      onSubmit={(e) => {
                        const formData = new FormData(e.currentTarget);
                        const actionVal = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value');
                        if (actionVal === 'reject') {
                          const comment = formData.get('comment')?.toString().trim();
                          if (!comment) {
                            e.preventDefault();
                            alert('A comment is required when rejecting a schedule.');
                          }
                        }
                      }}
                    >
                      <input type="hidden" name="scheduleId" value={schedule.id} />

                      <div>
                        <label htmlFor={`comment-${schedule.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                          Comment <span className="text-gray-400">(required for rejection)</span>
                        </label>
                        <textarea
                          id={`comment-${schedule.id}`}
                          name="comment"
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Add a comment..."
                        />
                      </div>

                      <div className="flex gap-3">
                        <button
                          type="submit"
                          name="action"
                          value="approve"
                          style={{ backgroundColor: '#16a34a', color: '#fff', padding: '8px 16px', borderRadius: '6px', fontWeight: 500, border: 'none', cursor: 'pointer' }}
                        >
                          Accept Schedule
                        </button>
                        <button
                          type="submit"
                          name="action"
                          value="reject"
                          style={{ backgroundColor: '#ef4444', color: '#fff', padding: '8px 16px', borderRadius: '6px', fontWeight: 500, border: 'none', cursor: 'pointer' }}
                        >
                          Reject
                        </button>
                      </div>
                    </Form>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
