"use server";

/* Le rapport de commercialisation : les gestes (MAV, 19/11/26).
 *
 * Préparer (lire et calculer), proposer une analyse (l'IA rédige, l'agent
 * corrige), fabriquer le PDF, envoyer. Doctrine §7.1 : l'écran prépare,
 * l'humain envoie — « rien ne part sans mon accord ». Le rapport part de la
 * boîte de celui qui l'écrit, aux seuls vendeurs du bien.
 */

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { compteCourant } from "@/lib/auth/comptes";
import { envoyerPourAgent } from "@/lib/bo/mail";
import { pdfDepuisHtml } from "@/lib/bo/pdf";
import { preparerRapportDe, rapportsEnvoyes, type RapportPrepare } from "@/lib/bo/rapport-serveur";
import { htmlMail, htmlPdf, texteMail, type ContenuRapport, type Piste, type PointRetour } from "@/lib/bo/rapport-html";
import { messageClair } from "@/lib/mails/client";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ID = /^[0-9a-z_]+x?[0-9a-z_]*$/i;
const UUID = /^[0-9a-f-]{36}$/i;

/** La personne connectée — obligatoire dès que la porte du BO est fermée. */
async function session() {
  const moi = await compteCourant();
  const ferme = process.env.BO_AUTH?.trim().toLowerCase() === "on";
  return { moi, refuse: !moi && ferme };
}

export async function preparerRapport(immeubleId: string): Promise<RapportPrepare> {
  if (!ID.test(immeubleId)) return { ok: false, message: "Bien introuvable." };
  const { moi, refuse } = await session();
  if (refuse) return { ok: false, message: "Session expirée : reconnectez-vous." };
  try {
    return await preparerRapportDe(immeubleId, moi?.agent_id);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Le rapport n'a pas pu être préparé." };
  }
}

export type RapportEnvoye = { id: string; envoyeLe: string; objet: string; destinataires: string[]; agentNom?: string };

/** Les rapports déjà envoyés pour ce bien, le plus récent d'abord. */
export async function listerRapports(immeubleId: string): Promise<RapportEnvoye[]> {
  if (!ID.test(immeubleId)) return [];
  const { refuse } = await session();
  if (refuse) return [];
  const l = await rapportsEnvoyes(immeubleId).catch(() => []);
  return l.map((e) => ({ id: e.id, envoyeLe: e.envoye_le, objet: e.objet, destinataires: e.destinataires ?? [], agentNom: e.agent_nom ?? undefined }));
}

/* ------------------------------------------------------------- L'analyse */

export type AnalyseRapport = {
  retient: string;
  plait: PointRetour[];
  bloque: PointRetour[];
  pistes: Piste[];
  reperes: { libelle: string; montant: number }[];
  suite: string;
};

const CONSIGNES_ANALYSE = `Tu aides un agent immobilier français (France Immeuble, vente d'immeubles de rapport) à rédiger le point de commercialisation qu'il envoie au PROPRIÉTAIRE d'un immeuble en vente.

On te donne les faits : les chiffres de la commercialisation et ce que les acquéreurs ont répondu, sans aucun nom. C'est ta SEULE source. Tu n'inventes ni retour, ni chiffre, ni caractéristique de l'immeuble.

Tu rends UNIQUEMENT un objet JSON, sans texte autour, de cette forme :
{
  "retient": "deux ou trois phrases : ce qu'il faut retenir des retours",
  "plait": [{"point": "ce que les acquéreurs apprécient", "combien": "2 retours"}],
  "bloque": [{"point": "ce qui freine la vente", "combien": "5 retours"}],
  "reperes": [{"libelle": "Refus même à", "montant": 645000}],
  "pistes": [{"titre": "titre court", "texte": "une ou deux phrases concrètes", "implique": "ce que cela demande au propriétaire"}],
  "suite": "une ou deux phrases : ce qui reste à faire côté agence"
}

Règles :
- "plait" et "bloque" : des thèmes regroupés (travaux, prix, emplacement, rentabilité, structure, taille…), du plus cité au moins cité, 5 au plus chacun. "combien" compte les retours qui le disent ("1 retour", "3 retours"). Si rien ne permet de dire ce qui plaît, rends une liste vide : ne force rien.
- "reperes" : seulement des PRIX que les acquéreurs ont cités eux-mêmes (un prix auquel ils achèteraient, ou refuseraient). Un prix au mètre carré se convertit seulement si la surface est donnée dans les faits. Aucun prix cité : liste vide. N'y mets jamais le prix du mandat ni une offre déjà listée comme offre.
- "pistes" : deux ou trois solutions réellement différentes pour débloquer la vente, tirées des freins constatés (par exemple : changer de public, lever un doute technique par une étude ou un devis, revoir le prix, présenter le bien autrement). Chacune dit honnêtement ce qu'elle implique.
- Ton : sobre, direct, respectueux, à la première personne du pluriel ("nous"). Pas de superlatif, pas de jargon, pas d'anglicisme. Tu ne promets aucun résultat, tu ne donnes aucun conseil fiscal ou juridique, et tu ne laisses jamais entendre que l'agence achèterait le bien : elle conseille, le propriétaire décide.
- Tu ne cites aucun nom de personne ni de société.
- Français, typographie française.`;

