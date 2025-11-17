export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex h-screen items-center justify-center bg-gradient-to-br from-background to-muted">
      <div className="w-full max-w-md px-4">
        {children}
      </div>
    </div>
  );
}
