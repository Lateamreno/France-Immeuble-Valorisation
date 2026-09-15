"use client";

/**
 * Les biens à proposer à une recherche (retour #331).
 *
 * MAV : « les pastilles de notification qui s'affichent rouge dans une
 * recherche, c'est parce qu'un immeuble correspondant à la recherche n'a pas
 * encore été proposé à l'acquéreur. Si on clique sur la pastille on voit les
 * modales des biens concernés et on peut les sélectionner soit :
 *   · pour lui envoyer par e-mail, auquel cas ça crée la proposition […] ;
 *   · pour dire que cela ne correspond pas — là ça devrait nous ouvrir une
 *     ligne par dossier et on écrit pourquoi ça correspond pas avant
 *     d'enregistrer […] ;
 *   · pour dire qu'on a déjà envoyé. Dans ce cas ça crée la proposition et ça
 *     demande si on a eu un retour. »
 *
 * Trois issues, une seule règle : chacune laisse une trace. Un bien écarté
 * sans proposition remonterait dans la pastille le lendemain et l'agent
 * referait le même arbitrage — c'est exactement ce qu'on veut arrêter.
 *
 * Rien ne part d'ici : l'e-mail est rédigé et rangé sur la proposition,
 * l'agent l'envoie. Doctrine maison, validation humaine avant tout envoi.
 *
 * Le panneau ne se ferme pas entre deux décisions (#332) : « chaque fois qu'on
 * fait un choix ça ferme pas la modale car il reste d'autres dossiers, ça
 * enlève juste les dossiers traités. »
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { APropositions, BienAProposer } from "@/lib/bubble/server";
import { chargerAProposer, traiterAProposer } from "@/lib/bo/actions";

type Mode = "envoyer" | "ne_correspond_pas" | "deja_envoye";

const MODES: { cle: Mode; titre: string; aide: string }[] = [
  { cle: "envoyer", titre: "Envoyer par e-mail",
    aide: "Le dernier dossier en pièce jointe, le message rédigé — vous relisez et vous envoyez." },
  { cle: "ne_correspond_pas", titre: "Ne correspond pas",
    aide: "Une ligne par bien pour dire pourquoi. La proposition est créée puis refusée avec ce motif." },
  { cle: "deja_envoye", titre: "Déjà envoyé",
    aide: "La proposition est créée telle qu'elle aurait dû l'être, et on note s'il y a eu un retour." },
];

/** L'objet et le corps de l'e-mail, selon qu'on envoie un dossier ou plusieurs. */
function redaction(biens: BienAProposer[], nom?: string) {
  const civil = nom ? `Bonjour ${nom},` : "Bonjour,";
  if (biens.length === 1) {
    const b = biens[0];
    return {
      objet: `Immeuble à vendre — ${b.libelle}`,
      message:
        `${civil}\n\n` +
        `Je vous adresse un immeuble qui correspond à votre recherche : ${b.libelle}` +
        `${b.prix ? `, ${b.prix} HAI` : ""}${b.renta ? `, ${b.renta} de rendement` : ""}` +
        `${b.surface ? `, ${b.surface}` : ""}.\n\n` +
        `Le dossier complet est en pièce jointe. Je reste à votre disposition pour organiser une visite.\n\n` +
        `Bien à vous,`,
    };
  }
  /* Retour #331 — « quand y a plusieurs dossiers à envoyer dans un e-mail, ça
     change le titre de l'objet et le texte devient plus court et récapitule en
     une ligne chaque dossier. » Un message long répété n fois ne se lit pas ;
     une liste, si. */
  const lignes = biens.map((b) =>
    `· ${b.libelle}${b.prix ? ` — ${b.prix} HAI` : ""}${b.renta ? ` — ${b.renta}` : ""}${b.surface ? ` — ${b.surface}` : ""}`,
  );
  return {
    objet: `${biens.length} immeubles à vendre correspondant à votre recherche`,
    message:
      `${civil}\n\n` +
      `Voici ${biens.length} immeubles qui correspondent à votre recherche :\n\n` +
      `${lignes.join("\n")}\n\n` +
      `Les dossiers complets sont en pièce jointe. Dites-moi ceux qui vous intéressent.\n\n` +
      `Bien à vous,`,
  };
}

