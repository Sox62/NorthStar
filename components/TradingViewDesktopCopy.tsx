"use client";

import { useState } from "react";
import styles from "./TradingViewDesktopCopy.module.css";

export default function TradingViewDesktopCopy({ url, label }: { url: string; label: string }) {
  const [result, setResult] = useState<{ url: string; copied: boolean } | null>(null);

  async function copyForDesktop() {
    try {
      await navigator.clipboard.writeText(url);
      setResult({ url, copied: true });
    } catch {
      setResult({ url, copied: false });
    }
  }

  return (
    <div className={styles.action}>
      <button className={`button ${styles.copyButton}`} type="button" onClick={() => void copyForDesktop()}>{label}</button>
      {result?.url === url ? (
        <div className={styles.help} role="status">
          <p>{result.copied ? "Chart link copied." : "Copy the chart link below."} In TradingView Desktop, open the app menu and choose <strong>Open link from clipboard</strong>.</p>
          {!result.copied ? <input className={styles.link} aria-label="TradingView chart link" value={url} readOnly onFocus={(event) => event.currentTarget.select()} /> : null}
        </div>
      ) : null}
    </div>
  );
}
