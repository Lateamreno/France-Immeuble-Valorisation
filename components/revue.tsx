"use client";

// Mode Revue — bouton flottant présent sur tous les écrans.
// Activé : le curseur devient une cible, un clic pose une épingle et ouvre
// une fiche de retour (gravité, commentaire, capture collée au presse-papier
// ou choisie). Les épingles déjà posées sur l'écran restent visibles.
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { addFeedback, type Feedback } from "@/lib/bo/feedback";

type Draft = {
  xPct: number; yPct: number;
  selecteur: string; elementTexte: string;
  pageX: number; pageY: number;
};

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
  const [voirPins, setVoirPins] = useState(true);

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

  // Capture du clic en phase descendante pour neutraliser l'action de la page.
  const onClick = useCallback(
    (e: MouseEvent) => {
      if (!actif) return;
      const t = e.target as Element | null;
      if (!t || t.closest(".rv-panel, .rv-fab, .rv-pin")) return;
      e.preventDefault();
      e.stopPropagation();
      const doc = document.documentElement;
      setDraft({
        xPct: (e.pageX / doc.scrollWidth) * 100,
        yPct: (e.pageY / doc.scrollHeight) * 100,
        pageX: e.pageX,
        pageY: e.pageY,
        selecteur: selectorOf(t),
        elementTexte: (t.textContent ?? "").trim().slice(0, 200),
      });
      setActif(false);
    },
    [actif],
  );

  useEffect(() => {
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [onClick]);

  useEffect(() => {
    document.body.classList.toggle("rv-armed", actif);
    return () => document.body.classList.remove("rv-armed");
  }, [actif]);

  const mine = pins.filter((p) => p.url === pathname && p.statut === "ouvert");

  return (
    <>
      {voirPins &&
        mine.map((p, i) =>
          p.x_pct === null || p.y_pct === null ? null : (
            <span
              key={p.id}
              className="rv-pin"
              style={{
                left: `${p.x_pct}%`,
                top: `${p.y_pct}%`,
                background: GRAVITES.find((g) => g.key === p.gravite)?.color ?? "#e3790d",
              }}
              title={`${p.gravite} — ${p.commentaire}`}
            >
              {i + 1}
            </span>
          ),
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
          title="Mode Revue (Ctrl/Cmd + Shift + R) : cliquez sur l'écran pour signaler un écart"
        >
          {actif ? "Cliquez sur la zone concernée…" : "✎ Signaler un écart"}
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
      <span className="rv-pin draft" style={{ left: draft.pageX, top: draft.pageY }}>✎</span>
      <div className="rv-panel" onClick={(e) => e.stopPropagation()}>
        <div className="rv-head">
          Signaler un écart
          <button type="button" onClick={onClose}>✕</button>
        </div>
        <div className="rv-body">
          <div className="rv-target" title={draft.selecteur}>
            Zone visée : <b>{draft.elementTexte || draft.selecteur || "page"}</b>
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
