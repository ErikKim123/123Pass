import './globals.css';

export const metadata = {
  title: '123Pass Admin',
  description: 'Operator dashboard — metadata only, zero-knowledge boundary preserved',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
