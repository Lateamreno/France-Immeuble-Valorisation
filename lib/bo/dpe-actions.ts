"use server";

// Les DPE de l'ADEME — la partie qui va chercher et qui range.
//
// Les règles sont dans lib/bo/dpe.ts, sans réseau et testées. Ici on interroge
// l'open data de l'ADEME et on garde le relevé.
//
// Deux principes tenus de bout en bout, et ils viennent de MAV :
//
//   • RIEN ne se remplit tout seul. Le `Type_dpe` d'un lot n'est jamais écrit
//     par cette recherche. L'ADEME rattache un DPE à une ADRESSE, pas à un
//     numéro de lot : rapprocher deux 48 m² au même étage relèverait de la
//     devinette, et une devinette écrite dans une fiche devient une vérité
//     trois semaines plus tard. L'affectation à un lot est un geste d'agent.
//
//   • Une fois cherchés, les DPE RESTENT. Le relevé vit dans `fi_dpe` /
//     `fi_dpe_releve` — des tables applicatives, pas le miroir `bo_*` que
//     Bubble réécrit chaque nuit. Rouvrir la modale n'appelle plus l'ADEME.

import { revalidatePath } from "next/cache";
import {
  BASE_ADEME, adresseInterrogeable, libelleAdresse, normaliserVoie, variantesNumero,
  type AdresseImmeuble, type Dpe, type ReleveDpe,
} from "./dpe";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const S = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const N = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

