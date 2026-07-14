import type { Metadata, Viewport } from "next";
import PwaRegistration from "@/components/PwaRegistration";
import "@/northstar/styles/tokens.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "NorthStar",
  description: "Private Personal and SMSF portfolio reporting",
  applicationName: "NorthStar",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "NorthStar",
  },
  icons: {
    icon: [
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#081019",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><PwaRegistration />{children}</body></html>;
}
