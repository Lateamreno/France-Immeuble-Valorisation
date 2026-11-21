"use client";

/**
 * La constructibilité lue par l'IA, et de quoi la vérifier (MAV, 20/11/26 :
 * « avec un détail quelque part pour qu'on puisse vérifier que le taff a été
 * bien fait »).
 *
 * Deux sources, jamais confondues à l'écran : la zone et son type viennent du
 * Géoportail de l'urbanisme (donnée officielle, sans IA) ; l'emprise et la
 * hauteur sont lues par l'IA dans le règlement, chacune avec l'extrait qui la
 * porte et un lien vers la page du PDF.
 *
 * Rien n'est enregistré d'office : « Reprendre ces valeurs » remplit les
 * quatre cases, que l'agent enregistre comme une saisie à la main.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/components/session";
import {
  ecrirePlages, lectureDe, propositions,
  type CasesPlu, type Controle, type Extrait, type LecturePlu, type ValeurLue,
} from "@/lib/bo/plu";

const CONTROLES: Record<Controle, { ton: string; texte: string }> = {
  chiffre_cite: { ton: "ok", texte: "Le chiffre figure dans l'extrait cité" },
  cite_sans_chiffre: { ton: "voir", texte: "L'extrait cité ne porte pas ce chiffre tel quel : à relire" },
  sans_extrait: { ton: "non", texte: "Aucun extrait à l'appui : à vérifier dans le règlement" },
};

const jour = (iso?: string) => {
  if (!iso) return "";
  const [a, m, j] = iso.slice(0, 10).split("-");
  return a && m && j ? `${j}/${m}/${a}` : "";
};

const moment = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    .replace(",", " à").replace(":", " h ");
};

const fr = (n: number) => String(n).replace(".", ",");

function Extraits({ extraits, reglement }: { extraits: Extrait[]; reglement?: string }) {
  if (extraits.length === 0) return null;
  return (
    <ul className="plu-ext">
      {extraits.map((e, i) => (
        <li key={i}>
          <q>{e.texte}</q>
          {reglement
            ? <a href={`${reglement}#page=${e.page}`} target="_blank" rel="noreferrer">page {e.page} du règlement ↗</a>
            : <span className="pg">page {e.page}</span>}
        </li>
      ))}
    </ul>
  );
}

function LigneLue({ titre, v, unite, reglement, ecart }: {
  titre: string; v?: ValeurLue; unite: string; reglement?: string; ecart?: string;
}) {
  if (!v) {
    return (
      <div className="plu-l">
        <div className="k">{titre}</div>
        <div className="v vide">—</div>
        <div className="d"><p className="plu-src">L&apos;IA n&apos;a pas établi ce chiffre : à lire dans le règlement.</p></div>
      </div>
    );
  }
  const c = CONTROLES[v.controle];
  return (
    <div className="plu-l">
      <div className="k">{titre}</div>
      <div className={`v${v.valeur === undefined ? " vide" : ""}`}>
        {v.valeur !== undefined ? <>{fr(v.valeur)}<i> {unite}</i></> : (v.mention ?? "—")}
        {ecart && <span className="plu-ecart">la fiche porte {ecart}</span>}
      </div>
      <div className="d">
        {v.valeur !== undefined && v.mention && <p className="plu-regle"><b>{v.mention}</b></p>}
        {v.regle && <p className="plu-regle">{v.regle}</p>}
        <Extraits extraits={v.extraits} reglement={reglement} />
        {/* Sans chiffre mais avec un extrait (« non réglementée »), il n'y a rien à recouper. */}
        {(v.valeur !== undefined || v.extraits.length === 0) && <p className={`plu-ctl ${c.ton}`}>{c.texte}</p>}
      </div>
    </div>
  );
}

