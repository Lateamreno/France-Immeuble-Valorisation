"use client";

/**
 * La carte d'un matching et celle d'une commercialisation — la présentation
 * du BO, reprise au picto et à la couleur près (retours #421, #422, #431).
 *
 * MAV : « les grades A B C D en couleur s'ils sont sélectionnés, en grisé
 * sinon. Les nombres d'e-mails et de téléphones à droite avec picto. Les
 * typologies concernées en gris foncé (grisé si non concerné). Pareil pour le
 * type de recherche. Surface, occupation, rendement, prix. On dit sur quoi
 * s'est basée la recherche : le dossier ou l'estimation. »
 *
 * Un seul objet pour l'historique ET le bandeau collé des résultats : ce que
 * l'agent a lancé se relit partout de la même façon.
 */
import { euros } from "@/lib/format";
import { CIBLES, DESTINATIONS_BIEN } from "@/lib/pictos-recherche";
import type { ComptesGrade } from "@/lib/bo/matching";

export type ResumeMatching = {
  date?: string;
  /** « dossier », « estimation », « prix » — d'où viennent les critères. */
  source: "from_est" | "from_imm" | "from_doss" | string;
  dossierLabel?: string;
  notes: string[];
  cibles: string[];
  destinations: string[];
  ville?: string;
  departement?: string;
  surface?: number;
  occupation?: number;
  prix?: number;
  renta?: number;
  exclureDejaVus: boolean;
  exclureAgents: boolean;
  mandatObligatoire: boolean;
  /** Le bien matché, pour la ligne du bas. */
  bien?: { libelle: string; prix?: number };
};

const GRADES = ["A", "B", "C", "D"] as const;

const Ic = ({ d }: { d: React.ReactNode }) => <svg viewBox="0 0 24 24" aria-hidden>{d}</svg>;

/** Les quatre lettres : allumées si retenues, grisées sinon. */
export function Grades({ notes }: { notes: string[] }) {
  const toutes = notes.length === 0;
  return (
    <span className="cm-grades" title={toutes ? "Tous les grades" : `Grades ${notes.join(" ")}`}>
      {GRADES.map((g) => (
        <b key={g} className={`note n${g}${toutes || notes.includes(g) ? "" : " off"}`}>{g}</b>
      ))}
    </span>
  );
}

/** Les pictos d'une liste de valeurs : allumés quand visés, éteints sinon. */
function Pictos({ liste, visees, tout }: {
  liste: { cle: string; titre: string; d: React.ReactNode }[]; visees: string[]; tout: boolean;
}) {
  return (
    <span className="cm-pictos">
      {liste.map((x) => (
        <i key={x.cle} className={tout || visees.includes(x.cle) ? "on" : undefined} title={x.titre}>
          <Ic d={x.d} />
        </i>
      ))}
    </span>
  );
}

const SOURCE: Record<string, string> = { from_est: "l'estimation", from_doss: "le dossier", from_imm: "le prix de la fiche" };

