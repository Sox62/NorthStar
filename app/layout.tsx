import "./globals.css";

export const metadata = {
  title: "NorthStar",
  description: "Personal and SMSF portfolio reporting",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