export function PanneauAProposer({
  rechercheId, agentId, onFermer,
}: {
  rechercheId: string;
  agentId?: string;
  onFermer: () => void;
}) {
  const [data, setData] = useState<APropositions | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  /** Les biens déjà traités dans cette session : ils quittent la liste (#332). */
  const [traites, setTraites] = useState<string[]>([]);
  const [choisis, setChoisis] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode | null>(null);
  const [pending, start] = useTransition();

  /* Champs propres à chaque issue.

     L'objet et le message suivent la sélection tant que l'agent n'y a pas
     touché : cocher un deuxième bien doit réécrire le récapitulatif. `null`
     veut dire « pas encore touché » — c'est plus sûr que de comparer le texte
     au texte servi, qui obligeait à deviner qui l'avait écrit. */
  const [objetSaisi, setObjetSaisi] = useState<string | null>(null);
  const [messageSaisi, setMessageSaisi] = useState<string | null>(null);
  const [motifs, setMotifs] = useState<Record<string, string>>({});
  const [retour, setRetour] = useState<"aucun" | "interesse" | "refus">("aucun");
  const [retourTexte, setRetourTexte] = useState("");

  useEffect(() => {
    let vivant = true;
    chargerAProposer(rechercheId)
      .then((d) => { if (vivant) setData(d); })
      .catch(() => { if (vivant) setErreur("Impossible de charger les biens à proposer."); });
    return () => { vivant = false; };
  }, [rechercheId]);

  const restants = useMemo(
    () => (data?.biens ?? []).filter((b) => !traites.includes(b.id)),
    [data, traites],
  );
  const selection = useMemo(
    () => restants.filter((b) => choisis.includes(b.id)),
    [restants, choisis],
  );

  const servi = useMemo(
    () => redaction(selection, data?.contact?.nom),
    [selection, data?.contact?.nom],
  );
  const objet = objetSaisi ?? servi.objet;
  const message = messageSaisi ?? servi.message;

  const cocher = (id: string) =>
    setChoisis((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const valider = () => {
    if (!mode || selection.length === 0) return;
    start(async () => {
      const ids = selection.map((b) => b.id);
      if (mode === "envoyer") {
        await traiterAProposer(rechercheId, ids,
          { mode: "envoyer", objet, message, email: data?.contact?.email }, agentId);
      } else if (mode === "ne_correspond_pas") {
        await traiterAProposer(rechercheId, ids, { mode: "ne_correspond_pas", motifs }, agentId);
      } else {
        await traiterAProposer(rechercheId, ids, {
          mode: "deja_envoye",
          retour: retour === "aucun" ? undefined : {
            statut: retour === "refus" ? "Refusée (sans offre)" : "Intéressé",
            commentaire: retourTexte,
          },
        }, agentId);
      }
      /* On retire les traités et on garde le panneau ouvert : il reste souvent
         d'autres biens, et les rouvrir un par un est le travail qu'on
         supprime. */
      setTraites((t) => [...t, ...ids]);
      setChoisis([]);
      setMode(null);
      setObjetSaisi(null);
      setMessageSaisi(null);
      setMotifs({});
      setRetour("aucun");
      setRetourTexte("");
    });
  };

  return (
    <div className="modal-ov" onClick={onFermer}>
      <div className="modal lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          {data?.contact?.nom ? `À proposer à ${data.contact.nom}` : "Biens à proposer"}
          <button type="button" onClick={onFermer}>✕</button>
        </div>

        <div className="modal-b">
          {erreur && <div className="warnbox" style={{ color: "var(--red)", borderColor: "var(--red)" }}>{erreur}</div>}
          {!data && !erreur && <div className="fempty">Recherche des immeubles qui correspondent…</div>}

          {data && restants.length === 0 && (
            <div className="fempty">
              {traites.length > 0
                ? `${traites.length} bien${traites.length > 1 ? "s" : ""} traité${traites.length > 1 ? "s" : ""}. Plus rien à proposer sur cette recherche.`
                : "Rien de nouveau : tout ce qui correspond lui a déjà été envoyé."}
            </div>
          )}

          {restants.length > 0 && (
            <>
              <div className="apr-barre">
                <b>{restants.length} bien{restants.length > 1 ? "s" : ""} à proposer</b>
                <span style={{ flex: 1 }} />
                <button type="button" className="fadd"
                  onClick={() => setChoisis(restants.map((b) => b.id))}>Tout cocher</button>
                <button type="button" className="fadd"
                  disabled={choisis.length === 0} onClick={() => setChoisis([])}>Tout décocher</button>
              </div>

              <div className="apr-liste">
                {restants.map((b) => (
                  <label key={b.id} className={`apr${choisis.includes(b.id) ? " on" : ""}`}>
                    <input type="checkbox" checked={choisis.includes(b.id)} onChange={() => cocher(b.id)} />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {b.photoUrl ? <img src={b.photoUrl} alt="" /> : <span className="apr-vide" />}
                    <span className="apr-txt">
                      <b>{b.libelle}</b>
                      <span>
                        {[b.prix && `${b.prix} HAI`, b.surface, b.occupation && `${b.occupation} occupé`, b.renta]
                          .filter(Boolean).join(" · ") || "Chiffres non renseignés"}
                      </span>
                      <em>
                        {b.destinations.join(", ") || "Destination non précisée"}
                        {b.dossier
                          ? ` · dossier V${b.dossier.version} en pièce jointe`
                          : " · aucun dossier généré"}
                      </em>
                    </span>
                    <Link className="apr-lien" href={`/bien/${b.id}`} target="_blank"
                      onClick={(e) => e.stopPropagation()}>Fiche ↗</Link>
                  </label>
                ))}
              </div>

              <span className="mlab">Que fait-on de {selection.length > 0 ? `ces ${selection.length}` : "ces"} bien{selection.length > 1 ? "s" : ""} ?</span>
              <div className="mrow" style={{ flexWrap: "wrap" }}>
                {MODES.map((m) => (
                  <button key={m.cle} type="button" className={`mopt${mode === m.cle ? " on" : ""}`}
                    disabled={selection.length === 0} title={m.aide}
                    onClick={() => setMode(m.cle)}>{m.titre}</button>
                ))}
              </div>
              {mode && <p className="rm-aide">{MODES.find((m) => m.cle === mode)?.aide}</p>}

              {mode === "envoyer" && (
                <>
                  {!data?.contact?.email && (
                    <p className="rm-avert">
                      Cet acquéreur n&apos;a pas d&apos;adresse e-mail sur sa fiche : la proposition
                      sera créée, mais il n&apos;y aura personne à qui envoyer.
                    </p>
                  )}
                  {selection.some((b) => !b.dossier) && (
                    <p className="rm-avert">
                      {selection.filter((b) => !b.dossier).length} bien(s) sélectionné(s) n&apos;ont
                      pas de dossier : l&apos;e-mail partira sans pièce jointe pour ceux-là.
                    </p>
                  )}
                  <span className="mlab">Objet</span>
                  <input className="min" value={objet} onChange={(e) => setObjetSaisi(e.target.value)} />
                  <span className="mlab">Message</span>
                  <textarea className="min" rows={9} value={message}
                    onChange={(e) => setMessageSaisi(e.target.value)} />
                </>
              )}

              {mode === "ne_correspond_pas" && (
                <div className="apr-motifs">
                  {selection.map((b) => (
                    <label key={b.id}>
                      <b>{b.libelle}</b>
                      <input className="min" placeholder="Pourquoi ça ne correspond pas…"
                        value={motifs[b.id] ?? ""}
                        onChange={(e) => setMotifs({ ...motifs, [b.id]: e.target.value })} />
                    </label>
                  ))}
                </div>
              )}

              {mode === "deja_envoye" && (
                <>
                  <span className="mlab">A-t-on eu un retour ?</span>
                  <div className="mrow">
                    {([["aucun", "Pas encore"], ["interesse", "Intéressé"], ["refus", "Refus"]] as const)
                      .map(([k, l]) => (
                        <button key={k} type="button" className={`mopt${retour === k ? " on" : ""}`}
                          onClick={() => setRetour(k)}>{l}</button>
                      ))}
                  </div>
                  {retour !== "aucun" && (
                    <>
                      <span className="mlab">Ce qu&apos;il a dit</span>
                      <input className="min" value={retourTexte}
                        onChange={(e) => setRetourTexte(e.target.value)}
                        placeholder={retour === "refus" ? "Motif du refus…" : "Ce qu'il retient…"} />
                    </>
                  )}
                  {retour === "aucun" && (
                    <p className="rm-aide">
                      La proposition reste ouverte, comme toutes celles en attente de réponse :
                      elle rejoindra les relances.
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <div className="modal-f">
          {traites.length > 0 && (
            <span className="apr-fait">
              {traites.length} traité{traites.length > 1 ? "s" : ""}
            </span>
          )}
          <span style={{ flex: 1 }} />
          <button className="fadd" type="button" onClick={onFermer}>Fermer</button>
          <button className="kgo" type="button"
            disabled={pending || !mode || selection.length === 0}
            style={pending || !mode || selection.length === 0 ? { opacity: 0.5 } : undefined}
            onClick={valider}>
            <span className="ch">›</span>{" "}
            {pending ? "Enregistrement…"
              : mode === "envoyer" ? `Créer ${selection.length} proposition${selection.length > 1 ? "s" : ""}`
              : mode === "ne_correspond_pas" ? "Enregistrer les motifs"
              : mode === "deja_envoye" ? "Enregistrer"
              : "Choisissez une action"}
          </button>
        </div>
      </div>
    </div>
  );
}
