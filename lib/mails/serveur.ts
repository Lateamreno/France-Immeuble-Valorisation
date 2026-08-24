/* Lectures du module Mails (retour #108).
 *
 * Deux sources, jamais mélangées :
 *   • `bo_*` — le miroir de Bubble, en lecture seule, réécrit chaque nuit ;
 *   • `fi_*` — nos tables (dossiers, messages types, brouillons, salves).
 *
 * Tout est mis en cache sous l'étiquette de sa table, comme le reste du BO :
 * une écriture décroche l'étiquette et l'écran se rafraîchit tout seul.
 */

import { unstable_cache } from "next/cache";
import type { Cible, Candidat } from "@/lib/mails/audience";
import { tablePrenoms, type RefPrenoms } from "@/lib/mails/fusion";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Lecture brute d'une de NOS tables. */
async function lire<T>(table: string, qs = ""): Promise<T[]> {
  if (!SB_KEY) return [];
  const res = await fetch(`${SB_URL}/rest/v1/${table}${qs ? `?${qs}` : ""}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    cache: "no-store",
  });
  if (!res.ok) return [];
  return (await res.json()) as T[];
}

/* ---------------- Dossiers façon Gmail ---------------- */

export const DOSSIERS = [
  { cle: "reception", label: "Boîte de réception" },
  { cle: "envoyes", label: "E-mails envoyés" },
  { cle: "brouillons", label: "Brouillons" },
  { cle: "indesirables", label: "Indésirables" },
  { cle: "corbeille", label: "Éléments supprimés" },
] as const;

export type Dossier = (typeof DOSSIERS)[number]["cle"];

export type EtatMail = { mail_id: string; dossier: Exclude<Dossier, "brouillons">; lu: boolean };

/** Les messages qu'on a déplacés. Les autres se rangent tout seuls : un
 *  entrant en réception, un sortant dans les envoyés.
 *
 *  Le cache ne sait stocker que du JSON : on y range donc le tableau, et la
 *  Map se refabrique à la sortie. Y mettre la Map directement marchait au
 *  premier appel et renvoyait un objet vide aux suivants. */
const lignesEtats = unstable_cache(
  async () => lire<EtatMail>("fi_mail_etat", "select=mail_id,dossier,lu"),
  ["fi_mail_etat"],
  { tags: ["fi_mail_etat"], revalidate: 60 },
);

export async function etatsMails(): Promise<Map<string, EtatMail>> {
  return new Map((await lignesEtats()).map((r) => [r.mail_id, r]));
}

/** Le dossier d'un message : ce qu'on en a fait, sinon son sens. */
export const dossierDe = (
  id: string,
  entrant: boolean,
  etats: Map<string, EtatMail>,
): Exclude<Dossier, "brouillons"> =>
  etats.get(id)?.dossier ?? (entrant ? "reception" : "envoyes");

/* ---------------- Messages types ---------------- */

export type MessageType = {
  id: string;
  libelle: string;
  cible: Cible | null;
  objet: string;
  corps: string;
  agent_id: string | null;
  favori: boolean;
  usages: number;
  updated_at: string;
};

export const messagesTypes = unstable_cache(
  async () =>
    lire<MessageType>(
      "fi_message_type",
      "select=*&archive=eq.false&order=favori.desc,libelle.asc",
    ),
  ["fi_message_type"],
  { tags: ["fi_message_type"], revalidate: 60 },
);

/* ---------------- Brouillons ---------------- */

export type Brouillon = {
  id: string;
  agent_id: string | null;
  objet: string;
  corps: string;
  destinataires: { contactId?: string; email: string; nom?: string }[];
  origine: "manuel" | "automatisation";
  statut: "brouillon" | "a_valider" | "envoye" | "abandonne";
  created_at: string;
  updated_at: string;
};

export const brouillons = unstable_cache(
  async () =>
    lire<Brouillon>(
      "fi_brouillon",
      "select=*&statut=in.(brouillon,a_valider)&order=updated_at.desc",
    ),
  ["fi_brouillon"],
  { tags: ["fi_brouillon"], revalidate: 30 },
);

/* ---------------- Salves ---------------- */

export type Salve = {
  id: string;
  libelle: string;
  cible: Cible;
  objet: string;
  statut: "preparation" | "a_valider" | "envoyee" | "abandonnee";
  destinataires: { email: string; nom?: string }[];
  envoyes: number;
  echecs: number;
  created_at: string;
  envoye_at: string | null;
};

export const salves = unstable_cache(
  async () => lire<Salve>("fi_salve", "select=id,libelle,cible,objet,statut,envoyes,echecs,created_at,envoye_at&order=created_at.desc&limit=50"),
  ["fi_salve"],
  { tags: ["fi_salve"], revalidate: 30 },
);

/* ================= Le vivier de la salve =================
   On assemble une fois pour toutes ce qu'il faut savoir de chaque contact
   pour le trier : ses profils, ses immeubles, ses recherches. La lecture
   passe par les fonctions déjà en cache du BO — l'écran Recherches et celui-ci
   se partagent donc le même chargement. */

export type Vivier = {
  candidats: Candidat[];
  refPrenoms: RefPrenoms;
  /** Valeurs proposées dans les listes déroulantes des sous-filtres. */
  facettes: { lieux: string[]; destinations: string[]; statuts: string[]; profils: string[] };
};

const nombre = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const texte = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const liste = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).map(String) : []);

/** Construit le vivier à partir des tables du miroir déjà chargées. */
export function assemblerVivier(
  contacts: Record<string, unknown>[],
  immeubles: Record<string, unknown>[],
  recherches: Record<string, unknown>[],
): Vivier {
  /* Index des immeubles par propriétaire et des recherches par acquéreur :
     42 000 contacts × parcours de liste serait quadratique. */
  const grouper = (rows: Record<string, unknown>[], cle: string) => {
    const m = new Map<string, Record<string, unknown>[]>();
    for (const r of rows) {
      const k = texte(r[cle]);
      if (!k) continue;
      const deja = m.get(k);
      if (deja) deja.push(r); else m.set(k, [r]);
    }
    return m;
  };
  const imParProprio = grouper(immeubles, "PROPRIETAIRE");
  const rechParAcq = grouper(recherches, "ACHETEUR");

  const lieux = new Set<string>();
  const destinations = new Set<string>();
  const statuts = new Set<string>();
  const profils = new Set<string>();

  const candidats: Candidat[] = [];
  for (const c of contacts) {
    const email = texte(c.email);
    if (!email) continue;
    const id = String(c._id);
    const mesIm = imParProprio.get(id) ?? [];
    const mesRech = rechParAcq.get(id) ?? [];
    const types = liste(c.Types);
    types.forEach((t) => profils.add(t));

    const villes: string[] = [];
    const departements: string[] = [];
    const dest: string[] = [];
    const st: string[] = [];
    const prix: number[] = [];
    const rentas: number[] = [];
    const surfaces: number[] = [];

    for (const im of mesIm) {
      const v = texte(im.adresse_ville); if (v) { villes.push(v); lieux.add(v); }
      const cp = texte(im.adresse_zipcode)?.slice(0, 2); if (cp) { departements.push(cp); lieux.add(cp); }
      const d = texte(im.Destination_principale); if (d) { dest.push(d); destinations.add(d); }
      const s = texte(im.Statut)?.replace(/^\d+ - /, ""); if (s) { st.push(s); statuts.add(s); }
      const p = nombre(im.prix_hai); if (p) prix.push(p);
      const r = nombre(im.fin_renta_ba); if (r) rentas.push(r);
      const su = nombre(im.surface_carrez); if (su) surfaces.push(su);
    }
    for (const r of mesRech) {
      for (const v of liste(r.villes).filter((x) => !/^\d{13}x\d+$/.test(x))) { villes.push(v); lieux.add(v); }
      for (const d of liste(r.dpts).filter((x) => /^\d{2,3}[AB]?$/.test(x))) { departements.push(d); lieux.add(d); }
      for (const d of liste(r.Destinations)) { dest.push(d); destinations.add(d); }
      const pmin = nombre(r.prix_min); const pmax = nombre(r.prix_max);
      if (pmax) prix.push(pmax); else if (pmin) prix.push(pmin);
      const re = nombre(r.renta); if (re) rentas.push(re);
      const smin = nombre(r.surface_min); if (smin) surfaces.push(smin);
    }

    candidats.push({
      contactId: id,
      nom: [texte(c["prénom"]), texte(c.nom)?.toUpperCase()].filter(Boolean).join(" ")
        || texte(c.entreprise_nom) || email,
      email,
      prenom: texte(c["prénom"]),
      civilite: texte(c["Civilité"]),
      societe: texte(c.entreprise_nom),
      telephone: texte(c.portable_formatted) ?? texte(c.portable),
      note: texte(c.Note),
      profils: types,
      proprietaire: mesIm.length > 0 || c.vendeur === true,
      acquereur: c.acheteur === true || mesRech.length > 0,
      /* `notif_email = false` est un refus explicite : Bubble le pose quand le
         contact se désabonne. L'absence de valeur n'est pas un refus. */
      desabonne: c.notif_email === false || c.archived === true,
      villes: [...new Set(villes)],
      departements: [...new Set(departements)],
      destinations: [...new Set(dest)],
      statuts: [...new Set(st)],
      prix, rentas, surfaces,
    });
  }

  return {
    candidats,
    refPrenoms: tablePrenoms(candidats.map((c) => ({ prenom: c.prenom, civilite: c.civilite }))),
    facettes: {
      lieux: [...lieux].sort((a, b) => a.localeCompare(b, "fr")),
      destinations: [...destinations].sort(),
      statuts: [...statuts].sort(),
      profils: [...profils].sort(),
    },
  };
}
