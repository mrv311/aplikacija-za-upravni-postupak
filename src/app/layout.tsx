import type { Metadata } from "next";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { ThemeProvider, ThemeInitScript } from "@/components/ThemeProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const legalSerif = Source_Serif_4({
  variable: "--font-legal-serif",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: "Upravni Postupak | Sustav za drugostupanjsko rješavanje",
  description: "Aplikacija za drugostupanjske upravne postupke i upravne sporove",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="hr"
      className={`${geistSans.variable} ${geistMono.variable} ${legalSerif.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <ThemeInitScript />
      </head>
      <body className="min-h-full flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200 selection:bg-blue-600 selection:text-white">
        <ThemeProvider>
          <Sidebar />
          <main className="flex-1 overflow-auto min-w-0 flex flex-col">
            {/* Diskretna institucionalna akcentna linija na vrhu */}
            <div className="h-[3px] w-full bg-gradient-to-r from-blue-700 via-indigo-600 to-amber-500/90 shrink-0" />
            <div className="flex-1 min-w-0">
              {children}
            </div>
          </main>
        </ThemeProvider>
      </body>
    </html>
  );
}
