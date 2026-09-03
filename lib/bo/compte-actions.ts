"use server";

/**
 * L'espace client — activation, connexion, réponses de l'acquéreur.
 *
 * ## Deux principes qui expliquent presque tout le fichier
 *
 * **On ne dit jamais si un compte existe.** Ni à la connexion, ni au mot de
 * passe oublié : la réponse est la même dans les deux cas. Sans ça, le
 * formulaire devient un annuaire — on y teste des adresses jusqu'à trouver
 * lesquelles sont clientes de France Immeuble, ce qui est une information
 * commerciale en soi.
 *
 * **Rien ne s'auto-crée.** MAV ouvre les comptes depuis la fiche contact ;
 * personne ne s'inscrit tout seul. C'est la même doctrine que les envois : le
 * BO propose, l'agent décide.
 */

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  COOKIE_SESSION, clientConnecte, compteDuContact, compteParEmail, consommerJeton,
  correspond, ecrireRest, empreinte, fermerSession, lireJeton, motDePasseFaible,
  normaliseEmail, ouvrirSession, poserJeton, rest, type CompteClient,
} from "@/lib/bo/compte-client";
import type { Reponse } from "@/lib/bo/espace-modele";

/* ---------- Côté BO : ouvrir un compte ---------- */

/**
 * Ouvre (ou réactive) le compte d'un contact et rend le lien d'activation.
 *
 * Le lien vaut une semaine et ne sert qu'une fois. Il ne CONTIENT pas de mot de
 * passe : la personne choisit le sien, et nous ne l'avons jamais eu.
 */
export async function ouvrirCompteClient(
  contactId: string, email: string, agent?: string,
): Promise<{ ok: false; message: string } | { ok: true; lien: string; email: string }> {
  const propre = normaliseEmail(email);
  if (!propre.includes("@")) {
    return { ok: false, message: "Cette fiche contact n'a pas d'adresse e-mail." };
  }

  const existant = await compteParEmail(propre);
  let compte = existant;
  if (existant && existant.contact_id !== contactId) {
    /* L'adresse sert déjà à un autre contact : c'est un doublon de fiche, pas
       un second compte. On laisse l'agent trancher plutôt que de rattacher au
       hasard — deux personnes derrière une adresse, ça n'existe pas. */
    return {
      ok: false,
      message: "Cette adresse est déjà rattachée à une autre fiche contact. Fusionnez les fiches avant d'ouvrir l'espace.",
    };
  }
  if (!compte) {
    const cree = (await ecrireRest("fi_compte_client", "POST", [{
      email: propre, contact_id: contactId, cree_par: agent ?? null,
    }])) as CompteClient[];
    compte = cree[0];
  } else if (!compte.actif) {
    await ecrireRest(`fi_compte_client?id=eq.${compte.id}`, "PATCH", { actif: true });
  }

  const jeton = await poserJeton(compte!.id, "activation");
  revalidatePath(`/contact/${contactId}`);
  return { ok: true, email: propre, lien: `/espace/activer/${jeton}` };
}

/** Coupe l'accès : le compte reste, mais plus aucune session ne s'ouvre. */
export async function desactiverCompteClient(contactId: string) {
  const compte = await compteDuContact(contactId);
  if (!compte) return;
  await ecrireRest(`fi_compte_client?id=eq.${compte.id}`, "PATCH", { actif: false });
  await ecrireRest(`fi_session_client?compte_id=eq.${compte.id}`, "DELETE").catch(() => undefined);
  revalidatePath(`/contact/${contactId}`);
}

/* ---------- Côté client ---------- */

/** Le même message dans les deux cas : le formulaire n'est pas un annuaire. */
const REFUS: Reponse = { ok: false, message: "Adresse ou mot de passe incorrect." };

export async function connexion(email: string, motDePasse: string): Promise<Reponse> {
  const compte = await compteParEmail(email);
  /* On calcule quand même une empreinte sur un compte inconnu : sans ça, une
     adresse connue répondrait plus lentement qu'une inconnue, ce qui suffit à
     les distinguer. */
  const ok = compte?.actif
    ? await correspond(motDePasse, compte.secret)
    : await correspond(motDePasse, null);
  if (!compte || !compte.actif || !ok) return REFUS;

  const jeton = await ouvrirSession(compte.id);
  (await cookies()).set(COOKIE_SESSION, jeton, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: 30 * 86400,
  });
  await ecrireRest(`fi_compte_client?id=eq.${compte.id}`, "PATCH", {
    vu_le: new Date().toISOString(), connexions: compte.connexions + 1,
  }).catch(() => undefined);
  return { ok: true, message: "" };
}

export async function deconnexion() {
  const jar = await cookies();
  const jeton = jar.get(COOKIE_SESSION)?.value;
  if (jeton) await fermerSession(jeton);
  jar.delete(COOKIE_SESSION);
}

/**
 * Pose le mot de passe derrière un jeton d'activation ou de réinitialisation.
 *
 * Toutes les sessions en cours tombent : si quelqu'un d'autre était connecté
 * avec l'ancien mot de passe, changer le sien doit le mettre dehors.
 */
export async function poserMotDePasse(jeton: string, motDePasse: string): Promise<Reponse> {
  const j = await lireJeton(jeton);
  if (!j) {
    return { ok: false, message: "Ce lien n'est plus valable. Demandez-en un nouveau depuis la page de connexion." };
  }
  const faible = motDePasseFaible(motDePasse);
  if (faible) return { ok: false, message: faible };

  await ecrireRest(`fi_compte_client?id=eq.${j.compte_id}`, "PATCH", {
    secret: await empreinte(motDePasse),
    actif: true,
    active_le: new Date().toISOString(),
  });
  await consommerJeton(jeton);
  await ecrireRest(`fi_session_client?compte_id=eq.${j.compte_id}`, "DELETE").catch(() => undefined);

  const nouvelle = await ouvrirSession(j.compte_id);
  (await cookies()).set(COOKIE_SESSION, nouvelle, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: 30 * 86400,
  });
  return { ok: true, message: "" };
}

