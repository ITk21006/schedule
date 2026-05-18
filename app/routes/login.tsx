import { redirect, data, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import { Form, useActionData } from 'react-router';
import { getUserId } from '~/lib/session.server';
import { verifyLogin } from '~/lib/auth.server';
import { createUserSession } from '~/lib/session.server';
import { useT } from '~/lib/i18n';
import { LanguageToggle } from '~/components/LanguageToggle';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await getUserId(request);
  if (userId) return redirect('/');
  return null;
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const email = formData.get('email');
  const password = formData.get('password');

  if (typeof email !== 'string' || typeof password !== 'string') {
    return data({ error: 'login.errorForm' }, { status: 400 });
  }

  const user = await verifyLogin(email, password);
  if (!user) {
    return data({ error: 'login.errorInvalid' }, { status: 400 });
  }

  return createUserSession(user.id, '/');
}

export default function Login() {
  const actionData = useActionData<typeof action>();
  const t = useT();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center" style={{ position: 'relative' }}>
      {/* Floating language toggle in top-left */}
      <div style={{
        position: 'absolute', top: 16, left: 16,
        background: 'var(--primary-color)', padding: '6px 8px', borderRadius: 6,
      }}>
        <LanguageToggle />
      </div>

      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold text-center mb-6" style={{ color: 'var(--primary-color)' }}>
          {t('login.title')}
        </h1>

        <Form method="post" className="space-y-4">
          {actionData?.error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {t(actionData.error)}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              {t('login.email')}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              {t('login.password')}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2"
            style={{ backgroundColor: 'var(--primary-color)' }}
          >
            {t('login.signIn')}
          </button>
        </Form>

        <div className="mt-4 text-sm text-gray-600">
          <p className="font-semibold mb-2">{t('login.demoAccounts')}</p>
          <p>{t('login.demoAdmin')}</p>
          <p>{t('login.demoManager')}</p>
          <p>{t('login.demoEmployee')}</p>
        </div>
      </div>
    </div>
  );
}