function lireAnalyse(texte: string): AnalyseRapport | null {
  const a = texte.indexOf("{");
  const z = texte.lastIndexOf("}");
  if (a < 0 || z <= a) return null;
  try {
    const j = JSON.parse(texte.slice(a, z + 1)) as Record<string, unknown>;
    const t = (v: unknown, max = 600) => (typeof v === "string" ? v.trim().slice(0, max) : "");
    const liste = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]).filter((x) => x && typeof x === "object") : []);
    return {
      retient: t(j.retient, 900),
      plait: liste(j.plait).map((x) => ({ point: t(x.point, 160), combien: t(x.combien, 40) || undefined })).filter((x) => x.point).slice(0, 5),
      bloque: liste(j.bloque).map((x) => ({ point: t(x.point, 160), combien: t(x.combien, 40) || undefined })).filter((x) => x.point).slice(0, 5),
      pistes: liste(j.pistes).map((x) => ({ titre: t(x.titre, 80), texte: t(x.texte, 400), implique: t(x.implique, 200) || undefined }))
        .filter((x) => x.titre || x.texte).slice(0, 3),
      reperes: liste(j.reperes).map((x) => ({ libelle: t(x.libelle, 60), montant: typeof x.montant === "number" ? Math.round(x.montant) : 0 }))
        .filter((x) => x.libelle && x.montant >= 10_000).slice(0, 3),
      suite: t(j.suite, 600),
    };
  } catch {
    return null;
  }
}

/**
 * L'IA propose « ce qu'on retient », ce qui plaît, ce qui bloque et des pistes.
 * Elle ne reçoit que des retours sans nom et des chiffres ; le résultat est un
 * brouillon que l'agent corrige — rien ne part d'ici.
 */
export async function proposerAnalyseRapport(immeubleId: string): Promise<
  { ok: true; analyse: AnalyseRapport } | { ok: false; message: string }
