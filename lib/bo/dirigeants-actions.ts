"use server";

/* Qui décide, derrière la SCI.
 *
 * Une adresse et une raison sociale ne se démarchent pas : on écrit à
 * quelqu'un. Le registre national des entreprises publie les dirigeants —
 * nom, prénoms, qualité, année de naissance — et l'annuaire de la DINUM les
 * rend gratuitement. C'est de là que vient le nom du gérant.
 *
 * Ce qu'aucune source publique ne donne, en revanche : son téléphone, son
 * e-mail, son LinkedIn. Ces trois-là ne se « trouvent » pas dans un fichier,
 * ils se recoupent. Deux recoupements sont possibles honnêtement, et ce sont
 * les deux que fait cet écran :
 *
 *   1. NOTRE PROPRE FICHIER. 42 000 contacts, dont beaucoup de propriétaires
 *      déjà rencontrés : si le gérant de la SCI y est, on a son portable
 *      depuis des années sans le savoir. C'est le recoupement qui rapporte.
 *   2. LA RECHERCHE NOMINATIVE, préparée mais pas automatisée : un lien
 *      LinkedIn et un lien annuaire, avec le nom et la ville déjà dedans.
 *      L'agent clique, regarde, décide. Aspirer LinkedIn serait à la fois
 *      contraire à ses conditions et un joli piège à faux positifs.
 *
 * RGPD : le nom d'un dirigeant est public (registre du commerce), son
 * téléphone personnel ne l'est pas. Ce qu'on affiche vient soit du registre,
 * soit de notre propre fichier — où la personne est déjà, avec son historique.
 * Rien n'est aspiré ailleurs.
 */

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export type Dirigeant = {
  /** Une personne physique, ou une société associée (holding). */
  type: "personne" | "societe";
  nom: string;
  prenoms?: string;
  qualite?: string;
  annee?: string;
  /** Pour une holding : son SIREN, qu'on peut ouvrir à son tour. */
  siren?: string;
};

export type ContactRecoupe = {
  id: string;
  nom: string;
  email?: string;
  tel?: string;
  type?: string;
  /** Ce qui a fait la correspondance, pour que l'agent juge lui-même. */
  raison: string;
};

export type FicheDirigeants = {
  ok: true;
  siren: string;
  denomination?: string;
  siege?: string;
  dirigeants: Dirigeant[];
  /** Les fiches de notre base qui portent le même nom. */
  contacts: ContactRecoupe[];
} | { ok: false; erreur: string };

/* ------------------------------------------------------------ registre --- */

type BrutDirigeant = {
  nom?: string; prenoms?: string; qualite?: string; annee_de_naissance?: string;
  type_dirigeant?: string; siren?: string; denomination?: string;
};

/** Gérant d'abord : c'est lui qui signe le mandat. */
const RANG_QUALITE = (q: string) => {
  const t = q.toLowerCase();
  if (t.startsWith("gérant") || t.startsWith("gerant")) return 0;
  if (t.includes("président") || t.includes("president")) return 1;
  if (t.includes("directeur")) return 2;
  if (t.includes("associé") || t.includes("associe")) return 3;
  if (t.includes("commissaire aux comptes")) return 9;
  return 5;
};

function lireDirigeants(brut: BrutDirigeant[]): Dirigeant[] {
  return brut
    .map((d): Dirigeant => (
      d.type_dirigeant === "personne morale"
        ? {
          type: "societe",
          nom: (d.denomination ?? "").toUpperCase(),
          qualite: d.qualite,
          siren: d.siren,
        }
        : {
          type: "personne",
          nom: (d.nom ?? "").replace(/\s*\(.*\)\s*/, " ").trim().toUpperCase(),
          prenoms: d.prenoms,
          qualite: d.qualite,
          annee: d.annee_de_naissance,
        }
    ))
    .filter((d) => d.nom)
    .sort((a, b) => RANG_QUALITE(a.qualite ?? "") - RANG_QUALITE(b.qualite ?? ""));
}

