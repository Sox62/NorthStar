"use client";

import { useEffect, useState } from "react";
import { tradingViewChartUrl, tradingViewRatioExpression } from "../lib/tradingview";
import { SECTOR_COLORS } from "../types";

type SpotMetal = "gold" | "silver" | "platinum";

type MetalSpotApiQuote = {
  metal: SpotMetal;
  label: string;
  price: number;
  priceDate: string;
  source: string;
};

type Tile = {
  key: string;
  label: string;
  /** Set when /api/prices/metals carries a live spot quote for this tile. */
  metal?: SpotMetal;
  tradingViewSymbol: string;
  color: string;
  /** Shown instead of a price for tiles the spot feed does not cover. */
  note: string;
};

// Venues verified against TradingView symbol pages: TVC carries GOLD, SILVER and GOLDSILVER but
// not platinum or copper, which is why those two sit on other venues.
const TILES: Tile[] = [
  { key: "gold", label: "Gold", metal: "gold", tradingViewSymbol: "TVC:GOLD", color: SECTOR_COLORS["Gold miners"], note: "Spot" },
  { key: "silver", label: "Silver", metal: "silver", tradingViewSymbol: "TVC:SILVER", color: SECTOR_COLORS["Silver bullion"], note: "Spot" },
  // The computed expression rather than the TVC:GOLDSILVER index, so the ratio is built from the
  // same two legs charted above it and matches how relative leadership expresses ratios.
  { key: "gsr", label: "GSR", tradingViewSymbol: tradingViewRatioExpression("TVC:GOLD", "TVC:SILVER"), color: SECTOR_COLORS["Silver miners"], note: "Gold / silver" },
  { key: "platinum", label: "Platinum", metal: "platinum", tradingViewSymbol: "ACTIVTRADES:PLATINUM", color: SECTOR_COLORS["Platinum bullion"], note: "Spot" },
  { key: "copper", label: "Copper", tradingViewSymbol: "CAPITALCOM:COPPER", color: SECTOR_COLORS.Oil, note: "Chart only" },
  { key: "uranium", label: "Uranium", tradingViewSymbol: "TSX:U.UN", color: SECTOR_COLORS["Uranium miners"], note: "Sprott proxy" },
  { key: "spx", label: "SPX", tradingViewSymbol: "SP:SPX", color: SECTOR_COLORS["Broad equities"], note: "Chart only" },
];

const fmtSpot = (value: number) =>
  `USD ${value.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/oz`;

const fmtDate = (value: string | null) => {
  if (!value) return "";
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "short" }).format(date);
};

export function MarketsPanel() {
  const [quotes, setQuotes] = useState<Map<SpotMetal, MetalSpotApiQuote>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadMetals() {
      try {
        const response = await fetch("/api/prices/metals", { cache: "no-store" });
        const payload = await response.json() as { quotes?: MetalSpotApiQuote[]; errors?: string[] };
        if (cancelled) return;
        setQuotes(new Map((payload.quotes ?? []).map((quote) => [quote.metal, quote])));
        setError((payload.errors ?? []).join("; "));
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to load metals spot prices.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadMetals();
    return () => { cancelled = true; };
  }, []);

  const gold = quotes.get("gold")?.price ?? null;
  const silver = quotes.get("silver")?.price ?? null;
  const gsr = gold && silver ? gold / silver : null;

  const readingFor = (tile: Tile) => {
    if (tile.key === "gsr") return gsr == null ? "n/a" : gsr.toFixed(1);
    if (!tile.metal) return "Chart";
    const quote = quotes.get(tile.metal);
    if (quote) return fmtSpot(quote.price);
    return loading ? "..." : "n/a";
  };

  const captionFor = (tile: Tile) => {
    if (tile.key === "gsr") return gsr == null ? "Needs gold + silver" : tile.note;
    if (!tile.metal) return tile.note;
    const quote = quotes.get(tile.metal);
    if (quote) return `${quote.source.replace(" spot mid", "")} · ${fmtDate(quote.priceDate)}`;
    return loading ? "Loading" : "No spot quote";
  };

  return (
    <section className="nsMetalsPanel" aria-label="Market prices">
      <div className="nsMetalsHeader">
        <p className="nsEyebrow">Markets</p>
        <strong>Metals, ratios and the index. Gold is the numeraire here, not a holding.</strong>
      </div>
      <div className="nsMetalsGrid">
        {TILES.map((tile) => (
          <a
            key={tile.key}
            className={`nsMetalTile${tile.key === "gsr" ? " nsMetalRatio" : ""}`}
            style={{ borderColor: `${tile.color}42` }}
            href={tradingViewChartUrl(tile.tradingViewSymbol)}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${tile.label} on TradingView`}
          >
            <span>
              <i style={{ background: tile.color }} />{tile.label}
              <b aria-hidden="true">TV</b>
            </span>
            <strong>{readingFor(tile)}</strong>
            <em>{captionFor(tile)}</em>
          </a>
        ))}
      </div>
      {error ? <p className="nsMetalsError">{error}</p> : null}
    </section>
  );
}
