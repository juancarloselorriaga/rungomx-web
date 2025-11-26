import createMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';

export const handleI18nRouting = createMiddleware(routing);
