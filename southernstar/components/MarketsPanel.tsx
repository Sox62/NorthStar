"use client";

import { useEffect, useMemo, useState } from "react";
import { dailyMove, describeMove, formatMarketPrice, formatMove, ratioMove, type MarketReading } from "../lib/markets";
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

type MarketTileApiQuote = {
  key: string;
  label: string;
  price: number;
  previousClose: number | null;
  currency: string;
  /** Carried by the feed for completeness; the tile prints currency and figure only. */
  unit: "oz" | "lb" | "index" | "unit";
  priceDate: string;
};

type Tile = {
  key: string;
  label: string;
  /** Set when /api/prices/metals carries a live spot quote for this tile. */
  metal?: SpotMetal;
  tradingViewSymbol: string;
  color: string;
  /** Appended after the daily move, only where the tile prices a proxy rather than the thing itself.
   *  Kept scarce: a note on every tile wraps the caption onto a second line and buries the move. */
  note?: string;
};

// Venues verified against TradingView symbol pages: TVC carries GOLD, SILVER and GOLDSILVER but
// not platinum or copper, which is why those two sit on other venues.
const TILES: Tile[] = [
  { key: "gold", label: "Gold", metal: "gold", tradingViewSymbol: "TVC:GOLD", color: SECTOR_COLORS["Gold miners"] },
  { key: "silver", label: "Silver", metal: "silver", tradingViewSymbol: "TVC:SILVER", color: SECTOR_COLORS["Silver bullion"] },
  // The computed expression rather than the TVC:GOLDSILVER index, so the ratio is built from the
  // same two legs charted above it and matches how relative leadership expresses ratios.
  { key: "gsr", label: "GSR", tradingViewSymbol: tradingViewRatioExpression("TVC:GOLD", "TVC:SILVER"), color: SECTOR_COLORS["Silver miners"] },
  { key: "platinum", label: "Platinum", metal: "platinum", tradingViewSymbol: "ACTIVTRADES:PLATINUM", color: SECTOR_COLORS["Platinum bullion"] },
  { key: "copper", label: "Copper", tradingViewSymbol: "CAPITALCOM:COPPER", color: SECTOR_COLORS.Oil },
  { key: "uranium", label: "Uranium", tradingViewSymbol: "TSX:U.UN", color: SECTOR_COLORS["Uranium miners"], note: "Sprott" },
  { key: "spx", label: "SPX", tradingViewSymbol: "SP:SPX", color: SECTOR_COLORS["Broad equities"] },
];

const MOVE_CLASS = { up: "nsMetalUp", down: "nsMetalDown", flat: "nsMetalFlat" } as const;

export function MarketsPanel() {
  const [spot, setSpot] = useState<Map<SpotMetal, MetalSpotApiQuote>>(new Map());
  const [tiles, setTiles] = useState<Map<string, MarketTileApiQuote>>(new Map());
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadJson<T>(url: string, fallback: string): Promise<T & { errors?: string[] }> {
      try {
        const response = await fetch(url, { cache: "no-store" });
        return await response.json();
      } catch (reason) {
        return { errors: [reason instanceof Error ? reason.message : fallback] } as T & { errors?: string[] };
      }
    }

    async function load() {
      const [metals, markets] = await Promise.all([
        loadJson<{ quotes?: MetalSpotApiQuote[] }>("/api/prices/metals", "Unable to load metals spot prices."),
        loadJson<{ quotes?: MarketTileApiQuote[] }>("/api/prices/markets", "Unable to load market quotes."),
      ]);
      if (cancelled) return;
      setSpot(new Map((metals.quotes ?? []).map((quote) => [quote.metal, quote])));
      setTiles(new Map((markets.quotes ?? []).map((quote) => [quote.key, quote])));
      // Six tiles failing one provider would print six near-identical lines, so the daily-move
      // feed is reported as a single sentence and the spot errors are kept verbatim.
      const moveErrors = markets.errors ?? [];
      setErrors([
        ...(metals.errors ?? []),
        ...(moveErrors.length ? [`Daily moves unavailable for ${moveErrors.length} of ${TILES.length - 1} markets.`] : []),
      ]);
      setLoading(false);
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  /**
   * Daily moves are taken wholly from the futures leg, so the price and the close behind a
   * percentage always share one basis. Measuring live spot against a futures close instead would
   * fold the carry straight into the day's move, and that carry is not always small: silver and
   * platinum sat 0.02% and 0.36% apart while gold's EFP basis was over 1%, wider than most of the
   * daily moves this panel exists to show.
   */
  const moveReadings = useMemo(() => {
    const byKey = new Map<string, MarketReading>();
    for (const [key, quote] of tiles) {
      byKey.set(key, { price: quote.price, previousClose: quote.previousClose, currency: quote.currency });
    }
    return byKey;
  }, [tiles]);

  /** On screen the three metals keep their live spot price: it is the number the desk trades against. */
  const priceReadings = useMemo(() => {
    const byKey = new Map(moveReadings);
    for (const metal of ["gold", "silver", "platinum"] as const) {
      const quote = spot.get(metal);
      if (quote?.price) byKey.set(metal, { price: quote.price, previousClose: null, currency: "USD" });
    }
    return byKey;
  }, [moveReadings, spot]);

  const gsr = useMemo(() => {
    const gold = priceReadings.get("gold");
    const silver = priceReadings.get("silver");
    if (!gold?.price || !silver?.price) return null;
    return gold.price / silver.price;
  }, [priceReadings]);

  const moveFor = (tile: Tile) => {
    // The ratio moves on both legs' closes, so it is computed rather than read off a feed.
    if (tile.key === "gsr") return ratioMove(moveReadings.get("gold") ?? null, moveReadings.get("silver") ?? null);
    const reading = moveReadings.get(tile.key);
    return dailyMove(reading?.price ?? null, reading?.previousClose ?? null);
  };

  const priceFor = (tile: Tile) => {
    if (tile.key === "gsr") return gsr == null ? null : gsr.toFixed(1);
    return formatMarketPrice(priceReadings.get(tile.key) ?? null);
  };

  return (
    <section className="nsMetalsPanel" aria-label="Market prices">
      <div className="nsMetalsHeader">
        <p className="nsEyebrow">Markets</p>
      </div>
      <div className="nsMetalsGrid">
        {TILES.map((tile) => {
          const price = priceFor(tile);
          const move = moveFor(tile);
          const moveText = formatMove(move);
          return (
            <a
              key={tile.key}
              className={`nsMetalTile${tile.key === "gsr" ? " nsMetalRatio" : ""}`}
              style={{ borderColor: `${tile.color}42` }}
              href={tradingViewChartUrl(tile.tradingViewSymbol)}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${tile.label} on TradingView. ${price ?? "Price unavailable"}, ${describeMove(move)}.`}
            >
              <span>
                <i style={{ background: tile.color }} />{tile.label}
                <b aria-hidden="true">TV</b>
              </span>
              <strong>{price ?? (loading ? "..." : "n/a")}</strong>
              <em className={MOVE_CLASS[move?.direction ?? "flat"]} aria-hidden="true">
                {moveText ?? (loading ? "Loading" : "No move")}
                {tile.note ? <i className="nsMetalNote">{tile.note}</i> : null}
              </em>
            </a>
          );
        })}
      </div>
      {errors.length ? <p className="nsMetalsError">{errors.join(" ")}</p> : null}
    </section>
  );
}
