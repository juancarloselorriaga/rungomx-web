const mockSendEmail = jest.fn<Promise<{ body: { messageId: string } }>, unknown[]>();
const mockGetSupportRecipients = jest.fn<{ email: string }[], []>();

jest.mock('@/i18n/routing', () => ({
  routing: {
    defaultLocale: 'es',
  },
}));

jest.mock('@/lib/email', () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
  getSupportRecipients: () => mockGetSupportRecipients(),
}));

jest.mock('next-intl/server', () => ({
  getTranslations: jest.fn(() => (key: string, params?: Record<string, unknown>) => {
    if (params) {
      return `[${key}]:${JSON.stringify(params)}`;
    }
    return `[${key}]`;
  }),
}));

import {
  notifyDeletedUser,
  notifySupportOfDeletion,
  sendUserDeletionNotifications,
  type UserDeletionNotificationParams,
} from '@/lib/users/email';

describe('User Deletion Email Service', () => {
  const defaultParams: UserDeletionNotificationParams = {
    deletedUser: {
      email: 'deleted@example.com',
      name: 'Deleted User',
    },
    deletedBy: {
      id: 'admin-123',
      name: 'Admin User',
    },
    isSelfDeletion: false,
    locale: 'en',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSendEmail.mockResolvedValue({ body: { messageId: 'test-message-id' } });
    mockGetSupportRecipients.mockReturnValue([{ email: 'support@example.com' }]);
  });

  describe('notifyDeletedUser', () => {
    it('sends email to the deleted user', async () => {
      await notifyDeletedUser(defaultParams);

      expect(mockSendEmail).toHaveBeenCalledTimes(1);
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: { email: 'deleted@example.com', name: 'Deleted User' },
          subject: '[subject]',
        }),
      );
    });

    it('uses admin deleted message when isSelfDeletion is false', async () => {
      await notifyDeletedUser({ ...defaultParams, isSelfDeletion: false });

      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          htmlContent: expect.stringContaining('[messageAdminDeleted]'),
        }),
      );
    });

    it('uses self deleted message when isSelfDeletion is true', async () => {
      await notifyDeletedUser({ ...defaultParams, isSelfDeletion: true });

      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          htmlContent: expect.stringContaining('[messageSelfDeleted]'),
        }),
      );
    });

    it('falls back to email when name is empty', async () => {
      await notifyDeletedUser({
        ...defaultParams,
        deletedUser: { email: 'test@example.com', name: '' },
      });

      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: { email: 'test@example.com', name: undefined },
          htmlContent: expect.stringContaining('test@example.com'),
        }),
      );
    });
  });

  describe('notifySupportOfDeletion', () => {
    it('sends email to support recipients', async () => {
      await notifySupportOfDeletion(defaultParams);

      expect(mockSendEmail).toHaveBeenCalledTimes(1);
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: [{ email: 'support@example.com' }],
          subject: '[subject]',
        }),
      );
    });

    it('skips sending when no support recipients are configured', async () => {
      mockGetSupportRecipients.mockReturnValue([]);

      await notifySupportOfDeletion(defaultParams);

      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it('includes deleted user info in the email', async () => {
      await notifySupportOfDeletion(defaultParams);

      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          htmlContent: expect.stringContaining('deleted@example.com'),
        }),
      );
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          htmlContent: expect.stringContaining('Deleted User'),
        }),
      );
    });

    it('shows self-deletion type when isSelfDeletion is true', async () => {
      await notifySupportOfDeletion({ ...defaultParams, isSelfDeletion: true });

      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          htmlContent: expect.stringContaining('[deletionTypeSelf]'),
        }),
      );
    });

    it('shows admin-initiated type when isSelfDeletion is false', async () => {
      await notifySupportOfDeletion({ ...defaultParams, isSelfDeletion: false });

      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          htmlContent: expect.stringContaining('[deletionTypeAdmin]'),
        }),
      );
    });

    it('includes admin name in deletedBy for admin-initiated deletions', async () => {
      await notifySupportOfDeletion({ ...defaultParams, isSelfDeletion: false });

      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          htmlContent: expect.stringContaining('Admin User'),
        }),
      );
    });

    it('includes (self) suffix for self-deletions', async () => {
      await notifySupportOfDeletion({ ...defaultParams, isSelfDeletion: true });

      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          htmlContent: expect.stringContaining('(self)'),
        }),
      );
    });
  });

  describe('sendUserDeletionNotifications', () => {
    it('sends both user and admin notifications', async () => {
      await sendUserDeletionNotifications(defaultParams);

      expect(mockSendEmail).toHaveBeenCalledTimes(2);
    });

    it('does not throw when user notification fails', async () => {
      mockSendEmail.mockRejectedValueOnce(new Error('SMTP error'));
      mockSendEmail.mockResolvedValueOnce({ body: { messageId: 'admin-msg' } });

      await expect(sendUserDeletionNotifications(defaultParams)).resolves.not.toThrow();
    });

    it('does not throw when admin notification fails', async () => {
      mockSendEmail.mockResolvedValueOnce({ body: { messageId: 'user-msg' } });
      mockSendEmail.mockRejectedValueOnce(new Error('SMTP error'));

      await expect(sendUserDeletionNotifications(defaultParams)).resolves.not.toThrow();
    });

    it('does not throw when both notifications fail', async () => {
      mockSendEmail.mockRejectedValue(new Error('SMTP error'));

      await expect(sendUserDeletionNotifications(defaultParams)).resolves.not.toThrow();
    });

    it('logs errors when notifications fail', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockSendEmail.mockRejectedValue(new Error('SMTP error'));

      await sendUserDeletionNotifications(defaultParams);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[user-deletion] Email notification failed:',
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });

    it('succeeds even when no support recipients are configured', async () => {
      mockGetSupportRecipients.mockReturnValue([]);

      await sendUserDeletionNotifications(defaultParams);

      // Only user notification sent
      expect(mockSendEmail).toHaveBeenCalledTimes(1);
    });
  });
});
