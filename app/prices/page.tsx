"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { Card, Notice, StatusBadge, SummaryGrid } from "@/northstar/components";

type PriceableInstrument = {
  symbol: string;
  exchange: string;
  name: string;
  currency: string;
  assetClass: string;
  positionCount: number;
  quantity: number;
  marketValueAud: number;
  lastPrice: number | null;
  asOfDate: string | null;
};

type StoredDailyPrice = {
  id: string;
  symbol: string;
  exchange: string;
  name: string;
  currency: string;
  close: number;
  priceDate: string;
  source: string;
  retrievedAt: string;
};

type StoredFxRate = {
  id: string;
  currency: string;
  rateToAud: number;
  rateDate: string;
  source: string;
  retrievedAt: string;
};

type PriceBook = {
  instruments: PriceableInstrument[];
  prices: StoredDailyPrice[];
  fxRates: StoredFxRate[];
};

type QuoteRefreshProvider = "auto" | "eodhd" | "globalx" | "yahoo" | "stooq";
type PriceResultPayload = Record<string, unknown> & {
  error?: string;
  errors?: string[];
  quotes?: Array<{ symbol: string; exchange: string; providerSymbol: string; source: string; close: number; priceDate: string }>;
  failures?: Array<{ symbol: string; exchange: string; message: string }>;
  providerConfigured?: boolean;
  providers?: { requested: QuoteRefreshProvider; eodhdConfigured: boolean; globalXEnabled: boolean; yahooEnabled: boolean; stooqEnabled: boolean };
};

const today = () => new Date().toLocaleDateString("en-CA");
const money = (value: number, maximumFractionDigits = 0) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits }).format(value);
const number = (value: number, maximumFractionDigits = 4) =>
  new Intl.NumberFormat("en-AU", { maximumFractionDigits }).format(value);
const date = (value: string | null) => value ? value : "No date";

