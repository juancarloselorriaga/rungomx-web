import { db } from '@/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { haveIBeenPwned } from 'better-auth/plugins';
import { sendVerificationEmail } from '@/lib/email';
import { extractLocaleFromRequest } from '@/lib/utils/locale';

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
  },
  plugins: [
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
        console.log('Locale', locale);

        await sendVerificationEmail({
          email: user.email,
          url,
          userName: user.name,
          locale,
        });
        console.log(`✅ Verification email sent to: ${user.email} (locale: ${locale})`);
      } catch (error) {
        console.error('❌ Failed to send verification email:', error);
        throw error;
      }
    },
  },
});
