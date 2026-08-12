"use client";

// Mode Revue — bouton flottant présent sur tous les écrans.
// Activé, le curseur devient une croix : on entoure la zone concernée en
// traçant un rectangle libre (comme une capture d'écran), ou on clique
// simplement pour poser une épingle ponctuelle. La fiche de retour s'ouvre
// ensuite (gravité, commentaire, capture collée au presse-papier ou choisie).
// Les zones déjà signalées sur l'écran restent visibles.
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { addFeedback, type Feedback } from "@/lib/bo/feedback";

type Draft = {
  /** Coin haut-gauche de la zone, en % de la page. */
  xPct: number; yPct: number;
  /** Taille de la zone en % ; absente pour une épingle ponctuelle. */
  wPct?: number; hPct?: number;
  selecteur: string; elementTexte: string;
  /** Géométrie en pixels de page, pour l'aperçu à l'écran. */
  pageX: number; pageY: number; pageW: number; pageH: number;
};

/** En-deçà de ce déplacement, on considère que c'est un simple clic. */
const SEUIL_GLISSER = 6;

const GRAVITES: { key: Feedback["gravite"]; label: string; color: string }[] = [
  { key: "bloquant", label: "Bloquant", color: "#d60000" },
  { key: "ecart", label: "Écart avec le BO", color: "#e3790d" },
  { key: "detail", label: "Détail visuel", color: "#b6a359" },
  { key: "idee", label: "Idée / plus tard", color: "#3db327" },
];

/** Sélecteur CSS court et lisible pour retrouver l'élément visé. */
function selectorOf(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  for (let i = 0; cur && i < 4 && cur.tagName !== "BODY"; i++) {
    const cls = (cur.getAttribute("class") ?? "")
      .split(/\s+/)
      .filter((c) => c && !/^(css-|__)/.test(c))
      .slice(0, 2)
      .map((c) => `.${c}`)
      .join("");
    parts.unshift(cur.tagName.toLowerCase() + cls);
    cur = cur.parentElement;
  }
  return parts.join(" > ");
}