export default function PricesPage() {
  const [book, setBook] = useState<PriceBook>({ instruments: [], prices: [], fxRates: [] });
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<PriceResultPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [csvBusy, setCsvBusy] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [refreshProvider, setRefreshProvider] = useState<QuoteRefreshProvider>("auto");
  const [selectedKey, setSelectedKey] = useState("");
  const [form, setForm] = useState({ symbol: "", exchange: "", close: "", currency: "AUD", priceDate: today(), source: "Manual close", fxRateToAud: "" });
  const [csv, setCsv] = useState("");

  const selectedInstrument = useMemo(() => book.instruments.find((item) => `${item.symbol}:${item.exchange}` === selectedKey), [book.instruments, selectedKey]);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/prices/daily", { cache: "no-store" });
      setBook(await response.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const chooseInstrument = (key: string) => {
    setSelectedKey(key);
    const instrument = book.instruments.find((item) => `${item.symbol}:${item.exchange}` === key);
    if (!instrument) return;
    setForm((current) => ({
      ...current,
      symbol: instrument.symbol,
      exchange: instrument.exchange,
      currency: instrument.currency,
      close: instrument.lastPrice ? String(instrument.lastPrice) : current.close,
    }));
  };

  const saveManualPrice = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const payload = {
        prices: [{
          symbol: form.symbol,
          exchange: form.exchange,
          close: Number(form.close),
          currency: form.currency,
          priceDate: form.priceDate,
          source: form.source,
          fxRateToAud: form.fxRateToAud ? Number(form.fxRateToAud) : undefined,
        }],
      };
      const response = await fetch("/api/prices/daily", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const payloadResult = await response.json();
      setResult(payloadResult);
      if (response.ok) await load();
    } finally {
      setBusy(false);
    }
  };

  const saveCsv = async () => {
    if (!csv.trim()) return;
    setCsvBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/prices/daily", {
        method: "POST",
        headers: { "content-type": "text/csv" },
        body: csv,
      });
      const payloadResult = await response.json();
      setResult(payloadResult);
      if (response.ok) {
        setCsv("");
        await load();
      }
    } finally {
      setCsvBusy(false);
    }
  };

  const refreshQuotes = async (symbols?: string[]) => {
    setRefreshBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/prices/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: refreshProvider, symbols }),
      });
      const payloadResult = await response.json();
      setResult(payloadResult);
      if (response.ok) await load();
    } finally {
      setRefreshBusy(false);
    }
  };

  return (
    <main className="shell">
      <PageHeader
        title="Pricing"
        description="Daily market closes and FX rates used to value current holdings independently of broker snapshots."
        links={[
          { href: "/", label: "← Dashboard" },
          { href: "/sync", label: "Sync" },
          { href: "/assets", label: "Bullion" },
          { href: "/roadmap", label: "Roadmap" },
        ]}
      />

      <section className="priceEngineGrid">
        <Card className="priceEngineCard">
          <p className="eyebrow">Market close</p>
          <h2 className="cardTitle">Apply security price</h2>
          <form className="form priceEngineForm" onSubmit={saveManualPrice}>
            <label className="field">
              <span>Holding</span>
              <select value={selectedKey} onChange={(event) => chooseInstrument(event.target.value)}>
                <option value="">Select current holding</option>
                {book.instruments.map((instrument) => (
                  <option key={`${instrument.symbol}:${instrument.exchange}`} value={`${instrument.symbol}:${instrument.exchange}`}>
                    {instrument.symbol} · {instrument.exchange} · {instrument.currency}
                  </option>
                ))}
              </select>
            </label>
            <div className="priceEngineFields">
              <label className="field"><span>Symbol</span><input value={form.symbol} onChange={(event) => setForm({ ...form, symbol: event.target.value.toUpperCase() })} required /></label>
              <label className="field"><span>Exchange</span><input value={form.exchange} onChange={(event) => setForm({ ...form, exchange: event.target.value.toUpperCase() })} /></label>
              <label className="field"><span>Close</span><input type="number" step="0.000001" value={form.close} onChange={(event) => setForm({ ...form, close: event.target.value })} required /></label>
              <label className="field"><span>Currency</span><input value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} required /></label>
              <label className="field"><span>Date</span><input type="date" value={form.priceDate} onChange={(event) => setForm({ ...form, priceDate: event.target.value })} required /></label>
              <label className="field"><span>FX to AUD</span><input type="number" step="0.000001" value={form.fxRateToAud} onChange={(event) => setForm({ ...form, fxRateToAud: event.target.value })} placeholder={form.currency === "AUD" ? "1.0000" : ""} /></label>
            </div>
            <label className="field"><span>Source</span><input value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} required /></label>
            <button className="primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save and apply"}</button>
          </form>
          {selectedInstrument && (
            <div className="priceInstrumentSnapshot">
              <SummaryGrid entries={[
                ["Current value", money(selectedInstrument.marketValueAud)],
                ["Quantity", number(selectedInstrument.quantity)],
                ["Last price", selectedInstrument.lastPrice == null ? "No price" : number(selectedInstrument.lastPrice, 6)],
                ["As of", date(selectedInstrument.asOfDate)],
              ]} />
            </div>
          )}
        </Card>

        <Card className="priceEngineCard">
          <p className="eyebrow">Batch import</p>
          <h2 className="cardTitle">CSV price ledger</h2>
          <textarea
            className="priceCsvInput"
            value={csv}
            onChange={(event) => setCsv(event.target.value)}
            placeholder={"symbol,exchange,date,close,currency,fxRateToAud,source\nSVM,TSX,2026-07-17,6.12,CAD,1.12,Manual close\n,,2026-07-17,,USD,1.52,Manual FX"}
          />
          <div className="buttonRow">
            <button className="primary" type="button" onClick={saveCsv} disabled={csvBusy || !csv.trim()}>{csvBusy ? "Importing…" : "Import CSV"}</button>
          </div>
        </Card>
      </section>

      {result && (
        <Card className="sectionStack">
          <PriceResult result={result} />
        </Card>
      )}

      <section className="priceEngineGrid sectionStack">
        <Card>
          <div className="panelHeader">
            <div>
              <p className="eyebrow">Current holdings</p>
              <h2 className="cardTitle">Priceable instruments</h2>
            </div>
            <div className="pricePanelActions">
              <span className="panelCount">{loading ? "Loading" : `${book.instruments.length} instruments`}</span>
              <label className="field priceProviderControl">
                <span>Provider</span>
                <select value={refreshProvider} onChange={(event) => setRefreshProvider(event.target.value as QuoteRefreshProvider)}>
                  <option value="auto">Auto</option>
                  <option value="eodhd">EODHD</option>
                  <option value="globalx">Global X NAV</option>
                  <option value="yahoo">Yahoo</option>
                  <option value="stooq">Stooq</option>
                </select>
              </label>
              <button
                className="primary"
                type="button"
                onClick={() => refreshQuotes(selectedInstrument ? [`${selectedInstrument.symbol}:${selectedInstrument.exchange}`] : undefined)}
                disabled={refreshBusy || !book.instruments.length}
              >
                {refreshBusy ? "Refreshing..." : selectedInstrument ? `Refresh ${selectedInstrument.symbol}` : "Refresh all"}
              </button>
              {selectedInstrument ? (
                <button className="button" type="button" onClick={() => refreshQuotes()} disabled={refreshBusy || !book.instruments.length}>
                  All
                </button>
              ) : null}
            </div>
          </div>
          <PriceInstrumentTable instruments={book.instruments} />
        </Card>

        <Card>
          <div className="panelHeader">
            <div>
              <p className="eyebrow">FX ledger</p>
              <h2 className="cardTitle">AUD conversion rates</h2>
            </div>
            <span className="panelCount">{book.fxRates.length} rates</span>
          </div>
          <FxTable rates={book.fxRates} />
        </Card>
      </section>

      <Card className="sectionStack">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Price history</p>
            <h2 className="cardTitle">Stored security closes</h2>
          </div>
          <span className="panelCount">{book.prices.length} rows</span>
        </div>
        <PriceTable prices={book.prices} />
      </Card>
    </main>
  );
}

