"use client";

/* La carte d'une recherche — partagée par l'écran Recherches et l'onglet
 * Recherches de la fiche contact (retours #116, #117, #119). Une seule
 * définition : les deux écrans ne peuvent pas diverger. */

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RechercheCard } from "@/lib/bubble/server";
import { VignetteContact } from "@/components/vignette-contact";
import { Modale } from "@/components/modale";
import { Avatar } from "@/components/avatar";
import { Champ } from "@/components/champ";
import { autresRecherchesEnCours, mettreRecherchesEnAttente, reactiverRecherche } from "@/lib/bo/actions";

/* Les quatre destinations du BO, dans son ordre. Un picto éteint dit « pas
   recherché » — l'absence de picto ne dirait rien du tout. */
export const DESTINATIONS: { cle: string; titre: string; d: React.ReactNode }[] = [
  { cle: "Logement", titre: "Logement", d: <path d="M4 11 12 4l8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" /> },
  { cle: "Parking", titre: "Parking", d: <path d="M5 11.5 6.4 7.4A2 2 0 0 1 8.3 6h7.4a2 2 0 0 1 1.9 1.4L19 11.5V17h-2.5v-1.6h-9V17H5zM7.4 14a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4zm9.2 0a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4z" /> },
  { cle: "Commerce", titre: "Commerce", d: <path d="M4 7h16l-1 3.2a2.4 2.4 0 0 1-4.6.3 2.4 2.4 0 0 1-4.8 0 2.4 2.4 0 0 1-4.6-.3zM5.5 12.6V19a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-6.4" /> },
  { cle: "Bureau", titre: "Bureau", d: <path d="M4 20V8.6a1 1 0 0 1 .6-.9l6-2.6a1 1 0 0 1 1.4.9V20M12 20V11h7a1 1 0 0 1 1 1v8M7 10.5h1.6M7 13.6h1.6M7 16.7h1.6M15 14h2M15 17h2" /> },
];

/**
 * Une puce de critère : grisée avec son intitulé quand rien n'est renseigné.
 *
 * Le marqueur « € » ne sort que sur une puce VIDE (retour #351 : « mets
 * toujours les unités à la FIN des chiffres »). Rempli, le budget se lit déjà
 * « 800 000 € à 2 000 000 € » : le € de tête en faisait un troisième, posé du
 * mauvais côté.
 */
export function Puce({ label, valeur, euro }: { label: string; valeur?: string; euro?: boolean }) {
  return (
    <span className={`rc-puce${valeur ? " on" : ""}`}>
      {euro && !valeur && <b>€</b>}
      {valeur ?? label}
    </span>
  );
}

