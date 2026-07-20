export function PageHeader({
  title,
  subtitle,
  milestone,
}: {
  title: string;
  subtitle?: string;
  milestone?: string;
}) {
  return (
    <div className="head" style={{ marginBottom: 24 }}>
      <div className="lead" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 style={{ fontSize: "clamp(22px,2.6vw,30px)" }}>{title}</h1>
        {subtitle && (
          <p style={{ marginTop: 10, fontSize: 13, color: "var(--sub)", maxWidth: "60ch", lineHeight: 1.6 }}>
            {subtitle}
          </p>
        )}
      </div>
      {milestone && <span className="chip" style={{ marginTop: 4 }}>{milestone}</span>}
    </div>
  );
}
