"use client";

/**
 * La vignette d'un contact (retours #205 et #370).
 *
 * MAV (#205) : « la petite vignette sur le nom du client qui est cliquable et
 * qui permet d'afficher ses coordonnées, son nombre d'immeubles et de
 * recherches, et quand on clique sur la fiche sauf sur le bouton appeler ou
 * email alors ça nous renvoie directement à la fiche contact du client. »
 *
 * MAV (#370) : « des boutons pour copier chaque ligne — le nom prénom, le
 * numéro de tel et l'adresse e-mail ; pour accéder à sa fiche, on clique sur
 * son nom ou son picto ; quand on clique sur sa recherche ou sur ses immeubles
 * on tombe sur sa fiche recherche ou immeubles ; le bouton e-mail ouvre un
 * popup pour lui écrire depuis le BO, réductible comme sur Gmail, avec
 * l'initiale du prénom et le nom du destinataire à la place de "Nouveau
 * message". On applique partout où il y a cette fiche. »
 *
 * D'où un composant seul dans son fichier plutôt qu'un bloc recopié : le jour
 * où la carte change, elle change partout. Règles tenues ici :
 *
 *   · le nom et le picto mènent à la fiche ; les compteurs mènent à l'onglet
 *     Immeubles ou Recherches de la fiche ; chaque ligne a son bouton copier ;
 *   · « Appeler » compose le numéro, « E-mail » ouvre la rédaction dans le BO,
 *     en fenêtre flottante — jamais le client mail du poste ;
 *   · elle s'ouvre au clic, se ferme à l'échappement, au clic dehors, ou en
 *     rouvrant la même ; sans contact rattaché, on rend le nom tel quel.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copier } from "@/components/copier";
import { FenetreRedaction } from "@/components/mails/redaction";
import { contexteRedaction } from "@/lib/bo/mails-actions";

export type VignetteData = {
  id: string;
  nom: string;
  /** Prénom et nom séparés, quand on les a : ils titrent la fenêtre d'e-mail. */
  prenom?: string;
  nomFamille?: string;
  qualite?: string;
  tel?: string;
  email?: string;
  immeubles: number;
  recherches: number;
};

const IC_PERS = (
  <><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20c.7-4 3.6-5.6 6.5-5.6s5.8 1.6 6.5 5.6" /></>
);

/** « S. TOURNUT » : l'initiale du prénom et le nom, pour titrer la fenêtre. */
export function initialeEtNom(v: { nom: string; prenom?: string; nomFamille?: string }) {
  let prenom = v.prenom ?? "";
  let nom = v.nomFamille ?? "";
  if (!prenom && !nom) {
    const mots = v.nom.replace(/^(M\.|Mme|Mlle|Monsieur|Madame|Mademoiselle)\s+/i, "").trim().split(/\s+/);
    if (mots.length > 1) { prenom = mots[0]; nom = mots.slice(1).join(" "); }
    else nom = mots[0] ?? "";
  }
  return [prenom ? `${prenom[0].toUpperCase()}.` : "", nom.toUpperCase()].filter(Boolean).join(" ") || v.nom;
}

type Contexte = Awaited<ReturnType<typeof contexteRedaction>>;

