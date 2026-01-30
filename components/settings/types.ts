export type SettingsSection = {
  key: 'profile' | 'account' | 'billing';
  href: string;
  title: string;
  description?: string;
};
