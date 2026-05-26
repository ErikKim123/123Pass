import './globals.css';

import { VaultProvider } from '@/components/VaultProvider';

import type { Metadata } from 'next';


export const metadata: Metadata = {
  title: '123Pass',
  description: 'Zero-Knowledge E2EE password manager',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <html lang="ko">
      <body>
        <VaultProvider>{children}</VaultProvider>
      </body>
    </html>
  );
}
