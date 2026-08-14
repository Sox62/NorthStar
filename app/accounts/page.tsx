import AccountsMandates from "@/components/AccountsMandates";
import PageHeader from "@/components/PageHeader";
import { getStorage, type DashboardData } from "@/lib/storage";

export const dynamic = "force-dynamic";

async function loadAccount(scope: "personal" | "smsf") {
  return getStorage().dashboard(scope) as Promise<DashboardData & { scope: "personal" | "smsf" }>;
}

export default async function AccountsPage() {
  const storage = getStorage();
  const [accounts, openOrders] = await Promise.all([
    Promise.all([loadAccount("personal"), loadAccount("smsf")]),
    storage.listOpenOrders(),
  ]);

  return (
    <main className="shell">
      <PageHeader
        title="Accounts & mandates"
        description="Legal-book boundaries, broker books, feed responsibilities and deployable-capital policy for Personal and SMSF capital."
        links={[
          { href: "/holdings", label: "Capital" },
          { href: "/cash", label: "External cash" },
          { href: "/sync", label: "Imports" },
        ]}
      />
      <AccountsMandates accounts={accounts} openOrders={openOrders} />
    </main>
  );
}