function PriceResult({ result }: { result: PriceResultPayload }) {
  if (result.error) return <Notice tone="error" title="Price import failed">{result.error}</Notice>;
  const errors = Array.isArray(result.errors) ? result.errors.filter(Boolean).map(String) : [];
  const failures = Array.isArray(result.failures) ? result.failures : [];
  const quotes = Array.isArray(result.quotes) ? result.quotes : [];
  const failureMessages = new Set(failures.map((failure) => `${failure.symbol}:${failure.exchange} ${failure.message}`));
  const remainingErrors = errors.filter((error) => !failureMessages.has(error));
  return (
    <div className="result">
      <StatusBadge>{errors.length ? "Saved with notes" : "Saved"}</StatusBadge>
      <SummaryGrid entries={[
        ["Prices", String(result.imported ?? 0)],
        ["Instruments", String(result.matchedInstruments ?? 0)],
        ["Positions updated", String(result.updatedPositions ?? 0)],
        ["FX rates", String(result.fxRates ?? 0)],
        ["Provider", result.providers ? [
          result.providers.requested.toUpperCase(),
          result.providers.eodhdConfigured ? "EODHD token" : "no EODHD token",
          result.providers.globalXEnabled ? "Global X on" : null,
          result.providers.yahooEnabled ? "Yahoo on" : null,
          result.providers.stooqEnabled ? "Stooq on" : null,
        ].filter(Boolean).join(" · ") : "Manual"],
      ]} />
      {quotes.length > 0 && (
        <div className="priceResultList">
          {quotes.slice(0, 8).map((quote) => (
            <span key={`${quote.symbol}:${quote.exchange}:${quote.providerSymbol}`}>
              {quote.symbol}:{quote.exchange} · {quote.providerSymbol} · {number(quote.close, 6)} · {quote.priceDate}
            </span>
          ))}
        </div>
      )}
      {failures.length > 0 && (
        <div className="priceResultList isWarning">
          {failures.slice(0, 8).map((failure) => (
            <span key={`${failure.symbol}:${failure.exchange}:${failure.message}`}>
              {failure.symbol}:{failure.exchange} · {failure.message}
            </span>
          ))}
        </div>
      )}
      {remainingErrors.length > 0 && <p className="small">{remainingErrors.join("; ")}</p>}
    </div>
  );
}

function PriceInstrumentTable({ instruments }: { instruments: PriceableInstrument[] }) {
  if (!instruments.length) return <p className="empty">No current holdings are available for price imports.</p>;
  return (
    <div className="priceTableWrap">
      <table className="priceTable">
        <thead><tr><th>Instrument</th><th>Currency</th><th className="numeric">Quantity</th><th className="numeric">Value</th><th className="numeric">Last</th><th>Date</th></tr></thead>
        <tbody>
          {instruments.map((instrument) => (
            <tr key={`${instrument.symbol}:${instrument.exchange}`}>
              <td><strong>{instrument.symbol}</strong><span>{instrument.name} · {instrument.exchange}</span></td>
              <td>{instrument.currency}</td>
              <td className="numeric">{number(instrument.quantity)}</td>
              <td className="numeric">{money(instrument.marketValueAud)}</td>
              <td className="numeric">{instrument.lastPrice == null ? "—" : number(instrument.lastPrice, 6)}</td>
              <td>{date(instrument.asOfDate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FxTable({ rates }: { rates: StoredFxRate[] }) {
  if (!rates.length) return <p className="empty">No FX rates have been stored yet.</p>;
  return (
    <div className="priceTableWrap">
      <table className="priceTable">
        <thead><tr><th>Currency</th><th className="numeric">AUD rate</th><th>Date</th><th>Source</th></tr></thead>
        <tbody>
          {rates.map((rate) => (
            <tr key={rate.id}>
              <td><strong>{rate.currency}</strong></td>
              <td className="numeric">{number(rate.rateToAud, 6)}</td>
              <td>{rate.rateDate}</td>
              <td>{rate.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PriceTable({ prices }: { prices: StoredDailyPrice[] }) {
  if (!prices.length) return <p className="empty">No market closes have been stored yet.</p>;
  return (
    <div className="priceTableWrap">
      <table className="priceTable">
        <thead><tr><th>Instrument</th><th>Currency</th><th className="numeric">Close</th><th>Date</th><th>Source</th></tr></thead>
        <tbody>
          {prices.map((price) => (
            <tr key={price.id}>
              <td><strong>{price.symbol}</strong><span>{price.name} · {price.exchange}</span></td>
              <td>{price.currency}</td>
              <td className="numeric">{number(price.close, 6)}</td>
              <td>{price.priceDate}</td>
              <td>{price.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
