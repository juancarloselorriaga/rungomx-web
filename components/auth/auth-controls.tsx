import { AuthControls as AuthControlsClient } from '@/components/auth/auth-controls.client';
import { getCurrentUser } from '@/lib/auth';

export async function AuthControls() {
  const user = await getCurrentUser();
  return <AuthControlsClient user={user}/>;
}
