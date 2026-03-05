interface PageHeadProps {
  title: React.ReactNode;
  sub?: string;
  actions?: React.ReactNode;
  eyebrow?: string;
}

export function PageHead({ title, sub, actions, eyebrow }: PageHeadProps) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <div className="eyebrow" style={{ marginBottom: 6 }}>{eyebrow}</div>}
        <h1 className="h1">{title}</h1>
        {sub && <p className="lead">{sub}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}
