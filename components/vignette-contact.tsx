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
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/avatar";
import { Copier } from "@/components/copier";
import { FenetreRedaction } from "@/components/mails/redaction";
import { contexteRedaction } from "@/lib/bo/mails-actions";
import { chercherContacts, type ContactTrouve } from "@/lib/bo/actions";

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
  /** Classe A–D de l'acquéreur : dès qu'il en a une, elle s'affiche dans la
   *  puce (retour du 24/09 : « si c'est aussi un acquéreur tu mets sa vignette
   *  A B C ou D »). */
  note?: string;
  /** Agent immobilier : la silhouette change, « pour qu'on sache à qui on a
   *  affaire ». */
  estAgent?: boolean;
  /** L'agent France Immeuble qui suit la fiche : ses initiales, dans sa
   *  couleur, sous le picto de la carte. */
  agent?: { initiales: string; couleur?: string };
};

const IC_PERS = (
  <><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20c.7-4 3.6-5.6 6.5-5.6s5.8 1.6 6.5 5.6" /></>
);
/* La silhouette de l'agent immobilier — la même que dans les listes : un
   confrère ne se présente pas comme un client. */
const IC_AGENT = (
  <>
    <circle cx="12" cy="8.5" r="3.4" />
    <path d="M5.5 20.5c.7-4 3.6-5.6 6.5-5.6s5.8 1.6 6.5 5.6" />
    <path d="M6.6 7.4h4.2M13.2 7.4h4.2" />
    <circle cx="8.7" cy="8.2" r="2.1" /><circle cx="15.3" cy="8.2" r="2.1" />
  </>
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

type Contexte = Awaited<ReturnType<typeof contexteRedaction>> & { qui: ContactTrouve | null };

/**
 * Le corps de la carte de visite, partagé entre la fenêtre qui s'ouvre sous
 * la puce et la carte posée en place dans la liste des contacts (#401 bis).
 * Un seul JSX : si la carte change d'un côté, elle change de l'autre.
 *
 * `copier` : les boutons copier sont un geste de la puce (on vient chercher
 * une coordonnée), pas d'une liste qu'on parcourt — la carte en place s'en
 * passe. `insigne` : la classe A–D ; sous la puce elle est déjà dans la puce,
 * en place elle n'a que la carte pour se montrer, à côté du nom.
 */
function CorpsCarte({ v, fiche, copier, insigne }: { v: VignetteData; fiche: string; copier: boolean; insigne?: React.ReactNode }) {
  const picto = v.estAgent ? IC_AGENT : IC_PERS;
  return (
    <span className="vgn-card">
      {/* Le picto et le nom mènent à la fiche (#370). */}
      <span className="avc">
        <Link className={`av${v.estAgent ? " agent" : ""}`} href={fiche} title={v.estAgent ? "Agent immobilier — ouvrir la fiche" : "Ouvrir la fiche contact"}>
          <svg viewBox="0 0 24 24" aria-hidden>{picto}</svg>
        </Link>
        {/* L'agent qui suit la fiche, sous le picto (retour du 24/09). */}
        {v.agent && <Avatar initiales={v.agent.initiales} couleur={v.agent.couleur} titre="Agent qui suit la fiche" />}
      </span>
      <span className="txt">
        <span className="ligne">
          <Link className="nom" href={fiche} title="Ouvrir la fiche contact">{v.nom}</Link>
          {insigne}
          {copier && <Copier valeur={v.nom} petit cls="vgn-cop" titre="Copier le nom" />}
        </span>
        {v.qualite && <i>{v.qualite}</i>}
        {v.tel && (
          <span className="ligne">
            <span className="l">{v.tel}</span>
            {copier && <Copier valeur={v.tel} petit cls="vgn-cop" titre="Copier le numéro" />}
          </span>
        )}
        {v.email && (
          <span className="ligne">
            <span className="l mail">{v.email}</span>
            {copier && <Copier valeur={v.email} petit cls="vgn-cop" titre="Copier l'adresse" />}
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
  );
}

/**
 * La même carte, rendue en place — dans la liste des contacts (#401 bis :
 * « les fiches contact sont trop larges, ça bloque la lecture… mettre le
 * nouvel objet vignette de contact puisqu'il y a toutes les infos dessus »).
 * Sans puce ni fenêtre, sans Appeler / E-mail ni boutons copier. Toute la
 * carte ouvre la fiche ; le nom, le picto et les compteurs restent des liens
 * (un lien dans un lien n'est pas du HTML : la carte est un bloc qui navigue
 * au clic, et laisse passer les clics sur ses propres liens).
 */
export function CarteContact({ v, href }: { v: VignetteData; href: string }) {
  const router = useRouter();
  const ouvrir = (e: React.MouseEvent | React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest("a, button")) return;
    router.push(href);
  };
  return (
    <div
      className="cc-carte" role="link" tabIndex={0} title="Ouvrir la fiche contact"
      onClick={ouvrir}
      onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) ouvrir(e); }}
    >
      <CorpsCarte
        v={v} fiche={href} copier={false}
        insigne={v.note && /^[A-D]$/.test(v.note) ? <b className={`note n${v.note}`} title={`Classement acquéreur ${v.note}`}>{v.note}</b> : null}
      />
    </div>
  );
}

