export function TopBar() {
  return (
    <div className="bar panel">
      <div className="bc">
        Opérations <span className="s">›</span> <b>55 rue Volant</b> <span className="s">›</span> Commercialisation
      </div>
      <div className="spacer" />
      <div className="search">
        <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8}><circle cx="11" cy="11" r="7"/><path d="m21 21-4-4"/></svg>
        Rechercher
      </div>
      <div className="ibtn">
        <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.6}><path d="M12 3l1.6 4.6L18 9l-4.4 1.4L12 15l-1.6-4.6L6 9l4.4-1.4z"/></svg>
      </div>
      <div className="ibtn">
        <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.7}><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>
      </div>
      <div className="ibtn glow">
        <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.7}><circle cx="12" cy="12" r="4.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2 2M17.1 17.1l2 2M19.1 4.9l-2 2M6.9 17.1l-2 2"/></svg>
      </div>
    </div>
  );
}
