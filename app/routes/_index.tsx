import { redirect, type LoaderFunctionArgs } from 'react-router';
import { getUserId } from '~/lib/session.server';
import { getCurrentUser } from '~/lib/auth.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await getUserId(request);
  if (!userId) return redirect('/login');

  const user = await getCurrentUser(userId);
  if (!user) return redirect('/login');

  // Redirect based on role
  if (user.role === 'ALL_STORE_MANAGER') {
    return redirect('/approvals');
  } else {
    return redirect('/schedules');
  }
}