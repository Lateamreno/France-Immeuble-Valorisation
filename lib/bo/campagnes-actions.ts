"use server";

/* Les gestes du module Mailing (lib/bo/campagnes.ts pour le moteur).
 *
 * Doctrine d'envoi (§7.1) : l'application prépare, un humain envoie. Une
 * campagne se construit dans la fenêtre de salve, se relit nominativement, et
 * ne part que sur « Programmer » — c'est le geste humain. La file fait ensuite
 * le travail de cadence, sans rien décider d'autre.
 */

import { revalidatePath } from "next/cache";
import { compteCourant, estDirection } from "@/lib/auth/comptes";
import { fusionner, valeursDe, type Expediteur, type RefPrenoms } from "@/lib/mails/fusion";
import { resumerCiblage, type Candidat, type Cible, type Filtres } from "@/lib/mails/audience";
import { nouveauJeton } from "@/lib/bo/rattachement";
import { masseConfiguree } from "@/lib/bo/mail";
import {
  destinatairesCampagne, envoiDuJeton, resteDuJour, sb, type DestinataireCampagne,
} from "@/lib/bo/campagnes";

type Retour = { ok: boolean; message: string };
const REFUS: Retour = { ok: false, message: "Les campagnes se lancent depuis un compte de direction." };

/**
 * Programme une campagne : chaque message est fusionné et rangé dans la file,
 * avec son jeton. Le cron l'envoie à partir de la minute suivante.
 */
export async function programmerCampagne(c: {
  libelle: string;
  cibles: Cible[];
  filtres: Filtres;
  objet: string;
  corps: string;
  destinataires: Candidat[];
  refPrenoms: RefPrenoms;
  expediteur: Expediteur;
}): Promise<Retour & { id?: string; aujourdhui?: number }> {
  if (!(await estDirection())) return REFUS;
  if (!masseConfiguree()) {
    return { ok: false, message: "La route d'envoi en masse (SendGrid) n'est pas configurée : une campagne ne part pas d'une boîte personnelle." };
  }
  if (!c.objet.trim() || !c.corps.trim()) return { ok: false, message: "Il faut un objet et un texte." };
  /* Une adresse ne reçoit la campagne qu'une fois, même si elle est à la fois
     vendeur et acquéreur. */
  const vus = new Set<string>();
  const liste = c.destinataires.filter((d) => {
    const k = d.email.trim().toLowerCase();
    if (!k.includes("@") || vus.has(k)) return false;
    vus.add(k);
    return true;
  });
  if (liste.length === 0) return { ok: false, message: "Aucun destinataire." };
  const moi = await compteCourant();

  const { lignes } = await sb<{ id: string }>("fi_salve", {
    method: "POST",
    prefer: "return=representation",
    body: JSON.stringify({
      nature: "campagne",
      agent_id: moi?.agent_id ?? null,
      lance_par: moi?.email ?? null,
      libelle: c.libelle.trim() || c.objet.trim(),
      cible: c.cibles.join(","),
      filtres: { ...c.filtres, resume: resumerCiblage(c.cibles, c.filtres) },
      objet: c.objet, corps: c.corps,
      destinataires: [],
      expediteur: c.expediteur,
      total: liste.length,
      envoyes: 0, echecs: 0,
      statut: "en_cours",
    }),
  });
  const id = lignes[0]?.id;
  if (!id) return { ok: false, message: "La campagne n'a pas pu être enregistrée." };

  const rangs = liste.map((d) => {
    const v = valeursDe(d, c.refPrenoms, c.expediteur);
    return {
      salve_id: id, contact_id: d.contactId || null, email: d.email.trim(), nom: d.nom || null,
      jeton: nouveauJeton(), objet: fusionner(c.objet, v).texte, corps: fusionner(c.corps, v).texte,
    };
  });
  for (let i = 0; i < rangs.length; i += 500) {
    await sb("fi_salve_envoi", { method: "POST", body: JSON.stringify(rangs.slice(i, i + 500)) });
  }
  revalidatePath("/mailing");
  const reste = await resteDuJour();
  const aujourdhui = Math.min(reste, liste.length);
  return {
    ok: true, id, aujourdhui,
    message: aujourdhui >= liste.length
      ? `Campagne programmée : ${liste.length} message${liste.length > 1 ? "s" : ""} partent dans les minutes qui viennent.`
      : `Campagne programmée : ${aujourdhui} message${aujourdhui > 1 ? "s" : ""} aujourd'hui, la suite dès demain (plafond du jour).`,
  };
}

async function changerStatut(id: string, depuis: string[], vers: string): Promise<Retour> {
  if (!(await estDirection())) return REFUS;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "Campagne introuvable." };
  const { lignes } = await sb(`fi_salve?id=eq.${id}&nature=eq.campagne&statut=in.(${depuis.join(",")})`, {
    method: "PATCH", prefer: "return=representation", body: JSON.stringify({ statut: vers }),
  });
  revalidatePath("/mailing");
  return lignes.length ? { ok: true, message: "C'est fait." } : { ok: false, message: "Cette campagne n'est plus dans cet état." };
}

/** Met la file en pause : ce qui est parti est parti, le reste attend. */
export async function suspendreCampagne(id: string) { return changerStatut(id, ["en_cours"], "suspendue"); }
export async function reprendreCampagne(id: string) { return changerStatut(id, ["suspendue"], "en_cours"); }

/** Arrête pour de bon : les messages pas encore partis sont retirés de la file. */
export async function annulerCampagne(id: string): Promise<Retour> {
  const r = await changerStatut(id, ["en_cours", "suspendue"], "annulee");
  if (r.ok) {
    await sb(`fi_salve_envoi?salve_id=eq.${id}&statut=eq.a_envoyer`, {
      method: "PATCH", body: JSON.stringify({ statut: "retire" }),
    });
  }
  return r;
}

/** Le détail d'une campagne, pour le panneau de l'écran. */
export async function chargerDestinataires(id: string): Promise<DestinataireCampagne[]> {
  if (!(await compteCourant()) && !(await estDirection())) return [];
  return destinatairesCampagne(id);
}

/* ------------------------------------------------- Désinscription (public) */

/**
 * Le geste du destinataire : son adresse rejoint les refus, et sa fiche le
 * dit aussi. Aucune connexion n'est demandée — le jeton, propre à un message,
 * suffit et ne permet rien d'autre.
 */
export async function desabonner(jeton: string): Promise<Retour> {
  const e = await envoiDuJeton(jeton);
  if (!e) return { ok: false, message: "Ce lien n'est pas reconnu." };
  const email = e.email.trim().toLowerCase();
  await sb("fi_desabonnement", {
    method: "POST",
    prefer: "resolution=ignore-duplicates",
    body: JSON.stringify({ email, contact_id: e.contact_id, salve_id: e.salve_id, jeton, source: "lien" }),
  });
  if (e.contact_id) {
    await sb("rpc/bo_patch_doc", {
      method: "POST",
      body: JSON.stringify({ p_table: "bo_contact", p_id: e.contact_id, p_patch: { notif_email: false } }),
    }).catch(() => undefined);
  }
  return { ok: true, message: "C'est noté : vous ne recevrez plus nos e-mails." };
}
