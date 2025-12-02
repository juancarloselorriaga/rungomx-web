import { db } from '@/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { customSession, haveIBeenPwned } from 'better-auth/plugins';
import { sendVerificationEmail, sendPasswordResetEmail } from '@/lib/email';
import { resolveUserContext } from '@/lib/auth/user-context';
import { extractLocaleFromRequest, extractLocaleFromCallbackURL } from '@/lib/utils/locale';

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
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
        const resetPasswordURL = callbackURL || `${process.env.BETTER_AUTH_URL || 'http://localhost:3000'}/${locale}/reset-password`;

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
        const baseURL = process.env.BETTER_AUTH_URL || 'http://localhost:3000';
        const successURL = `${baseURL}/${locale}/verify-email-success`;

        // Modify the verification URL to include callbackURL parameter
        const urlObj = new URL(url);
        urlObj.searchParams.set('callbackURL', successURL);
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
  },
});
