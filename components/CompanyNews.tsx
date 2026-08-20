"use client";

import { hasMaterialNews, type CompanyNewsItem } from "@/lib/integrations/company-news/types";

const dayLabel = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "short" }).format(date);
};

/**
 * The row signal. It appears only for a release the issuer itself called material, so a badge is
 * always worth a look — that is the whole reason routine filings are excluded from raising it.
 */
export function NewsBadge({ items }: { items: CompanyNewsItem[] }) {
  // The window matters as much as the flag: an old material release would otherwise badge a row
  // forever, and a badge that never clears is indistinguishable from decoration.
  if (!hasMaterialNews(items)) return null;
  const latest = items.filter((item) => item.material)[0];
  if (!latest) return null;
  return (
    <span className="newsBadge" title={`${latest.source} · ${dayLabel(latest.publishedAt)} · ${latest.headline}`}>
      News
    </span>
  );
}

/** The reading surface: headlines link out to the announcement PDF or the filing itself. */
export function CompanyNewsList({ items, loading }: { items: CompanyNewsItem[]; loading: boolean }) {
  if (loading && !items.length) return <p className="newsEmpty">Checking for announcements…</p>;
  if (!items.length) return <p className="newsEmpty">No recent announcements or filings for this holding.</p>;

  return (
    <ul className="newsList">
      {items.map((item) => (
        <li key={`${item.url}-${item.publishedAt}`} className={item.material ? "isMaterial" : undefined}>
          <a href={item.url} target="_blank" rel="noreferrer">
            <span className="newsMeta">
              <span className="newsDate">{dayLabel(item.publishedAt)}</span>
              <span className="newsSource">{item.source}</span>
              {item.kind ? <span className="newsKind">{item.kind}</span> : null}
              {item.material ? <span className="newsMaterial">Material</span> : null}
            </span>
            <strong>{item.headline}</strong>
          </a>
        </li>
      ))}
    </ul>
  );
}
