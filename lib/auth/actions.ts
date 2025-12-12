'use server';

import { cookies } from 'next/headers';
import { siteUrl } from '@/config/url';

/**
 * Server Actions for password reset flow
 * These run on the server and provide better security and error handling
 */

const baseURL = siteUrl;

interface PasswordResetResponse {
  data: Record<string, unknown> | null;
  error: { message: string } | null;
}

interface EmailVerificationResponse {
  data: Record<string, unknown> | null;
  error: { message: string } | null;
}

/**
 * Request a password reset email
 * Server Action - runs on the server for better security
 */
export async function requestPasswordReset(
  email: string,
  redirectTo: string
): Promise<PasswordResetResponse> {
  try {
    // Get the locale cookie to pass it along to Better Auth
    const cookieStore = await cookies();
    const localeCookie = cookieStore.get('NEXT_LOCALE');
    const cookieHeader = localeCookie ? `NEXT_LOCALE=${localeCookie.value}` : '';

    const response = await fetch(`${baseURL}/api/auth/request-password-reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': baseURL,
        ...(cookieHeader && { 'Cookie': cookieHeader }),
      },
      body: JSON.stringify({ email, redirectTo }),
      cache: 'no-store',
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        data: null,
        error: {
          message: data.message || 'Failed to send password reset email'
        }
      };
    }

    return { data, error: null };
  } catch (error) {
    console.error('❌ Password reset request failed:', error);
    return {
      data: null,
      error: { message: 'Network error. Please try again.' }
    };
  }
}

/**
 * Request an email verification email
 * Server Action - runs on the server for better security
 */
export async function requestEmailVerification(
  email: string,
  callbackURL?: string
): Promise<EmailVerificationResponse> {
  try {
    const cookieStore = await cookies();
    const localeCookie = cookieStore.get('NEXT_LOCALE');
    const cookieHeader = localeCookie ? `NEXT_LOCALE=${localeCookie.value}` : '';

    const response = await fetch(`${baseURL}/api/auth/send-verification-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': baseURL,
        ...(cookieHeader && { 'Cookie': cookieHeader }),
      },
      body: JSON.stringify({ email, callbackURL }),
      cache: 'no-store',
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        data: null,
        error: {
          message: data.message || 'Failed to send verification email'
        }
      };
    }

    return { data, error: null };
  } catch (error) {
    console.error('❌ Email verification request failed:', error);
    return {
      data: null,
      error: { message: 'Network error. Please try again.' }
    };
  }
}

/**
 * Reset password with token
 * Server Action - runs on the server for better security
 */
export async function resetPasswordWithToken(
  newPassword: string,
  token: string
): Promise<PasswordResetResponse> {
  try {
    const response = await fetch(`${baseURL}/api/auth/reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': baseURL,
      },
      body: JSON.stringify({ newPassword, token }),
      cache: 'no-store',
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        data: null,
        error: {
          message: data.message || 'Failed to reset password'
        }
      };
    }

    return { data, error: null };
  } catch (error) {
    console.error('❌ Password reset failed:', error);
    return {
      data: null,
      error: { message: 'Network error. Please try again.' }
    };
  }
}
