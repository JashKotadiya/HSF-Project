import { Open_Sans, Work_Sans } from 'next/font/google';
import '@/styles/globals.css';

const openSans = Open_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-open-sans',
});

const workSans = Work_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-work-sans',
});

export const metadata = {
  title: 'HSF Project | Join. Connect. Grow.',
  description:
    'Human Service Forum - Professional community for human services.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${openSans.variable} ${workSans.variable}`}>
      <body className="bg-hsf-light text-hsf-text antialiased">{children}</body>
    </html>
  );
}
