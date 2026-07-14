# NorthStar — Next.js component package

Drop-in React/TypeScript components, design tokens, and portfolio helpers matching the NorthStar visual system. Built to be **data-driven** (holdings are always passed in — nothing is hardcoded) and **owner-aware** (Personal and SMSF stay legally separate).

## Install

1. Copy this `nextjs/` folder into your app, e.g. `src/northstar/`.
2. Import the tokens once, in `app/layout.tsx`:

   ```ts
   import "@/northstar/styles/tokens.css";
   ```

   (These are additive CSS custom properties — they don't clash with your existing `globals.css`. They're the same tokens the current app uses, just named semantically.)
3. Use components:

   ```tsx
   import { Kpi, SplitBar, SectorTag, BreakdownBars, TabBar } from "@/northstar/components";
   ```

No dependencies beyond `react`. All styling is inline + CSS variables — no CSS-in-JS, no Tailwind requirement.

## Components

`Button` · `Field` · `Card` · `Kpi` · `Row` · `SummaryGrid` · `StatusBadge` · `Notice` · `ProgressBar` · `TabBar` · `PageNav` · `SectorTag` · `SplitBar` · `BreakdownBars`

Each is a named export with a typed props interface in the same file.

## Data model (`types.ts`)

- **`Holding`** — one position. Carries `ownerType: "PERSONAL" | "SMSF"` (the legal separation), `sector`, and live valuation fields (`marketValueAud`, `pnlAud`, …) that change every sync. This shape is stable; the numbers are not — always read them from your DB / IBKR feed.
- **`OwnerType`**, **`PortfolioScope`** (`overall | personal | smsf`), **`Sector`**, **`CompositionGroup`** (`miners | metals | other`).
- **`SECTOR_COLORS`**, **`COMPOSITION_OF`** — the palette + sector→group mapping so tags, donut and bars stay consistent.

## Deriving the dashboard (`lib/portfolio-metrics.ts`)

Pure functions — compute on every render, never persist:

- `byScope(holdings, scope)` — filter to Overall / Personal / SMSF. **This is how the two portfolios stay separate:** the scope selector drives this, and every figure below is computed from the filtered set.
- `totals(holdings)` — market value, cost, P/L, P/L %, count.
- `ownerSplit(holdings)` — Personal vs SMSF market value (for the top-level split bar in "Overall").
- `bySector(holdings)` — market value per sector, largest first (feed `BreakdownBars` / donut).
- `byComposition(holdings)` — metals vs miners vs other (feed `SplitBar`).

### Example — owner-scoped dashboard

```tsx
"use client";
import { useState } from "react";
import { TabBar, Kpi, SplitBar, BreakdownBars } from "@/northstar/components";
import { byScope, totals, ownerSplit, bySector, byComposition, fmtAud } from "@/northstar/lib/portfolio-metrics";
import { SECTOR_COLORS, type Holding, type PortfolioScope } from "@/northstar/types";

export function Dashboard({ holdings }: { holdings: Holding[] }) {
  const [scope, setScope] = useState<PortfolioScope>("overall");
  const view = byScope(holdings, scope);           // ← Personal/SMSF separation happens here
  const t = totals(view);
  const comp = byComposition(view);
  const sectors = bySector(view);

  return (
    <>
      <TabBar value={scope} onChange={(s) => setScope(s as PortfolioScope)}
        options={[{ value: "overall", label: "Overall" }, { value: "personal", label: "Personal" }, { value: "smsf", label: "SMSF" }]} />

      <Kpi label="Total value" value={fmtAud(t.marketValue)} />
      <Kpi label="Profit / loss" value={fmtAud(t.pnl)} tone={t.pnl >= 0 ? "positive" : "negative"} />

      {/* Overall shows the legal owner split; a single book shows composition */}
      {scope === "overall" && (() => { const o = ownerSplit(view); return (
        <SplitBar segments={[
          { label: "Personal", value: o.personal, display: fmtAud(o.personal), color: "#77a9d8" },
          { label: "SMSF", value: o.smsf, display: fmtAud(o.smsf), color: "#8dc6a0" },
        ]} />
      ); })()}

      <SplitBar segments={[
        { label: "Miners", value: comp.miners, display: fmtAud(comp.miners), color: "#d7b56d" },
        { label: "Metals & bullion", value: comp.metals, display: fmtAud(comp.metals), color: "#8fa6bf" },
        { label: "Oil & cash", value: comp.other, display: fmtAud(comp.other), color: "#5d6f81" },
      ]} />

      <BreakdownBars items={sectors.map((s) => ({
        label: s.sector, value: s.value, display: fmtAud(s.value), color: SECTOR_COLORS[s.sector],
      }))} />
    </>
  );
}
```

## Notes

- **Two dimensions, kept distinct.** Owner (Personal / SMSF) is the *legal* axis and is the primary scope selector. Sector / metals-vs-miners is the *composition* axis shown as breakdowns within the selected scope. They compose — you can view SMSF's sector split, Personal's, or the consolidated Overall.
- **Fonts.** The redesign prototype uses Spectral (figures) + Hanken Grotesk (UI). These are optional — omit the `@import`/`next/font` and the components fall back to your existing stack. Flag: the current production app uses system Arial/Georgia; adopting the serif is a deliberate visual upgrade, not required.
- Prototype reference: the design system's `ui_kits/northstar-private/` (`index.html`, `sectors.html`).