export function CarteRecherche({
  r, choisi, onCocher, onDetail, onAProposer, onModifier,
  /** Sur la fiche contact, le nom de l'acquéreur est déjà dans l'en-tête. */
  sansContact = false,
  /** Mention posée à droite des destinations (« Mandat de recherche actif »). */
  mention,
}: {
  r: RechercheCard;
  choisi?: boolean;
  onCocher?: (id: string) => void;
  onDetail: (r: RechercheCard) => void;
  /** Retour #331 : la pastille ouvre les biens qu'on pourrait lui envoyer. */
  onAProposer?: (r: RechercheCard) => void;
  /** Retour #330 : cliquer la recherche ouvre la modale qui la modifie. */
  onModifier?: (r: RechercheCard) => void;
  sansContact?: boolean;
  mention?: string;
}) {

  return (
    <div className="rc">
      {onCocher && (
        <label className="rc-cocher">
          <input type="checkbox" checked={!!choisi} onChange={() => onCocher(r.id)} />
        </label>
      )}

      {/* Colonne de gauche : le compteur d'immeubles à proposer, les jumelles,
          puis le commercial. */}
      <div className="rc-gauche">
        <button
          type="button"
          className={`rc-cpt${r.aProposer > 0 ? " chaud" : ""}`}
          title={r.aProposer > 0
            ? `${r.aProposer} immeuble(s) en mandat correspondent et ne lui ont jamais été envoyés`
            : "Rien de nouveau à lui proposer"}
          onClick={() => (onAProposer ?? onDetail)(r)}
        >
          {r.aProposer}
        </button>
        <span className="rc-jum">
          <svg viewBox="0 0 24 24"><circle cx="7" cy="14" r="3.6" /><circle cx="17" cy="14" r="3.6" /><path d="M7 10.4V6h3.4M17 10.4V6h-3.4M10.6 14h2.8" /></svg>
        </span>
        <Avatar initiales={r.agent} couleur={r.agentCouleur} />
      </div>

      <div className="rc-corps">
        <div className="rc-ligne1">
          {/* Retour #330 — « il faut qu'en cliquant sur une recherche on
              puisse la modifier avec le popup qui s'ouvre. » La carte n'avait
              aucune prise : on la lisait, on ne la corrigeait pas. C'est son
              titre — le secteur — qui ouvre la modale ; le reste de la carte
              garde ses gestes propres (la pastille, le contact, les détails). */}
          {onModifier ? (
            <button type="button" className="rc-lieux modif" onClick={() => onModifier(r)}
              title="Modifier cette recherche">
              {r.lieux.slice(0, 6).join(", ")}
              {r.lieux.length > 6 && <i> +{r.lieux.length - 6}</i>}
              <svg viewBox="0 0 24 24" aria-hidden><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M14 6l4 4" /></svg>
            </button>
          ) : (
            <span className="rc-lieux">
              {r.lieux.slice(0, 6).join(", ")}
              {r.lieux.length > 6 && <i> +{r.lieux.length - 6}</i>}
            </span>
          )}
          <span style={{ flex: 1 }} />
          {sansContact ? null : r.contact ? (
            /* La vignette partagée (retour du 24/09), avec la classe de
               l'acquéreur dans la puce. */
            <VignetteContact v={r.contact} />
          ) : (
            <span className="rc-orphelin">
              <em>{[r.orphelin?.email, r.orphelin?.tel].filter(Boolean).join(" · ") || "Sans coordonnées"}</em>
              <Link className="rc-creer" href="/contacts">⚠ Créer un contact</Link>
            </span>
          )}
        </div>

        <div className="rc-ligne2">
          <span className="rc-dest">
            {DESTINATIONS.map((d) => (
              <i key={d.cle} className={r.destinations.includes(d.cle) ? "on" : undefined} title={d.titre}>
                <svg viewBox="0 0 24 24">{d.d}</svg>
              </i>
            ))}
          </span>
          {r.commentaire && (
            <button type="button" className="rc-details" onClick={() => onDetail(r)}>
              <svg viewBox="0 0 24 24"><path d="M12 3C6.8 3 2.6 6.3 2.6 10.4c0 2.3 1.3 4.4 3.4 5.7-.2 1.3-.9 2.5-1.9 3.4 1.9 0 3.7-.7 5-1.9.9.2 1.8.3 2.9.3 5.2 0 9.4-3.3 9.4-7.5S17.2 3 12 3z" /></svg>
              Voir les détails
            </button>
          )}
          {mention && <span className="rc-mention">● {mention}</span>}
          {!mention && r.attente && (
            <span className="rc-mention att">● En attente{r.attente.fin ? ` jusqu'au ${r.attente.fin}` : ""}</span>
          )}
        </div>

        <div className="rc-ligne3">
          <span className="rc-cible">
            <svg viewBox="0 0 24 24"><path d="M4 18 10 11l4 4 6-8" /><path d="M20 7v5h-5" /></svg>
            {r.cible ?? "Type non précisé"}
          </span>
          <span style={{ flex: 1 }} />
          <Puce label="Surface" valeur={r.surface} />
          <Puce label="Occupation" valeur={r.occupation} />
          <Puce label="Budget" valeur={r.prix} euro />
          <Puce label="Rendement" valeur={r.renta} />
        </div>
      </div>
    </div>
  );
}

