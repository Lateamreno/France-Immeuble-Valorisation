"use client";

/**
 * La fenêtre modale — objet n° 1 du catalogue (validé le 25/09).
 *
 * Cinquante-cinq fenêtres étaient réécrites à la main : le fond, l'en-tête
 * avec sa croix, le corps, le pied. Le clic dehors, la touche Échap, la
 * largeur ne se comportaient pas pareil de l'une à l'autre (le retour #364,
 * fenêtre du lieu ouverte dans la barre, en venait). Ici, une seule règle :
 *
 *   · la fenêtre se pose dans <body> (un portail) : jamais coincée dans un
 *     conteneur qui défile ou qui la rogne ;
 *   · Échap ferme, le clic sur le fond ferme (sauf `fermeDehors={false}` pour
 *     une saisie qu'on ne veut pas perdre d'un clic malheureux) ;
 *   · un en-tête avec le titre et la croix, un corps, un pied facultatif ;
 *     `brut` rend les enfants tels quels pour les fenêtres qui ont leur propre
 *     mise en page (Suivi, avenant).
 *
 * Les classes CSS restent `modal-ov`, `modal`, `modal-h`, `modal-b`,
 * `modal-f` : le dessin ne change pas, seul le code est partagé.
 */
import { useCallback, useEffect, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Les fenêtres ouvertes, de la plus ancienne à la plus récente. */
const PILE: Array<() => void> = [];

export function Modale({
  titre, onFermer, children, pied, className, style, largeur, fermeDehors = true, entete = true, brut = false, apresTitre,
}: {
  titre?: ReactNode;
  /** Ce qui se passe quand on ferme (croix, Échap, clic dehors). Absent : pas de croix. */
  onFermer?: () => void;
  children: ReactNode;
  /** Le pied (boutons), rendu dans `.modal-f` quand il est donné. */
  pied?: ReactNode;
  /** Classes en plus sur `.modal` (`lg`, `sv`…), pour les dessins existants. */
  className?: string;
  style?: CSSProperties;
  /** Largeur maximale en pixels ; sinon celle de la classe. */
  largeur?: number;
  /** Le clic sur le fond ferme-t-il ? Non pour une saisie longue. */
  fermeDehors?: boolean;
  /** Sans en-tête : la fenêtre dessine le sien. */
  entete?: boolean;
  /** Les enfants tels quels, sans `.modal-b`. */
  brut?: boolean;
  /** Quelque chose à ranger juste après le titre (une copie d'adresse, #274). */
  apresTitre?: ReactNode;
}) {
  /* Le portail n'existe qu'au navigateur : au rendu serveur (et pendant
     l'hydratation) on ne dessine rien, puis la fenêtre apparaît. */
  const monte = useSyncExternalStore(() => () => {}, () => true, () => false);

  /* Échap ne ferme que la fenêtre du DESSUS : une question posée au-dessus
     d'une fenêtre (« Supprimer ces travaux ? ») se ferme seule, la fenêtre de
     dessous reste. D'où une pile : la dernière ouverte a la main. */
  useEffect(() => {
    if (!onFermer) return;
    const moi = () => onFermer();
    PILE.push(moi);
    const echap = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || PILE[PILE.length - 1] !== moi) return;
      e.stopPropagation();
      moi();
    };
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("keydown", echap);
      const i = PILE.lastIndexOf(moi);
      if (i >= 0) PILE.splice(i, 1);
    };
  }, [onFermer]);

  if (!monte) return null;

  const largeurStyle: CSSProperties | undefined = largeur ? { maxWidth: largeur, width: "100%" } : undefined;
  return createPortal(
    <div
      className="modal-ov"
      onMouseDown={(e) => { if (fermeDehors && onFermer && e.target === e.currentTarget) onFermer(); }}
    >
      <div
        className={`modal${className ? ` ${className}` : ""}`}
        style={{ ...largeurStyle, ...style }}
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {entete && (
          <div className="modal-h">
            <span className="modal-t">{titre}{apresTitre}</span>
            {onFermer && <button type="button" aria-label="Fermer" title="Fermer (Échap)" onClick={onFermer}>✕</button>}
          </div>
        )}
        {brut ? children : <div className="modal-b">{children}</div>}
        {pied && <div className="modal-f">{pied}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ Questions */

type Question =
  | { genre: "confirmer"; titre?: string; message: ReactNode; oui: string; non: string; danger: boolean; resolve: (v: boolean) => void }
  | { genre: "saisir"; titre?: string; message: ReactNode; placeholder?: string; initial: string; oui: string; non: string; multiligne: boolean; obligatoire: boolean; resolve: (v: string | null) => void };

/**
 * Les questions posées à l'utilisateur — objet n° 8 (les `confirm()` et
 * `prompt()` du navigateur, remplacés par la fenêtre partagée).
 *
 *   const { confirmer, saisir, question } = useQuestion();
 *   …
 *   if (!(await confirmer("Retirer ce document ?"))) return;
 *   const motif = await saisir("Motif du refus ?");   // null si annulé
 *   …
 *   return <>{…}{question}</>;
 *
 * `question` est l'élément à rendre quelque part dans le composant : c'est la
 * fenêtre, quand une question est posée, rien sinon.
 *
 * PIÈGE : ne jamais poser la question DANS une transition (`start(async …)`).
 * React retient l'écran tant que l'action court, la fenêtre n'apparaît pas et
 * la promesse n'est jamais tenue. On demande d'abord, on lance la transition
 * ensuite.
 */
export function useQuestion() {
  const [q, setQ] = useState<Question | null>(null);

  const confirmer = useCallback(
    (message: ReactNode, opts: { titre?: string; oui?: string; non?: string; danger?: boolean } = {}) =>
      new Promise<boolean>((resolve) => {
        setQ({ genre: "confirmer", message, titre: opts.titre, oui: opts.oui ?? "Oui", non: opts.non ?? "Annuler", danger: opts.danger ?? false, resolve });
      }),
    [],
  );
  const saisir = useCallback(
    (message: ReactNode, opts: { titre?: string; placeholder?: string; initial?: string; oui?: string; non?: string; multiligne?: boolean; obligatoire?: boolean } = {}) =>
      new Promise<string | null>((resolve) => {
        setQ({
          genre: "saisir", message, titre: opts.titre, placeholder: opts.placeholder, initial: opts.initial ?? "",
          oui: opts.oui ?? "Valider", non: opts.non ?? "Annuler", multiligne: opts.multiligne ?? false, obligatoire: opts.obligatoire ?? false, resolve,
        });
      }),
    [],
  );

  const question = q ? <FenetreQuestion q={q} onFin={() => setQ(null)} /> : null;
  return { confirmer, saisir, question };
}

function FenetreQuestion({ q, onFin }: { q: Question; onFin: () => void }) {
  const [valeur, setValeur] = useState(q.genre === "saisir" ? q.initial : "");
  const annuler = () => { if (q.genre === "confirmer") q.resolve(false); else q.resolve(null); onFin(); };
  const valider = () => {
    if (q.genre === "confirmer") q.resolve(true);
    else {
      if (q.obligatoire && !valeur.trim()) return;
      q.resolve(valeur);
    }
    onFin();
  };
  const peut = q.genre === "confirmer" || !q.obligatoire || valeur.trim().length > 0;
  return (
    <Modale
      titre={q.titre ?? (q.genre === "confirmer" ? "Confirmer" : "Précision")}
      onFermer={annuler}
      largeur={440}
      pied={
        <>
          <button type="button" className="fadd" onClick={annuler}>{q.non}</button>
          <button
            type="button"
            className="fadd"
            style={q.genre === "confirmer" && q.danger ? { color: "#fff", background: "var(--red)", borderColor: "var(--red)" } : { color: "#fff", background: "var(--slate)", borderColor: "var(--slate)" }}
            disabled={!peut}
            onClick={valider}
            autoFocus={q.genre === "confirmer"}
          >
            {q.oui}
          </button>
        </>
      }
    >
      <div className="qst-m">{q.message}</div>
      {q.genre === "saisir" && (
        q.multiligne ? (
          <textarea
            className="qst-i" rows={4} autoFocus value={valeur} placeholder={q.placeholder}
            onChange={(e) => setValeur(e.target.value)}
          />
        ) : (
          <input
            className="qst-i" autoFocus value={valeur} placeholder={q.placeholder}
            onChange={(e) => setValeur(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); valider(); } }}
          />
        )
      )}
    </Modale>
  );
}
