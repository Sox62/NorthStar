import Link from "next/link";
import type { ReactNode } from "react";

export type HeaderLink = { href: string; label: ReactNode };

export default function PageHeader({ title, description, links }: { title: string; description: string; links: HeaderLink[] }) {
  return (
    <>
      <nav className="pageNav" aria-label="Page navigation">
        {links.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}
      </nav>
      <header className="pageHeader">
        <div className="pageStar" aria-hidden="true">✦</div>
        <div>
          <p className="eyebrow">NorthStar</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </header>
    </>
  );
}
