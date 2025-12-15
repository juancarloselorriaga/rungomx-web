import { AuthControls as AuthControlsInteractive } from '@/components/auth/auth-controls-interactive';
import { getCurrentUser } from '@/lib/auth/server';

export async function AuthControls() {
  const user = await getCurrentUser();
  return <AuthControlsInteractive user={user} />;
}