/** Le détail d'une recherche, en fenêtre. */
export function ModaleRecherche({
  detail, onClose, onAProposer, onModifier,
}: {
  detail: RechercheCard;
  onClose: () => void;
  onAProposer?: (r: RechercheCard) => void;
  onModifier?: (r: RechercheCard) => void;
}) {
  const router = useRouter();
  const [attente, setAttente] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Modale
      titre={<b>{detail.contact?.nom ?? "Recherche"} — {detail.cible ?? "Recherche"}</b>}
      onFermer={onClose}
      className="lieu-modal"
      pied={
        <>
          {/* MAV, 25/09 : la mise en attente d'une recherche, jusqu'à une
              date. Une recherche archivée ne se repousse pas, elle est finie. */}
          {detail.group === "en_cours" && (
            <button type="button" className="fadd" onClick={() => setAttente(true)}>Mettre en attente…</button>
          )}
          {detail.group === "en_attente" && (
            <button type="button" className="fadd" disabled={pending}
              onClick={() => start(async () => { await reactiverRecherche(detail.id, detail.contact?.id); router.refresh(); onClose(); })}>
              {pending ? "Réactivation…" : "Réactiver la recherche"}
            </button>
          )}
          <span style={{ flex: 1 }} />
          {onModifier && (
            <button type="button" className="fadd" onClick={() => onModifier(detail)}>
              Modifier la recherche
            </button>
          )}
          {detail.aProposer > 0 && (
            onAProposer ? (
              <button type="button" className="savebar-go" onClick={() => onAProposer(detail)}>
                <span className="ch">›</span> Voir les immeubles à proposer
              </button>
            ) : (
              <Link className="savebar-go" href={`/acheteurs?recherche=${detail.id}`}>
                <span className="ch">›</span> Voir les immeubles à proposer
              </Link>
            )
          )}
        </>
      }
    >
      <div className="rc-det">
        <b>Où</b><span>{detail.lieux.join(", ")}</span>
        <b>Destinations</b><span>{detail.destinations.join(", ") || "Toutes"}</span>
        <b>Surface</b><span>{detail.surface ?? "Non précisée"}</span>
        <b>Occupation</b><span>{detail.occupation ?? "Non précisée"}</span>
        <b>Budget</b><span>{detail.prix ?? "Non précisé"}</span>
        <b>Rendement</b><span>{detail.renta ?? "Non précisé"}</span>
        <b>À proposer</b>
        <span>
          {detail.aProposer > 0
            ? `${detail.aProposer} immeuble(s) en mandat correspondent et ne lui ont jamais été envoyés.`
            : "Rien de nouveau : tout ce qui correspond lui a déjà été envoyé."}
        </span>
        {detail.attente && (
          <>
            <b>En attente</b>
            <span>
              {detail.attente.fin ? `Jusqu'au ${detail.attente.fin}` : "Sans date"}
              {detail.attente.motif && ` — ${detail.attente.motif}`}
            </span>
          </>
        )}
      </div>
      {detail.commentaire && <p className="rc-com">{detail.commentaire}</p>}
      {attente && (
        <ModaleAttenteRecherche
          r={detail}
          onFermer={() => setAttente(false)}
          onFait={() => { setAttente(false); router.refresh(); onClose(); }}
        />
      )}
    </Modale>
  );
}

/** La date par défaut : dans trois mois, au format de la case `date`. */
function dansTroisMois() {
  const d = new Date();
  d.setMonth(d.getMonth() + 3);
  return d.toISOString().slice(0, 10);
}

const dateFr = (iso: string) => {
  const [a, m, j] = iso.split("-");
  return a && m && j ? `${j}/${m}/${a}` : iso;
};

/**
 * Mettre une recherche en attente — et, quand la personne en a d'autres en
 * cours, proposer de les repousser à la même date (MAV, 25/09 : « on peut
 * les cocher pour toutes les mettre en attente à la même date »).
 *
 * Deux temps dans la même fenêtre : la date et le motif d'abord, puis, une
 * fois la première recherche écrite, la liste des autres à cocher. Les cases
 * partent décochées : c'est un choix, pas un réflexe.
 */
