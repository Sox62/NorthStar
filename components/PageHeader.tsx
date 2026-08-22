import Link from "next/link";
import { BrandMark } from "@/southernstar/components";
import type { ReactNode } from "react";
import MobileMenu from "@/components/MobileMenu";

export type HeaderLink = { href: string; label: ReactNode };

export default function PageHeader({ title, description }: { title: string; description: string; links?: HeaderLink[] }) {
  return (
    <header className="pageMasthead">
      <div className="pageMastheadBar">
        <Link href="/" className="miniBrand" aria-label="SouthernStar dashboard">
          <BrandMark size={22} />
          <span>SouthernStar</span>
        </Link>
        <MobileMenu />
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
