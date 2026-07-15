// Example route — the whole redesigned overview, wired to sample data.
// Swap sampleHoldings for your DB / IBKR query. Server-fetch, pass down.
//
//   app/(dashboard)/page.tsx
import { OverviewScreen } from "@/northstar/components";
import { sampleHoldings } from "@/northstar/lib/sample-holdings";

export default function Page() {
  // const holdings = await getHoldings();  // ← your live data
  return <OverviewScreen holdings={sampleHoldings} logoSrc="/northstar-icon.png" />;
}
