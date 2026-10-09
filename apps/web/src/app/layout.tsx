import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { FeedbackProvider } from "@/components/Feedback";
import { skinInitScript } from "@/components/SkinPicker";
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
  title: "Store Tracker",
  description: "Inventory, daily sales and weekly tithe for the store",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-skin="ocean"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: skinInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <FeedbackProvider>{children}</FeedbackProvider>
      </body>
    </html>
  );
}