> {
  if (!ID.test(immeubleId)) return { ok: false, message: "Bien introuvable." };
  const { moi, refuse } = await session();
  if (refuse) return { ok: false, message: "Session expirée : reconnectez-vous." };
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, message: "ANTHROPIC_API_KEY n'est pas posée dans Vercel : l'analyse automatique n'est pas disponible. Les champs restent à remplir à la main." };
  }
  const p = await preparerRapportDe(immeubleId, moi?.agent_id);
  if (!p.ok) return p;
  if (p.matiere.length === 0) {
    return { ok: false, message: "Aucun retour motivé ni retour de visite n'est noté : il n'y a rien à analyser pour l'instant." };
  }
  const c = p.rapport.chiffres;
  const faits = [
    `Prix du mandat : ${p.rapport.barometre ? `${p.rapport.barometre.prixMandat} € honoraires inclus` : "non renseigné"}.`,
    `Acquéreurs contactés : ${c.contactes}. Ont répondu : ${c.repondants}. Visites effectuées : ${c.visites}. Offres : ${c.offres}${c.offreHaute ? ` (la plus haute : ${c.offreHaute} €)` : ""}. Refus : ${c.refus}, dont ${c.refusMotives} motivés.`,
    "",
    "Ce que les acquéreurs ont dit :",
    ...p.matiere.map((l) => `- ${l}`),
  ].join("\n");
  try {
    const client = new Anthropic();
    const r = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 8000,
      /* La fiche du bien a soixante secondes : un classement de retours en
         thèmes n'a pas besoin de l'effort maximal, et doit rendre avant. */
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: CONSIGNES_ANALYSE,
      messages: [{ role: "user", content: `FAITS (seule source autorisée) :\n${faits}` }],
    });
    if (r.stop_reason === "refusal") return { ok: false, message: "Le modèle a refusé la demande : remplissez les champs à la main, ou réessayez." };
    const texte = r.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    const analyse = lireAnalyse(texte);
    if (!analyse) return { ok: false, message: "Réponse illisible du modèle : réessayez." };
    return { ok: true, analyse };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { ok: false, message: "Trop de demandes à la fois : réessayez dans une minute." };
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, message: "La clé ANTHROPIC_API_KEY est refusée." };
    if (e instanceof Anthropic.APIError) return { ok: false, message: `Claude ${e.status ?? ""} : ${e.message}` };
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/* ------------------------------------------------------------ Le PDF, l'envoi */

/** Un contenu venu de l'écran : on borne les tailles avant d'en faire un document. */
function borner(c: ContenuRapport): ContenuRapport {
  const t = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const l = <T,>(v: T[] | undefined, max: number) => (Array.isArray(v) ? v.slice(0, max) : []);
  return {
    ...c,
    objet: t(c.objet, 200), bien: t(c.bien, 200), periode: t(c.periode, 120),
    salutation: t(c.salutation, 200), intro: t(c.intro, 1500), fait: t(c.fait, 1500), retient: t(c.retient, 2000),
    libre: t(c.libre, 6000), signature: t(c.signature, 600), legende: t(c.legende, 800), suite: t(c.suite, 2000),
    retoursNote: t(c.retoursNote, 400),
    chiffres: l(c.chiffres, 4), chiffresDetail: l(c.chiffresDetail, 6), actions: l(c.actions, 80),
    retours: l(c.retours, 200), visites: l(c.visites, 100), offres: l(c.offres, 50), diffusion: l(c.diffusion, 8),
    plait: l(c.plait, 8), bloque: l(c.bloque, 8), pistes: l(c.pistes, 4),
    barometre: c.barometre && c.barometre.prixMandat > 0
      ? { ...c.barometre, reperes: l(c.barometre.reperes, 4), commentaire: t(c.barometre.commentaire, 500) } : undefined,
  };
}

const nomFichier = (c: ContenuRapport) => {
  const lieu = c.bien.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 ]+/g, " ").trim().replace(/\s+/g, " ").slice(0, 60);
  return `Compte rendu de commercialisation - ${lieu || "immeuble"} - ${new Date().toISOString().slice(0, 10)}.pdf`;
};

/** Le PDF du rapport en cours de rédaction, pour le relire avant d'envoyer. */
export async function pdfRapport(contenu: ContenuRapport): Promise<
  { ok: true; nom: string; base64: string } | { ok: false; message: string }