export function RevueButton({ pins }: { pins: Feedback[] }) {
  const pathname = usePathname();
  const [actif, setActif] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  // Retour #63 : les cadres enregistrés ne s'affichent plus par défaut — ils
  // recouvraient les menus et bloquaient la navigation. Le compteur de la
  // barre de recette les réaffiche à la demande.
  const [voirPins, setVoirPins] = useState(false);

  // Raccourci clavier : Ctrl/Cmd + Shift + R
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        setActif((v) => !v);
      }
      if (e.key === "Escape") { setDraft(null); setActif(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Tracé du rectangle : on suit la souris depuis l'appui jusqu'au relâché.
  // Tout est capté en phase descendante pour neutraliser l'action de la page.
  const depart = useRef<{ x: number; y: number } | null>(null);
  const [trace, setTrace] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const onDown = useCallback(
    (e: MouseEvent) => {
      if (!actif || e.button !== 0) return;
      const t = e.target as Element | null;
      if (!t || t.closest(".rv-panel, .rv-fab, .rv-pin, .rv-zone")) return;
      e.preventDefault();
      e.stopPropagation();
      depart.current = { x: e.pageX, y: e.pageY };
      setTrace({ x: e.pageX, y: e.pageY, w: 0, h: 0 });
    },
    [actif],
  );

  const onMove = useCallback((e: MouseEvent) => {
    const d = depart.current;
    if (!d) return;
    e.preventDefault();
    setTrace({
      x: Math.min(d.x, e.pageX),
      y: Math.min(d.y, e.pageY),
      w: Math.abs(e.pageX - d.x),
      h: Math.abs(e.pageY - d.y),
    });
  }, []);

  const onUp = useCallback(
    (e: MouseEvent) => {
      const d = depart.current;
      if (!d) return;
      e.preventDefault();
      e.stopPropagation();
      depart.current = null;
      setTrace(null);

      const x = Math.min(d.x, e.pageX);
      const y = Math.min(d.y, e.pageY);
      const w = Math.abs(e.pageX - d.x);
      const h = Math.abs(e.pageY - d.y);
      const doc = document.documentElement;
      const rectangle = w >= SEUIL_GLISSER && h >= SEUIL_GLISSER;

      // L'élément décrit est celui du centre de la zone (ou du point cliqué).
      const cx = rectangle ? x + w / 2 : e.pageX;
      const cy = rectangle ? y + h / 2 : e.pageY;
      const cible =
        document.elementFromPoint(cx - window.scrollX, cy - window.scrollY) ??
        (e.target as Element | null);

      setDraft({
        xPct: ((rectangle ? x : e.pageX) / doc.scrollWidth) * 100,
        yPct: ((rectangle ? y : e.pageY) / doc.scrollHeight) * 100,
        wPct: rectangle ? (w / doc.scrollWidth) * 100 : undefined,
        hPct: rectangle ? (h / doc.scrollHeight) * 100 : undefined,
        pageX: rectangle ? x : e.pageX,
        pageY: rectangle ? y : e.pageY,
        pageW: w,
        pageH: h,
        selecteur: cible ? selectorOf(cible) : "",
        elementTexte: (cible?.textContent ?? "").trim().slice(0, 200),
      });
      setActif(false);
    },
    [],
  );

  useEffect(() => {
    // Le clic est avalé pour que la page ne réagisse pas au tracé.
    const avale = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (!actif || t?.closest(".rv-panel, .rv-fab, .rv-pin, .rv-zone")) return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("mouseup", onUp, true);
    document.addEventListener("click", avale, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mouseup", onUp, true);
      document.removeEventListener("click", avale, true);
    };
  }, [actif, onDown, onMove, onUp]);

  useEffect(() => {
    document.body.classList.toggle("rv-armed", actif);
    return () => document.body.classList.remove("rv-armed");
  }, [actif]);

  const mine = pins.filter((p) => p.url === pathname && p.statut === "ouvert");

  return (
    <>
      {voirPins &&
        mine.map((p, i) => {
          if (p.x_pct === null || p.y_pct === null) return null;
          const couleur = GRAVITES.find((g) => g.key === p.gravite)?.color ?? "#e3790d";
          const titre = `${p.gravite} — ${p.commentaire}`;
          // Zone rectangulaire si elle a été tracée, épingle ponctuelle sinon.
          return p.w_pct && p.h_pct ? (
            <span
              key={p.id}
              className="rv-zone"
              style={{
                left: `${p.x_pct}%`, top: `${p.y_pct}%`,
                width: `${p.w_pct}%`, height: `${p.h_pct}%`,
                borderColor: couleur,
              }}
              title={titre}
            >
              <b style={{ background: couleur }}>{i + 1}</b>
            </span>
          ) : (
            <span key={p.id} className="rv-pin"
              style={{ left: `${p.x_pct}%`, top: `${p.y_pct}%`, background: couleur }}
              title={titre}>
              {i + 1}
            </span>
          );
        })}

      {trace && (
        <span className="rv-zone trace"
          style={{ left: trace.x, top: trace.y, width: trace.w, height: trace.h }}>
          <b>{Math.round(trace.w)} × {Math.round(trace.h)}</b>
        </span>
      )}

      <div className="rv-fab">
        {mine.length > 0 && (
          <button
            type="button"
            className="rv-chip"
            onClick={() => setVoirPins((v) => !v)}
            title="Afficher / masquer les épingles de cet écran"
          >
            {mine.length} retour{mine.length > 1 ? "s" : ""}
          </button>
        )}
        <Link className="rv-chip" href="/revue" title="Voir tous les retours">Liste</Link>
        <button
          type="button"
          className={`rv-btn${actif ? " on" : ""}`}
          onClick={() => setActif((v) => !v)}
          title="Mode Revue (Ctrl/Cmd + Shift + R) : entourez la zone concernée, ou cliquez simplement pour poser une épingle"
        >
          {actif ? "Entourez la zone concernée…" : "✎ Signaler un écart"}
        </button>
      </div>

      {draft && <RevuePanel draft={draft} pathname={pathname} onClose={() => setDraft(null)} />}
    </>
  );
}

function RevuePanel({
  draft, pathname, onClose,
}: {
  draft: Draft; pathname: string; onClose: () => void;
}) {
  const [gravite, setGravite] = useState<Feedback["gravite"]>("ecart");
  const [commentaire, setCommentaire] = useState("");
  const [capture, setCapture] = useState<File | null>(null);
  const [apercu, setApercu] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, start] = useTransition();
  const zone = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { zone.current?.focus(); }, []);

  // Coller une capture d'écran directement (Ctrl/Cmd + V) — le cas d'usage
  // principal : MAV fait une capture de son BO actuel et la colle ici.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"));
      const f = item?.getAsFile();
      if (f) {
        setCapture(f);
        setApercu(URL.createObjectURL(f));
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const envoyer = () =>
    start(async () => {
      setErr(null);
      try {
        const fd = new FormData();
        fd.set("url", pathname);
        fd.set("page_titre", document.title || pathname);
        fd.set("selecteur", draft.selecteur);
        fd.set("element_texte", draft.elementTexte);
        fd.set("x_pct", String(draft.xPct));
        fd.set("y_pct", String(draft.yPct));
        if (draft.wPct !== undefined) fd.set("w_pct", String(draft.wPct));
        if (draft.hPct !== undefined) fd.set("h_pct", String(draft.hPct));
        fd.set("viewport_w", String(window.innerWidth));
        fd.set("gravite", gravite);
        fd.set("commentaire", commentaire);
        if (capture) fd.set("capture", capture);
        await addFeedback(fd);
        setOk(true);
        setTimeout(onClose, 900);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    });

  return (
    <>
      {draft.wPct !== undefined ? (
        <span className="rv-zone draft"
          style={{ left: draft.pageX, top: draft.pageY, width: draft.pageW, height: draft.pageH }}>
          <b>✎</b>
        </span>
      ) : (
        <span className="rv-pin draft" style={{ left: draft.pageX, top: draft.pageY }}>✎</span>
      )}
      <div className="rv-panel" onClick={(e) => e.stopPropagation()}>
        <div className="rv-head">
          Signaler un écart
          <button type="button" onClick={onClose}>✕</button>
        </div>
        <div className="rv-body">
          <div className="rv-target" title={draft.selecteur}>
            {draft.wPct !== undefined
              ? `Zone entourée (${Math.round(draft.pageW)} × ${Math.round(draft.pageH)} px) : `
              : "Point visé : "}
            <b>{draft.elementTexte || draft.selecteur || "page"}</b>
          </div>
          <div className="mrow">
            {GRAVITES.map((g) => (
              <button
                key={g.key}
                type="button"
                className={`mopt${gravite === g.key ? " on" : ""}`}
                style={gravite === g.key ? { background: g.color, borderColor: g.color } : undefined}
                onClick={() => setGravite(g.key)}
              >
                {g.label}
              </button>
            ))}
          </div>
          <textarea
            ref={zone}
            className="min"
            rows={4}
            placeholder="Ce qui ne va pas et ce qui devrait s'afficher à la place…"
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
          />
          <div className="rv-paste">
            {apercu ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={apercu} alt="capture" />
            ) : (
              <span>Collez une capture de votre BO (Ctrl/Cmd + V) ou</span>
            )}
            <label className="fadd">
              {apercu ? "Remplacer" : "choisir un fichier"}
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setCapture(f);
                  setApercu(f ? URL.createObjectURL(f) : null);
                }}
              />
            </label>
            {apercu && (
              <button type="button" className="xdel" onClick={() => { setCapture(null); setApercu(null); }}>✕</button>
            )}
          </div>
          {err && <div className="warnbox" style={{ color: "var(--red)", borderColor: "var(--red)" }}>{err}</div>}
          {ok && <div className="warnbox" style={{ color: "#3d7327", borderColor: "#b7e2ae" }}>Retour enregistré ✓</div>}
        </div>
        <div className="rv-foot">
          <span style={{ flex: 1, fontSize: 11.5, color: "var(--gray-lt)" }}>{pathname}</span>
          <button
            className="kgo"
            type="button"
            disabled={pending || !commentaire.trim()}
            style={pending || !commentaire.trim() ? { opacity: 0.5 } : undefined}
            onClick={envoyer}
          >
            <span className="ch">›</span> {pending ? "Envoi…" : "Enregistrer le retour"}
          </button>
        </div>
      </div>
    </>
  );
}
