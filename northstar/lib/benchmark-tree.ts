import { classifyAsset } from "@/lib/storage/classify";
import type { Sector } from "@/northstar/types";
import { tradingViewSymbolForInstrument } from "./tradingview";

export type BenchmarkRole = "reserve" | "commodity" | "sector_etf" | "leader" | "peer_group" | "candidate";

export type BenchmarkNode = {
  id: string;
  label: string;
  role: BenchmarkRole;
  symbol?: string;
  tradingViewSymbol?: string;
  basisCurrency: "AUD" | "USD" | "CAD" | "GBP";
  note?: string;
};

export type BenchmarkTree = {
  sector: Sector;
  reserve: BenchmarkNode;
  path: BenchmarkNode[];
  peers: BenchmarkNode[];
  notes: string[];
};

export type BenchmarkTreeInput = {
  symbol: string;
  name?: string | null;
  sector?: Sector | null;
  exchange?: string | null;
  currency?: string | null;
};

type TemplateNode = Omit<BenchmarkNode, "id"> & { id: string };

type BenchmarkTemplate = {
  path: TemplateNode[];
  peers?: TemplateNode[];
  notes?: string[];
};

const GOLD_RESERVE: BenchmarkNode = {
  id: "reserve:gold",
  label: "Gold",
  role: "reserve",
  symbol: "GOLD",
  tradingViewSymbol: "TVC:GOLD",
  basisCurrency: "USD",
  note: "Reserve benchmark and numeraire; not an actual holding unless gold appears in allocations.",
};

const TEMPLATES: Record<Sector, BenchmarkTemplate> = {
  "Silver miners": {
    path: [
      commodity("silver", "Silver", "SILVER", "TVC:SILVER"),
      sectorEtf("slvm", "Silver miners ETF", "SLVM", "ASX:SLVM", "AUD"),
      leader("paas", "Silver miner leader", "PAAS", "NASDAQ:PAAS"),
    ],
    peers: [
      sectorEtf("sil", "Global silver miners proxy", "SIL", "AMEX:SIL"),
      sectorEtf("silj", "Junior silver miners proxy", "SILJ", "AMEX:SILJ"),
      leader("wpm", "Silver streamer leader", "WPM", "NYSE:WPM"),
    ],
  },
  "Gold miners": {
    path: [
      sectorEtf("gdx", "Gold miners ETF", "GDX", "AMEX:GDX"),
      leader("aem", "Large gold miner leader", "AEM", "NYSE:AEM"),
    ],
    peers: [leader("nem", "Large gold miner peer", "NEM", "NYSE:NEM")],
  },
  "Uranium miners": {
    path: [
      commodity("uranium", "U3O8", "U3O8", undefined, "USD", "Use spot/futures feed when available; otherwise sector proxies carry the chart."),
      sectorEtf("urnm", "Uranium miners ETF", "URNM", "AMEX:URNM"),
      leader("ccj", "Uranium leader", "CCJ", "NYSE:CCJ"),
    ],
    peers: [sectorEtf("ura", "Uranium ETF proxy", "URA", "AMEX:URA")],
  },
  "Uranium explorers": {
    path: [
      commodity("uranium", "U3O8", "U3O8", undefined, "USD", "Use spot/futures feed when available; otherwise sector proxies carry the chart."),
      sectorEtf("urnm", "Uranium miners ETF", "URNM", "AMEX:URNM"),
      peerGroup("uranium-explorers", "Uranium explorers"),
    ],
    peers: [leader("ccj", "Uranium leader", "CCJ", "NYSE:CCJ"), sectorEtf("ura", "Uranium ETF proxy", "URA", "AMEX:URA")],
  },
  Oil: {
    path: [
      commodity("oil", "Oil", "USOIL", "TVC:USOIL"),
      sectorEtf("xle", "Energy sector ETF", "XLE", "AMEX:XLE"),
      leader("xom", "Energy leader", "XOM", "NYSE:XOM"),
    ],
    peers: [sectorEtf("xop", "Oil & gas exploration ETF", "XOP", "AMEX:XOP"), leader("cvx", "Integrated energy peer", "CVX", "NYSE:CVX")],
  },
  "Platinum bullion": {
    path: [commodity("platinum", "Platinum", "PLATINUM", "TVC:PLATINUM")],
    notes: ["Label physical holdings as strategic metal holding or physical platinum, not gold reserve."],
  },
  "Silver bullion": {
    path: [commodity("silver", "Silver", "SILVER", "TVC:SILVER")],
  },
  "Rhodium metal": {
    path: [commodity("rhodium", "Rhodium", "RHODIUM", undefined, "USD", "Rhodium may require manual/dealer pricing rather than a public chart feed.")],
  },
  Technology: {
    path: [sectorEtf("qqq", "NASDAQ 100 proxy", "QQQ", "NASDAQ:QQQ")],
  },
  "Broad equities": {
    path: [sectorEtf("spy", "Global equities proxy", "SPY", "AMEX:SPY")],
  },
  Cash: {
    path: [peerGroup("cash-reserve", "Cash and reserves")],
    notes: ["Cash is capital availability, not relative equity leadership."],
  },
};

