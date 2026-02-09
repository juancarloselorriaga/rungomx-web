import type { ReactNode } from 'react';

type ResultsLayoutProps = {
  children: ReactNode;
  modal: ReactNode;
};

export default function ResultsLayout({ children, modal }: ResultsLayoutProps) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}

