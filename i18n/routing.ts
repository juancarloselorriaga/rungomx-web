import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  // A list of all locales that are supported
  locales: ['es', 'en'],

  // Used when no locale matches
  defaultLocale: 'es',

  // Use 'as-needed' to hide the default locale prefix
  // Spanish (default): /acerca
  // English: /en/about
  localePrefix: 'as-needed',

  // Localized pathnames ensure Spanish uses /acerca and English uses /about
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
    '/dashboard': {
      es: '/dashboard',
      en: '/dashboard'
    },
    '/settings': {
      es: '/configuracion',
      en: '/settings'
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
    }
  }
});


export type AppLocale = typeof routing.locales[number];
