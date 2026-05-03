import '@/styles/globals.css';

export const metadata = {
  title: 'HSF Project',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-hsf-light">{children}</body>
    </html>
  );
}
