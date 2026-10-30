// Le compte client du site, vu du BO (contrat §9, lot 4, validé le 22/10).
//
// Le compte vit sur le site ; le BO y dépose, pour chaque client rattaché, ce
// qu'il a le droit de voir, dans cinq tables de la base du site. Clés neutres
// partout : la clé du compte vient du site, la clé de chaque ligne est un UUID
// que le BO tire une fois et garde sur sa fiche (`site_cle`). Jamais un
// identifiant du BO, jamais un nom d'acquéreur, jamais un montant d'offre.
//
// Revirement de MAV le 30/10 (V2) : une offre que l'agent TRANSMET au
// propriétaire lui est montrée telle qu'on la lui enverrait — nom de
// l'acquéreur, date, validité, HAI, net vendeur, honoraires, et le document.
// Rien ne part sans ce geste. Les acquéreurs, eux, ne voient toujours ni nom ni
// montant d'offre.
//
// Un dépôt est une photographie complète du client : ce qui n'y est plus est
// effacé. On le rejoue à volonté (rattachement, proposition, réponse,
// changement d'étape d'un bien, reprise de nuit).

import { randomUUID } from "node:crypto";
import { departement, typeImmeuble } from "@/lib/diffusion";

const BO_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const BO_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const REF_BO = "sojtmhdrzmdbtqborxsi";

type Doc = { id: string; data: Record<string, unknown> };
type Site = { url: string; cle: string };

function site(): Site | null {
  const url = process.env.SITE_FI_SUPABASE_URL?.trim().replace(/\/+$/, "");
  const cle = process.env.SITE_FI_SUPABASE_SECRET_KEY?.trim();
  if (!url || !cle || url.includes(REF_BO)) return null;
  return { url, cle };
}

async function lireBo(chemin: string): Promise<Doc[]> {
  if (!BO_KEY) return [];
  const res = await fetch(`${BO_URL}/rest/v1/${chemin}`, {
    headers: { apikey: BO_KEY, Authorization: `Bearer ${BO_KEY}` },
    cache: "no-store",
  });
  return res.ok ? res.json() : [];
}

