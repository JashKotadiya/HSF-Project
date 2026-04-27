import { Open_Sans, Work_Sans } from 'next/font/google';
import "./globals.css"; // Ensure your Tailwind imports are here

// Load Open Sans for body and paragraphs [cite: 29, 35]
const openSans = Open_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-open-sans',
});

// Load Work Sans for headings [cite: 41]
const workSans = Work_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-work-sans',
});

export const metadata = {
  title: "HSF Project | Join. Connect. Grow.",
  description: "Human Service Forum - Professional community for human services.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${openSans.variable} ${workSans.variable}`}>
      <body className="bg-[#F3F4F6] text-[#111111] antialiased">
        {/* We set a neutral background here to mirror the LinkedIn 
            clean-room aesthetic and ensure brand text contrast[cite: 22].
        */}
        {children}
      </body>
    </html>
  );
}
