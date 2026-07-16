import PageHeader from "@/components/PageHeader";
import SecurityPasskeys from "@/components/SecurityPasskeys";

export default function SecurityPage() {
  return (
    <main className="shell">
      <PageHeader
        title="Security"
        description="Manage access methods for the private NorthStar portfolio app."
        links={[
          { href: "/", label: "← Dashboard" },
          { href: "/imports", label: "Broker imports" },
          { href: "/reports", label: "Reports" },
          { href: "/roadmap", label: "Roadmap" },
        ]}
      />

      <section className="grid two equal sectionStack">
        <SecurityPasskeys />
      </section>
    </main>
  );
}