async function patchBo(table: string, id: string, patch: Record<string, unknown>) {
  if (!BO_KEY) return;
  await fetch(`${BO_URL}/rest/v1/rpc/bo_patch_doc`, {
    method: "POST",
    headers: { apikey: BO_KEY, Authorization: `Bearer ${BO_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_table: table, p_id: id, p_patch: patch }),
    cache: "no-store",
  });
}

async function versSite(s: Site, chemin: string, init: RequestInit = {}) {
  const res = await fetch(`${s.url}${chemin}`, {
    ...init,
    headers: { apikey: s.cle, Authorization: `Bearer ${s.cle}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Site ${res.status} : ${(await res.text()).slice(0, 300)}`);
  return res;
}

const S = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const N = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);
const jour = (v: unknown) => {
  const t = typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isFinite(t) && new Date(t).getFullYear() > 2000 ? new Date(t).toISOString().slice(0, 10) : null;
};
const statutNum = (v: unknown) => parseInt(String(v ?? "").split(" ")[0], 10);

/** La clé neutre d'une fiche : tirée une fois, gardée sur la fiche. */
async function cleDe(table: string, d: Doc): Promise<string> {
  const deja = S(d.data.site_cle);
  if (deja) return deja;
  const cle = randomUUID();
  await patchBo(table, d.id, { site_cle: cle });
  return cle;
}

export const TABLES_COMPTE = [
  "compte_recherches", "compte_propositions", "compte_demandes", "compte_biens", "compte_estimations", "compte_documents",
  /* V2 (30/10) : tant que le site ne les a pas créées, on les saute sans bruit. */
  "compte_offres", "compte_messages", "compte_agent",
] as const;
export type TableCompte = (typeof TABLES_COMPTE)[number];
export type LignesCompte = Record<TableCompte, Record<string, unknown>[]>;

/* ---------------------------------------------------------- Les biens */

/** Ce qu'un client peut savoir d'un immeuble : commune, type, lots, prix. */
async function carteImmeuble(imId: string) {
  const [im] = await lireBo(`bo_immeuble?select=id,data&id=eq.${encodeURIComponent(imId)}`);
  if (!im) return null;
  const lots = (await lireBo(`bo_lot?select=id,data&data->>IMMEUBLE=eq.${encodeURIComponent(imId)}&limit=300`)).map((l) => l.data);
  const cp = S(im.data.adresse_zipcode) ?? "";
  const st = statutNum(im.data.Statut);
  return {
    im,
    st,
    commune: S(im.data.adresse_ville) ?? "",
    dept: departement(cp) || S(im.data.adresse_dpt) || null,
    type: lots.length ? typeImmeuble(lots) : null,
    lots: lots.length || N(im.data.lots_tot) || null,
    prix: N(im.data.prix_hai) ?? null,
    rendement: N(im.data.fin_renta_ba) ?? null,
    // L'identifiant de `biens_a_vendre` est celui de l'immeuble ; il n'est donné
    // que pour un bien EN LIGNE sur le site, déjà public.
    bien: S(im.data.site_statut) && !S(im.data.site_retire_le) ? im.id : null,
  };
}

/* ----------------------------------------------------- La photographie */

/** Tout ce que le compte de ce contact doit montrer, ligne par ligne. */
export async function lignesDuCompte(contactId: string, compte: string): Promise<LignesCompte> {
  const maj_le = new Date().toISOString();
  const cid = encodeURIComponent(contactId);
  const [recherches, propositions, questions, immeubles] = await Promise.all([
    lireBo(`bo_recherche?select=id,data&data->>ACHETEUR=eq.${cid}&limit=200`),
    lireBo(`bo_proposition?select=id,data&data->>ACHETEUR=eq.${cid}&order=id.desc&limit=300`),
    lireBo(`bo_question?select=id,data&data->>CONTACT=eq.${cid}&data->>demande_dossier=eq.true&limit=100`),
    lireBo(`bo_immeuble?select=id,data&or=(data->>PROPRIETAIRE.eq.${cid},data->PROPRIETAIREs.cs.${encodeURIComponent(JSON.stringify([contactId]))})&limit=100`),
  ]);
  const cartes = new Map<string, Awaited<ReturnType<typeof carteImmeuble>>>();
  const carte = async (id: string) => {
    if (!cartes.has(id)) cartes.set(id, await carteImmeuble(id));
    return cartes.get(id) ?? null;
  };

  // Les recherches actives.
  const lr: Record<string, unknown>[] = [];
  for (const r of recherches.filter((x) => x.data.archived !== true)) {
    const prix = [N(r.data.prix_min), N(r.data.prix_max)];
    lr.push({
      compte, cle: await cleDe("bo_recherche", r),
      cible: S(r.data.Cible) ?? null,
      departements: Array.isArray(r.data.dpts) ? r.data.dpts : [],
      villes: Array.isArray(r.data.villes) ? r.data.villes : [],
      prix_min: prix[0] ?? null, prix_max: prix[1] ?? null,
      rendement_min: N(r.data.renta) ?? null,
      destinations: Array.isArray(r.data.Destinations) ? r.data.Destinations : [],
      commentaire: S(r.data.commentaire) ?? null,
      maj_le,
    });
  }

  /* Les propositions : celles de l'année, et toutes celles dont le bien est
     encore en vente. Une proposition de 2019 sur un bien vendu n'apprend rien. */
  const ilYaUnAn = Date.now() - 365 * 86_400_000;
  const lp: Record<string, unknown>[] = [];
  const vus = new Set<string>();
  for (const p of propositions) {
    const imId = S(p.data.IMMEUBLE);
    if (!imId || vus.has(imId)) continue;
    const c = await carte(imId);
    if (!c) continue;
    const recente = Date.parse(String(p.data.date_envoi ?? p.data["Created Date"] ?? "")) > ilYaUnAn;
    if (!recente && !(c.st >= 5 && c.st <= 10)) continue;
    vus.add(imId);
    const st = String(p.data.Statut ?? "");
    const reponse = S(p.data.site_reponse)
      ?? (/^(Intéressé|Visite|Offre)/.test(st) ? "interesse" : st.startsWith("Refusée (sans offre)") ? "pas_pour_moi" : null);
    lp.push({
      compte, cle: await cleDe("bo_proposition", p),
      bien: c.bien, commune: c.commune, dept: c.dept, type: c.type, lots: c.lots,
      prix: c.prix, rendement: c.rendement,
      propose_le: jour(p.data.date_envoi ?? p.data["Created Date"]),
      reponse, repondu_le: jour(p.data.site_repondu_le),
      etat: c.st >= 5 && c.st <= 6 ? "disponible" : c.st >= 7 && c.st <= 10 ? "sous_offre" : c.st === 11 ? "vendu" : "retire",
      maj_le,
    });
  }

  // Les demandes de dossier.
  const ld: Record<string, unknown>[] = [];
  for (const q of questions) {
    const imId = S(q.data.IMMEUBLE);
    const c = imId ? await carte(imId) : null;
    const envoye = imId
      ? propositions.some((p) => p.data.IMMEUBLE === imId && String(p.data.date_envoi ?? "") >= String(q.data["Created Date"] ?? ""))
      : false;
    ld.push({
      compte, cle: await cleDe("bo_question", q),
      bien: c?.bien ?? null,
      titre: S(q.data.bien_titre) ?? (c ? `${c.type ?? "Immeuble"} à ${c.commune}` : "Demande de dossier"),
      etat: envoye ? "dossier_envoye" : q.data.ended === true ? "close" : "en_attente",
      demande_le: jour(q.data["Created Date"]),
      maj_le,
    });
  }

  // Ses immeubles, leurs estimations envoyées et les pièces qu'il a déposées.
  const lb: Record<string, unknown>[] = [];
  const lpieces: Record<string, unknown>[] = [];
  const le: Record<string, unknown>[] = [];
  const lo: Record<string, unknown>[] = [];
  const clesBiens = new Map<string, string>();
  for (const im of immeubles) {
    const st = statutNum(im.data.Statut);
    if (im.data.archived === true && st !== 11) continue;
    if (st === 0) continue;
    const c = await carte(im.id);
    if (!c) continue;
    const cle = await cleDe("bo_immeuble", im);
    clesBiens.set(im.id, cle);
    const [props, visites, offres, estimations, pieces] = await Promise.all([
      lireBo(`bo_proposition?select=id&data->>IMMEUBLE=eq.${encodeURIComponent(im.id)}&limit=5000`),
      lireBo(`bo_visite?select=id&data->>IMMEUBLE=eq.${encodeURIComponent(im.id)}&limit=1000`),
      lireBo(`bo_offre?select=id,data&data->IMMEUBLEs=cs.${encodeURIComponent(JSON.stringify([im.id]))}&limit=500`),
      lireBo(`bo_estimation?select=id,data&data->>IMMEUBLE=eq.${encodeURIComponent(im.id)}&limit=50`),
      /* Les pièces que CE compte a déposées sur cet immeuble (lot 5) — jamais
         le reste du coffre : un co-indivisaire ne voit pas ce qu'a déposé
         l'autre, et aucune pièce de l'agence ne remonte. */
      lireBo(`bo_app_document?select=id,data&data->>IMMEUBLE=eq.${encodeURIComponent(im.id)}&data->>site_compte=eq.${encodeURIComponent(compte)}&limit=200`),
    ]);
    for (const d of pieces) {
      lpieces.push({
        compte, cle: await cleDe("bo_app_document", d), bien_cle: cle,
        categorie: S(d.data.site_categorie) ?? "autre",
        nom: S(d.data.file_name) ?? "Pièce",
        recu_le: jour(d.data["Created Date"]),
      });
    }
    lb.push({
      compte, cle,
      commune: c.commune, dept: c.dept, type: c.type, lots: c.lots,
      etape: st <= 3 ? "estimation" : st === 4 ? "mandat" : st <= 6 ? "commercialisation" : st <= 10 ? "sous_offre" : "vendu",
      prix: st >= 4 ? c.prix : null,
      sollicites: st >= 5 ? props.length : null,
      visites: st >= 5 ? visites.length : null,
      offres: st >= 5 ? offres.length : null,
      bien: c.bien,
      maj_le,
    });
    /* Les offres que l'agent a transmises au propriétaire (V2, 30/10). */
    for (const o of offres.filter((x) => S(x.data.site_transmise_le))) {
      const ocle = await cleDe("bo_offre", o);
      lo.push({
        compte, cle: ocle, bien_cle: cle,
        acquereur: await acquereurDe(o),
        recue_le: jour(o.data.date ?? o.data["Created Date"]),
        valable_jours: N(o.data.validite_jours) ?? null,
        valable_jusqu_au: jour(o.data.date_expiration) ?? finValidite(o.data.date, N(o.data.validite_jours)),
        prix_hai: N(o.data.prix_hai) ?? null,
        net_vendeur: N(o.data.prix_nv) ?? null,
        honoraires: N(o.data.honos_ttc) ?? null,
        statut: STATUT_OFFRE[S(o.data.Statut) ?? ""] ?? "en_cours",
        document: S(o.data.pdf) ? await deposerDocumentClient(compte, `offres/${ocle}.pdf`, S(o.data.pdf)!) : null,
        transmise_le: jour(o.data.site_transmise_le),
        maj_le,
      });
    }
    /* Une estimation n'apparaît que lorsqu'un agent l'a envoyée au propriétaire :
       jamais un chiffre calculé sans un humain (§7.1). */
    for (const e of estimations.filter((x) => String(x.data.Statut ?? "").startsWith("3") && N(x.data.prix_hai))) {
      const valeur = N(e.data.prix_hai)!;
      const surface = N(e.data.imm_carrez_tot_tot);
      const loyers = N(e.data.imm_loyer_hc_tot) ?? 0; // annuels HC (vérifié sur les estimations envoyées)
      le.push({
        compte, cle: await cleDe("bo_estimation", e), bien_cle: cle,
        valeur,
        prix_m2: surface && surface > 0 ? Math.round(valeur / surface) : null,
        rendement: loyers > 0 ? Math.round((loyers / valeur) * 1000) / 10 : null,
        estimee_le: jour(e.data.date_envoi ?? e.data["Created Date"]),
      });
    }
  }

  /* La messagerie (V2, 30/10) : ce que le client a écrit depuis son compte et
     ce que les agents lui ont répondu, dans l'ordre. */
  const messages = await lireBo(`bo_suivi?select=id,data&data->>CONTACT=eq.${cid}&data->>site_message=not.is.null&order=id.asc&limit=500`);
  const lm: Record<string, unknown>[] = [];
  /* Le titre d'une conversation est porté par le message qui l'ouvre ; on le
     répète sur chaque ligne. */
  const titres = new Map<string, string>();
  for (const m of messages) {
    const c = S(m.data.site_conversation), t = S(m.data.site_titre);
    if (c && t && !titres.has(c)) titres.set(c, t);
  }
  for (const m of messages.sort((a, b) => String(a.data["Created Date"] ?? "").localeCompare(String(b.data["Created Date"] ?? "")))) {
    const imId = Array.isArray(m.data.IMMEUBLEs) ? S(m.data.IMMEUBLEs[0]) : undefined;
    lm.push({
      compte, cle: await cleDe("bo_suivi", m),
      bien_cle: imId ? clesBiens.get(imId) ?? null : null,
      conversation: S(m.data.site_conversation) ?? null,
      titre: titres.get(S(m.data.site_conversation) ?? "") ?? null,
      pieces: Array.isArray(m.data.site_pieces) ? (m.data.site_pieces as { nom?: string }[]).map((x) => x.nom).filter(Boolean) : [],
      de: m.data.site_message === "agent" ? "agent" : "client",
      auteur: m.data.site_message === "agent" ? S(m.data.site_auteur) ?? "France Immeuble" : null,
      texte: S(m.data.notes) ?? "",
      envoye_le: S(m.data["Created Date"]) ?? maj_le,
      maj_le,
    });
  }

  /* Point 4 du site (30/10) : l'agent attitré et « appelé ». Un acquéreur noté
     D n'a pas encore été appelé : pas d'agent, pas d'off-market. La lettre ne
     part jamais, seulement le oui ou non. */
  const [ct] = await lireBo(`bo_contact?select=id,data&id=eq.${cid}`);
  const appele = !!ct && S(ct.data.Note) !== "D" && !!S(ct.data.SUIVI);
  const [ag] = appele ? await lireBo(`bo_agentfi?select=id,data&id=eq.${encodeURIComponent(S(ct!.data.SUIVI)!)}`) : [];
  const photo = S(ag?.data.photo);
  const la: Record<string, unknown>[] = ct ? [{
    compte, cle: await cleDe("bo_contact", ct),
    appele,
    agent_nom: ag ? [S(ag.data["prénom"]), S(ag.data.nom)].filter(Boolean).join(" ") || null : null,
    agent_poste: S(ag?.data.Poste) ?? null,
    agent_tel: S(ag?.data["portable (TXT)"]) ?? S(ag?.data.portable) ?? null,
    agent_email: S(ag?.data.email)?.toLowerCase() ?? null,
    agent_photo: photo ? (photo.startsWith("//") ? `https:${photo}` : /^https:\/\//.test(photo) ? photo : null) : null,
    maj_le,
  }] : [];

  return {
    compte_recherches: lr, compte_propositions: lp, compte_demandes: ld, compte_biens: lb, compte_estimations: le,
    compte_documents: lpieces, compte_offres: lo, compte_messages: lm, compte_agent: la,
  };
}

/* ---------------------------------------------------- Offres (V2, 30/10) */

const STATUT_OFFRE: Record<string, string> = {
  "En cours": "en_cours", "Contre offre": "contre_offre", "Acceptée": "acceptee", "Refusée": "refusee",
  "Compromis programmé": "compromis", "Compromis signé": "compromis", "Vente prévue": "compromis", "Vendu": "vendu",
};

const finValidite = (date: unknown, jours?: number) => {
  const t = typeof date === "string" ? Date.parse(date) : NaN;
  return Number.isFinite(t) && jours ? new Date(t + jours * 86_400_000).toISOString().slice(0, 10) : null;
};

/** Le nom de l'acquéreur, tel qu'il figure sur son offre : la société d'abord. */
async function acquereurDe(o: Doc): Promise<string | null> {
  const id = Array.isArray(o.data.ACHETEURs) ? S(o.data.ACHETEURs[0]) : undefined;
  const [c] = id ? await lireBo(`bo_contact?select=id,data&id=eq.${encodeURIComponent(id)}`) : [];
  const personne = c ? [S(c.data["prénom"]), S(c.data.nom)].filter(Boolean).join(" ") : "";
  return S(c?.data.entreprise_nom) ?? (personne || S(o.data.acheteur_nom) || null);
}

/** Le seau privé du site où le BO dépose les documents d'un client (V2). */
export const SEAU_CLIENTS = "documents-clients";

/** Un fichier du BO : `storage:…` dans son coffre, ou une adresse (fichiers de l'ancien BO). */
async function lireFichierBo(ref: string): Promise<ArrayBuffer | null> {
  const url = ref.startsWith("storage:") ? `${BO_URL}/storage/v1/object/bo-files/${ref.slice(8)}`
    : ref.startsWith("//") ? `https:${ref}` : ref;
  if (!/^https:\/\//.test(url)) return null;
  const res = await fetch(url, {
    headers: url.startsWith(BO_URL) && BO_KEY ? { Authorization: `Bearer ${BO_KEY}` } : {},
    cache: "no-store",
  }).catch(() => null);
  return res?.ok ? res.arrayBuffer() : null;
}

/**
 * Dépose un document dans le dossier du compte sur le site, une seule fois :
 * s'il y est déjà, on ne le retélécharge pas. Rend le chemin, ou `null` si le
 * seau n'existe pas encore ou si le fichier est illisible.
 */
async function deposerDocumentClient(compte: string, chemin: string, source: string): Promise<string | null> {
  const s = site();
  if (!s) return null;
  const complet = `${compte}/${chemin}`;
  const info = await fetch(`${s.url}/storage/v1/object/info/${SEAU_CLIENTS}/${complet}`, {
    headers: { apikey: s.cle, Authorization: `Bearer ${s.cle}` }, cache: "no-store",
  }).catch(() => null);
  if (info?.ok) return complet;
  const octets = await lireFichierBo(source);
  if (!octets) return null;
  const up = await fetch(`${s.url}/storage/v1/object/${SEAU_CLIENTS}/${complet}`, {
    method: "POST",
    headers: { apikey: s.cle, Authorization: `Bearer ${s.cle}`, "Content-Type": "application/pdf", "x-upsert": "true" },
    body: new Uint8Array(octets),
    cache: "no-store",
  }).catch(() => null);
  return up?.ok ? complet : null;
}

/* ------------------------------------------------------------ Le dépôt */

/** Une table que le site n'a pas encore créée (V2) : PostgREST répond PGRST205. */
const tableAbsente = (e: unknown) => /PGRST205|Could not find the table|does not exist/i.test(e instanceof Error ? e.message : String(e));

/** Remplace, table par table, les lignes du compte par la photographie. */
async function remplacer(s: Site, compte: string, table: TableCompte, lignes: Record<string, unknown>[]) {
  if (lignes.length) {
    await versSite(s, `/rest/v1/${table}?on_conflict=compte,cle`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(lignes),
    });
  }
  const gardees = lignes.map((l) => `"${String(l.cle)}"`).join(",");
  await versSite(s, `/rest/v1/${table}?compte=eq.${encodeURIComponent(compte)}${gardees ? `&cle=not.in.(${encodeURIComponent(gardees)})` : ""}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

/** Dépose tout ce que voit le compte de ce contact. Rien si pas de compte. */
export async function deposerCompte(contactId: string): Promise<{ ok: boolean; message: string }> {
  const s = site();
  if (!s) return { ok: false, message: "Le site n'est pas branché." };
  const [c] = await lireBo(`bo_contact?select=id,data&id=eq.${encodeURIComponent(contactId)}`);
  const compte = S(c?.data.site_compte);
  if (!c || !compte) return { ok: false, message: "Ce contact n'a pas de compte sur le site." };
  const lignes = await lignesDuCompte(contactId, compte);
  const erreurs: string[] = [];
  for (const t of TABLES_COMPTE) {
    await remplacer(s, compte, t, lignes[t]).catch((e) => {
      if (!tableAbsente(e)) erreurs.push(`${t} : ${e instanceof Error ? e.message : String(e)}`);
    });
  }
  await patchBo("bo_contact", contactId, {
    site_compte_depot_le: new Date().toISOString(),
    site_compte_erreur: erreurs.length ? erreurs.join(" · ").slice(0, 500) : null,
  });
  return erreurs.length ? { ok: false, message: erreurs.join(" · ") } : { ok: true, message: "Compte à jour." };
}

/** Efface, sur le site, tout ce que le BO avait déposé pour ce compte. */
export async function effacerCompte(compte: string) {
  const s = site();
  if (!s) return;
  for (const t of TABLES_COMPTE) {
    await versSite(s, `/rest/v1/${t}?compte=eq.${encodeURIComponent(compte)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => undefined);
  }
}

/** Les contacts rattachés à un compte, pour la reprise de nuit. */
export async function deposerTousLesComptes() {
  const contacts = await lireBo("bo_contact?select=id,data&data->>site_compte=not.is.null&limit=5000");
  let ok = 0;
  for (const c of contacts) if ((await deposerCompte(c.id).catch(() => ({ ok: false }))).ok) ok++;
  return { comptes: contacts.length, ok };
}

/** Après une écriture sur un immeuble : ses propriétaires et ses acquéreurs rattachés à un compte. */
export async function deposerComptesDeLImmeuble(immeubleId: string) {
  const id = encodeURIComponent(immeubleId);
  const [[im], props] = await Promise.all([
    lireBo(`bo_immeuble?select=id,data&id=eq.${id}`),
    lireBo(`bo_proposition?select=id,data&data->>IMMEUBLE=eq.${id}&limit=5000`),
  ]);
  const ids = new Set<string>([
    S(im?.data.PROPRIETAIRE),
    ...(Array.isArray(im?.data.PROPRIETAIREs) ? (im!.data.PROPRIETAIREs as unknown[]).map(S) : []),
    ...props.map((p) => S(p.data.ACHETEUR)),
  ].filter((x): x is string => !!x));
  if (!ids.size) return;
  const filtre = [...ids].map((x) => `"${x}"`).join(",");
  const avecCompte = await lireBo(`bo_contact?select=id&id=in.(${encodeURIComponent(filtre)})&data->>site_compte=not.is.null`);
  for (const c of avecCompte) await deposerCompte(c.id).catch(() => undefined);
}

/** Ce que voit le client, relu dans la base du site : c'est le panneau de la fiche contact. */
export async function lireCompteSurLeSite(compte: string): Promise<LignesCompte | null> {
  const s = site();
  if (!s) return null;
  const out = {} as LignesCompte;
  for (const t of TABLES_COMPTE) {
    const r = await versSite(s, `/rest/v1/${t}?compte=eq.${encodeURIComponent(compte)}&select=*`).catch(() => null);
    out[t] = r ? await r.json() : [];
  }
  return out;
}

/* ------------------------------------------------- Les pièces (lot 5) */

/** Le seau privé du site où le propriétaire dépose ses pièces (contrat §10). */
export const SEAU_DEPOTS = "depots-proprietaires";

/** Lit une pièce déposée sur le site ; `null` si le site n'est pas branché ou si elle n'y est pas. */
export async function lirePieceDuSite(chemin: string): Promise<{ octets: Buffer; taille: number } | null> {
  const s = site();
  if (!s) return null;
  const res = await fetch(`${s.url}/storage/v1/object/${SEAU_DEPOTS}/${chemin.split("/").map(encodeURIComponent).join("/")}`, {
    headers: { apikey: s.cle, Authorization: `Bearer ${s.cle}` },
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return null;
  const octets = Buffer.from(await res.arrayBuffer());
  return { octets, taille: octets.length };
}

/** Efface la pièce du seau du site, une fois rangée au coffre : le site n'en garde pas de copie. */
export async function effacerPieceDuSite(chemin: string): Promise<boolean> {
  const s = site();
  if (!s) return false;
  const res = await fetch(`${s.url}/storage/v1/object/${SEAU_DEPOTS}`, {
    method: "DELETE",
    headers: { apikey: s.cle, Authorization: `Bearer ${s.cle}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: [chemin] }),
    cache: "no-store",
  }).catch(() => null);
  return !!res?.ok;
}
