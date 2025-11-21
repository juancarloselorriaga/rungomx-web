'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

type Theme = 'light' | 'dark';

type AppThemeProviderProps = {
  children: React.ReactNode;
  forcedTheme?: Theme;
  enableSystem?: boolean;
  defaultTheme?: Theme;
  disableTransitionOnChange?: boolean;
};

type ThemeContextValue = {
  theme: Theme;
  setTheme: (next: Theme) => void;
  forcedTheme?: Theme;
};

const STORAGE_KEY = 'sprintmx-theme';

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function applyTheme(next: Theme, disableTransitions: boolean) {
  const root = document.documentElement;
  const removeTransitionBlocker = disableTransitions
    ? injectTransitionBlocker(root)
    : undefined;

  root.classList.toggle('dark', next === 'dark');
  root.style.colorScheme = next === 'dark' ? 'dark' : 'light';

  if (removeTransitionBlocker) {
    removeTransitionBlocker();
  }
}

function injectTransitionBlocker(root: HTMLElement) {
  const style = document.createElement('style');
  style.setAttribute('data-theme-transition', 'true');
  style.textContent = '*{transition:none!important}';
  root.appendChild(style);
  return () => {
    style.remove();
  };
}

export function AppThemeProvider({
  children,
  forcedTheme,
  enableSystem = true,
  defaultTheme = 'light',
  disableTransitionOnChange = true,
}: AppThemeProviderProps) {
  const getInitialState = () => {
    if (typeof window === 'undefined') {
      return {
        theme: forcedTheme ?? defaultTheme,
        hasStored: false,
      };
    }
    const stored =(localStorage.getItem(STORAGE_KEY) as Theme | null)
    const prefersDark =
      enableSystem && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initial = stored ?? (prefersDark ? 'dark' : defaultTheme);
    return {
      theme: forcedTheme ?? initial,
      hasStored: !!stored,
    };
  };

  const initial = getInitialState();

  const [theme, setThemeState] = useState<Theme>(initial.theme);
  const [hasStoredPreference, setHasStoredPreference] = useState<boolean>(
    initial.hasStored,
  );

  // Keep DOM and storage in sync when the theme changes
  useEffect(() => {
    if (forcedTheme) {
      applyTheme(forcedTheme, disableTransitionOnChange);
      return;
    }
    applyTheme(theme, disableTransitionOnChange);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [disableTransitionOnChange, forcedTheme, theme]);

  // React to other tabs/hidden Activities writing storage
  useEffect(() => {
    if (forcedTheme) return;
    const handler = (event: StorageEvent) => {
      if (
        (event.key === STORAGE_KEY) &&
        event.newValue
      ) {
        const next = event.newValue as Theme;
        setThemeState(next);
        setHasStoredPreference(true);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [forcedTheme]);

  // React to system preference changes only if we don't have a stored preference
  useEffect(() => {
    if (!enableSystem || hasStoredPreference || forcedTheme) return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (event: MediaQueryListEvent) => {
      const next = event.matches ? 'dark' : 'light';
      setThemeState(next);
      applyTheme(next, disableTransitionOnChange);
    };
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [disableTransitionOnChange, enableSystem, forcedTheme, hasStoredPreference]);

  const setTheme = useCallback((next: Theme) => {
    if (forcedTheme) {
      // Respect forced theme; no-op to avoid conflicting writes
      setThemeState(forcedTheme);
      return;
    }
    setHasStoredPreference(true);
    setThemeState(next);
  }, [forcedTheme]);

  const value = useMemo(
    () => ({ theme: forcedTheme ?? theme, setTheme, forcedTheme }),
    [forcedTheme, setTheme, theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useAppTheme must be used within AppThemeProvider');
  }
  return ctx;
}
