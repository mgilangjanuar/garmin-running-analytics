import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Workout Analysis",
  description: "Garmin workout analytics dashboard and AI planning assistant",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isLoggedIn = await getSession();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning className="min-h-full flex flex-col bg-zinc-100 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <ThemeProvider>
          <header className="sticky top-0 z-20 border-b border-zinc-300/60 bg-zinc-100/95 backdrop-blur dark:border-zinc-800/80 dark:bg-zinc-900/95">
            <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between px-4 py-3 sm:px-6">
              <Link href="/" className="font-semibold tracking-tight">
                Garmin Analytics
              </Link>
              <nav className="flex items-center gap-2 text-sm">
                <Link
                  href="/"
                  className="rounded-md px-3 py-1.5 text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                >
                  Dashboard
                </Link>
                {isLoggedIn ? (
                  <>
                    <Link
                      href="/plan"
                      className="rounded-md bg-indigo-600 px-3 py-1.5 text-white transition-colors hover:bg-indigo-500"
                    >
                      Plan
                    </Link>
                    <form action="/api/auth/logout" method="POST">
                      <button
                        type="submit"
                        className="rounded-md px-3 py-1.5 text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                      >
                        Logout
                      </button>
                    </form>
                  </>
                ) : (
                  <Link
                    href="/login"
                    className="rounded-md bg-indigo-600 px-3 py-1.5 text-white transition-colors hover:bg-indigo-500"
                  >
                    Login
                  </Link>
                )}
                <ThemeToggle />
              </nav>
            </div>
          </header>
          <div className="flex-1">{children}</div>
        </ThemeProvider>
      </body>
    </html>
  );
}