const SYMBOL_TEMPLATE_OVERRIDES: Record<string, Partial<BenchmarkTemplate>> = {
  SLVM: {
    path: [commodity("silver", "Silver", "SILVER", "TVC:SILVER")],
    peers: [sectorEtf("sil", "Global silver miners proxy", "SIL", "AMEX:SIL"), sectorEtf("silj", "Junior silver miners proxy", "SILJ", "AMEX:SILJ")],
  },
  SIL: {
    path: [commodity("silver", "Silver", "SILVER", "TVC:SILVER")],
    peers: [sectorEtf("slvm", "Silver miners ETF", "SLVM", "ASX:SLVM"), sectorEtf("silj", "Junior silver miners proxy", "SILJ", "AMEX:SILJ")],
  },
  SILJ: {
    path: [commodity("silver", "Silver", "SILVER", "TVC:SILVER")],
    peers: [sectorEtf("slvm", "Silver miners ETF", "SLVM", "ASX:SLVM"), sectorEtf("sil", "Global silver miners proxy", "SIL", "AMEX:SIL")],
  },
  URNM: {
    path: [commodity("uranium", "U3O8", "U3O8", undefined)],
    peers: [sectorEtf("ura", "Uranium ETF proxy", "URA", "AMEX:URA"), leader("ccj", "Uranium leader", "CCJ", "NYSE:CCJ")],
  },
  URA: {
    path: [commodity("uranium", "U3O8", "U3O8", undefined)],
    peers: [sectorEtf("urnm", "Uranium miners ETF", "URNM", "AMEX:URNM"), leader("ccj", "Uranium leader", "CCJ", "NYSE:CCJ")],
  },
  GDX: {
    path: [],
    peers: [leader("aem", "Large gold miner leader", "AEM", "NYSE:AEM"), leader("nem", "Large gold miner peer", "NEM", "NYSE:NEM")],
  },
  XLE: {
    path: [commodity("oil", "Oil", "USOIL", "TVC:USOIL")],
    peers: [sectorEtf("xop", "Oil & gas exploration ETF", "XOP", "AMEX:XOP"), leader("xom", "Energy leader", "XOM", "NYSE:XOM")],
  },
  XOP: {
    path: [commodity("oil", "Oil", "USOIL", "TVC:USOIL")],
    peers: [sectorEtf("xle", "Energy sector ETF", "XLE", "AMEX:XLE"), leader("xom", "Energy leader", "XOM", "NYSE:XOM")],
  },
  ETPMAG: {
    path: [commodity("silver", "Silver", "SILVER", "TVC:SILVER")],
    notes: ["ETPMAG current pricing can come from the Global X NAV feed; public historical charts may need a manual or provider-specific feed."],
  },
};

