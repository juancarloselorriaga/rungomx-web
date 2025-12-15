import React, { ReactNode } from 'react';
import { AppThemeProvider } from './app-theme';

interface ProvidersWrapperProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersWrapperProps) {
  return <AppThemeProvider>{children}</AppThemeProvider>;
}