export function VignetteContact({
  v, nom, prefixe,
}: {
  /** La fiche du contact ; absente, la vignette n'est qu'un libellé. */
  v?: VignetteData;
  /** Nom à afficher quand il n'y a pas de fiche derrière. */
  nom?: string;
  /** Étiquette posée devant, comme dans le BO : « Mandant », « Propriétaire ». */
  prefixe?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [mail, setMail] = useState<Contexte | "chargement" | null>(null);
  const boite = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: MouseEvent) => {
      if (!boite.current?.contains(e.target as Node)) setOuvert(false);
    };
    const echap = (e: KeyboardEvent) => { if (e.key === "Escape") setOuvert(false); };
    document.addEventListener("mousedown", dehors);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("mousedown", dehors);
      document.removeEventListener("keydown", echap);
    };
  }, [ouvert]);

  const libelle = v?.nom || nom || "";
  if (!libelle) return null;

  if (!v) {
    return (
      <span className="vgn">
        {prefixe && <i className="vgn-pre">{prefixe}</i>}
        <span className="vgn-chip plat">
          <svg viewBox="0 0 24 24" aria-hidden>{IC_PERS}</svg>
          {libelle}
        </span>
      </span>
    );
  }

  const tel = v.tel?.replace(/[^\d+]/g, "");
  const fiche = `/contact/${v.id}`;

  /* La rédaction s'ouvre dans le BO : on va chercher l'agent et ses messages
     types, puis la fenêtre flottante se pose en bas à droite. */
  const ecrire = () => {
    if (!v.email || mail) return;
    setOuvert(false);
    setMail("chargement");
    contexteRedaction()
      .then((c) => setMail(c))
      .catch(() => setMail(null));
  };

  return (
    <span className="vgn" ref={boite}>
      {prefixe && <i className="vgn-pre">{prefixe}</i>}
      <button
        type="button" className={`vgn-chip${ouvert ? " on" : ""}`}
        aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)}
      >
        <svg viewBox="0 0 24 24" aria-hidden>{IC_PERS}</svg>
        {libelle}
      </button>

      {ouvert && (
        <span className="vgn-pop">
          <span className="vgn-card">
            {/* Le picto et le nom mènent à la fiche (#370). */}
            <Link className="av" href={fiche} title="Ouvrir la fiche contact">
              <svg viewBox="0 0 24 24" aria-hidden>{IC_PERS}</svg>
            </Link>
            <span className="txt">
              <span className="ligne">
                <Link className="nom" href={fiche} title="Ouvrir la fiche contact">{v.nom}</Link>
                <Copier valeur={v.nom} petit cls="vgn-cop" titre="Copier le nom" />
              </span>
              {v.qualite && <i>{v.qualite}</i>}
              {v.tel && (
                <span className="ligne">
                  <span className="l">{v.tel}</span>
                  <Copier valeur={v.tel} petit cls="vgn-cop" titre="Copier le numéro" />
                </span>
              )}
              {v.email && (
                <span className="ligne">
                  <span className="l mail">{v.email}</span>
                  <Copier valeur={v.email} petit cls="vgn-cop" titre="Copier l'adresse" />
                </span>
              )}
              {/* Les compteurs ouvrent l'onglet qui va avec (#370). */}
              <span className="cpt">
                <Link href={`${fiche}?onglet=immeubles`} title="Ses immeubles">
                  <svg viewBox="0 0 24 24" aria-hidden><path d="M5 2h11v19h3v2H4v-2h1z" /></svg>
                  {v.immeubles} immeuble{v.immeubles > 1 ? "s" : ""}
                </Link>
                <Link href={`${fiche}?onglet=recherches`} title="Ses recherches">
                  <svg viewBox="0 0 24 24" aria-hidden><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
                  {v.recherches} recherche{v.recherches > 1 ? "s" : ""}
                </Link>
              </span>
            </span>
          </span>
          <span className="vgn-act">
            <a href={tel ? `tel:${tel}` : undefined} className={tel ? "" : "off"}>
              <svg viewBox="0 0 24 24" aria-hidden><path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>
              Appeler
            </a>
            <button type="button" className={v.email ? "" : "off"} disabled={!v.email} onClick={ecrire}>
              <svg viewBox="0 0 24 24" aria-hidden><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 8 9 5 9-5" /></svg>
              E-mail
            </button>
          </span>
        </span>
      )}

      {mail && mail !== "chargement" && createPortal(
        <FenetreRedaction
          agent={mail.agent}
          modeles={mail.modeles}
          amorce={{ to: v.email ?? "", objet: "", corps: "" }}
          flottante={{ titre: initialeEtNom(v) }}
          onClose={() => setMail(null)}
        />,
        document.body,
      )}
    </span>
  );
}
