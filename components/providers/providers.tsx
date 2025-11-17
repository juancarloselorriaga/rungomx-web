import React, { ReactNode } from 'react';
import { ThemeProvider } from './theme-provider';

interface ProvidersWrapperProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersWrapperProps) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}
