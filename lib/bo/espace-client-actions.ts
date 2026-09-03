"use server";

/**
 * Ce que le client peut faire — et rien d'autre.
 *
 * Toutes ces actions passent par `espace-anon`, donc par la clé publique et les
 * fonctions `ec_*`. Aucune ne connaît de nom de table, aucune ne porte la clé
 * de service : le pouvoir de tout lire n'est pas ici, il n'y a donc pas à s'en
 * méfier ligne à ligne.
 *
 * L'identité vient toujours du cookie, jamais d'un paramètre. Une action qui
 * accepterait un identifiant de contact serait une action qu'on peut retourner.
 */

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  COOKIE_SESSION, connexionSql, deconnexionSql, demanderReinitSql, jetonSession,
  majRechercheSql, poserMdpSql, poserPrixSql, repondreSql, retirerPieceSql,
} from "@/lib/bo/espace-anon";
import type { Reponse } from "@/lib/bo/espace-modele";

const COOKIE = {
  httpOnly: true as const,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 30 * 86400,
};

/* ---------- Entrer, sortir ---------- */

/**
 * Connexion.
 *
 * La base rend un jeton ou rien : elle ne dit pas si l'adresse existe, si le
 * mot de passe est faux, ou si le compte est momentanément bloqué après cinq
 * échecs. Un message unique, sinon le formulaire devient un annuaire des
 * clients de l'agence, à tester une adresse à la fois.
 */
export async function connexion(email: string, motDePasse: string): Promise<Reponse> {
  const jeton = await connexionSql(email, motDePasse);
  if (!jeton) return { ok: false, message: "Adresse ou mot de passe incorrect." };
  (await cookies()).set(COOKIE_SESSION, jeton, COOKIE);
  return { ok: true, message: "" };
}

export async function deconnexion() {
  const jar = await cookies();
  const j = jar.get(COOKIE_SESSION)?.value;
  if (j) await deconnexionSql(j);
  jar.delete(COOKIE_SESSION);
}

/** Pose le mot de passe derrière un jeton d'activation ou de réinitialisation. */
export async function poserMotDePasse(jeton: string, motDePasse: string): Promise<Reponse> {
  if (motDePasse.length < 12) {
    return { ok: false, message: "Choisissez au moins 12 caractères — une petite phrase fait très bien l'affaire." };
  }
  const session = await poserMdpSql(jeton, motDePasse);
  if (!session) {
    return { ok: false, message: "Ce lien n'est plus valable. Demandez-en un nouveau depuis la page de connexion." };
  }
  (await cookies()).set(COOKIE_SESSION, session, COOKIE);
  return { ok: true, message: "" };
}

/**
 * Mot de passe oublié.
 *
 * La base pose le jeton mais ne le rend PAS : sinon la clé publique suffirait
 * à prendre la main sur n'importe quel compte. C'est l'envoi d'e-mails, côté
 * serveur, qui le relève et l'expédie.
 */
export async function motDePasseOublie(email: string): Promise<Reponse> {
  await demanderReinitSql(email);
  /* L'envoi vit à part, avec la clé de service, et ne prend aucune donnée de
     l'appelant : il relève les demandes en attente. Un échec ne change pas la
     réponse — elle doit être la même que l'adresse existe ou non. */
  try {
    const { envoyerReinitialisationsEnAttente } = await import("@/lib/bo/espace-mail");
    await envoyerReinitialisationsEnAttente();
  } catch { /* silencieux, par construction */ }
  return {
    ok: true,
    message: "Si un espace existe pour cette adresse, un lien vient d'y être envoyé. Pensez à regarder vos indésirables.",
  };
}

/* ---------- Ce qu'il décide ---------- */

const HORS_SESSION: Reponse = { ok: false, message: "Votre session a expiré. Reconnectez-vous." };

export async function poserPrix(immeubleId: string, prix: number, mot: string): Promise<Reponse> {
  const j = await jetonSession();
  if (!j) return HORS_SESSION;
  if (!Number.isFinite(prix) || prix <= 0) return { ok: false, message: "Indiquez un montant." };
  const ok = await poserPrixSql(j, immeubleId, Math.round(prix), mot);
  if (!ok) return { ok: false, message: "Montant refusé — vérifiez le nombre de chiffres." };
  revalidatePath(`/espace/bien/${immeubleId}`);
  revalidatePath(`/bien/${immeubleId}`);
  return { ok: true, message: "C'est noté. Votre conseiller revient vers vous." };
}

const PHRASE: Record<string, string> = {
  interesse: "C'est noté — votre conseiller revient vers vous.",
  visite: "Demande de visite transmise. Votre conseiller vous rappelle pour convenir d'un créneau.",
  pas_interesse: "Merci de nous l'avoir dit : nous ne vous le représenterons pas.",
};

export async function repondreProposition(
  propositionId: string, reponse: string, mot: string,
): Promise<Reponse> {
  const j = await jetonSession();
  if (!j) return HORS_SESSION;
  const ok = await repondreSql(j, propositionId, reponse, mot);
  if (!ok) return { ok: false, message: "Ce bien ne fait pas partie de ceux qui vous ont été proposés." };
  revalidatePath("/espace");
  revalidatePath(`/espace/propose/${propositionId}`);
  revalidatePath("/propositions");
  return { ok: true, message: PHRASE[reponse] ?? "C'est noté." };
}

/**
 * Le client remplit sa recherche.
 *
 * MAV : « le client pourra se connecter et remplir sa recherche ». La base ne
 * retient que les critères — ni l'agent, ni la note, ni le suivi, ni
 * l'archivage : ce sont des jugements de l'agence, pas des souhaits du client.
 */
export async function majRecherche(
  id: string | null,
  criteres: {
    villes?: string[]; dpts?: string[]; Destinations?: string[];
    surface_min?: number; surface_max?: number;
    prix_min?: number; prix_max?: number; renta?: number; commentaire?: string;
  },
): Promise<Reponse> {
  const j = await jetonSession();
  if (!j) return HORS_SESSION;
  const rid = await majRechercheSql(j, id, criteres);
  if (!rid) return { ok: false, message: "Enregistrement impossible." };
  revalidatePath("/espace");
  revalidatePath("/recherches");
  return { ok: true, message: "Vos critères sont enregistrés. Nous vous enverrons ce qui correspond." };
}

export async function retirerPiece(pieceId: string, immeubleId: string): Promise<Reponse> {
  const j = await jetonSession();
  if (!j) return HORS_SESSION;
  const ok = await retirerPieceSql(j, pieceId);
  if (!ok) return { ok: false, message: "Pièce introuvable." };
  revalidatePath(`/espace/bien/${immeubleId}`);
  return { ok: true, message: "Pièce retirée de votre liste." };
}