async function sb(chemin: string, init?: RequestInit) {
  if (!SB_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY absente");
  const res = await fetch(`${SB_URL}/rest/v1/${chemin}`, {
    ...init,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const texte = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status} : ${texte.slice(0, 200)}`);
  /* Avec `Prefer: return=minimal`, PostgREST rend un 201 au corps VIDE — pas un
     204. Se fier au seul code de statut faisait donc échouer chaque écriture
     sur un « Unexpected end of JSON input » qui n'avait aucun rapport. */
  return texte ? JSON.parse(texte) : [];
}

/* ------------------------------------------------------------- L'ADEME */

/* Les champs qu'on rapatrie. Le jeu en compte 230 ; en demander deux cents de
   plus ne coûterait pas grand-chose en réseau, mais rendrait la ligne brute
   illisible le jour où quelqu'un l'ouvre. */
const CHAMPS = [
  "numero_dpe", "etiquette_dpe", "etiquette_ges", "surface_habitable_logement",
  "numero_etage_appartement", "position_logement_dans_immeuble",
  "complement_adresse_logement", "type_batiment", "periode_construction",
  "date_etablissement_dpe", "date_fin_validite_dpe", "adresse_ban", "identifiant_ban",
  "nom_rue_ban", "numero_voie_ban", "code_postal_ban",
].join(",");

type ReponseAdeme = {
  total?: number;
  next?: string;
  results?: Record<string, unknown>[];
  aggs?: { value: string; total: number }[];
};

async function ademeUrl(url: string | URL): Promise<ReponseAdeme> {
  /* L'API rend un curseur `next` absolu ; on refuse tout ce qui ne pointe pas
     sur le jeu de données attendu, plutôt que de suivre aveuglément une URL
     lue dans une réponse. */
  const u = new URL(url);
  if (!`${u.origin}${u.pathname}`.startsWith(BASE_ADEME)) {
    throw new Error("Réponse ADEME inattendue : curseur hors du jeu de données.");
  }
  const res = await fetch(u, {
    signal: AbortSignal.timeout(45_000),
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`ADEME ${res.status}`);
  return res.json() as Promise<ReponseAdeme>;
}

async function ademe(chemin: string, params: Record<string, string | number>) {
  const u = new URL(`${BASE_ADEME}/${chemin}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  return ademeUrl(u);
}

/**
 * Les libellés de voie que l'ADEME connaît à ce numéro, dans ce code postal, et
 * qui désignent bien NOTRE rue.
 *
 * On passe par une agrégation plutôt que par le géocodeur de la Base Adresse
 * Nationale : une dépendance de moins, et la BAN peut être injoignable sans que
 * la fonctionnalité tombe. L'agrégation rend quelques dizaines de valeurs, on
 * compare sur la forme normalisée.
 *
 * On essaie les écritures du numéro de la plus précise à la plus large : dès
 * qu'une rend quelque chose, on s'arrête. Chercher aussi « 34 » après avoir
 * trouvé « 34bis » ramènerait les DPE du voisin.
 */
async function voiesCorrespondantes(a: AdresseImmeuble) {
  const cible = normaliserVoie(a.rue);
  const numeros = variantesNumero(a.numero);
  /* Sans numéro de voie on ne cherche pas : « Boulevard du Général de Gaulle »
     à Sarcelles, c'est 300 DPE dont aucun n'est le nôtre. */
  if (!numeros.length) return [];

  for (const numero of numeros) {
    const qs = `code_postal_ban:"${a.codePostal}" AND numero_voie_ban:"${numero}"`;
    const agg = await ademe("values_agg", { qs, field: "nom_rue_ban", agg_size: 300, size: 0 });
    const voies = (agg.aggs ?? [])
      .filter((x) => normaliserVoie(x.value) === cible)
      .map((x) => x.value);
    if (voies.length) return voies.map((rue) => ({ numero, rue }));
  }
  return [];
}

function versDpe(r: Record<string, unknown>): Dpe {
  return {
    numeroDpe: String(r.numero_dpe ?? ""),
    etiquetteDpe: S(r.etiquette_dpe),
    etiquetteGes: S(r.etiquette_ges),
    surface: N(r.surface_habitable_logement),
    etage: N(r.numero_etage_appartement),
    positionLogement: S(r.position_logement_dans_immeuble),
    complement: S(r.complement_adresse_logement),
    typeBatiment: S(r.type_batiment),
    periodeConstruction: S(r.periode_construction),
    dateEtablissement: S(r.date_etablissement_dpe)?.slice(0, 10),
    dateFinValidite: S(r.date_fin_validite_dpe)?.slice(0, 10),
    adresseBan: S(r.adresse_ban),
    identifiantBan: S(r.identifiant_ban),
  };
}

/* ------------------------------------------------------- Lire le relevé */

/**
 * Ce qu'on a déjà relevé pour cet immeuble. Aucun appel réseau.
 *
 * Rend `null` quand on n'a JAMAIS cherché — à distinguer d'un relevé vide, qui
 * est une information : cet immeuble n'a pas de DPE publié. Sans cette
 * distinction, l'écran relancerait la recherche indéfiniment sur une adresse
 * qui n'a rien.
 */
export async function releveDpe(immeubleId: string): Promise<ReleveDpe | null> {
  if (!SB_KEY) return null;
  const [rel] = (await sb(
    `fi_dpe_releve?select=*&immeuble_id=eq.${encodeURIComponent(immeubleId)}&limit=1`,
  )) as Record<string, unknown>[];
  if (!rel) return null;

  const lignes = (await sb(
    `fi_dpe?select=*&immeuble_id=eq.${encodeURIComponent(immeubleId)}&order=etage.asc.nullslast,date_etablissement.desc`,
  )) as Record<string, unknown>[];

  return {
    immeubleId,
    chercheLe: S(rel.cherche_le),
    adresseDemandee: S(rel.adresse_demandee),
    adressesTrouvees: Array.isArray(rel.adresses_trouvees) ? (rel.adresses_trouvees as string[]) : [],
    dpe: lignes.map((l) => ({
      id: String(l.id),
      numeroDpe: String(l.numero_dpe),
      etiquetteDpe: S(l.etiquette_dpe),
      etiquetteGes: S(l.etiquette_ges),
      surface: l.surface === null ? undefined : Number(l.surface),
      etage: l.etage === null ? undefined : Number(l.etage),
      positionLogement: S(l.position_logement),
      complement: S(l.complement),
      typeBatiment: S(l.type_batiment),
      periodeConstruction: S(l.periode_construction),
      dateEtablissement: S(l.date_etablissement),
      dateFinValidite: S(l.date_fin_validite),
      adresseBan: S(l.adresse_ban),
      identifiantBan: S(l.identifiant_ban),
      lotId: S(l.lot_id),
    })),
  };
}

/* --------------------------------------------------------- Chercher */

/**
 * Interroge l'ADEME pour cet immeuble et garde le résultat.
 *
 * Idempotent : relancer la recherche met à jour les lignes déjà connues sans
 * perdre les affectations de lot faites à la main. C'est le point auquel il
 * faut faire attention — un agent qui a rattaché huit DPE à huit lots ne doit
 * pas les voir disparaître parce qu'il a recliqué sur « Actualiser ».
 */
export async function chercherDpe(immeubleId: string, agent?: string): Promise<ReleveDpe> {
  const [im] = (await sb(
    `bo_immeuble?select=data&id=eq.${encodeURIComponent(immeubleId)}&limit=1`,
  )) as { data: Record<string, unknown> }[];
  if (!im?.data) throw new Error("Immeuble introuvable.");

  const adresse: AdresseImmeuble = {
    numero: S(im.data.adresse_numero_rue),
    rue: S(im.data.adresse_rue),
    codePostal: S(im.data.adresse_zipcode),
    ville: S(im.data.adresse_ville),
  };
  if (!adresseInterrogeable(adresse)) {
    throw new Error(
      "L'adresse de la fiche est incomplète : il faut au minimum une voie et un code postal "
      + "pour interroger l'ADEME.",
    );
  }

  const voies = await voiesCorrespondantes(adresse);
  const trouves: Dpe[] = [];
  for (const v of voies) {
    /* Une adresse ne porte jamais mille DPE — mais on suit quand même le
       curseur `next` que rend l'API plutôt que de tronquer en silence sur la
       première page. C'est exactement le défaut qu'on a corrigé sur les
       relances : une liste coupée qui a l'air complète. */
    let page = await ademe("lines", {
      qs: `code_postal_ban:"${adresse.codePostal}" AND numero_voie_ban:"${v.numero}" AND nom_rue_ban:"${v.rue}"`,
      select: CHAMPS,
      size: 1000,
      sort: "numero_etage_appartement",
    });
    for (let garde = 0; garde < 10; garde++) {
      trouves.push(...(page.results ?? []).map(versDpe));
      if (!page.next) break;
      page = await ademeUrl(page.next);
    }
  }

  /* L'ADEME publie parfois deux fois la même ligne (dépôt corrigé). Le numéro
     de DPE tranche. */
  const parNumero = new Map<string, Dpe>();
  for (const d of trouves) if (d.numeroDpe) parNumero.set(d.numeroDpe, d);
  const dpe = [...parNumero.values()];

  const maintenant = new Date().toISOString();
  const adresses = [...new Set(dpe.map((d) => d.adresseBan).filter(Boolean))] as string[];

  await sb("fi_dpe_releve?on_conflict=immeuble_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{
      immeuble_id: immeubleId,
      cherche_le: maintenant,
      cherche_par: agent ?? null,
      adresse_demandee: libelleAdresse(adresse),
      adresses_trouvees: adresses,
      nb_dpe: dpe.length,
    }]),
  });

  if (dpe.length) {
    /* `merge-duplicates` sur (immeuble_id, numero_dpe) : les colonnes absentes
       du corps — dont `lot_id` — ne sont pas écrasées, donc les affectations
       manuelles survivent à une actualisation. */
    await sb("fi_dpe?on_conflict=immeuble_id,numero_dpe", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(dpe.map((d) => ({
        immeuble_id: immeubleId,
        numero_dpe: d.numeroDpe,
        etiquette_dpe: d.etiquetteDpe ?? null,
        etiquette_ges: d.etiquetteGes ?? null,
        surface: d.surface ?? null,
        etage: d.etage ?? null,
        position_logement: d.positionLogement ?? null,
        complement: d.complement ?? null,
        type_batiment: d.typeBatiment ?? null,
        periode_construction: d.periodeConstruction ?? null,
        date_etablissement: d.dateEtablissement ?? null,
        date_fin_validite: d.dateFinValidite ?? null,
        adresse_ban: d.adresseBan ?? null,
        identifiant_ban: d.identifiantBan ?? null,
        releve_le: maintenant,
      }))),
    });
  }

  revalidatePath(`/bien/${immeubleId}`);
  return (await releveDpe(immeubleId)) ?? {
    immeubleId, chercheLe: maintenant, adresseDemandee: libelleAdresse(adresse),
    adressesTrouvees: adresses, dpe: [],
  };
}