export function VignetteContact({
  v, nom, prefixe, badge, immeuble,
}: {
  /** La fiche du contact ; absente, la vignette n'est qu'un libellé. */
  v?: VignetteData;
  /** Nom à afficher quand il n'y a pas de fiche derrière. */
  nom?: string;
  /** Étiquette posée devant, comme dans le BO : « Mandant », « Propriétaire ». */
  prefixe?: string;
  /** Un insigne dans la puce (la classe A–D d'un acquéreur, par exemple). */
  badge?: React.ReactNode;
  /** L'immeuble dont on parle, pour le champ de fusion {{immeuble}} (#371). */
  immeuble?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [mail, setMail] = useState<Contexte | "chargement" | null>(null);
  const boite = useRef<HTMLSpanElement>(null);
  /* Une puce posée au bord droit d'une carte (écran Recherches) ouvrirait sa
     carte hors de l'écran : dans ce cas elle s'aligne à droite. */
  const [droite, setDroite] = useState(false);
  const pop = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ouvert || !pop.current) return;
    const r = pop.current.getBoundingClientRect();
    const deborde = r.right > window.innerWidth - 8;
    if (deborde !== droite) setDroite(deborde);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert]);

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
  const picto = v.estAgent ? IC_AGENT : IC_PERS;
  /* L'insigne : celui qu'on nous donne, sinon la classe de l'acquéreur. */
  const insigne = badge ?? (v.note && /^[A-D]$/.test(v.note) ? <b className={`note n${v.note}`}>{v.note}</b> : null);

  /* La rédaction s'ouvre dans le BO : on va chercher l'agent et ses messages
     types, puis la fenêtre flottante se pose en bas à droite. */
  const ecrire = () => {
    if (!v.email || mail) return;
    setOuvert(false);
    setMail("chargement");
    /* Retour #371 : les champs de fusion partent de la fiche du destinataire,
       qu'on va chercher en même temps que l'agent. */
    Promise.all([
      contexteRedaction(),
      chercherContacts(v.email).then((l) => l.find((c) => c.id === v.id) ?? l[0] ?? null).catch(() => null),
    ])
      .then(([c, qui]) => setMail({ ...c, qui }))
      .catch(() => setMail(null));
  };
  /* Les vignettes vivent parfois dans un lien (carte du tableau de bord) :
     un clic dedans ne doit pas suivre ce lien. */
  const isoler = (e: React.SyntheticEvent) => { e.stopPropagation(); if ("preventDefault" in e && (e.target as HTMLElement).tagName !== "A") e.preventDefault(); };

  return (
    <span className="vgn" ref={boite}>
      {prefixe && <i className="vgn-pre">{prefixe}</i>}
      <button
        type="button" className={`vgn-chip${ouvert ? " on" : ""}${v.estAgent ? " agent" : ""}`}
        aria-expanded={ouvert} onClick={(e) => { isoler(e); setOuvert((o) => !o); }}
        title={v.estAgent ? "Agent immobilier" : undefined}
      >
        <svg viewBox="0 0 24 24" aria-hidden>{picto}</svg>
        {libelle}
        {insigne}
      </button>

      {ouvert && (
        <span className={`vgn-pop${droite ? " droite" : ""}`} ref={pop} onClick={(e) => e.stopPropagation()}>
          <CorpsCarte v={v} fiche={fiche} copier />
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
          destinataire={mail.qui}
          immeuble={immeuble}
          onClose={() => setMail(null)}
        />,
        document.body,
      )}
    </span>
  );
}
