import {
  NavigationBar as NavigationBarClient
} from '@/components/layout/navigation/nav-bar.client';
import { NavItems } from '@/components/layout/navigation/nav-items';
import { getCurrentUser } from '@/lib/auth';
import Link from 'next/link';
import NavigationControls from './nav-controls';

export default async function NavigationBar() {
  const user = await getCurrentUser();

  return (
    <nav
      className="bg-gradient-to-t from-transparent via-background/80 to-background z-20 fixed top-0 right-0 left-0 w-full h-16">
      <div
        className="h-full w-full max-w-7xl mx-auto flex justify-between items-center p-3 text-sm ">
        <div className="flex items-center gap-3 font-semibold flex-1/3">
          <NavigationBarClient user={user}/>
          <Link className="hidden md:block px-4" href={'/'}>
            SprintMX
          </Link>
        </div>

        <div className="hidden md:block flex-1 mx-4 flex-1/3">
          <NavItems
            containerClassName="flex-row items-center justify-center space-y-0 space-x-2 p-0"
            iconSize={22}
            showLabels={true}
          />
        </div>

        <div className="flex items-center justify-end flex-1/3">
          <NavigationControls/>
        </div>
      </div>
    </nav>
  );
}
