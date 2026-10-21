// Les formulaires du site France Immeuble, reçus par le BO (contrat §6, lot 3).
//
// Le site poste sur /api/site/lead ; ce fichier fait le travail. Trois
// formulaires, trois traitements :
//   - Vendre / Estimer → un immeuble au statut « 1 - FORMULAIRE », sous la même
//     vignette que les anciens formulaires (le suivi « Formulaire » porte le
//     texte que la carte affiche) ;
//   - Recherche → le contact, retrouvé par e-mail ou créé avec la note D, et
//     une recherche par ligne du formulaire ;
//   - Contact depuis une fiche à vendre → une DEMANDE DE DOSSIER dans
//     Questions, rattachée au bien et à son agent.
//
// Le site réessaie tout ce qui n'a pas reçu 200 (file `leads_outbox`). Chaque
// objet créé porte donc un identifiant tiré de la référence du formulaire :
// un réessai retrouve ce qui existe et ne crée rien de plus. Aucun e-mail ne
// part vers le visiteur, et rien ne se publie : on enregistre, c'est tout.

import { after } from "next/server";
import { capturerFacadeRue, enregistrerRecherche, saveAdresse } from "@/lib/bo/actions";
import { getAgents } from "@/lib/bubble/server";
import { AGENT_DEFAUT_INITIALES } from "@/lib/bo/agent-defaut";
import { CIBLES } from "@/lib/referentiels";

const BO_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const BO_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/* ------------------------------------------------------------------ Base */

async function lire(chemin: string): Promise<{ id: string; data: Record<string, unknown> }[]> {
  if (!BO_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY absente");
  const res = await fetch(`${BO_URL}/rest/v1/${chemin}`, {
    headers: { apikey: BO_KEY, Authorization: `Bearer ${BO_KEY}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Lecture ${res.status} : ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function rpc(fn: string, args: Record<string, unknown>) {
  if (!BO_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY absente");
  const res = await fetch(`${BO_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: BO_KEY, Authorization: `Bearer ${BO_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Écriture ${fn} ${res.status} : ${(await res.text()).slice(0, 200)}`);
}

const present = async (table: string, id: string) =>
  (await lire(`${table}?select=id&id=eq.${encodeURIComponent(id)}&limit=1`)).length > 0;

/**
 * Existe, ou a existé : une fiche passée à la corbeille compte comme traitée.
 * La base refuse d'ailleurs de la recréer (déclencheur
 * `trg_bo_refuser_reinsertion`) : un complément qui arrive après que l'agent a
 * supprimé le formulaire ne doit pas le ressusciter, ni boucler en erreur.
 */
const existe = async (table: string, id: string) =>
  (await present(table, id)) ||
  (await lire(`bo_trash?select=id&id=eq.${encodeURIComponent(id)}&src_table=eq.${table}&limit=1`).catch(() => [])).length > 0;

/** Insère, puis relit : un 200 au site doit vouloir dire « c'est dans la base ». */
async function inserer(table: string, id: string, doc: Record<string, unknown>) {
  await rpc("bo_insert_doc", { p_table: table, p_id: id, p_doc: sansVides(doc) });
  if (!(await present(table, id))) throw new Error(`${table} ${id} : l'insertion n'a rien laissé dans la base.`);
}

const sansVides = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ""));

/* -------------------------------------------------------------- Lecture */

const T = (v: unknown, max = 2000) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
const N = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};
const L = (v: unknown) => (Array.isArray(v) ? v.map((x) => T(x, 120)).filter((x): x is string => !!x) : []);

/** Une référence UUID, ou rien : c'est elle qui fabrique les identifiants. */
function reference(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s) ? s.replace(/-/g, "") : null;
}

export class LeadInvalide extends Error {}

/* ---------------------------------------------------------- Les agents */

async function agentParDefaut(): Promise<string | undefined> {
  const agents = await getAgents().catch(() => []);
  return (agents.find((a) => a.initials === AGENT_DEFAUT_INITIALES) ?? agents[0])?.id;
}

/* ---------------------------------------------------------- Le contact */

