const ACTIONS = [
  { lb: "Nouveau lot", icon: <><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></> },
  { lb: "Document", icon: <><path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/></> },
  { lb: "Email", icon: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 8 9 5 9-5"/></> },
  { lb: "Devis", icon: <><path d="M4 4h16v12H8l-4 4z"/><path d="M8 9h8M8 12h5"/></> },
  { lb: "Note", icon: <><path d="M4 4h16v14H4z"/><path d="M8 9h8M8 13h5"/></> },
  { lb: "Plus", icon: <><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></> },
];

export function Dock() {
  return (
    <div className="dock">
      <div className="actions panel">
        {ACTIONS.map((a) => (
          <span key={a.lb} className="act">
            <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.7}>{a.icon}</svg>
            {a.lb}
          </span>
        ))}
      </div>
      <div className="assistant panel">
        <div className="orb">
          <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.6}>
            <path d="M12 3l2.2 6.2L20 12l-5.8 2.8L12 21l-2.2-6.2L4 12l5.8-2.8z" stroke="#fff8e6" fill="rgba(255,248,230,.25)"/>
          </svg>
        </div>
        <div className="atxt">
          <div className="a1">Assistant IA</div>
          <div className="a2">Analyse en cours <span className="dots"><i/><i/><i/></span></div>
        </div>
        <svg className="aspark" viewBox="0 0 54 24"><polyline points="2,18 10,12 18,15 26,7 34,10 44,4 52,8" fill="none" stroke="var(--gold)" strokeWidth="1.5"/></svg>
        <span className="aexp">
          <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.7}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>
        </span>
      </div>
    </div>
  );
}
