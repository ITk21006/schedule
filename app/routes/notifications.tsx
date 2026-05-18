import { data, type LoaderFunctionArgs, type ActionFunctionArgs } from 'react-router';
import { useLoaderData, Form, Link } from 'react-router';
import { requireUserId } from '~/lib/session.server';
import { getCurrentUser } from '~/lib/auth.server';
import { prisma } from '~/lib/db.server';
import { useT, useLang, localeFor } from '~/lib/i18n';
import { LanguageToggle } from '~/components/LanguageToggle';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const user = await getCurrentUser(userId);
  if (!user) throw new Response('Not found', { status: 404 });

  let notifications: any[] = [];
  try {
    notifications = await prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
  } catch { /* table may not exist yet */ }

  return data({ user, notifications });
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const user = await getCurrentUser(userId);
  if (!user) throw new Response('Not found', { status: 404 });

  const formData = await request.formData();
  const action = formData.get('action');
  const notificationId = formData.get('notificationId');

  try {
  if (action === 'markRead' && typeof notificationId === 'string') {
    await prisma.notification.update({
      where: { id: notificationId },
      data: { read: true },
    });
  } else if (action === 'markAllRead') {
    await prisma.notification.updateMany({
      where: { userId: user.id, read: false },
      data: { read: true },
    });
  } else if (action === 'dismiss' && typeof notificationId === 'string') {
    await prisma.notification.delete({
      where: { id: notificationId },
    });
  }
  } catch { /* table may not exist yet */ }

  return data({ success: true });
}

export default function Notifications() {
  const { user, notifications } = useLoaderData<typeof loader>();
  const t = useT();
  const lang = useLang();
  const locale = localeFor(lang);
  const unreadCount = notifications.filter((n: any) => !n.read).length;

  const formatTimestamp = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
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
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-4">
              <Link to="/schedules" className="text-sm hover:underline" style={{ color: 'var(--primary-color)' }}>
                {t('common.backToSchedules')}
              </Link>
              <h2 className="text-2xl font-bold" style={{ color: 'var(--primary-color)' }}>
                {t('notif.heading')} {unreadCount > 0 && <span className="text-sm font-normal">{t('notif.unreadSuffix', { n: unreadCount })}</span>}
              </h2>
            </div>
            {unreadCount > 0 && (
              <Form method="post">
                <button
                  type="submit"
                  name="action"
                  value="markAllRead"
                  className="text-sm px-3 py-1 rounded border border-gray-300 hover:bg-gray-100"
                >
                  {t('notif.markAllRead')}
                </button>
              </Form>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className="text-gray-500 text-center">{t('notif.empty')}</p>
          ) : (
            <div className="space-y-3">
              {notifications.map((notif: any) => {
                const isAccepted = notif.type === 'ACCEPTED';
                const bgColor = isAccepted ? '#dcfce7' : '#fee2e2';
                const borderColor = isAccepted ? '#86efac' : '#fca5a5';
                const textColor = isAccepted ? '#166534' : '#991b1b';

                return (
                  <div
                    key={notif.id}
                    className="rounded-lg p-4"
                    style={{
                      backgroundColor: bgColor,
                      borderLeft: `4px solid ${borderColor}`,
                      opacity: notif.read ? 0.7 : 1,
                    }}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-semibold" style={{ color: textColor }}>
                          {notif.title}
                        </h3>
                        {notif.message && (
                          <p className="text-sm mt-1" style={{ color: textColor }}>
                            {notif.message}
                          </p>
                        )}
                        <p className="text-xs mt-2" style={{ color: textColor, opacity: 0.7 }}>
                          {formatTimestamp(notif.createdAt)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {!notif.read && (
                          <Form method="post" style={{ display: 'inline' }}>
                            <input type="hidden" name="notificationId" value={notif.id} />
                            <button
                              type="submit"
                              name="action"
                              value="markRead"
                              className="text-xs px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50"
                            >
                              {t('notif.markRead')}
                            </button>
                          </Form>
                        )}
                        <Form method="post" style={{ display: 'inline' }}>
                          <input type="hidden" name="notificationId" value={notif.id} />
                          <button
                            type="submit"
                            name="action"
                            value="dismiss"
                            className="text-xs px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50"
                            title={t('notif.dismiss')}
                          >
                            &times;
                          </button>
                        </Form>
                        {notif.scheduleId && (
                          <Link
                            to={`/schedules/${notif.scheduleId}`}
                            className="text-xs px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50"
                          >
                            {t('notif.view')}
                          </Link>
                        )}
                      </div>
                    </div>
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
