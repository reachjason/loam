import type { Metadata, Viewport } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import { ServiceWorker } from "@/components/service-worker";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "opsz"],
});

export const metadata: Metadata = {
  title: "Loam — read deeply",
  description: "A quiet place to focus and take in what you're reading.",
  applicationName: "Loam",
  // Installed on iPhone/iPad: open full-screen with the parchment status bar.
  appleWebApp: { capable: true, title: "Loam", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#efe6d4" },
    { media: "(prefers-color-scheme: dark)", color: "#221c17" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="relative min-h-full flex flex-col">
        <TooltipProvider delay={400}>{children}</TooltipProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