export function CriteresMatching({ r }: { r: ResumeMatching }) {
  const chip = (ok: boolean, txt: string, titre: string) => (
    <span className={`cm-chip${ok ? "" : " off"}`} title={titre}>{txt}</span>
  );
  return (
    <>
      <div className="cm-l">
        <Pictos liste={DESTINATIONS_BIEN} visees={r.destinations} tout={r.destinations.length === 0} />
        <Pictos liste={CIBLES} visees={r.cibles} tout={r.cibles.length === 0} />
        {(r.ville || r.departement) && (
          <span className="cm-chip" title="Secteur">
            <Ic d={<><path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z" /><circle cx="12" cy="10" r="2.2" /></>} />
            {[r.ville, r.departement].filter(Boolean).join(" · ")}
          </span>
        )}
        {chip(r.surface !== undefined, r.surface !== undefined ? `${Math.round(r.surface)} m²` : "Surface", "Surface Carrez")}
        {chip(r.occupation !== undefined, r.occupation !== undefined ? `${Math.round(r.occupation)} %` : "Occupation", "Occupation")}
        {chip(r.prix !== undefined, r.prix !== undefined ? (euros(r.prix) ?? `${r.prix} €`) : "Prix", "Prix")}
        {chip(r.renta !== undefined, r.renta !== undefined ? `${String(r.renta).replace(".", ",")} %` : "Rendement", "Rendement brut")}
      </div>
      <div className="cm-l">
        <Grades notes={r.notes} />
        <span className={`cm-tag${r.exclureDejaVus ? " rouge" : ""}`}>Déjà vus <b>{r.exclureDejaVus ? "exclus" : "inclus"}</b></span>
        <span className={`cm-tag${r.exclureAgents ? " rouge" : ""}`}>Agents <b>{r.exclureAgents ? "exclus" : "inclus"}</b></span>
        <span className="cm-tag">Mandat de recherche <b className={r.mandatObligatoire ? "" : "vert"}>{r.mandatObligatoire ? "obligatoire" : "facultatif"}</b></span>
        <span className="cm-tag">À partir de <b>{SOURCE[r.source] ?? "critères"}</b>{r.dossierLabel ? <> — {r.dossierLabel}</> : null}</span>
      </div>
      {r.bien && (
        <div className="cm-l cm-bien">
          <span className="cm-lab">Immeuble matché</span>
          <span className="cm-chip">{r.bien.libelle}</span>
          {r.bien.prix !== undefined && <span className="cm-chip"><b>{euros(r.bien.prix)}</b> HAI</span>}
        </div>
      )}
    </>
  );
}

/** Le bloc de droite : e-mails et téléphones par grade, puis le total. */
export function ComptesGrades({ parGrade, total, compact }: {
  parGrade?: Record<string, ComptesGrade>; total: { mails: number; tels: number }; compact?: boolean;
}) {
  return (
    <div className={`cm-comptes${compact ? " compact" : ""}`}>
      {parGrade && GRADES.map((g) => (
        <span key={g} className={`cm-cpt${(parGrade[g]?.n ?? 0) === 0 ? " off" : ""}`}>
          <b className={`note n${g}`}>{g}</b>
          <i><Ic d={<><path d="M3 7.5 12 13l9-5.5" /><rect x="3" y="5" width="18" height="14" rx="2" /></>} />{parGrade[g]?.mails ?? 0}</i>
          <i><Ic d={<path d="M6 3h4l2 5-2.5 1.5a12 12 0 0 0 5 5L16 12l5 2v4a2 2 0 0 1-2.2 2C10.6 19.3 4.7 13.4 4 5.2A2 2 0 0 1 6 3z" />} />{parGrade[g]?.tels ?? 0}</i>
        </span>
      ))}
      <span className="cm-cpt total">
        <i><Ic d={<><path d="M3 7.5 12 13l9-5.5" /><rect x="3" y="5" width="18" height="14" rx="2" /></>} />{total.mails}</i>
        <i><Ic d={<path d="M6 3h4l2 5-2.5 1.5a12 12 0 0 0 5 5L16 12l5 2v4a2 2 0 0 1-2.2 2C10.6 19.3 4.7 13.4 4 5.2A2 2 0 0 1 6 3z" />} />{total.tels}</i>
      </span>
    </div>
  );
}

/** La carte d'un matching de l'historique. */
export function CarteMatching({ r, titre, parGrade, total, onOuvrir }: {
  r: ResumeMatching; titre: React.ReactNode;
  parGrade?: Record<string, ComptesGrade>; total: { mails: number; tels: number };
  onOuvrir?: () => void;
}) {
  const corps = (
    <>
      <span className="cm-ic"><Ic d={<><circle cx="9" cy="8" r="3.2" /><circle cx="16.5" cy="9.5" r="2.4" /><path d="M3.5 19c.5-3.4 2.8-5.2 5.5-5.2s5 1.8 5.5 5.2M14.5 18.5c.3-2.2 1.6-3.6 3.5-3.6 1.4 0 2.6.8 3 2.6" /></>} /></span>
      <div className="cm-c">
        <div className="cm-t">{titre}</div>
        <CriteresMatching r={r} />
      </div>
      <ComptesGrades parGrade={parGrade} total={total} />
    </>
  );
  return onOuvrir
    ? <button type="button" className="cm ouvrable" title="Rouvrir ce matching" onClick={onOuvrir}>{corps}</button>
    : <div className="cm">{corps}</div>;
}
