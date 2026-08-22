"use client";

import type { PortfolioScope } from "../types";

const scopeOptions: PortfolioScope[] = ["overall", "personal", "smsf"];

function scopeLabel(scope: PortfolioScope) {
  return scope === "smsf" ? "SMSF" : scope[0].toUpperCase() + scope.slice(1);
}

export function ScopeTabs({ value, onChange }: { value: PortfolioScope; onChange: (scope: PortfolioScope) => void }) {
  return (
    <div className="nsScopeTabs" aria-label="Portfolio scope">
      {scopeOptions.map((scope) => (
        <button key={scope} type="button" className={scope === value ? "isActive" : ""} onClick={() => onChange(scope)}>
          {scopeLabel(scope)}
        </button>
      ))}
    </div>
  );
}