async function depuisAnnuaire(siren: string) {
  const r = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${siren}&per_page=1`, {
    cache: "no-store",
  }).catch(() => null);
  if (!r?.ok) return null;
  const d = (await r.json().catch(() => null)) as {
    results?: {
      siren?: string; nom_raison_sociale?: string; nom_complet?: string;
      siege?: { adresse?: string }; dirigeants?: BrutDirigeant[];
    }[];
  } | null;
  const e = d?.results?.[0];
  if (!e || e.siren !== siren) return null;
  return {
    denomination: (e.nom_raison_sociale || e.nom_complet || "").toUpperCase() || undefined,
    siege: e.siege?.adresse ?? undefined,
    dirigeants: lireDirigeants(e.dirigeants ?? []),
  };
}

/* ---------------------------------------------------- notre propre fichier --- */

/**
 * Le gérant est-il déjà chez nous ?
 *
 * On cherche sur le nom de famille ET le premier prénom : chercher « MARTIN »
 * seul sur 42 000 fiches ne prouve rien, et l'agent perdrait son temps à
 * écarter des homonymes. Le prénom composé du registre (« MARC LOUIS ») est
 * réduit à son premier terme, c'est celui d'usage.
 */
async function contactsPourNom(nom: string, prenoms?: string): Promise<ContactRecoupe[]> {
  if (!SB_KEY || !nom) return [];
  const propre = (v: string) => v.replace(/[%*(),"\\]/g, "").trim();
  const famille = propre(nom);
  const prenom = propre((prenoms ?? "").split(/\s+/)[0] ?? "");
  if (famille.length < 3) return [];

  const p = new URLSearchParams({ select: "data", limit: "8" });
  if (prenom.length >= 2) {
    p.append("and", `(data->>nom.ilike.*${famille}*,data->>"prénom".ilike.*${prenom}*)`);
  } else {
    p.append("data->>nom", `ilike.${famille}`);
  }
  const res = await fetch(`${SB_URL}/rest/v1/bo_contact?${p}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return [];
  const rows = (await res.json()) as { data: Record<string, unknown> }[];
  return rows.map(({ data: c }) => ({
    id: String(c._id),
    nom: `${c["prénom"] ?? ""} ${c.nom ?? ""}`.trim() || String(c.email ?? "Sans nom"),
    email: typeof c.email === "string" ? c.email : undefined,
    tel: typeof c.portable_formatted === "string" ? c.portable_formatted
      : typeof c.portable === "string" ? c.portable : undefined,
    type: Array.isArray(c.Types) ? String(c.Types[0] ?? "") : undefined,
    raison: prenom ? `${prenom} ${famille}` : famille,
  }));
}

/* ------------------------------------------------------------- cache --- */

async function enCache(siren: string) {
  if (!SB_KEY) return null;
  const res = await fetch(
    `${SB_URL}/rest/v1/fi_pm_soc?select=nom,siege,dirigeants&code=eq.${siren}&dirigeants=not.is.null&limit=1`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, cache: "no-store" },
  ).catch(() => null);
  if (!res?.ok) return null;
  const rows = (await res.json()) as { nom?: string; siege?: string; dirigeants?: Dirigeant[] }[];
  const r = rows[0];
  return r?.dirigeants ? { denomination: r.nom, siege: r.siege, dirigeants: r.dirigeants } : null;
}

async function memoriser(siren: string, f: { denomination?: string; siege?: string; dirigeants: Dirigeant[] }) {
  if (!SB_KEY) return;
  await fetch(`${SB_URL}/rest/v1/fi_pm_soc?on_conflict=code`, {
    method: "POST",
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify([{
      code: siren,
      nom: f.denomination ?? siren,
      siege: f.siege ?? null,
      dirigeants: f.dirigeants,
      maj: new Date().toISOString(),
    }]),
    cache: "no-store",
  }).catch(() => null);
}

/* ------------------------------------------------------------- action --- */

/**
 * Les dirigeants d'une société, et ceux qu'on connaît déjà.
 *
 * Le recoupement ne porte que sur les personnes physiques : une holding
 * associée n'a pas de portable, on l'ouvre à son tour si on veut remonter.
 */
export async function ficheDirigeants(siren: string): Promise<FicheDirigeants> {
  if (!/^\d{9}$/.test(siren)) {
    return {
      ok: false,
      erreur: "Cette société n'a pas de SIREN au cadastre : le registre du commerce ne peut pas la retrouver.",
    };
  }
  try {
    const cache = await enCache(siren);
    const f = cache ?? await depuisAnnuaire(siren);
    if (!f) return { ok: false, erreur: "Société introuvable à l'annuaire des entreprises." };
    if (!cache) await memoriser(siren, f);

    /* Les trois premières personnes physiques suffisent : au-delà on est dans
       les associés mineurs d'une SCI familiale, pas dans les décideurs. */
    const personnes = f.dirigeants.filter((d) => d.type === "personne").slice(0, 3);
    const listes = await Promise.all(personnes.map((d) => contactsPourNom(d.nom, d.prenoms)));
    const vus = new Set<string>();
    const contacts: ContactRecoupe[] = [];
    for (const l of listes) {
      for (const c of l) if (!vus.has(c.id)) { vus.add(c.id); contacts.push(c); }
    }

    return {
      ok: true, siren,
      denomination: f.denomination,
      siege: f.siege,
      dirigeants: f.dirigeants,
      contacts,
    };
  } catch (e) {
    return { ok: false, erreur: e instanceof Error ? e.message : String(e) };
  }
}
