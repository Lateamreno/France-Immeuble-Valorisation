// Le compte client du site, vu du BO (contrat §9, lot 4, validé le 22/10).
//
// Le compte vit sur le site ; le BO y dépose, pour chaque client rattaché, ce
// qu'il a le droit de voir, dans cinq tables de la base du site. Clés neutres
// partout : la clé du compte vient du site, la clé de chaque ligne est un UUID
// que le BO tire une fois et garde sur sa fiche (`site_cle`). Jamais un
// identifiant du BO, jamais un nom d'acquéreur, jamais un montant d'offre.
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

export const TABLES_COMPTE = ["compte_recherches", "compte_propositions", "compte_demandes", "compte_biens", "compte_estimations"] as const;
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

  // Ses immeubles, et leurs estimations envoyées.
  const lb: Record<string, unknown>[] = [];
  const le: Record<string, unknown>[] = [];
  for (const im of immeubles) {
    const st = statutNum(im.data.Statut);
    if (im.data.archived === true && st !== 11) continue;
    if (st === 0) continue;
    const c = await carte(im.id);
    if (!c) continue;
    const cle = await cleDe("bo_immeuble", im);
    const [props, visites, offres, estimations] = await Promise.all([
      lireBo(`bo_proposition?select=id&data->>IMMEUBLE=eq.${encodeURIComponent(im.id)}&limit=5000`),
      lireBo(`bo_visite?select=id&data->>IMMEUBLE=eq.${encodeURIComponent(im.id)}&limit=1000`),
      lireBo(`bo_offre?select=id&data->IMMEUBLEs=cs.${encodeURIComponent(JSON.stringify([im.id]))}&limit=500`),
      lireBo(`bo_estimation?select=id,data&data->>IMMEUBLE=eq.${encodeURIComponent(im.id)}&limit=50`),
    ]);
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

  return { compte_recherches: lr, compte_propositions: lp, compte_demandes: ld, compte_biens: lb, compte_estimations: le };
}

/* ------------------------------------------------------------ Le dépôt */

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
    await remplacer(s, compte, t, lignes[t]).catch((e) => erreurs.push(`${t} : ${e instanceof Error ? e.message : String(e)}`));
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
