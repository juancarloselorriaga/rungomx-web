import { db } from '@/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { customSession, haveIBeenPwned } from 'better-auth/plugins';
import { sendVerificationEmail, sendPasswordResetEmail } from '@/lib/email';
import { resolveUserContext } from '@/lib/auth/user-context';
import { extractLocaleFromRequest, extractLocaleFromCallbackURL } from '@/lib/utils/locale';
import { siteUrl } from '@/config/url';

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

const trustedOrigins = Array.from(
  new Set(
    [
      siteUrl,
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
      process.env.VERCEL_BRANCH_URL ? `https://${process.env.VERCEL_BRANCH_URL}` : null,
      process.env.AUTH_ADDITIONAL_TRUSTED_ORIGINS,
      'http://localhost:3000',
    ]
      .filter((origin): origin is string => Boolean(origin))
      .flatMap((origin) =>
        origin
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      ),
  ),
);

export const auth = betterAuth({
  baseURL: siteUrl,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: 'pg',
    usePlural: true,
  }),
  advanced: {
    database: {
      generateId: false,
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    requireEmailVerification: true,
    autoSignIn: false,
    sendResetPassword: async ({ user, url }, request) => {
      try {
        // Extract locale from the url which contains the redirectTo parameter
        // The url looks like: http://localhost:3000/api/auth/verify?token=...&callbackURL=/en/reset-password
        const urlObj = new URL(url);
        const callbackURL = urlObj.searchParams.get('callbackURL') || '';

        // Extract locale from callbackURL, with fallback to request-based extraction
        const locale = extractLocaleFromCallbackURL(callbackURL, request);

        // Use the callbackURL directly if provided, otherwise construct it
        const resetPasswordURL = callbackURL || `${siteUrl}/${locale}/reset-password`;

        // Modify the reset URL to include callbackURL parameter
        urlObj.searchParams.set('callbackURL', resetPasswordURL);
        const modifiedURL = urlObj.toString();

        await sendPasswordResetEmail({
          email: user.email,
          url: modifiedURL,
          userName: user.name,
          locale,
        });
      } catch (error) {
        console.error('❌ Failed to send password reset email:', error);
        throw error;
      }
    },
  },
  plugins: [
    customSession(async ({ user, session }) => {
      const resolved = await resolveUserContext(user ?? null);

      return {
        roles: resolved.roles,
        canonicalRoles: resolved.canonicalRoles,
        isInternal: resolved.isInternal,
        permissions: resolved.permissions,
        needsRoleAssignment: resolved.needsRoleAssignment,
        profileRequirements: resolved.profileRequirements,
        profileMetadata: resolved.profileMetadata,
        availableExternalRoles: resolved.availableExternalRoles,
        profile: resolved.profile,
        user: {
          ...user,
          isInternal: resolved.isInternal,
          profileStatus: resolved.profileStatus,
          canonicalRoles: resolved.canonicalRoles,
          permissions: resolved.permissions,
          needsRoleAssignment: resolved.needsRoleAssignment,
          profileRequirements: resolved.profileRequirements,
          profileMetadata: resolved.profileMetadata,
          availableExternalRoles: resolved.availableExternalRoles,
          profile: resolved.profile,
        },
        session,
      };
    }),
    haveIBeenPwned({
      paths: [
        '/sign-up/email',
        '/change-password',
        '/reset-password',
      ],
      customPasswordCompromisedMessage: 'This password has been found in a data breach. Please choose a more secure password.',
    }),
  ],
  socialProviders:
    googleClientId && googleClientSecret
      ? {
        google: {
          clientId: googleClientId,
          clientSecret: googleClientSecret,
        },
      }
      : undefined,
  emailVerification: {
    sendVerificationEmail: async ({
      user,
      url
    }, request) => {
      try {
        const locale = extractLocaleFromRequest(request);

        // Construct the success page URL with proper locale
        const successURL = `${siteUrl}/${locale}/verify-email-success`;

        // Modify the verification URL to include callbackURL parameter
        const urlObj = new URL(url);
        const originalCallbackURL = urlObj.searchParams.get('callbackURL');
        const successUrlObj = new URL(successURL);

        if (originalCallbackURL) {
          successUrlObj.searchParams.set('callbackURL', originalCallbackURL);
        }

        urlObj.searchParams.set('callbackURL', successUrlObj.toString());
        const modifiedURL = urlObj.toString();

        await sendVerificationEmail({
          email: user.email,
          url: modifiedURL,
          userName: user.name,
          locale,
        });
      } catch (error) {
        console.error('❌ Failed to send verification email:', error);
        throw error;
      }
    },
    sendOnSignUp: true,
  },
  trustedOrigins: async (request) => {
    const origins = new Set(trustedOrigins);

    // Always trust the current host serving the request (covers aliases and previews)
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
    const protocol = request.headers.get('x-forwarded-proto') ?? 'https';
    if (host) {
      origins.add(`${protocol}://${host}`);
    }

    return Array.from(origins);
  },
});