/**
 * Le contact du formulaire : retrouvé par son e-mail, sinon créé. Un contact
 * existant n'est jamais modifié (sa note, son agent restent ceux du BO) ; un
 * nouveau reçoit la note D quand le contrat le demande.
 */
async function contactDuLead(ref: string, p: {
  prenom?: string; nom?: string; email?: string; telephone?: string;
  source: string; agentId?: string; noteD: boolean; vendeur?: boolean; acheteur?: boolean;
}): Promise<{ id: string; nouveau: boolean }> {
  if (p.email) {
    // ilike sans joker : « _ » et « % » sont fréquents dans une adresse.
    const motif = p.email.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`);
    const [c] = await lire(`bo_contact?select=id,data&data->>email=ilike.${encodeURIComponent(motif)}&limit=1`);
    if (c) return { id: c.id, nouveau: false };
  }
  const id = `app_site_${ref}_c`;
  if (await existe("bo_contact", id)) return { id, nouveau: false };
  const now = new Date().toISOString();
  await inserer("bo_contact", id, {
    "prénom": p.prenom,
    nom: p.nom ?? (p.email ? p.email.split("@")[0] : "Contact du site"),
    email: p.email?.toLowerCase(),
    portable: p.telephone,
    Source: p.source,
    source: p.source,
    Note: p.noteD ? "D" : undefined,
    vendeur: p.vendeur ?? false,
    acheteur: p.acheteur ?? false,
    agent: false,
    archived: false,
    SUIVI: p.agentId,
    "Created Date": now,
    "Modified Date": now,
  });
  return { id, nouveau: true };
}

/** Un suivi « Formulaire » : c'est son texte que la carte du tableau de bord affiche. */
async function suiviFormulaire(id: string, p: { agentId?: string; contactId: string; immeubleId?: string; notes: string }) {
  if (await existe("bo_suivi", id)) return;
  const now = new Date().toISOString();
  await inserer("bo_suivi", id, {
    Type: "Formulaire",
    AGENT: p.agentId,
    CONTACT: p.contactId,
    IMMEUBLEs: p.immeubleId ? [p.immeubleId] : [],
    Canals: ["Formulaire"],
    notes: p.notes,
    Statut: "Traité",
    date_start: now,
    "Created Date": now,
    "Modified Date": now,
  });
  if (p.immeubleId) {
    await rpc("bo_append_ref", { p_table: "bo_immeuble", p_id: p.immeubleId, p_key: "SUIVIs", p_value: id }).catch(() => undefined);
  }
  await rpc("bo_append_ref", { p_table: "bo_contact", p_id: p.contactId, p_key: "SUIVIs", p_value: id }).catch(() => undefined);
}

/* ------------------------------------------------- Vendre / Estimer */

const eur = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;
const LOTS: [string, string, string][] = [
  ["lotsHabitation", "logement", "logements"],
  ["lotsCommerces", "commerce", "commerces"],
  ["lotsBureaux", "bureau", "bureaux"],
  ["lotsActivite", "local d'activité", "locaux d'activité"],
];

/** Le texte de la carte, à la façon des anciens formulaires. */
function texteEstimation(b: Record<string, unknown>, complement: boolean): string {
  const lignes: string[] = [];
  const message = T(b.message, 5000);
  lignes.push(complement ? `Complément du formulaire${message ? ` : ${message}` : ""}` : message ?? "Formulaire sans message.");
  for (const [cle, un, plusieurs] of LOTS) {
    const n = N(b[cle]);
    if (n) lignes.push(`- ${n} ${n > 1 ? plusieurs : un}`);
  }
  const surface = N(b.surface);
  const loyer = N(b.loyerAnnuel);
  const valeur = N(b.valeurEstimee);
  const details = [
    surface ? `Surface : ${surface.toLocaleString("fr-FR")} m²` : null,
    loyer ? `Loyers annuels : ${eur(loyer)}` : null,
    T(b.occupation) ? `Occupation : ${T(b.occupation)}` : null,
    T(b.travaux) ? `Travaux à prévoir : ${T(b.travaux)}` : null,
    T(b.echeance) ? `Échéance de vente : ${T(b.echeance)}` : null,
    valeur ? `Valeur estimée par le propriétaire : ${eur(valeur)}` : null,
  ].filter(Boolean);
  if (details.length) lignes.push("", ...(details as string[]));
  return lignes.join("\n");
}

/** Géocodage de l'adresse saisie, par la Base adresse nationale. */
async function geocoder(q: string) {
  for (const url of [
    `https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(q)}&limit=1&index=address`,
    `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=1`,
  ]) {
    const r = await fetch(url, { cache: "no-store" }).catch(() => null);
    if (!r?.ok) continue;
    const d = (await r.json().catch(() => null)) as {
      features?: { geometry?: { coordinates?: [number, number] }; properties?: Record<string, unknown> }[];
    } | null;
    const f = d?.features?.[0];
    if (f?.properties && f.geometry?.coordinates && Number(f.properties.score ?? 1) >= 0.5) {
      return {
        numero: T(f.properties.housenumber),
        rue: T(f.properties.street) ?? T(f.properties.name),
        cp: T(f.properties.postcode),
        ville: T(f.properties.city),
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0],
        label: T(f.properties.label) ?? q,
      };
    }
  }
  return null;
}

async function recevoirEstimation(ref: string, b: Record<string, unknown>) {
  const complement = b.etat === "complement";
  const formulaire = b.formulaire === "estimer" ? "estimer" : "vendre";
  const source = formulaire === "estimer" ? "Site - Formulaire estimer" : "Site - Formulaire Vendre";
  const immeubleId = `app_site_${ref}`;
  const agentId = await agentParDefaut();
  const dejaLa = await existe("bo_immeuble", immeubleId);

  // Le complément d'un formulaire déjà reçu : on complète la même fiche.
  if (complement && dejaLa) {
    const [im] = await lire(`bo_immeuble?select=id,data&id=eq.${immeubleId}`);
    if (!im) return { deja: true, id: immeubleId }; // supprimé par l'agent entre-temps
    if (im.data.site_lead_complement_le || (await existe("bo_suivi", `app_site_${ref}_s2`))) return { deja: true, id: immeubleId };
    const lots = ["lotsHabitation", "lotsCommerces", "lotsBureaux", "lotsActivite"].map((k) => N(b[k]) ?? 0);
    // Le complément ne redit pas ce que le principal a déjà dit.
    const avant = String(im?.data.form ?? "");
    const ajout = texteEstimation(b, true).split("\n")
      .filter((l, i) => i === 0 || !l.trim() || !avant.includes(l))
      .join("\n").replace(/\n{3,}/g, "\n\n").trim();
    await rpc("bo_patch_doc", {
      p_table: "bo_immeuble",
      p_id: immeubleId,
      p_patch: sansVides({
        surface_carrez: N(b.surface),
        fin_loyers_an: N(b.loyerAnnuel),
        lots_tot: lots.some((n) => n > 0) ? lots.reduce((s, n) => s + n, 0) : undefined,
        "occupé": T(b.occupation) ? T(b.occupation) !== "Libre" : undefined,
        form: `${avant}\n\n${ajout}`.trim(),
        site_lead_complement_le: new Date().toISOString(),
        "Modified Date": new Date().toISOString(),
      }),
    });
    /* Le complément rejoint le suivi du formulaire au lieu d'en ouvrir un
       second : la carte du tableau de bord affiche le DERNIER suivi, et elle
       doit continuer de montrer le message du propriétaire. */
    const [s1] = await lire(`bo_suivi?select=id,data&id=eq.app_site_${ref}_s1`);
    if (s1) {
      await rpc("bo_patch_doc", {
        p_table: "bo_suivi", p_id: s1.id,
        p_patch: { notes: `${String(s1.data.notes ?? "")}\n\n${ajout}`.trim(), "Modified Date": new Date().toISOString() },
      });
    } else {
      await suiviFormulaire(`app_site_${ref}_s2`, {
        agentId: T(im.data.AGENT) ?? agentId, contactId: T(im.data.PROPRIETAIRE) ?? "", immeubleId, notes: ajout,
      });
    }
    return { deja: false, id: immeubleId };
  }
  if (dejaLa) {
    /* Le principal après son complément (la file du site a pu les inverser) :
       la fiche existe, il lui manque le texte et le suivi du principal. */
    const suivi = `app_site_${ref}_s1`;
    if (await existe("bo_suivi", suivi)) return { deja: true, id: immeubleId };
    const [im] = await lire(`bo_immeuble?select=id,data&id=eq.${immeubleId}`);
    if (!im) return { deja: true, id: immeubleId };
    const texte = texteEstimation(b, false);
    await rpc("bo_patch_doc", {
      p_table: "bo_immeuble",
      p_id: immeubleId,
      p_patch: { form: `${texte}\n\n${String(im?.data.form ?? "")}`.trim(), "Modified Date": new Date().toISOString() },
    });
    await suiviFormulaire(suivi, {
      agentId: T(im?.data.AGENT) ?? agentId, contactId: T(im?.data.PROPRIETAIRE) ?? "", immeubleId, notes: texte,
    });
    return { deja: false, id: immeubleId };
  }

  // Le formulaire principal (ou un complément arrivé avant lui : il fait foi).
  const ville = T(b.ville, 120);
  const cp = T(b.codePostal, 10);
  const rue = T(b.rue, 200);
  if (!ville && !cp) throw new LeadInvalide("Ni ville ni code postal : impossible de situer l'immeuble.");
  const { id: contactId } = await contactDuLead(ref, {
    prenom: T(b.prenom, 80), nom: T(b.nom, 80), email: T(b.email, 200), telephone: T(b.telephone, 40),
    source, agentId, noteD: false, vendeur: true,
  });
  const lots = ["lotsHabitation", "lotsCommerces", "lotsBureaux", "lotsActivite"].map((k) => N(b[k]) ?? 0);
  const texte = texteEstimation(b, complement);
  const now = new Date().toISOString();
  await inserer("bo_immeuble", immeubleId, {
    Statut: "1 - FORMULAIRE",
    archived: false,
    standby: false,
    standby_Statut: "Traité",
    vendu: false,
    AGENT: agentId,
    PROPRIETAIRE: contactId,
    source,
    form: texte,
    adresse_numero_rue: T(b.numero, 20),
    adresse_rue: rue,
    adresse_zipcode: cp,
    adresse_ville: ville,
    adresse_dpt: cp ? (cp.startsWith("97") ? cp.slice(0, 3) : cp.slice(0, 2)) : undefined,
    surface_carrez: N(b.surface),
    fin_loyers_an: N(b.loyerAnnuel),
    lots_tot: lots.some((n) => n > 0) ? lots.reduce((s, n) => s + n, 0) : undefined,
    "occupé": T(b.occupation) ? T(b.occupation) !== "Libre" : undefined,
    date_contact_form: now,
    site_lead_ref: ref,
    "Created Date": now,
    "Modified Date": now,
  });
  await rpc("bo_append_ref", { p_table: "bo_contact", p_id: contactId, p_key: "IMMEUBLES", p_value: immeubleId }).catch(() => undefined);
  await suiviFormulaire(`app_site_${ref}_s${complement ? 2 : 1}`, { agentId, contactId, immeubleId, notes: texte });

  /* L'adresse géocodée et la façade : après la réponse, pour que le site ait
     son 200 sans attendre le réseau. Un échec ici ne défait rien. */
  after(async () => {
    const q = [T(b.numero), rue, cp, ville].filter(Boolean).join(" ");
    const g = q ? await geocoder(q).catch(() => null) : null;
    if (g) {
      await saveAdresse(immeubleId, {
        numero: g.numero ?? T(b.numero), rue: g.rue ?? rue, cp: g.cp ?? cp, ville: g.ville ?? ville,
        lat: g.lat, lon: g.lon, label: g.label,
      }).catch(() => undefined);
      await capturerFacadeRue(immeubleId).catch(() => undefined);
    }
  });
  return { deja: false, id: immeubleId };
}

/* ------------------------------------------------------------ Recherche */

const DESTINATIONS = new Set(["Logement", "Commerce", "Bureau", "Logistique", "Hôtel", "Parking"]);

async function recevoirRecherche(ref: string, b: Record<string, unknown>) {
  const recherches = Array.isArray(b.recherches) ? (b.recherches as Record<string, unknown>[]).slice(0, 10) : [];
  if (!T(b.email) && !T(b.telephone)) throw new LeadInvalide("Ni e-mail ni téléphone.");
  const agentId = await agentParDefaut();
  const source = "Site - Formulaire recherche";
  const contact = await contactDuLead(ref, {
    prenom: T(b.prenom, 80), nom: T(b.nom, 80), email: T(b.email, 200), telephone: T(b.telephone, 40),
    source, agentId, noteD: true, acheteur: true,
  });
  let creees = 0;
  for (const [i, r] of recherches.entries()) {
    const id = `app_site_${ref}_r${i + 1}`;
    if (await existe("bo_recherche", id)) continue;
    const cible = T(r.cible);
    await enregistrerRecherche({
      contactId: contact.id,
      cible: cible && CIBLES.includes(cible) ? cible : undefined,
      destinations: L(r.destinations).filter((d) => DESTINATIONS.has(d)),
      villes: L(r.villes),
      departements: L(r.departements).map((d) => d.toUpperCase()).filter((d) => /^(\d{2}|2A|2B|97\d)$/.test(d)),
      prixMin: N(r.prixMin),
      prixMax: N(r.prixMax),
      renta: N(r.rendementMin),
      commentaire: T(r.commentaire, 2000),
      exclusions: { destinations: [], villes: [], departements: [], regions: [] },
    }, agentId, { id, source });
    creees++;
  }
  const resume = recherches.map((r, i) => {
    const prix = [N(r.prixMin), N(r.prixMax)].map((x) => (x ? eur(x) : "…")).join(" à ");
    return `Recherche ${i + 1} : ${T(r.cible) ?? "cible non précisée"}, ${L(r.departements).join(", ") || "tous départements"}, ${prix}`;
  });
  await suiviFormulaire(`app_site_${ref}_s1`, {
    agentId, contactId: contact.id,
    notes: [`Formulaire de recherche du site${contact.nouveau ? "" : " (contact déjà connu)"}.`, ...resume].join("\n"),
  });
  return { deja: creees === 0 && recherches.length > 0, id: contact.id };
}

/* ------------------------------------------- Contact depuis une fiche */

const arrondi = (n: number) => Math.round(n / 10_000) * 10_000;

/**
 * La recherche de quelqu'un qui demande un dossier (MAV, 21/10 : « il faut
 * aussi créer la recherche »). Ses critères se déduisent du bien demandé : le
 * département, une fourchette de prix autour de celui du bien, les
 * destinations de ses lots. La cible reste vide : l'agent la précise à
 * l'appel. Un contact connu qui cherche déjà dans ce département garde sa
 * recherche, on ne lui en ajoute pas une seconde.
 */
async function rechercheDeLaDemande(
  ref: string, contact: { id: string; nouveau: boolean },
  im: { id: string; data: Record<string, unknown> }, titre: string | undefined, agentId?: string,
): Promise<string | undefined> {
  const cp = T(im.data.adresse_zipcode) ?? "";
  const dept = T(im.data.adresse_dpt) ?? (cp.startsWith("97") ? cp.slice(0, 3) : cp.slice(0, 2));
  if (!contact.nouveau && dept) {
    const siennes = await lire(`bo_recherche?select=id,data&data->>ACHETEUR=eq.${encodeURIComponent(contact.id)}&limit=50`).catch(() => []);
    const deja = siennes.find((r) => r.data.archived !== true && Array.isArray(r.data.dpts) && (r.data.dpts as unknown[]).includes(dept));
    if (deja) return deja.id;
  }
  const id = `app_site_${ref}_r1`;
  if (await existe("bo_recherche", id)) return id;
  const lots = await lire(`bo_lot?select=data&data->>IMMEUBLE=eq.${encodeURIComponent(im.id)}&limit=300`).catch(() => []);
  const destinations = [...new Set(lots.map((l) => String(l.data.Destination ?? "")).filter((d) => DESTINATIONS.has(d)))];
  const prix = N(im.data.prix_hai);
  await enregistrerRecherche({
    contactId: contact.id,
    destinations,
    villes: [],
    departements: dept ? [dept] : [],
    prixMin: prix ? arrondi(prix * 0.7) : undefined,
    prixMax: prix ? arrondi(prix * 1.3) : undefined,
    commentaire: `Créée depuis une demande de dossier sur le site${titre ? ` (${titre})` : ""}. Critères déduits du bien, à confirmer à l'appel.`,
    exclusions: { destinations: [], villes: [], departements: [], regions: [] },
  }, agentId, { id, source: "Site - Fiche à vendre" });
  return id;
}

