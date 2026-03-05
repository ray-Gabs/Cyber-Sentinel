interface CardProps {
  title?: string;
  action?: React.ReactNode;
  eyebrow?: string;
  children: React.ReactNode;
  pad?: boolean;
  className?: string;
}

export function Card({ title, action, eyebrow, children, pad = true, className = "" }: CardProps) {
  return (
    <div className={`card card-flush ${className}`.trim()}>
      {(title || action) && (
        <div className="card-head">
          <div>
            {eyebrow && <div className="eyebrow" style={{ marginBottom: 4 }}>{eyebrow}</div>}
            {title && <h2 className="h2">{title}</h2>}
          </div>
          {action}
        </div>
      )}
      {pad ? <div style={{ padding: "var(--pad-card)" }}>{children}</div> : children}
    </div>
  );
}
