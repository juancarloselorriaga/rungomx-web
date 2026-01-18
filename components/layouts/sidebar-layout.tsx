import { ReactNode } from 'react';

type SidebarLayoutProps = {
  /**
   * Optional header content that spans the full width above sidebar and content
   */
  header?: ReactNode;
  /**
   * Sidebar navigation content
   */
  sidebar: ReactNode;
  /**
   * Main page content
   */
  children: ReactNode;
  /**
   * Maximum width for the content area
   */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | '7xl' | 'full';
};

const maxWidthClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
  full: 'max-w-full',
};

/**
 * Reusable sidebar layout component following Vercel's design pattern
 * - Optional full-width header at the top
 * - Left sidebar navigation
 * - Main content area on the right
 */
export function SidebarLayout({
  header,
  sidebar,
  children,
  maxWidth = '5xl',
}: SidebarLayoutProps) {
  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* Optional Header - spans full width */}
      {header && (
        <div className="border-b border-border bg-background">
          <div className="px-6 py-4">{header}</div>
        </div>
      )}

      {/* Sidebar + Content */}
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-60 flex-shrink-0 border-r border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 h-[calc(100vh-4rem)] overflow-y-auto">
          {sidebar}
        </aside>

        {/* Main content area */}
        <main className="flex-1 overflow-y-auto">
          <div className={`${maxWidthClasses[maxWidth]} py-6 px-6`}>{children}</div>
        </main>
      </div>
    </div>
  );
}
