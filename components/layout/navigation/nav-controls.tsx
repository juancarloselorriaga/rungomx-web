import { AuthControls } from '@/components/auth/auth-controls';
import { ThemeSwitcher } from '@/components/theme-switcher.client';

export default function NavigationControls() {
  return (
    <div className="hidden md:flex gap-2 items-center">
      <AuthControls/>
      <ThemeSwitcher/>
    </div>
  );
}
