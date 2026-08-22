import type { Metadata, Viewport } from "next";
import "@/southernstar/styles/tokens.css";
import "./globals.css";
import "@/southernstar/styles/theme.css";
import "@/southernstar/styles/relative.css";
import SouthernStarShell from "@/components/SouthernStarShell";

export const metadata: Metadata = {
  title: "SouthernStar",
  description: "Private Personal and SMSF portfolio reporting",
  applicationName: "SouthernStar",
  manifest: "/manifest.webmanifest",
  // iOS ignores the manifest for the home-screen icon and uses this link instead.
  icons: {
    icon: [
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "SouthernStar",
    statusBarStyle: "black-translucent",
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
  return <html lang="en"><body className="southernstar"><SouthernStarShell>{children}</SouthernStarShell></body></html>;
}