export function LecturePluIa({ immeubleId, im, actuel, localise, onReprendre }: {
  immeubleId: string;
  im: Record<string, unknown>;
  /** Ce que portent les quatre cases en ce moment (saisie en cours comprise). */
  actuel: CasesPlu;
  /** L'adresse du bien est-elle géocodée ? Sans point, pas de zonage. */
  localise: boolean;
  onReprendre: (cases: CasesPlu) => void;
}) {
  const { nom } = useSession();
  const servie = useMemo(() => lectureDe(im), [im]);
  const [lecture, setLecture] = useState<LecturePlu | null>(servie);
  const [enCours, setEnCours] = useState(false);
  const [secondes, setSecondes] = useState(0);
  const [erreur, setErreur] = useState<string | null>(null);
  const [repris, setRepris] = useState(false);
  const depart = useRef(0);

  useEffect(() => { setLecture(servie); }, [servie]);
  useEffect(() => {
    if (!enCours) return;
    const t = setInterval(() => setSecondes(Math.round((Date.now() - depart.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [enCours]);

  const lancer = async () => {
    setErreur(null); setRepris(false); setSecondes(0);
    depart.current = Date.now();
    setEnCours(true);
    try {
      const r = await fetch("/api/plu-ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ immeuble: immeubleId, par: nom }),
      });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; message?: string; lecture?: LecturePlu } | null;
      if (j?.ok && j.lecture) setLecture(j.lecture);
      else setErreur(j?.message ?? (r.status === 504 ? "La lecture a dépassé le temps accordé : réessayez." : `La lecture a échoué (${r.status}).`));
    } catch {
      setErreur("La lecture a été interrompue (connexion perdue ou page fermée) : réessayez.");
    } finally {
      setEnCours(false);
    }
  };

  const attente = enCours && (
    <p className="plu-attente">
      <span className="plu-tourne" aria-hidden /> Lecture du règlement en cours… {Math.floor(secondes / 60)}:{String(secondes % 60).padStart(2, "0")}
      <i> — comptez une à deux minutes ; gardez cette page ouverte.</i>
    </p>
  );

  if (!lecture) {
    return (
      <div className="plu-ia vide">
        <div className="plu-tete">
          <div>
            <b>Faire lire le règlement par l&apos;IA</b>
            <p>
              La zone et son type sont pris au Géoportail de l&apos;urbanisme. L&apos;emprise et la hauteur sont lues dans le
              règlement, chacune avec l&apos;extrait qui la justifie et la page où le retrouver. Rien n&apos;est enregistré sans vous.
            </p>
          </div>
          <button type="button" className="terr-auto plu-go" disabled={enCours || !localise} onClick={lancer}>
            Lire le règlement
          </button>
        </div>
        {!localise && <p className="plu-ctl voir">L&apos;adresse du bien n&apos;est pas localisée : renseignez-la d&apos;abord plus haut.</p>}
        {attente}
        {erreur && <p className="plu-ctl non">{erreur}</p>}
      </div>
    );
  }

  const z = lecture.zone;
  const { cases, ecarts } = propositions(lecture, actuel);
  const ecartDe = (k: keyof CasesPlu) => ecarts.find((e) => e.case === k)?.fiche;
  const aReprendre = (["zone", "type", "hauteur", "emprise"] as const).some((k) => cases[k] !== actuel[k]);
  const lien = z.reglement ? `${z.reglement}${z.page ? `#page=${z.page}` : ""}` : undefined;

  return (
    <div className="plu-ia">
      <div className="plu-tete">
        <div>
          <b>Lecture du règlement par l&apos;IA</b>
          <p>
            {[moment(lecture.fait_le) && `Faite le ${moment(lecture.fait_le)}`, lecture.par && `par ${lecture.par}`].filter(Boolean).join(" ")}
            {z.document && <> · {z.document}{z.approuve ? `, en vigueur depuis le ${jour(z.approuve)}` : ""}</>}
            {lien && <> · <a href={lien} target="_blank" rel="noreferrer">ouvrir le règlement ↗</a></>}
          </p>
        </div>
        <button type="button" className="fadd" disabled={enCours} onClick={lancer}>Relancer la lecture</button>
      </div>
      {attente}
      {erreur && <p className="plu-ctl non">{erreur}</p>}

      <div className="plu-l">
        <div className="k">Zone</div>
        <div className="v">{z.zone}{ecartDe("zone") && <span className="plu-ecart">la fiche porte {ecartDe("zone")}</span>}</div>
        <div className="d">
          {z.intitule && <p className="plu-regle">{z.intitule}</p>}
          <p className="plu-src">Géoportail de l&apos;urbanisme, au point de l&apos;adresse — donnée officielle, sans IA.</p>
        </div>
      </div>
      <div className="plu-l">
        <div className="k">Type de zone</div>
        <div className={`v${z.type ? "" : " vide"}`}>{z.type ?? "—"}</div>
        <div className="d">
          <p className="plu-src">
            {z.code ? `Code « ${z.code} » du plan de zonage (Géoportail de l'urbanisme).` : "Le Géoportail ne donne pas le type de cette zone."}
            {actuel.type.trim() && z.type && actuel.type.trim().toLowerCase() !== z.type.toLowerCase()
              ? ` La fiche porte « ${actuel.type.trim()} », plus précis : il est gardé.` : ""}
          </p>
        </div>
      </div>
      <LigneLue titre="Emprise max" v={lecture.emprise} unite="%" reglement={z.reglement} ecart={ecartDe("emprise")} />
      <LigneLue titre="Hauteur max" v={lecture.hauteur} unite="m" reglement={z.reglement} ecart={ecartDe("hauteur")} />

      {lecture.reserve && <p className="plu-reserve"><b>À savoir avant de reprendre :</b> {lecture.reserve}</p>}

      {lecture.a_savoir.length > 0 && (
        <div className="plu-plus">
          <b>Ce que disent aussi ces pages</b>
          <ul>
            {lecture.a_savoir.map((p, i) => (
              <li key={i}>
                {p.texte}
                <Extraits extraits={p.extraits} reglement={z.reglement} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {lecture.servitudes.length > 0 && (
        <div className="plu-plus">
          <b>Ce qui couvre aussi l&apos;adresse, d&apos;après le Géoportail</b>
          <ul className="court">{lecture.servitudes.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      )}

      <div className="plu-pied">
        <span>
          {lecture.pages_lues.length > 0
            ? `Pages lues par l'IA : ${ecrirePlages(lecture.pages_lues)}${lecture.pages_total ? ` (sur ${lecture.pages_total})` : ""}.`
            : "Le règlement n'a pas été lu par l'IA."}
          {" "}Rien n&apos;est enregistré tant que vous n&apos;avez pas cliqué « Enregistrer ».
        </span>
        <button type="button" className="savebar-go" disabled={!aReprendre || enCours}
          onClick={() => { onReprendre(cases); setRepris(true); }}>
          {repris && !aReprendre ? "Valeurs reprises" : aReprendre ? "Reprendre ces valeurs" : "Les cases portent déjà ces valeurs"}
        </button>
      </div>
    </div>
  );
}
