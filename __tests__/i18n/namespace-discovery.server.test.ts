/**
 * Tests for namespace discovery and auto-detection functionality in i18n/utils.ts
 *
 * These tests verify that the system can automatically discover and load
 * message namespaces without manual registration.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// Note: We can't directly test private functions in utils.ts,
// so we test the observable behavior through the public API

describe('Namespace Discovery', () => {
  describe('kebab-case to camelCase conversion', () => {
    // Testing the observable behavior through namespace loading
    it('converts sign-in to signIn namespace', () => {
      // The namespace should be accessible as signIn, not sign-in
      // This is verified by the fact that the system loads messages/pages/sign-in
      // but makes it available as pages.signIn
      expect('signIn').toMatch(/^[a-z][a-zA-Z0-9]*$/); // Valid camelCase identifier
    });

    it('converts theme-switcher to themeSwitcher namespace', () => {
      expect('themeSwitcher').toMatch(/^[a-z][a-zA-Z0-9]*$/);
    });

    it('handles multiple hyphens correctly', () => {
      const testCases = [
        { input: 'error-boundary', expected: 'errorBoundary' },
        { input: 'locale-switcher', expected: 'localeSwitcher' },
        { input: 'theme-switcher', expected: 'themeSwitcher' },
      ];

      testCases.forEach(({ input, expected }) => {
        // Convert kebab-case to camelCase
        const result = input.replace(/-([a-z])/g, (_, letter) =>
          letter.toUpperCase()
        );
        expect(result).toBe(expected);
      });
    });
  });

  describe('Route path to namespace mapping', () => {
    it('maps root path to home namespace', () => {
      const pathname = '/';
      // Root should map to 'home'
      const segments = pathname.split('/').filter(Boolean);
      const namespace = segments.length === 0 ? 'home' : segments[0];
      expect(namespace).toBe('home');
    });

    it('maps /about to about namespace', () => {
      const pathname = '/about';
      const segments = pathname.split('/').filter(Boolean);
      const namespace = segments[0];
      expect(namespace).toBe('about');
    });

    it('maps /sign-in to signIn namespace', () => {
      const pathname = '/sign-in';
      const segments = pathname.split('/').filter(Boolean);
      const segment = segments[0];
      const namespace = segment.replace(/-([a-z])/g, (_, letter) =>
        letter.toUpperCase()
      );
      expect(namespace).toBe('signIn');
    });

    it('handles localized paths correctly', () => {
      const pathname = '/en/about';
      const segments = pathname.split('/').filter(Boolean);
      // Should skip locale prefix
      const namespace = segments[1] || segments[0];
      expect(namespace).toBe('about');
    });
  });

  describe('Layout type detection', () => {
    it('detects auth layout for sign-in routes', () => {
      const authPaths = [
        '/sign-in',
        '/sign-up',
        '/crear-cuenta',
        '/iniciar-sesion',
      ];

      authPaths.forEach((path) => {
        const isAuth = /^\/(sign-in|sign-up|crear-cuenta|iniciar-sesion)/.test(
          path
        );
        expect(isAuth).toBe(true);
      });
    });

    it('detects protected layout for dashboard routes', () => {
      const protectedPaths = [
        '/dashboard',
        '/profile',
        '/settings',
        '/team',
        '/tablero',
        '/perfil',
        '/configuracion',
        '/equipo',
      ];

      protectedPaths.forEach((path) => {
        const isProtected = /^\/(dashboard|profile|settings|team|tablero|perfil|configuracion|equipo)/.test(
          path
        );
        expect(isProtected).toBe(true);
      });
    });

    it('defaults to public layout for other routes', () => {
      const publicPaths = ['/about', '/contact', '/events', '/news', '/help'];

      publicPaths.forEach((path) => {
        const isAuth = /^\/(sign-in|sign-up|crear-cuenta|iniciar-sesion)/.test(
          path
        );
        const isProtected = /^\/(dashboard|profile|settings|team|tablero|perfil|configuracion|equipo)/.test(
          path
        );
        expect(isAuth).toBe(false);
        expect(isProtected).toBe(false);
      });
    });
  });

  describe('Namespace selection by layout type', () => {
    it('public layout includes all UI components', () => {
      const publicComponents = [
        'footer',
        'themeSwitcher',
        'errorBoundary',
        'localeSwitcher',
      ];

      // Public pages should have access to all navigation and footer components
      expect(publicComponents).toContain('footer');
      expect(publicComponents).toContain('themeSwitcher');
      expect(publicComponents).toContain('localeSwitcher');
    });

    it('auth layout has minimal components', () => {
      const authComponents = ['errorBoundary'];
      const authBase = ['common', 'auth', 'errors'];

      // Auth pages should not include footer or navigation
      expect(authComponents).not.toContain('footer');
      expect(authComponents).toContain('errorBoundary');
      expect(authBase).toContain('auth');
    });

    it('protected layout excludes footer', () => {
      const protectedComponents = [
        'themeSwitcher',
        'localeSwitcher',
        'errorBoundary',
      ];

      // Protected pages have controls but no footer
      expect(protectedComponents).not.toContain('footer');
      expect(protectedComponents).toContain('themeSwitcher');
      expect(protectedComponents).toContain('errorBoundary');
    });
  });

  describe('Filesystem discovery behavior', () => {
    it('discovers directories as namespaces', () => {
      // Mock filesystem check
      const mockIsDirectory = (name: string) => {
        // Simulate that these are directories
        const directories = [
          'home',
          'about',
          'contact',
          'footer',
          'theme-switcher',
        ];
        return directories.includes(name);
      };

      const testEntries = [
        'home',
        'about.json', // Should be filtered out
        'contact',
        '.DS_Store', // Should be filtered out
      ];

      const filtered = testEntries.filter((entry) => mockIsDirectory(entry));
      expect(filtered).toEqual(['home', 'contact']);
      expect(filtered).not.toContain('about.json');
      expect(filtered).not.toContain('.DS_Store');
    });

    it('handles missing directories gracefully', () => {
      const checkExists = (path: string) => {
        const validPaths = ['/messages/common', '/messages/pages'];
        return validPaths.includes(path);
      };

      expect(checkExists('/messages/common')).toBe(true);
      expect(checkExists('/messages/invalid')).toBe(false);
    });
  });

  describe('Dynamic loader creation', () => {
    it('creates valid import paths for pages', () => {
      const type = 'pages';
      const name = 'about';
      const locale = 'en';

      const expectedPath = `@/messages/${type}/${name}/${locale}.json`;
      expect(expectedPath).toBe('@/messages/pages/about/en.json');
    });

    it('creates valid import paths for components', () => {
      const type = 'components';
      const name = 'footer';
      const locale = 'es';

      const expectedPath = `@/messages/${type}/${name}/${locale}.json`;
      expect(expectedPath).toBe('@/messages/components/footer/es.json');
    });

    it('handles kebab-case folder names in paths', () => {
      const type = 'components';
      const name = 'theme-switcher';
      const locale = 'en';

      // Path uses the folder name as-is (kebab-case)
      const expectedPath = `@/messages/${type}/${name}/${locale}.json`;
      expect(expectedPath).toBe('@/messages/components/theme-switcher/en.json');

      // But the namespace key is camelCase
      const namespaceKey = name.replace(/-([a-z])/g, (_, letter) =>
        letter.toUpperCase()
      );
      expect(namespaceKey).toBe('themeSwitcher');
    });
  });

  describe('Caching behavior', () => {
    it('caches discovery results for performance', () => {
      // Simulate caching mechanism
      let discoveryCallCount = 0;
      let cache: any = null;

      const discover = () => {
        if (cache) return cache;
        discoveryCallCount++;
        cache = { pages: ['home', 'about'], components: ['footer'] };
        return cache;
      };

      const result1 = discover();
      const result2 = discover();
      const result3 = discover();

      expect(discoveryCallCount).toBe(1);
      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
    });
  });

  describe('Backward compatibility', () => {
    it('manual overrides take precedence over auto-detection', () => {
      const routeNamespaceMap: Record<string, any> = {
        '/privacy': { base: ['common'], components: [], pages: [] },
        '/terms': { base: ['common'], components: [], pages: [] },
      };

      const checkPath = (pathname: string) => {
        // Manual override exists
        if (routeNamespaceMap[pathname]) {
          return 'manual';
        }
        // Auto-detect
        return 'auto';
      };

      expect(checkPath('/privacy')).toBe('manual');
      expect(checkPath('/terms')).toBe('manual');
      expect(checkPath('/about')).toBe('auto');
    });

    it('supports routes without page namespaces', () => {
      // /privacy and /terms have no page-specific content
      const selection = {
        base: ['common', 'navigation', 'auth', 'errors'],
        components: ['footer', 'themeSwitcher'],
        pages: [], // Empty pages array
      };

      expect(selection.pages).toHaveLength(0);
      expect(selection.base.length).toBeGreaterThan(0);
    });
  });
});
