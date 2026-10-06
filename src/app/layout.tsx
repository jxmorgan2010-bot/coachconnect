import type { Metadata } from "next";
import { Anton, Karla } from "next/font/google";
import "./globals.css";
import SessionProviderWrapper from "@/components/SessionProviderWrapper";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SupportWidget from "@/components/SupportWidget";
import SuspensionNotice from "@/components/SuspensionNotice";

const anton = Anton({
  variable: "--font-anton",
  subsets: ["latin"],
  weight: "400",
});

const karla = Karla({
  variable: "--font-karla",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "CoachConnect — 1-on-1 coaching from student athletes",
  description:
    "Book 1-on-1 sports sessions in the Bay Area with high school and college athletes. A person reviews every coach's ID before their profile goes live, and you pay through the app.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${anton.variable} ${karla.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <SessionProviderWrapper>
          <Navbar />
          <SuspensionNotice />
          <main className="flex-1">{children}</main>
          <Footer />
          <SupportWidget />
        </SessionProviderWrapper>
      </body>
    </html>
  );
}