> {
  const { refuse } = await session();
  if (refuse) return { ok: false, message: "Session expirée : reconnectez-vous." };
  try {
    const c = borner(contenu);
    const pdf = await pdfDepuisHtml(htmlPdf(c));
    return { ok: true, nom: nomFichier(c), base64: pdf.toString("base64") };
  } catch (e) {
    return { ok: false, message: `Le PDF n'a pas pu être fabriqué : ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Le PDF d'un rapport déjà envoyé, refait depuis ce qui a été gardé. */
export async function pdfRapportEnvoye(id: string): Promise<
  { ok: true; nom: string; base64: string } | { ok: false; message: string }
> {
  const { refuse } = await session();
  if (refuse) return { ok: false, message: "Session expirée : reconnectez-vous." };
  if (!SB_KEY || !UUID.test(id)) return { ok: false, message: "Rapport introuvable." };
  const res = await fetch(`${SB_URL}/rest/v1/fi_rapport_commercialisation?select=contenu,envoye_le&id=eq.${id}&limit=1`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, cache: "no-store",
  }).catch(() => null);
  const ligne = res?.ok ? ((await res.json()) as { contenu: ContenuRapport; envoye_le: string }[])[0] : undefined;
  if (!ligne) return { ok: false, message: "Rapport introuvable." };
  try {
    const c = borner(ligne.contenu);
    const pdf = await pdfDepuisHtml(htmlPdf(c));
    return { ok: true, nom: nomFichier(c).replace(/\d{4}-\d{2}-\d{2}\.pdf$/, `${ligne.envoye_le.slice(0, 10)}.pdf`), base64: pdf.toString("base64") };
  } catch (e) {
    return { ok: false, message: `Le PDF n'a pas pu être fabriqué : ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Envoie le rapport, relu par l'agent, aux vendeurs choisis. Garde-fous : on
 * n'écrit qu'aux vendeurs de CE bien ; le message part de la boîte de celui
 * qui l'envoie, avec sa copie dans ses envoyés, ou ne part pas.
 */
export async function envoyerRapport(immeubleId: string, contenu: ContenuRapport, destinataires: string[]): Promise<
  { ok: boolean; message: string }
> {
  if (!ID.test(immeubleId)) return { ok: false, message: "Bien introuvable." };
  const { moi, refuse } = await session();
  if (refuse) return { ok: false, message: "Session expirée : reconnectez-vous." };
  const c = borner(contenu);
  if (!c.objet.trim()) return { ok: false, message: "Il faut un objet." };
  const p = await preparerRapportDe(immeubleId, moi?.agent_id);
  if (!p.ok) return p;
  const permis = new Set(p.destinataires.map((d) => d.email));
  const a = [...new Set(destinataires.map((x) => x.trim().toLowerCase()).filter(Boolean))];
  if (a.length === 0) return { ok: false, message: "Choisissez au moins un destinataire." };
  const intrus = a.find((x) => !permis.has(x));
  if (intrus) return { ok: false, message: `${intrus} n'est pas un vendeur de ce bien.` };

  let pdf: Buffer;
  try {
    pdf = await pdfDepuisHtml(htmlPdf(c));
  } catch (e) {
    return { ok: false, message: `Rien n'est parti : le PDF n'a pas pu être fabriqué (${e instanceof Error ? e.message : String(e)}).` };
  }
  let r;
  try {
    r = await envoyerPourAgent(moi?.agent_id, {
      to: a.join(", "), subject: c.objet.trim(),
      text: texteMail(c), html: htmlMail(c),
      attachments: [{ filename: nomFichier(c), content: pdf, contentType: "application/pdf" }],
      replyTo: moi?.email,
      boiteObligatoire: true,
    });
  } catch (e) {
    return { ok: false, message: messageClair(e) };
  }
  /* Le rapport est parti : on le range. Un échec ici ne doit pas faire croire
     que l'envoi a raté. */
  let range = true;
  if (SB_KEY) {
    const res = await fetch(`${SB_URL}/rest/v1/fi_rapport_commercialisation`, {
      method: "POST",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        immeuble_id: immeubleId, agent_id: moi?.agent_id ?? null, agent_nom: c.signature.split("\n").map((x) => x.trim()).filter(Boolean)[1] ?? null,
        objet: c.objet.trim(), destinataires: a, contenu: c, chiffres: p.rapport.chiffres,
      }),
      cache: "no-store",
    }).catch(() => null);
    range = !!res?.ok;
  }
  revalidatePath(`/bien/${immeubleId}`);
  const copie = r.copieDansEnvoyes === false
    ? ` La copie n'a pas pu être rangée dans vos envoyés${r.copieErreur ? ` (${r.copieErreur})` : ""}.` : "";
  return {
    ok: true,
    message: `Rapport envoyé depuis ${r.expediteur} à ${a.join(", ")}.${copie}${range ? "" : " Il n'a pas pu être rangé dans l'historique."}`,
  };
}
