// Synthèse des retours de recette (mode Revue) : liste par écran, statut,
// capture jointe. C'est la « todo » de fidélité au BO.
import Link from "next/link";
import { listFeedback } from "@/lib/bo/feedback";
import { FeedbackActions } from "@/components/revue-actions";

export const dynamic = "force-dynamic";

const COULEURS: Record<string, string> = {
  bloquant: "#d60000", ecart: "#e3790d", detail: "#b6a359", idee: "#3db327",
};
const LABELS: Record<string, string> = {
  bloquant: "Bloquant", ecart: "Écart", detail: "Détail", idee: "Idée",
};

export default async function RevuePage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string }>;
}) {
  const { statut = "ouvert" } = await searchParams;
  const all = await listFeedback().catch(() => []);
  const rows = all.filter((f) => (statut === "tous" ? true : f.statut === statut));
  const parEcran = new Map<string, typeof rows>();
  for (const f of rows) {
    const k = f.url;
    parEcran.set(k, [...(parEcran.get(k) ?? []), f]);
  }
  const compte = (s: string) => (s === "tous" ? all.length : all.filter((f) => f.statut === s).length);

  return (
    <div className="lst-page">
      <h1 className="lst-title">Retours de recette</h1>
      <div style={{ fontSize: 12.5, color: "var(--gray-txt)", marginBottom: 10 }}>
        Pour signaler un écart : ouvrez l&apos;écran concerné, cliquez sur <b>✎ Signaler un écart</b>
        {" "}en bas à droite (ou Ctrl/Cmd + Shift + R), puis cliquez sur la zone fautive.
        Vous pouvez coller une capture de votre BO actuel directement dans la fiche (Ctrl/Cmd + V).
      </div>

      <div className="ftabs">
        {[["ouvert", "À traiter"], ["corrige", "Corrigés"], ["ecarte", "Écartés"], ["tous", "Tous"]].map(([k, l]) => (
          <Link key={k} href={`/revue?statut=${k}`} className={`ftab${statut === k ? " on" : ""}`}>
            {l}{compte(k) > 0 && <span className="n">{compte(k)}</span>}
          </Link>
        ))}
      </div>

      {rows.length === 0 && (
        <div className="fempty">
          Aucun retour {statut === "ouvert" ? "en attente" : ""} pour l&apos;instant.
        </div>
      )}

      {[...parEcran.entries()].map(([url, items]) => (
        <div key={url}>
          <div className="fsub" style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10 }}>
            <Link className="lnk" href={url}>{url}</Link>
            <span style={{ fontWeight: 400, color: "var(--gray-lt)", fontSize: 12 }}>
              {items.length} retour{items.length > 1 ? "s" : ""}
            </span>
          </div>
          {items.map((f) => (
            <div key={f.id} className={`fb${f.statut === "corrige" ? " corrige" : ""}`}>
              <span className="fb-gr" style={{ background: COULEURS[f.gravite] }} />
              <div className="fb-main">
                <div className="fb-meta">
                  #{f.id} · {LABELS[f.gravite]} · {f.auteur} ·{" "}
                  {new Date(f.created_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}
                  {f.statut !== "ouvert" && ` · ${f.statut === "corrige" ? "corrigé" : "écarté"}`}
                </div>
                <div className="fb-txt">{f.commentaire}</div>
                {(f.element_texte || f.selecteur) && (
                  <div className="fb-zone">Zone : {f.element_texte || f.selecteur}</div>
                )}
                {f.reponse && (
                  <div className="fb-zone" style={{ color: "#3d7327" }}>Réponse : {f.reponse}</div>
                )}
                <FeedbackActions id={f.id} statut={f.statut} commentaire={f.commentaire} gravite={f.gravite} />
              </div>
              {/* Les retours d'avant le multi-fichiers n'ont que `capture_path` :
                  on le prend en repli pour qu'ils s'affichent comme avant. */}
              {(f.captures?.length ? f.captures : f.capture_path ? [f.capture_path] : []).map((c, i) => (
                <a key={i} href={`/api/photo?s=${encodeURIComponent(c)}`} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="fb-shot" src={`/api/photo?s=${encodeURIComponent(c)}`} alt={`capture ${i + 1}`} />
                </a>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