async function recevoirContact(ref: string, b: Record<string, unknown>) {
  const questionId = `app_site_${ref}`;
  if (await existe("bo_question", questionId)) return { deja: true, id: questionId };
  if (!T(b.email) && !T(b.telephone)) throw new LeadInvalide("Ni e-mail ni téléphone.");
  const bienId = T(b.bien, 80);
  const [im] = bienId ? await lire(`bo_immeuble?select=id,data&id=eq.${encodeURIComponent(bienId)}`) : [];
  // La demande va à l'agent du bien ; sans bien reconnu, à l'agent par défaut.
  const agentId = T(im?.data.AGENT) ?? (await agentParDefaut());
  const source = "Site - Fiche à vendre";
  const contact = await contactDuLead(ref, {
    prenom: T(b.prenom, 80), nom: T(b.nom, 80), email: T(b.email, 200), telephone: T(b.telephone, 40),
    source, agentId, noteD: true, acheteur: true,
  });
  const rechercheId = im ? await rechercheDeLaDemande(ref, contact, im, T(b.bienTitre, 200), agentId) : undefined;
  const now = new Date().toISOString();
  await inserer("bo_question", questionId, {
    source,
    demande_dossier: true,
    "suivi par": agentId ? [agentId] : undefined,
    ended: false,
    message: T(b.message, 5000) ?? (T(b.bienTitre) ? `Demande de dossier : ${T(b.bienTitre)}` : "Demande de dossier"),
    email: T(b.email, 200)?.toLowerCase(),
    "téléphone": T(b.telephone, 40),
    Projet: T(b.projet, 200),
    IMMEUBLE: im ? im.id : undefined,
    bien_titre: T(b.bienTitre, 200),
    CONTACT: contact.id,
    RECHERCHE: rechercheId,
    searchfield: [T(b.prenom), T(b.nom), T(b.email), T(b.bienTitre)].filter(Boolean).join(" ").toLowerCase(),
    "Created Date": now,
    "Modified Date": now,
  });
  return { deja: false, id: questionId };
}

/* -------------------------------------------------------------- Entrée */

export async function recevoirLead(b: Record<string, unknown>): Promise<{ deja: boolean; id: string }> {
  const ref = reference(b.ref);
  if (!ref) throw new LeadInvalide("Référence absente ou qui n'est pas un UUID.");
  switch (b.type) {
    case "estimation": return recevoirEstimation(ref, b);
    case "recherche_acquereur": return recevoirRecherche(ref, b);
    case "contact": return recevoirContact(ref, b);
    default: throw new LeadInvalide(`Type de formulaire inconnu : ${String(b.type).slice(0, 40)}`);
  }
}

/* ------------------------------------------------- Tableau de bord */

/** Les demandes de dossier ouvertes d'un agent, pour le compteur du tableau de bord. */
export async function demandesDossierOuvertes(agentId: string): Promise<number> {
  const rows = await lire(
    "bo_question?select=id,data&data->>demande_dossier=eq.true&data->>ended=eq.false&limit=500",
  ).catch(() => []);
  return rows.filter((q) => {
    const suivi = q.data["suivi par"];
    return Array.isArray(suivi) ? suivi.includes(agentId) : suivi === agentId;
  }).length;
}