/* -------------------------------------------------------- Affecter */

/**
 * Rattache un DPE à un lot — ou détache.
 *
 * Le seul écrit qui touche un lot, et il ne part que d'un clic. On note QUI et
 * QUAND : un rapprochement d'adresse reste une décision humaine, elle mérite
 * d'être traçable comme telle.
 */
export async function affecterDpe(
  dpeId: string, lotId: string | null, immeubleId: string, agent?: string,
) {
  await sb(`fi_dpe?id=eq.${encodeURIComponent(dpeId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      lot_id: lotId,
      affecte_le: lotId ? new Date().toISOString() : null,
      affecte_par: lotId ? (agent ?? null) : null,
    }),
  });
  revalidatePath(`/bien/${immeubleId}`);
}

/**
 * Oublie le relevé d'un immeuble.
 *
 * Utile quand l'adresse de la fiche était fausse au moment de la recherche : le
 * relevé porte alors les DPE du voisin, et le corriger vaut mieux que de vivre
 * avec.
 */
export async function oublierReleveDpe(immeubleId: string) {
  const f = `immeuble_id=eq.${encodeURIComponent(immeubleId)}`;
  await sb(`fi_dpe?${f}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  await sb(`fi_dpe_releve?${f}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  revalidatePath(`/bien/${immeubleId}`);
}
