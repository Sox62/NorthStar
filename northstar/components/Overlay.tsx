"use client";

import React, { useEffect } from "react";

/**
 * The floating work layer. Owns the dialog mechanics — scrim, Escape, body scroll lock — so
 * every overlay in the app behaves the same way. Callers supply their own body content.
 */
export function Overlay({ eyebrow, title, subtitle, actions, children, onClose }: {
  eyebrow: string;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    // The layer scrolls internally; letting the page behind it scroll too makes the scrim feel
    // detached from the content it is covering.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);

  return (
    <div className="nsChartOverlay" role="dialog" aria-modal="true" aria-label={title}>
      <button className="nsChartOverlayScrim" type="button" aria-label={`Close ${title}`} onClick={onClose} />
      <section className="nsChartOverlayPanel">
        <div className="nsChartOverlayHeader">
          <div>
            <p className="nsEyebrow">{eyebrow}</p>
            <h2>{title}</h2>
            {subtitle ? <p className="nsOverlaySubtitle">{subtitle}</p> : null}
          </div>
          <div className="nsOverlayActions">
            {actions}
            <button className="nsReportButton" type="button" onClick={onClose}>Close</button>
          </div>
        </div>
        {children}
      </section>
    </div>
  );
}
