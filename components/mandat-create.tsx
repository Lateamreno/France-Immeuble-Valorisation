"use client";

/**
 * « Ajouter un mandat » — un bouton, plus une modale (retour #286).
 *
 * MAV : « là on me demande de mettre le mandant quand j'ouvre la modale de
 * création de mandat, et je peux modifier le champ : cela ne devrait pas être
 * possible. On pourrait même directement passer à la page mandat sans avoir
 * besoin de cette modale, c'est des clics en trop vu que tout peut se faire
 * dans la page suivante. »
 *
 * Il a raison sur les deux points, et le second règle le premier. La modale
 * redemandait quatre choses que l'écran d'après sait poser mieux — et le
 * mandant, elle le laissait retaper à la main, si bien qu'on pouvait signer un
 * mandat au nom de quelqu'un qui n'était pas le propriétaire de la fiche. Le
 * mandat naît donc du dossier : type de vente, mandant = propriétaire, objet =
 * l'immeuble. Tout se corrige ensuite dans la page, là où c'est visible et
 * relié à la fiche contact.
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BienData } from "@/lib/bubble/server";
import { createMandat } from "@/lib/bo/actions";

const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));

export function AddMandatButton({ b }: { b: BienData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const immeubleId = String(b.im._id);
  const c = b.proprietaire;

  const prenom = S(c?.["prénom"]);
  const nom = S(c?.nom);
  const societe = S(c?.entreprise_nom);
  /* Un propriétaire enregistré sous une raison sociale et sans nom de personne
     est une société : partir de « personne physique » obligerait à tout
     reprendre à la main dès la première ligne du mandat. */
  const morale = !prenom && !nom && !!societe;

  const creer = () =>
    start(async () => {
      const id = await createMandat(immeubleId, String(b.im.AGENT ?? ""), {
        Type: "Vente",
        Type_personne: morale ? "Personne morale" : "Personne physique",
        prenom_m1: morale ? undefined : prenom || undefined,
        nom_m1: morale ? undefined : nom || undefined,
        raison_sociale: morale ? societe || undefined : undefined,
      });
      router.push(`/bien/${immeubleId}/mandat/${id}`);
    });

  return (
    <button
      className="fbtn" type="button" disabled={pending}
      style={{ margin: "0 auto 14px", display: "flex", ...(pending ? { opacity: 0.5 } : {}) }}
      onClick={creer}
    >
      {pending ? "Création…" : "+ Ajouter un mandat"}
    </button>
  );
}
