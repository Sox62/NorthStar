import AccountsMandates from "@/components/AccountsMandates";
import PageHeader from "@/components/PageHeader";
import { getStorage, type DashboardData } from "@/lib/storage";

export const dynamic = "force-dynamic";

async function loadAccount(scope: "personal" | "smsf") {
  return getStorage().dashboard(scope) as Promise<DashboardData & { scope: "personal" | "smsf" }>;
}

export default async function AccountsPage() {
  const accounts = await Promise.all([loadAccount("personal"), loadAccount("smsf")]);

  return (
    <main className="shell">
      <PageHeader
        title="Accounts & mandates"
        description="Read-only legal-book boundaries, broker books and feed responsibilities for Personal and SMSF capital."
        links={[
          { href: "/holdings", label: "Capital" },
          { href: "/cash", label: "External cash" },
          { href: "/sync", label: "Imports" },
        ]}
      />
      <AccountsMandates accounts={accounts} />
    </main>
  );
}
