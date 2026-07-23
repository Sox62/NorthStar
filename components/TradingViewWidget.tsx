"use client";

import { useEffect, useRef } from "react";

type TradingViewWidgetProps = {
  symbol: string;
  className?: string;
  minHeight?: number;
  maxHeight?: number;
  compactMinHeight?: number;
  compactMaxHeight?: number;
  heightRatio?: number;
  compactHeightRatio?: number;
};

function tradingViewFrameSize(container: HTMLElement, props: Required<Pick<TradingViewWidgetProps, "minHeight" | "maxHeight" | "compactMinHeight" | "compactMaxHeight" | "heightRatio" | "compactHeightRatio">>) {
  const bounds = container.getBoundingClientRect();
  const parentBounds = container.parentElement?.getBoundingClientRect();
  const width = Math.max(320, Math.round(bounds.width || parentBounds?.width || 980));
  const isCompact = window.matchMedia("(max-width: 760px)").matches;
  const minHeight = isCompact ? props.compactMinHeight : props.minHeight;
  const maxHeight = isCompact ? props.compactMaxHeight : props.maxHeight;
  const viewportHeight = window.innerHeight || 780;
  const desiredHeight = Math.round(viewportHeight * (isCompact ? props.compactHeightRatio : props.heightRatio));

  return {
    width,
    height: Math.max(minHeight, Math.min(maxHeight, desiredHeight)),
  };
}

export default function TradingViewWidget({
  symbol,
  className = "tradingview-widget-container stockChartWidget",
  minHeight = 420,
  maxHeight = 560,
  compactMinHeight = 340,
  compactMaxHeight = 420,
  heightRatio = 0.68,
  compactHeightRatio = 0.56,
}: TradingViewWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let lastFrame = "";
    let loadingFrame = "";
    let animationFrame = 0;
    let resizeTimer: number | undefined;

    const renderWidget = () => {
      const frame = tradingViewFrameSize(container, {
        minHeight,
        maxHeight,
        compactMinHeight,
        compactMaxHeight,
        heightRatio,
        compactHeightRatio,
      });
      const frameKey = `${symbol}:${frame.width}:${frame.height}`;
      if (frameKey === lastFrame && (loadingFrame === frameKey || container.querySelector("iframe"))) return;

      lastFrame = frameKey;
      loadingFrame = frameKey;
      container.innerHTML = "";
      container.style.width = "100%";
      container.style.height = `${frame.height}px`;

      const widget = document.createElement("div");
      widget.className = "tradingview-widget-container__widget";
      widget.style.width = "100%";
      widget.style.height = "100%";
      container.appendChild(widget);

      const script = document.createElement("script");
      script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
      script.async = true;
      script.onload = () => {
        if (loadingFrame === frameKey) loadingFrame = "";
      };
      script.onerror = () => {
        if (loadingFrame === frameKey) loadingFrame = "";
      };
      script.innerHTML = JSON.stringify({
        autosize: false,
        width: frame.width,
        height: frame.height,
        symbol,
        interval: "D",
        timezone: "Australia/Sydney",
        theme: "dark",
        style: "1",
        locale: "en",
        withdateranges: true,
        hide_side_toolbar: false,
        allow_symbol_change: true,
        save_image: false,
        calendar: false,
        support_host: "https://www.tradingview.com",
      });
      container.appendChild(script);
    };

    const scheduleRender = () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(renderWidget);
    };

    const resizeObserver = "ResizeObserver" in window
      ? new ResizeObserver(() => {
        if (resizeTimer) window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(scheduleRender, 180);
      })
      : null;

    scheduleRender();
    resizeObserver?.observe(container);
    window.addEventListener("resize", scheduleRender);

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleRender);
      container.innerHTML = "";
      container.style.height = "";
    };
  }, [compactHeightRatio, compactMaxHeight, compactMinHeight, heightRatio, maxHeight, minHeight, symbol]);

  return <div ref={containerRef} className={className} />;
}
