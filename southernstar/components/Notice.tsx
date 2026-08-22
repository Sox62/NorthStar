import React from "react";

export interface NoticeProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  
  tone?: "neutral" | "success" | "error";
  title?: React.ReactNode;
  children?: React.ReactNode;
}

const tones: Record<NonNullable<NoticeProps["tone"]>, { border: string; background: string; color?: string }> = {
  neutral: { border: "var(--border-notice)", background: "var(--notice-bg)" },
  success: { border: "var(--result-good-border)", background: "var(--result-good-bg)" },
  error: { border: "var(--result-error-border)", background: "var(--result-error-bg)", color: "var(--status-negative)" },
};

export function Notice({ tone = "neutral", title, children, style, ...rest }: NoticeProps) {
  const t = tones[tone] || tones.neutral;
  return (
    <div
      style={{
        marginTop: "18px",
        padding: tone === "neutral" ? "28px" : "14px",
        border: `1px solid ${t.border}`,
        borderRadius: "var(--radius-lg)",
        background: t.background,
        color: t.color || "inherit",
        ...style,
      }}
      {...rest}
    >
      {title && <strong>{title}</strong>}
      {children && <p style={{ color: tone === "neutral" ? "var(--text-muted)" : "inherit", maxWidth: 900, lineHeight: "var(--leading-relaxed)", margin: title ? "8px 0 0" : 0 }}>{children}</p>}
    </div>
  );
}
