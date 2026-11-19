import "server-only";

/* Le rapport de commercialisation : la lecture (MAV, 19/11/26).
 *
 * Va chercher ce que la base sait de la commercialisation d'un bien — envois,
 * relances, propositions, réponses, visites, offres, retombées de l'annonce —
 * et le donne au calcul (rapport-commercialisation.ts). Rien n'est recopié ni
 * gardé : le rapport se refait à chaque ouverture, sur l'état du moment.
 */

import { fetchAll, getAgents, proprietairesDe } from "@/lib/bubble/server";
import { adresseImmeuble, lireMandants } from "@/lib/mandat";
import { retombeesAnnonces } from "@/lib/bo/diffusion";
import {
  construireRapport, initialeDe, type EntreesRapport, type Personne, type Rapport,
} from "@/lib/bo/rapport-commercialisation";
import { contenuParDefaut } from "@/lib/bo/rapport-contenu";
import type { ContenuRapport } from "@/lib/bo/rapport-html";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const S = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const N = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v
  : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);
const L = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).map(String).filter(Boolean) : []);

async function lire<T>(chemin: string): Promise<T[]> {
  if (!SB_KEY) return [];
  const res = await fetch(`${SB_URL}/rest/v1/${chemin}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return [];
  return (await res.json()) as T[];
}

async function parIds(type: string, cle: string, ids: string[], champs?: string[]) {
  const out: Record<string, unknown>[] = [];
  const uniques = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < uniques.length; i += 80) {
    out.push(...await fetchAll(type, [{ key: cle, constraint_type: "in", value: uniques.slice(i, i + 80) }], 5000, undefined, champs).catch(() => []));
  }
  return out;
}

/** Le profil d'un acquéreur, tel qu'on l'écrit au propriétaire. */
const PROFILS: [string, string][] = [
  ["Marchand", "marchand de biens"], ["Foncière", "foncière"], ["Promoteur", "promoteur"],
  ["Exploitant", "exploitant"], ["Lotisseur", "lotisseur"], ["Investisseur", "investisseur"],
];
function profilDe(contact?: Record<string, unknown>, cible?: string): string | undefined {
  const types = L(contact?.Types);
  for (const [t, libelle] of PROFILS) if (types.includes(t)) return libelle;
  const c = S(cible)?.toLowerCase();
  return c === "patrimonial" ? "investisseur patrimonial" : c;
}

/** D'où vient une visite, dans des mots de propriétaire. */
function sourceVisite(s?: string): string | undefined {
  if (!s || /^manuelle$/i.test(s)) return undefined;
  if (/^site/i.test(s)) return "Site France Immeuble";
  if (/plein ?bail/i.test(s)) return "Plein Bail";
  return s;
}

export type RapportPrepare = {
  ok: true;
  rapport: Rapport;
  contenu: ContenuRapport;
  /** À qui le rapport peut partir : les vendeurs qui ont une adresse. */
  destinataires: { nom: string; email: string }[];
  /** Les rapports déjà envoyés, le plus récent d'abord. */
  envoyes: { id: string; envoyeLe: string; objet: string; destinataires: string[]; agentNom?: string }[];
  /** Les retours mis à plat, pour l'analyse (sans nom). */
  matiere: string[];
  iaDisponible: boolean;
} | { ok: false; message: string };

type LigneRapport = { id: string; envoye_le: string; objet: string; destinataires: string[]; agent_nom: string | null };

export async function rapportsEnvoyes(immeubleId: string): Promise<LigneRapport[]> {
  return lire<LigneRapport>(
    `fi_rapport_commercialisation?select=id,envoye_le,objet,destinataires,agent_nom&immeuble_id=eq.${encodeURIComponent(immeubleId)}&order=envoye_le.desc&limit=30`,
  );
}

export async function preparerRapportDe(immeubleId: string, agentConnecte?: string): Promise<RapportPrepare> {
  const [ims, mandats, props, comms, visitesB, offresB, questions, agents, envoyes] = await Promise.all([
    fetchAll("immeuble", [{ key: "_id", constraint_type: "equals", value: immeubleId }], 1),
    fetchAll("mandat", [{ key: "IMMEUBLEs", constraint_type: "contains", value: immeubleId }], 50).catch(() => []),
    fetchAll("proposition", [{ key: "IMMEUBLE", constraint_type: "equals", value: immeubleId }], 5000).catch(() => []),
    fetchAll("commercialisation", [{ key: "IMMEUBLE", constraint_type: "equals", value: immeubleId }], 200).catch(() => []),
    fetchAll("visite", [{ key: "IMMEUBLE", constraint_type: "equals", value: immeubleId }], 500).catch(() => []),
    fetchAll("offre", [{ key: "IMMEUBLEs", constraint_type: "contains", value: immeubleId }], 200).catch(() => []),
    fetchAll("question", [{ key: "IMMEUBLE", constraint_type: "equals", value: immeubleId }], 500, undefined, ["source", "Created Date"]).catch(() => []),
    getAgents().catch(() => []),
    rapportsEnvoyes(immeubleId),
  ]);
  const im = ims[0];
  if (!im) return { ok: false, message: "Bien introuvable." };

  const [reponses, relancesB] = await Promise.all([
    lire<{ proposition_id: string | null; canal: string; recu_le: string; traite_le: string | null; texte: string | null }>(
      `fi_reponse?select=proposition_id,canal,recu_le,traite_le,texte&immeuble_id=eq.${encodeURIComponent(immeubleId)}&limit=5000`),
    lire<{ created_at: string; fait_mail: number | null; fait_sms: number | null; statut: string | null }>(
      `fi_relance_salve?select=created_at,fait_mail,fait_sms,statut&immeuble_id=eq.${encodeURIComponent(immeubleId)}&genre=eq.relances&limit=200`),
  ]);

  /* Les personnes : acquéreurs des propositions, visiteurs, auteurs d'offres. */
  const idsPersonnes = [
    ...props.map((p) => S(p.ACHETEUR)),
    ...visitesB.flatMap((v) => L(v.VISITEURs)),
    ...offresB.flatMap((o) => L(o.ACHETEURs)),
  ].filter((x): x is string => !!x);
  const idsRecherches = props.map((p) => L(p.RECHERCHEs)[0]).filter(Boolean);
  const [contacts, recherchesProp, recherchesPers] = await Promise.all([
    parIds("contact", "_id", idsPersonnes, ["nom", "prénom", "entreprise_nom", "Types", "email"]),
    parIds("recherche", "_id", idsRecherches, ["Note", "Cible", "ACHETEUR"]),
    parIds("recherche", "ACHETEUR", [...visitesB.flatMap((v) => L(v.VISITEURs)), ...offresB.flatMap((o) => L(o.ACHETEURs))], ["Note", "Cible", "ACHETEUR", "archived"]),
  ]);
  const contactPar = new Map(contacts.map((c) => [String(c._id), c]));
  const recherchePar = new Map(recherchesProp.map((r) => [String(r._id), r]));
  /* La meilleure note connue d'une personne, toutes ses recherches confondues. */
  const notePar = new Map<string, { note?: string; cible?: string }>();
  for (const r of [...recherchesProp, ...recherchesPers]) {
    const a = S(r.ACHETEUR);
    if (!a) continue;
    const deja = notePar.get(a);
    const note = S(r.Note);
    if (!deja || (note && (!deja.note || note < deja.note))) notePar.set(a, { note: note ?? deja?.note, cible: S(r.Cible) ?? deja?.cible });
  }
  const personne = (contactId?: string, repliNom?: string, recherche?: Record<string, unknown>): Personne => {
    const c = contactId ? contactPar.get(contactId) : undefined;
    const nomFamille = S(c?.nom);
    const nom = c ? [S(c["prénom"]), nomFamille?.toUpperCase()].filter(Boolean).join(" ") || S(c.entreprise_nom) || S(c.email) || "Contact" : repliNom ?? "Contact";
    const connu = contactId ? notePar.get(contactId) : undefined;
    return {
      contactId,
      nom,
      initiale: initialeDe(nomFamille, S(c?.entreprise_nom) ?? repliNom ?? nom),
      profil: profilDe(c, S(recherche?.Cible) ?? connu?.cible),
      note: S(recherche?.Note) ?? connu?.note,
    };
  };

  /* Chaque proposition appartient à une salve, ou a été faite à la main. */
  const salveDe = new Map<string, string>();
  for (const c of comms) for (const id of L(c.PROPOSITIONs)) salveDe.set(id, String(c._id));

  const signe = mandats
    .filter((m) => S(m.date_signature) || S(m.pdf_signed))
    .sort((a, b) => String(S(b.date_signature) ?? "").localeCompare(String(S(a.date_signature) ?? "")))[0];

  const entrees: EntreesRapport = {
    maintenant: new Date().toISOString(),
    depuis: envoyes[0]?.envoye_le,
    prixMandat: N(signe?.prix_hai) ?? N(im.prix_hai),
    salves: comms.filter((c) => S(c["Created Date"])).map((c) => ({
      id: String(c._id), date: S(c.prop_date) ?? S(c["Created Date"])!,
      mails: N(c.mails_envoyes) ?? 0, mobiles: N(c.sms_envoyes) ?? 0,
    })),
    relances: relancesB.filter((r) => (r.fait_mail ?? 0) + (r.fait_sms ?? 0) > 0).map((r) => ({
      date: r.created_at, nombre: Math.max(r.fait_mail ?? 0, r.fait_sms ?? 0),
      mode: [r.fait_mail ? "E-mail" : "", r.fait_sms ? "SMS" : ""].filter(Boolean).join(" + "),
    })),
    propositions: props.map((p) => ({
      id: String(p._id),
      qui: personne(S(p.ACHETEUR), undefined, recherchePar.get(L(p.RECHERCHEs)[0])),
      creeLe: S(p.date_envoi) ?? S(p["Created Date"]) ?? "",
      salveId: salveDe.get(String(p._id)),
      statut: S(p.Statut) ?? "Envoyée",
      motifRefus: S(p.motif_refus),
      commentaire: S(p.commentaire),
      commentaireLe: S(p.commentaire_le),
      relanceLe: S(p.mail_relance_le) ?? S(p.date_last_relance),
      retourSms: S(p.retour_sms),
      interesseLe: S(p.rcs_interesse_le),
      dossierLe: S(p.rcs_dossier_le),
    })),
    reponses: reponses.map((r) => ({
      propositionId: r.proposition_id ?? undefined, canal: r.canal, recuLe: r.recu_le, traite: !!r.traite_le,
      texte: r.texte ?? undefined,
    })),
    visites: visitesB.filter((v) => S(v.date)).map((v) => ({
      id: String(v._id), date: S(v.date)!, statut: S(v.Statut) ?? "",
      qui: personne(L(v.VISITEURs)[0], S(v.visiteur_nom)),
      retourVendeur: S(v.commentaire_externe),
      retourInterne: S(v.rex_fi) ?? S(v.commentaire_interne),
      source: sourceVisite(S(v.source)),
    })),
    offres: offresB.map((o) => ({
      id: String(o._id), date: S(o.date) ?? S(o["Created Date"]), statut: S(o.Statut) ?? "",
      prixHai: N(o.prix_hai), qui: personne(L(o.ACHETEURs)[0], S(o.acheteur_nom)), motifRefus: S(o.motif_refus),
    })),
  };
  /* Une relance groupée connue du journal remplace les dates de dernière
     relance des propositions : sinon chaque relance compterait deux fois. */
  if (!entrees.relances?.length) entrees.relances = undefined;
  const rapport = construireRapport(entrees);

  /* ---- La diffusion de l'annonce ---- */
  const diffusion: ContenuRapport["diffusion"] = [];
  const [pb] = await retombeesAnnonces([`FI:${immeubleId}`]).catch(() => []);
  if (pb) {
    const lignes = [
      typeof pb.impressions === "number" ? { libelle: "apparitions dans les résultats", valeur: String(pb.impressions) } : null,
      typeof pb.vues === "number" ? { libelle: "consultations de l'annonce", valeur: String(pb.vues) } : null,
      { libelle: "messages reçus", valeur: String(pb.contacts ?? 0) },
      { libelle: "téléphones demandés", valeur: String(pb.telephones ?? 0) },
    ].filter((x): x is { libelle: string; valeur: string } => !!x);
    diffusion.push({ source: "Plein Bail", lignes });
  }
  const messagesSite = questions.filter((q) => /^site/i.test(S(q.source) ?? "")).length;
  const visitesSite = rapport.visitesParSource.find((s) => s.source === "Site France Immeuble")?.nombre ?? 0;
  if (messagesSite || visitesSite) {
    diffusion.push({
      source: "Site France Immeuble",
      lignes: [
        { libelle: messagesSite > 1 ? "messages reçus" : "message reçu", valeur: String(messagesSite) },
        { libelle: visitesSite > 1 ? "visites issues du site" : "visite issue du site", valeur: String(visitesSite) },
      ],
    });
  }
  /* Seuls les canaux d'annonce : une visite venue du « relationnel » n'est pas
     une retombée de diffusion. */
  const autresSources = rapport.visitesParSource.filter((s) =>
    !["Notre fichier", "Site France Immeuble"].includes(s.source) && !/^(relationnel|autre|manuelle)$/i.test(s.source));
  for (const s of autresSources) {
    const ligne = { libelle: s.nombre > 1 ? "visites issues de cette source" : "visite issue de cette source", valeur: String(s.nombre) };
    const deja = diffusion.find((d) => d.source === s.source);
    if (deja) deja.lignes.push(ligne); else diffusion.push({ source: s.source, lignes: [ligne] });
  }

  /* ---- Les destinataires : les vendeurs ---- */
  const idsVendeurs = proprietairesDe(im);
  const mandants = signe ? lireMandants(signe) : [];
  for (const m of mandants) if (m.contactId && !idsVendeurs.includes(m.contactId)) idsVendeurs.push(m.contactId);
  const vendeurs = await parIds("contact", "_id", idsVendeurs, ["nom", "prénom", "entreprise_nom", "email", "Civilité"]);
  const destinataires: { nom: string; email: string; civilite?: string }[] = [];
  for (const c of vendeurs) {
    const email = S(c.email)?.toLowerCase();
    if (!email) continue;
    destinataires.push({
      nom: [S(c["prénom"]), S(c.nom)?.toUpperCase()].filter(Boolean).join(" ") || S(c.entreprise_nom) || email,
      email, civilite: S(c["Civilité"]),
    });
  }
  for (const m of mandants) {
    const email = m.email?.toLowerCase();
    if (m.contactId || !email || destinataires.some((d) => d.email === email)) continue;
    destinataires.push({ nom: [m.prenom, m.nom].filter(Boolean).join(" ") || email, email });
  }
  const CIV: Record<string, string> = { "M.": "Monsieur", "Mme": "Madame", "Mme.": "Madame", "Mlle": "Madame", "Monsieur": "Monsieur", "Madame": "Madame" };
  const civilite = destinataires.length === 1 ? CIV[destinataires[0].civilite ?? ""] : undefined;

  /* Le rapport part de celui qui l'écrit ; c'est donc lui qui signe. */
  const agent = agents.find((a) => a.id === agentConnecte) ?? agents.find((a) => a.id === S(im.AGENT));
  const contenu = contenuParDefaut(rapport, {
    bien: adresseImmeuble(im),
    ville: S(im.adresse_ville) ?? "",
    civilite,
    agent: { nom: agent?.name ?? "France Immeuble", tel: agent?.tel },
    diffusion,
  });

  /* La matière de l'analyse : ce que les acquéreurs ont dit, sans aucun nom. */
  const matiere = [
    ...rapport.retours.map((r) => `Retour (${r.nature === "refus" ? "refus" : r.nature === "interesse" ? "intéressé" : "échange"}${r.qui.includes("—") ? `, ${r.qui.split("— ")[1]}` : ""}) : ${r.texte}`),
    ...rapport.visites.filter((v) => v.texte).map((v) => `Retour de visite : ${v.texte}`),
    ...entrees.offres.filter((o) => o.prixHai).map((o) => `Offre : ${o.prixHai} € HAI (${o.statut})${o.motifRefus ? ` — ${o.motifRefus}` : ""}`),
  ];

  return {
    ok: true,
    rapport,
    contenu,
    destinataires: destinataires.map(({ nom, email }) => ({ nom, email })),
    envoyes: envoyes.map((e) => ({
      id: e.id, envoyeLe: e.envoye_le, objet: e.objet, destinataires: e.destinataires ?? [], agentNom: e.agent_nom ?? undefined,
    })),
    matiere,
    iaDisponible: !!process.env.ANTHROPIC_API_KEY,
  };
}
