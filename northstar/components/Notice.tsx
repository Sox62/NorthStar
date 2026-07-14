import type { ReactNode } from "react";

export interface NoticeProps {
  tone?: "neutral" | "success" | "error";
  title?: ReactNode;
  children?: ReactNode;
}

type ToneStyle = { border: string; background: string; color?: string };

const tones: Record<NonNullable<NoticeProps["tone"]>, ToneStyle> = {
  neutral: { border: "var(--border-notice)", background: "var(--notice-bg)" },
  success: { border: "var(--result-good-border)", background: "var(--result-good-bg)" },
  error: { border: "var(--result-error-border)", background: "var(--result-error-bg)", color: "var(--status-negative)" },
};

export function Notice({ tone = "neutral", title, children }: NoticeProps) {
  const style = tones[tone];
  return (
    <div
      style={{
        marginTop: "18px",
        padding: tone === "neutral" ? "28px" : "14px",
        border: `1px solid ${style.border}`,
        borderRadius: "var(--radius-lg)",
        background: style.background,
        color: style.color ?? "inherit",
      }}
    >
      {title && <strong>{title}</strong>}
      {children && (
        <p
          style={{
            color: tone === "neutral" ? "var(--text-muted)" : "inherit",
            maxWidth: 900,
            lineHeight: "var(--leading-relaxed)",
            margin: title ? "8px 0 0" : 0,
          }}
        >
          {children}
        </p>
      )}
    </div>
  );
}
