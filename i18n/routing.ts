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
      en: '/about',
    },
    '/contact': {
      es: '/contacto',
      en: '/contact',
    },
    '/help': {
      es: '/ayuda',
      en: '/help',
    },
    '/privacy': {
      es: '/privacidad',
      en: '/privacy',
    },
    '/terms': {
      es: '/terminos',
      en: '/terms',
    },
    '/sign-in': {
      es: '/iniciar-sesion',
      en: '/sign-in',
    },
    '/sign-up': {
      es: '/crear-cuenta',
      en: '/sign-up',
    },
    '/admin': {
      es: '/admin',
      en: '/admin',
    },
    '/admin/users': {
      es: '/admin/usuarios',
      en: '/admin/users',
    },
    '/admin/users/internal': {
      es: '/admin/usuarios/internos',
      en: '/admin/users/internal',
    },
    '/admin/users/self-signup': {
      es: '/admin/usuarios/auto-registro',
      en: '/admin/users/self-signup',
    },
    '/admin/users/pro-access': {
      es: '/admin/usuarios/acceso-pro',
      en: '/admin/users/pro-access',
    },
    '/admin/users/pro-access/overrides': {
      es: '/admin/usuarios/acceso-pro/overrides',
      en: '/admin/users/pro-access/overrides',
    },
    '/admin/users/pro-access/promo-codes': {
      es: '/admin/usuarios/acceso-pro/codigos-promocionales',
      en: '/admin/users/pro-access/promo-codes',
    },
    '/admin/users/pro-access/email-grants': {
      es: '/admin/usuarios/acceso-pro/asignaciones-por-correo',
      en: '/admin/users/pro-access/email-grants',
    },
    '/dashboard': {
      es: '/tablero',
      en: '/dashboard',
    },
    '/dashboard/events': {
      es: '/tablero/eventos',
      en: '/dashboard/events',
    },
    '/dashboard/organizations': {
      es: '/tablero/organizaciones',
      en: '/dashboard/organizations',
    },
    '/dashboard/organizations/[orgId]': {
      es: '/tablero/organizaciones/[orgId]',
      en: '/dashboard/organizations/[orgId]',
    },
    '/dashboard/events/new': {
      es: '/tablero/eventos/nuevo',
      en: '/dashboard/events/new',
    },
    '/dashboard/events/[eventId]': {
      es: '/tablero/eventos/[eventId]',
      en: '/dashboard/events/[eventId]',
    },
    '/dashboard/events/[eventId]/editions': {
      es: '/tablero/eventos/[eventId]/ediciones',
      en: '/dashboard/events/[eventId]/editions',
    },
    '/dashboard/events/[eventId]/settings': {
      es: '/tablero/eventos/[eventId]/configuracion',
      en: '/dashboard/events/[eventId]/settings',
    },
    '/dashboard/events/[eventId]/faq': {
      es: '/tablero/eventos/[eventId]/faq',
      en: '/dashboard/events/[eventId]/faq',
    },
    '/dashboard/events/[eventId]/waivers': {
      es: '/tablero/eventos/[eventId]/deslindes',
      en: '/dashboard/events/[eventId]/waivers',
    },
    '/dashboard/events/[eventId]/policies': {
      es: '/tablero/eventos/[eventId]/politicas',
      en: '/dashboard/events/[eventId]/policies',
    },
    '/dashboard/events/[eventId]/website': {
      es: '/tablero/eventos/[eventId]/sitio-web',
      en: '/dashboard/events/[eventId]/website',
    },
    '/dashboard/events/[eventId]/pricing': {
      es: '/tablero/eventos/[eventId]/precios',
      en: '/dashboard/events/[eventId]/pricing',
    },
    '/dashboard/events/[eventId]/add-ons': {
      es: '/tablero/eventos/[eventId]/extras',
      en: '/dashboard/events/[eventId]/add-ons',
    },
    '/dashboard/events/[eventId]/coupons': {
      es: '/tablero/eventos/[eventId]/cupones',
      en: '/dashboard/events/[eventId]/coupons',
    },
    '/dashboard/events/[eventId]/registrations': {
      es: '/tablero/eventos/[eventId]/inscripciones',
      en: '/dashboard/events/[eventId]/registrations',
    },
    '/dashboard/events/[eventId]/group-registrations': {
      es: '/tablero/eventos/[eventId]/inscripciones-grupales',
      en: '/dashboard/events/[eventId]/group-registrations',
    },
    '/dashboard/my-registrations': {
      es: '/tablero/inscripciones',
      en: '/dashboard/my-registrations',
    },
    '/dashboard/my-registrations/[registrationId]': {
      es: '/tablero/inscripciones/[registrationId]',
      en: '/dashboard/my-registrations/[registrationId]',
    },
    '/events/[seriesSlug]/[editionSlug]': {
      es: '/eventos/[seriesSlug]/[editionSlug]',
      en: '/events/[seriesSlug]/[editionSlug]',
    },
    '/events/[seriesSlug]/[editionSlug]/register': {
      es: '/eventos/[seriesSlug]/[editionSlug]/inscripcion',
      en: '/events/[seriesSlug]/[editionSlug]/register',
    },
    '/events/[seriesSlug]/[editionSlug]/register/complete/[registrationId]': {
      es: '/eventos/[seriesSlug]/[editionSlug]/inscripcion/completar/[registrationId]',
      en: '/events/[seriesSlug]/[editionSlug]/register/complete/[registrationId]',
    },
    '/events/[seriesSlug]/[editionSlug]/claim/[inviteToken]': {
      es: '/eventos/[seriesSlug]/[editionSlug]/reclamar/[inviteToken]',
      en: '/events/[seriesSlug]/[editionSlug]/claim/[inviteToken]',
    },
    '/events/[seriesSlug]/[editionSlug]/group-upload/[uploadToken]': {
      es: '/eventos/[seriesSlug]/[editionSlug]/carga-grupal/[uploadToken]',
      en: '/events/[seriesSlug]/[editionSlug]/group-upload/[uploadToken]',
    },
    '/events/[seriesSlug]/[editionSlug]/group-upload/[uploadToken]/batches/[batchId]': {
      es: '/eventos/[seriesSlug]/[editionSlug]/carga-grupal/[uploadToken]/lotes/[batchId]',
      en: '/events/[seriesSlug]/[editionSlug]/group-upload/[uploadToken]/batches/[batchId]',
    },
    '/events/[seriesSlug]/[editionSlug]/groups/new': {
      es: '/eventos/[seriesSlug]/[editionSlug]/grupos/nuevo',
      en: '/events/[seriesSlug]/[editionSlug]/groups/new',
    },
    '/events/[seriesSlug]/[editionSlug]/groups/[groupToken]': {
      es: '/eventos/[seriesSlug]/[editionSlug]/grupos/[groupToken]',
      en: '/events/[seriesSlug]/[editionSlug]/groups/[groupToken]',
    },
    '/settings': {
      es: '/configuracion',
      en: '/settings',
    },
    '/settings/profile': {
      es: '/configuracion/perfil',
      en: '/settings/profile',
    },
    '/settings/account': {
      es: '/configuracion/cuenta',
      en: '/settings/account',
    },
    '/settings/billing': {
      es: '/configuracion/facturacion',
      en: '/settings/billing',
    },
    '/admin/account': {
      es: '/admin/cuenta',
      en: '/admin/account',
    },
    '/profile': {
      es: '/perfil',
      en: '/profile',
    },
    '/results': {
      es: '/resultados',
      en: '/results',
    },
    '/news': {
      es: '/noticias',
      en: '/news',
    },
    '/events': {
      es: '/eventos',
      en: '/events',
    },
    '/verify-email-success': {
      es: '/verificar-email-exitoso',
      en: '/verify-email-success',
    },
    '/verify-email': {
      es: '/verificar-email',
      en: '/verify-email',
    },
    '/forgot-password': {
      es: '/olvide-contrasena',
      en: '/forgot-password',
    },
    '/forgot-password/success': {
      es: '/olvide-contrasena/exitoso',
      en: '/forgot-password/success',
    },
    '/reset-password': {
      es: '/restablecer-contrasena',
      en: '/reset-password',
    },
  },
});

export type AppLocale = (typeof routing.locales)[number];

// Type representing all pathnames in the routing config
export type AppPathname = keyof typeof routing.pathnames;

// Type representing only static pathnames (no dynamic segments like [eventId])
// Used for callback URLs in auth forms where we redirect to static pages
export type StaticPathname = {
  [K in AppPathname]: K extends `${string}[${string}]${string}` ? never : K;
}[AppPathname];
