export function ComingSoon({ points }: { points: string[] }) {
  return (
    <div className="soon-box">
      <p className="h">À venir dans ce module :</p>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {points.map((p) => (
          <li key={p}>
            <span style={{ color: "var(--gold)" }}>›</span>
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}
