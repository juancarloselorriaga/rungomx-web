import { defineRouting } from 'next-intl/routing';

export const DEFAULT_TIMEZONE = 'America/Mexico_City';

export const routing = defineRouting({
  // A list of all locales that are supported
  locales: ['es', 'en'],

  // Used when no locale matches
  defaultLocale: 'es',

  // Use 'as-needed' to hide the default locale prefix
  // Spanish (default): /acerca
  // English: /en/about
  localePrefix: 'as-needed',

  // Only declare routes that differ across locales
  pathnames: {
    '/': '/',
    '/about': {
      es: '/acerca',
      en: '/about'
    },
    '/contact': {
      es: '/contacto',
      en: '/contact'
    },
    '/help': {
      es: '/ayuda',
      en: '/help'
    },
    '/privacy': {
      es: '/privacidad',
      en: '/privacy'
    },
    '/terms': {
      es: '/terminos',
      en: '/terms'
    },
    '/sign-in': {
      es: '/iniciar-sesion',
      en: '/sign-in'
    },
    '/sign-up': {
      es: '/crear-cuenta',
      en: '/sign-up'
    },
    '/admin': {
      es: '/admin',
      en: '/admin'
    },
    '/admin/users': {
      es: '/admin/usuarios',
      en: '/admin/users'
    },
    '/admin/users/self-signup': {
      es: '/admin/usuarios/auto-registro',
      en: '/admin/users/self-signup'
    },
    '/admin/tools': {
      es: '/admin/herramientas',
      en: '/admin/tools'
    },
    '/dashboard': {
      es: '/tablero',
      en: '/dashboard'
    },
    '/settings': {
      es: '/configuracion',
      en: '/settings'
    },
    '/settings/profile': {
      es: '/configuracion/perfil',
      en: '/settings/profile'
    },
    '/settings/account': {
      es: '/configuracion/cuenta',
      en: '/settings/account'
    },
    '/admin/account': {
      es: '/admin/cuenta',
      en: '/admin/account'
    },
    '/profile': {
      es: '/perfil',
      en: '/profile'
    },
    '/results': {
      es: '/resultados',
      en: '/results'
    },
    '/news': {
      es: '/noticias',
      en: '/news'
    },
    '/events': {
      es: '/eventos',
      en: '/events'
    },
    '/verify-email-success': {
      es: '/verificar-email-exitoso',
      en: '/verify-email-success'
    },
    '/verify-email': {
      es: '/verificar-email',
      en: '/verify-email'
    },
    '/forgot-password': {
      es: '/olvide-contrasena',
      en: '/forgot-password'
    },
    '/forgot-password/success': {
      es: '/olvide-contrasena/exitoso',
      en: '/forgot-password/success'
    },
    '/reset-password': {
      es: '/restablecer-contrasena',
      en: '/reset-password'
    }
  }
});


export type AppLocale = typeof routing.locales[number];
