import { redirect, data, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import { Form, useActionData } from 'react-router';
import { getUserId } from '~/lib/session.server';
import { verifyLogin } from '~/lib/auth.server';
import { createUserSession } from '~/lib/session.server';

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
    return data({ error: 'Invalid form submission' }, { status: 400 });
  }

  const user = await verifyLogin(email, password);
  if (!user) {
    return data({ error: 'Invalid email or password' }, { status: 400 });
  }

  return createUserSession(user.id, '/');
}

export default function Login() {
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold text-center mb-6" style={{ color: 'var(--primary-color)' }}>
          Store Schedule Manager
        </h1>
        
        <Form method="post" className="space-y-4">
          {actionData?.error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {actionData.error}
            </div>
          )}
          
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
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
              Password
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
            Sign In
          </button>
        </Form>
        
        <div className="mt-4 text-sm text-gray-600">
          <p className="font-semibold mb-2">Demo Accounts:</p>
          <p>Admin: admin@example.com / password123</p>
          <p>Manager: manager@example.com / password123</p>
          <p>Employee: employee@example.com / password123</p>
        </div>
      </div>
    </div>
  );
}