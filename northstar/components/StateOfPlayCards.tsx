"use client";

import React from "react";
import { fmtAud } from "../lib/portfolio-metrics";
import type { Holding, PortfolioScope } from "../types";

type AccountBreakdownSummary = {
  scope: "personal" | "smsf";
  label: string;
  netAssetValue: number;
  investedValue: number;
  cashValue: number;
  totalReturn: number;
  totalReturnPercent: number;
  positionCount: number;
  sharePositionValue: number;
};

type PortfolioTotal = {
  marketValue: number;
  pnl: number;
};

function fmtSignedAud(value: number) {
  return `${value >= 0 ? "+" : ""}${fmtAud(value)}`;
}

function fmtSignedPct(value: number | null) {
  if (value == null) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function StateValueRow({ label, value, note, tone }: { label: string; value: React.ReactNode; note?: React.ReactNode; tone?: "positive" | "negative" }) {
  return (
    <div className="nsStateValueRow">
      <span>{label}</span>
      <strong className={tone === "positive" ? "isPositive" : tone === "negative" ? "isNegative" : undefined}>{value}</strong>
      {note ? <em>{note}</em> : null}
    </div>
  );
}

export function StateOfPlayCards({ total, dailyPnl, accounts, holdings, scope }: {
  total: PortfolioTotal;
  dailyPnl: number;
  accounts: AccountBreakdownSummary[];
  holdings: Holding[];
  scope: PortfolioScope;
}) {
  const visibleAccounts = scope === "overall" ? accounts : accounts.filter((account) => account.scope === scope);
  const personal = accounts.find((account) => account.scope === "personal");
  const smsf = accounts.find((account) => account.scope === "smsf");
  const brokerCash = visibleAccounts.reduce((sum, account) => sum + account.cashValue, 0);
  const shareValue = visibleAccounts.reduce((sum, account) => sum + (account.sharePositionValue ?? account.investedValue), 0);
  const owner = scope === "smsf" ? "SMSF" : scope === "personal" ? "PERSONAL" : null;
  const platinum = holdings
    .filter((holding) => holding.sector === "Platinum bullion" && (!owner || holding.ownerType === owner))
    .reduce((sum, holding) => sum + holding.marketValueAud, 0);
  const cashAndReserve = Math.max(0, total.marketValue - shareValue);
  const previousValue = total.marketValue - dailyPnl;
  const dailyPercent = previousValue ? (dailyPnl / previousValue) * 100 : 0;

  return (
    <section className="nsStateGrid" aria-label="State of play summary">
      <article className="nsPanel nsStateCard nsStateNavCard">
        <p className="nsEyebrow">Total NAV — {scope === "overall" ? "Overall" : scope === "smsf" ? "SMSF" : "Personal"}</p>
        <div className="nsStateNavValue">{fmtAud(total.marketValue)}</div>
        <div className="nsStateTwoStats">
          <StateValueRow label="Day P/L" value={fmtSignedAud(dailyPnl)} note={`${fmtSignedPct(dailyPercent)} of NAV`} tone={dailyPnl >= 0 ? "positive" : "negative"} />
          <StateValueRow label="Total open P/L" value={fmtSignedAud(total.pnl)} note="FX-aware · AUD basis" tone={total.pnl >= 0 ? "positive" : "negative"} />
        </div>
      </article>

      <article className="nsPanel nsStateCard">
        <p className="nsEyebrow">Portfolio split</p>
        <div className="nsStateRows">
          <StateValueRow label="Personal" value={fmtAud(personal?.netAssetValue ?? 0)} />
          <StateValueRow label="SMSF" value={fmtAud(smsf?.netAssetValue ?? 0)} />
          <StateValueRow label="Invested" value={fmtAud(shareValue)} />
          <StateValueRow label="Cash and reserve" value={fmtAud(cashAndReserve)} />
        </div>
      </article>

      <article className="nsPanel nsStateCard">
        <p className="nsEyebrow">Cash and strategic reserve</p>
        <div className="nsStateRows">
          <StateValueRow label="Broker cash" value={fmtAud(brokerCash)} note="IBKR, Directshares and cash accounts" />
          <StateValueRow label="External cash" value="—" note="Not configured" />
          <StateValueRow label="Physical platinum" value={platinum ? fmtAud(platinum) : "—"} note={platinum ? "Strategic metal holding · separate from cash" : "Not configured"} />
          <StateValueRow label="Gold reserve" value="—" note="Not configured · NAV in gold is a numeraire" />
        </div>
      </article>
    </section>
  );
}