/**
 * Mot de passe oublié.
 *
 * Réponse identique que l'adresse existe ou non, et le lien part par e-mail —
 * jamais rendu à l'écran, sinon n'importe qui réinitialiserait n'importe quel
 * compte depuis le formulaire.
 */
export async function motDePasseOublie(email: string): Promise<Reponse> {
  const commun: Reponse = {
    ok: true,
    message: "Si un espace existe pour cette adresse, un lien vient d'y être envoyé. Pensez à regarder vos indésirables.",
  };
  const compte = await compteParEmail(email);
  if (!compte || !compte.actif) return commun;

  const jeton = await poserJeton(compte.id, "reinitialisation");
  const base = process.env.SITE_URL ?? "https://bo.france-immeuble.fr";
  try {
    const { envoyerMail, envoiPossible } = await import("@/lib/bo/mail");
    if (await envoiPossible()) {
      await envoyerMail({
        to: compte.email,
        subject: "Votre espace France Immeuble — nouveau mot de passe",
        text: [
          "Bonjour,",
          "",
          "Vous avez demandé à changer le mot de passe de votre espace France Immeuble.",
          `Cliquez sur ce lien, valable deux heures : ${base}/espace/activer/${jeton}`,
          "",
          "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe actuel reste valable.",
          "",
          "France Immeuble",
        ].join("\n"),
      });
    }
  } catch {
    /* Un envoi qui échoue ne doit rien révéler non plus : la réponse reste la
       même, et l'agent peut toujours rouvrir un accès depuis le BO. */
  }
  return commun;
}

/* ---------- Réponses de l'acquéreur ---------- */

export type ChoixAcquereur = "interesse" | "visite" | "pas_interesse";

const PHRASE: Record<ChoixAcquereur, string> = {
  interesse: "C'est noté — votre conseiller revient vers vous.",
  visite: "Demande de visite transmise. Votre conseiller vous rappelle pour convenir d'un créneau.",
  pas_interesse: "Merci de nous l'avoir dit : nous ne vous le représenterons pas.",
};

/**
 * L'acquéreur répond sur un bien qu'on lui a proposé.
 *
 * Un refus est un fait, pas une décision commerciale : il ferme la proposition
 * dans le BO tout de suite, exactement comme l'agent l'aurait fait au
 * téléphone. Un intérêt, lui, n'avance RIEN tout seul — il alerte l'agent, à
 * qui il revient de rappeler.
 */
export async function repondreProposition(
  propositionId: string, choix: ChoixAcquereur, mot: string,
): Promise<Reponse> {
  const compte = await clientConnecte();
  if (!compte) return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };
  if (!["interesse", "visite", "pas_interesse"].includes(choix)) {
    return { ok: false, message: "Réponse inconnue." };
  }

  const { fetchAll } = await import("@/lib/bubble/server");
  const props = await fetchAll("proposition", [
    { key: "_id", constraint_type: "equals", value: propositionId },
    { key: "ACHETEUR", constraint_type: "equals", value: compte.contact_id },
  ], 1).catch(() => [] as Record<string, unknown>[]);
  const p = props[0];
  if (!p) return { ok: false, message: "Ce bien ne fait pas partie de ceux qui vous ont été proposés." };

  const immeubleId = typeof p.IMMEUBLE === "string" ? p.IMMEUBLE : "";
  await ecrireRest("fi_reponse_proposition?on_conflict=proposition_id", "POST", [{
    proposition_id: propositionId,
    compte_id: compte.id,
    immeuble_id: immeubleId,
    reponse: choix,
    mot: mot.trim().slice(0, 2000) || null,
    le: new Date().toISOString(),
    traitee: false,
  }]).catch(async () => {
    /* Le serveur n'a pas accepté la fusion : on remplace la ligne existante. */
    await ecrireRest(
      `fi_reponse_proposition?proposition_id=eq.${encodeURIComponent(propositionId)}`,
      "PATCH",
      { reponse: choix, mot: mot.trim().slice(0, 2000) || null, le: new Date().toISOString(), traitee: false },
    );
  });

  if (choix === "pas_interesse") {
    const { setPropositionStatut } = await import("@/lib/bo/actions");
    await setPropositionStatut(immeubleId, propositionId, "refuser", "Refus signalé par l'acquéreur depuis son espace")
      .catch(() => undefined);
  }

  revalidatePath("/espace");
  if (immeubleId) revalidatePath(`/bien/${immeubleId}`);
  revalidatePath("/propositions");
  return { ok: true, message: PHRASE[choix] };
}

/** L'agent a traité la réponse : elle sort des alertes du BO. */
export async function marquerReponseTraitee(id: string, immeubleId: string) {
  await ecrireRest(`fi_reponse_proposition?id=eq.${id}`, "PATCH", { traitee: true });
  revalidatePath(`/bien/${immeubleId}`);
  revalidatePath("/propositions");
}

/** Les réponses jamais traitées, pour l'écran du BO. */
export async function reponsesEnAttente(): Promise<
  { id: string; proposition_id: string; immeuble_id: string; reponse: ChoixAcquereur; mot: string | null; le: string }[]
> {
  return rest(
    "fi_reponse_proposition?traitee=is.false&reponse=in.(interesse,visite)&select=*&order=le.desc&limit=100",
  );
}
