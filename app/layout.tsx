import type { Metadata, Viewport } from "next";
import "@/northstar/styles/tokens.css";
import "./globals.css";
import "@/northstar/styles/theme.css";
import SouthernStarShell from "@/components/SouthernStarShell";

export const metadata: Metadata = {
  title: "SouthernStar",
  description: "Private Personal and SMSF portfolio reporting",
  applicationName: "SouthernStar",
};

export const viewport: Viewport = {
  themeColor: "#081019",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body className="northstar"><SouthernStarShell>{children}</SouthernStarShell></body></html>;
}
