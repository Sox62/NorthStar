import Link from "next/link";
import type { ReactNode } from "react";

export type HeaderLink = { href: string; label: ReactNode };

export default function PageHeader({ title, description, links }: { title: string; description: string; links: HeaderLink[] }) {
  return (
    <header className="pageMasthead">
      <div className="pageMastheadBar">
        <Link href="/" className="miniBrand" aria-label="NorthStar dashboard">
          <span className="miniStar" aria-hidden="true">✦</span>
          <span>NorthStar</span>
        </Link>
        <nav className="pageNav" aria-label="Page navigation">
          {links.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}
        </nav>
      </div>
      <div className="pageHero">
        <div>
          <p className="eyebrow">Private portfolio operations</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="pageStar" aria-hidden="true">✦</div>
      </div>
    </header>
  );
}