export function ModaleAttenteRecherche({ r, onFermer, onFait }: {
  r: RechercheCard; onFermer: () => void; onFait: () => void;
}) {
  const [fin, setFin] = useState(dansTroisMois);
  const [motif, setMotif] = useState("");
  const [etape, setEtape] = useState<"date" | "autres">("date");
  const [autres, setAutres] = useState<{ id: string; libelle: string }[] | null>(null);
  const [coches, setCoches] = useState<Set<string>>(() => new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let vivant = true;
    autresRecherchesEnCours(r.id).then((l) => { if (vivant) setAutres(l); }).catch(() => { if (vivant) setAutres([]); });
    return () => { vivant = false; };
  }, [r.id]);

  const qui = r.contact?.nom ?? "Cette personne";
  const cocher = (id: string) => setCoches((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const valider = () =>
    start(async () => {
      const x = await mettreRecherchesEnAttente({ ids: [r.id], fin, motif, contactId: r.contact?.id });
      if (!x.ok) { setMsg(x.message); return; }
      if ((autres ?? []).length > 0) setEtape("autres");
      else onFait();
    });

  const validerAutres = () =>
    start(async () => {
      if (coches.size > 0) {
        const x = await mettreRecherchesEnAttente({ ids: [...coches], fin, motif, contactId: r.contact?.id });
        if (!x.ok) { setMsg(x.message); return; }
      }
      onFait();
    });

  return (
    <Modale
      titre={etape === "date" ? "Mettre la recherche en attente" : "Mettre d'autres recherches en attente ?"}
      onFermer={etape === "date" ? onFermer : onFait}
      largeur={520}
      pied={etape === "date" ? (
        <>
          <button type="button" className="fchip" onClick={onFermer}>Annuler</button>
          <button type="button" className="savebar-go" disabled={pending || !fin} onClick={valider}>
            {pending ? "Enregistrement…" : `Mettre en attente jusqu'au ${dateFr(fin)}`}
          </button>
        </>
      ) : (
        <>
          <button type="button" className="fchip" disabled={pending} onClick={onFait}>Non, seulement celle-ci</button>
          <button type="button" className="savebar-go" disabled={pending || coches.size === 0} onClick={validerAutres}>
            {pending ? "Enregistrement…" : `Mettre en attente ${coches.size > 1 ? `les ${coches.size} cochées` : "la recherche cochée"}`}
          </button>
        </>
      )}
    >
      {etape === "date" ? (
        <>
          <p className="rgl-aide">
            La recherche sort du « en cours » sans être archivée : elle reviendra à la date choisie.
            Aucun e-mail ne part.
          </p>
          <Champ libelle="Jusqu'au" capitales htmlFor="att-fin">
            <input id="att-fin" className="mi" type="date" value={fin} onChange={(e) => setFin(e.target.value)} />
          </Champ>
          <Champ libelle="Motif" capitales htmlFor="att-motif" aide="Facultatif — ce que la personne a dit">
            <input id="att-motif" className="mi" value={motif} placeholder="Budget bloqué jusqu'à la vente de…"
              onChange={(e) => setMotif(e.target.value)} />
          </Champ>
          {autres === null && <p className="rgl-aide">Lecture des autres recherches…</p>}
          {autres && autres.length > 0 && (
            <p className="rgl-aide">
              {qui} a {autres.length} autre{autres.length > 1 ? "s" : ""} recherche{autres.length > 1 ? "s" : ""} en cours :
              on vous proposera de les mettre en attente à la même date.
            </p>
          )}
        </>
      ) : (
        <>
          <p>
            <b>C&apos;est fait</b> : la recherche est en attente jusqu&apos;au <b>{dateFr(fin)}</b>.
            {" "}{qui} a {autres!.length} autre{autres!.length > 1 ? "s" : ""} recherche{autres!.length > 1 ? "s" : ""} en cours.
            Cochez celles à mettre en attente à la même date.
          </p>
          <ul className="att-liste">
            {autres!.map((a) => (
              <li key={a.id}>
                <label>
                  <input type="checkbox" checked={coches.has(a.id)} onChange={() => cocher(a.id)} />
                  <span>{a.libelle}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
      {msg && <p className="rgl-err">{msg}</p>}
    </Modale>
  );
}
