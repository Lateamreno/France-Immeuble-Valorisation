const ACTIONS = [
  { lb: "Nouveau lot", icon: <><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></> },
  { lb: "Document", icon: <><path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/></> },
  { lb: "Email", icon: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 8 9 5 9-5"/></> },
  { lb: "Devis", icon: <><path d="M4 4h16v12H8l-4 4z"/><path d="M8 9h8M8 12h5"/></> },
  { lb: "Note", icon: <><path d="M4 4h16v14H4z"/><path d="M8 9h8M8 13h5"/></> },
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
        <div className="orb" />
        <div>
          <div className="a1">Assistant IA</div>
          <div className="a2">Analyse en cours <span className="dots"><i/><i/><i/></span></div>
        </div>
      </div>
    </div>
  );
}
