import ProtectedLayoutWrapper from '@/components/layout/protected-layout-wrapper';

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProtectedLayoutWrapper>{children}</ProtectedLayoutWrapper>;
}