export function resolveBenchmarkTree(input: BenchmarkTreeInput): BenchmarkTree {
  const symbol = normaliseSymbol(input.symbol);
  const sector = input.sector ?? classifyAsset(symbol, input.name ?? symbol);
  const template = mergeTemplate(TEMPLATES[sector], SYMBOL_TEMPLATE_OVERRIDES[symbol]);
  const candidate = candidateNode(input, sector);
  const path = dedupeNodes([GOLD_RESERVE, ...template.path.map(materialiseNode), candidate]);
  const peers = dedupeNodes((template.peers ?? []).map(materialiseNode));
  const notes = template.notes ?? [];
  return { sector, reserve: GOLD_RESERVE, path, peers, notes };
}

export function benchmarkSymbols(tree: BenchmarkTree) {
  return [...tree.path, ...tree.peers]
    .filter((node) => node.role !== "candidate")
    .filter((node) => Boolean(node.symbol || node.tradingViewSymbol));
}

function mergeTemplate(base: BenchmarkTemplate, override?: Partial<BenchmarkTemplate>): BenchmarkTemplate {
  if (!override) return base;
  return {
    path: override.path ?? base.path,
    peers: override.peers ?? base.peers,
    notes: [...(base.notes ?? []), ...(override.notes ?? [])],
  };
}

function materialiseNode(node: TemplateNode): BenchmarkNode {
  return node;
}

function candidateNode(input: BenchmarkTreeInput, sector: Sector): BenchmarkNode {
  const symbol = normaliseSymbol(input.symbol);
  const exchange = input.exchange?.trim() || undefined;
  const currency = normaliseCurrency(input.currency);
  return {
    id: `candidate:${symbol.toLowerCase()}`,
    label: input.name?.trim() || symbol,
    role: "candidate",
    symbol,
    tradingViewSymbol: tradingViewSymbolForInstrument({ symbol, exchange }),
    basisCurrency: currency,
    note: sector === "Cash" ? "Cash holding" : undefined,
  };
}

function commodity(id: string, label: string, symbol: string, tradingViewSymbol?: string, basisCurrency: BenchmarkNode["basisCurrency"] = "USD", note?: string): TemplateNode {
  return { id: `commodity:${id}`, label, role: "commodity", symbol, tradingViewSymbol, basisCurrency, note };
}

function sectorEtf(id: string, label: string, symbol: string, tradingViewSymbol: string, basisCurrency: BenchmarkNode["basisCurrency"] = "USD"): TemplateNode {
  return { id: `sector_etf:${id}`, label, role: "sector_etf", symbol, tradingViewSymbol, basisCurrency };
}

function leader(id: string, label: string, symbol: string, tradingViewSymbol: string, basisCurrency: BenchmarkNode["basisCurrency"] = "USD"): TemplateNode {
  return { id: `leader:${id}`, label, role: "leader", symbol, tradingViewSymbol, basisCurrency };
}

function peerGroup(id: string, label: string): TemplateNode {
  return { id: `peer_group:${id}`, label, role: "peer_group", basisCurrency: "AUD" };
}

function dedupeNodes(nodes: BenchmarkNode[]) {
  const result: BenchmarkNode[] = [];
  const indexByKey = new Map<string, number>();
  for (const node of nodes) {
    const key = node.symbol ? normaliseSymbol(node.symbol) : node.id;
    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      indexByKey.set(key, result.length);
      result.push(node);
      continue;
    }
    if (node.role === "candidate") result[existingIndex] = node;
  }
  return result;
}

function normaliseSymbol(value: string) {
  return value.trim().toUpperCase();
}

function normaliseCurrency(value: string | null | undefined): BenchmarkNode["basisCurrency"] {
  const currency = value?.trim().toUpperCase();
  if (currency === "USD" || currency === "CAD" || currency === "GBP") return currency;
  return "AUD";
}
