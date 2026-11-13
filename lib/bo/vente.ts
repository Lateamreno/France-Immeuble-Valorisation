import "server-only";

/* Le suivi de la vente (MAV, 27/10, retour #549) : « on rentre les notaires de
 * chacun avec leurs coordonnées, et on met tous les mails qu'on reçoit des
 * notaires et qu'on leur envoie ; ce serait bien qu'on récupère aussi les
 * échanges avec les vendeurs et les acquéreurs pour bien vérifier ce qu'il se
 * passe. » Ouvert dès la signature du mandat, complet à l'offre acceptée.
 *
 * Rien n'est recopié : les parties viennent de la fiche (propriétaires, offre
 * retenue, notaires choisis), les jalons de l'offre, et les e-mails sont
 * cherchés à la demande dans la boîte de l'agent du bien — réception et
 * envoyés —, sur les adresses des parties.
 */

import { fetchAll, getAgents, proprietairesDe } from "@/lib/bubble/server";
import { adresseImmeuble, lireMandants } from "@/lib/mandat";
import { boiteDe } from "@/lib/mails/boites";
import { chercherEchanges, type Entete } from "@/lib/mails/client";
import { societesDeContact } from "@/lib/bo/societes-lecture";

const S = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** L'ordre d'avancement d'une offre : la plus avancée est la vente en cours. */
const RANG_OFFRE: Record<string, number> = {
  "Acceptée": 1, "Compromis programmé": 2, "Compromis signé": 3, "Vente prévue": 4, "Vendu": 5,
};

export type RolePartie =
  | "vendeur" | "acquereur"
  | "notaire_vendeur" | "notaire_acquereur"
  | "clerc_vendeur" | "clerc_acquereur"
  | "gestionnaire";
export const LIBELLE_ROLE: Record<RolePartie, string> = {
  vendeur: "Vendeur", acquereur: "Acquéreur",
  notaire_vendeur: "Notaire du vendeur", notaire_acquereur: "Notaire de l'acquéreur",
  clerc_vendeur: "Clerc du vendeur", clerc_acquereur: "Clerc de l'acquéreur",
  gestionnaire: "Gestionnaire",
};

/** Les intervenants que l'agent choisit lui-même, et la clé de la fiche bien
 *  qui garde chacun (retour #568 : un clerc par côté, et un gestionnaire). */
export const POSTES = {
  notaire_vendeur: "vente_notaire_vendeur",
  notaire_acquereur: "vente_notaire_acquereur",
  clerc_vendeur: "vente_clerc_vendeur",
  clerc_acquereur: "vente_clerc_acquereur",
  gestionnaire: "vente_gestionnaire",
} as const;
export type Poste = keyof typeof POSTES;
/** Le profil que prend le contact choisi, dans le fichier du BO. */
export const PROFIL_DU_POSTE: Record<Poste, string> = {
  notaire_vendeur: "Notaire", notaire_acquereur: "Notaire",
  clerc_vendeur: "Clerc de notaire", clerc_acquereur: "Clerc de notaire",
  gestionnaire: "Gestionnaire",
};

export type Partie = {
  role: RolePartie;
  contactId?: string;
  nom: string;
  /** Pour s'adresser à lui : « Maître DUPONT », « Madame MARTIN ». */
  civilite?: string;
  prenom?: string;
  nomFamille?: string;
  societe?: string;
  email?: string;
  tel?: string;
  /** Notaire ou clerc : est-ce lui qui suit le dossier pour son côté ? L'autre
   *  est mis en copie de chaque e-mail (#568). */
  enCharge?: boolean;
  /** Vendeur ou acquéreur : les sociétés qu'il peut engager (#571). */
  entites?: Entite[];
  /** L'entité de facturation retenue — rien : en nom propre. */
  entite?: Entite;
};

/** Une entité de facturation : une fiche société du BO, ou la société écrite
 *  sur la fiche contact. `cle` est ce que la fiche bien retient. */
export type Entite = { cle: string; nom: string; fonction?: string };

/** Un lien de pièces envoyé aux notaires, et ce qu'il contenait (#570). */
export type LienPieces = { id: string; url: string; date: string; pieces: string[] };

export type DonneesVente = {
  /** La section a-t-elle quelque chose à suivre ? Mandat signé ou offre retenue. */
  ouverte: boolean;
  agentId?: string;
  mandat?: { id: string; numero?: string; signeLe?: string };
  offre?: {
    id: string; statut: string; date?: string; prixHai?: number; prixNv?: number;
    dateCompromis?: string; dateActe?: string; acheteurNom?: string;
  };
  parties: Partie[];
  notaires: { vendeur?: string; acquereur?: string };
  /** De chaque côté, qui suit le dossier : le notaire (par défaut) ou le clerc. */
  enCharge: { vendeur: "notaire" | "clerc"; acquereur: "notaire" | "clerc" };
  liens: LienPieces[];
  /** Ce que le premier e-mail aux notaires rappelle du dossier. */
  bien: { adresse: string; chargeVendeur: boolean };
};

function partieDe(role: RolePartie, c: Record<string, unknown> | undefined, repli?: string): Partie | undefined {
  if (!c && !repli) return undefined;
  const nom = c ? [S(c["prénom"]), S(c.nom)].filter(Boolean).join(" ") || S(c.entreprise_nom) || S(c.email) || "Contact" : repli!;
  return {
    role, nom,
    contactId: c ? String(c._id) : undefined,
    civilite: c ? S(c["Civilité"]) : undefined,
    prenom: c ? S(c["prénom"]) : undefined,
    nomFamille: c ? S(c.nom) : undefined,
    societe: c ? S(c.entreprise_nom) : undefined,
    email: c ? S(c.email)?.toLowerCase() : undefined,
    tel: c ? S(c.portable_formatted) ?? S(c.portable) ?? S(c.fixe_formatted) ?? S(c.fixe) : undefined,
  };
}

export async function donneesVente(immeubleId: string): Promise<DonneesVente> {
  const [ims, mandats, offres] = await Promise.all([
    fetchAll("immeuble", [{ key: "_id", constraint_type: "equals", value: immeubleId }], 1),
    fetchAll("mandat", [{ key: "IMMEUBLEs", constraint_type: "contains", value: immeubleId }], 50).catch(() => []),
    fetchAll("offre", [{ key: "IMMEUBLEs", constraint_type: "contains", value: immeubleId }], 50).catch(() => []),
  ]);
  const im = ims[0];
  if (!im) {
    return {
      ouverte: false, parties: [], notaires: {}, enCharge: { vendeur: "notaire", acquereur: "notaire" },
      liens: [], bien: { adresse: "", chargeVendeur: false },
    };
  }

  const signe = mandats
    .filter((m) => S(m.date_signature) || S(m.pdf_signed))
    .sort((a, b) => String(S(b.date_signature) ?? "").localeCompare(String(S(a.date_signature) ?? "")))[0];
  const retenue = offres
    .filter((o) => RANG_OFFRE[String(o.Statut ?? "")])
    .sort((a, b) => (RANG_OFFRE[String(b.Statut)] - RANG_OFFRE[String(a.Statut)])
      || String(b.date ?? "").localeCompare(String(a.date ?? "")))[0];

  const idsVendeurs = proprietairesDe(im);
  /* Les mandants signataires sont aussi des vendeurs : en indivision, ou
     quand la fiche ne connaît que le gérant d'une société. */
  const mandants = signe ? lireMandants(signe) : [];
  for (const m of mandants) if (m.contactId && !idsVendeurs.includes(m.contactId)) idsVendeurs.push(m.contactId);
  const idsAcquereurs = retenue && Array.isArray(retenue.ACHETEURs) ? (retenue.ACHETEURs as unknown[]).map(String) : [];
  const poste = (k: Poste) => S(im[POSTES[k]]);
  const notaireV = poste("notaire_vendeur");
  const notaireA = poste("notaire_acquereur");
  const intervenants = (Object.keys(POSTES) as Poste[]).map(poste);
  const ids = [...new Set([...idsVendeurs, ...idsAcquereurs, ...intervenants].filter((x): x is string => !!x))];
  const contacts = ids.length
    ? await fetchAll("contact", [{ key: "_id", constraint_type: "in", value: ids }], 40).catch(() => [])
    : [];
  const par = new Map(contacts.map((c) => [String(c._id), c]));

  /* Retour #571 : l'entité de facturation de chaque client — la société qu'il
     engage, ou lui-même. Par défaut, le vendeur engage la société propriétaire
     de l'immeuble quand il en est associé ; l'acquéreur achète en nom propre
     tant qu'on n'a rien choisi. */
  const choixEntites = (im.vente_entites && typeof im.vente_entites === "object" ? im.vente_entites : {}) as Record<string, string>;
  const societeProprio = S(im.SOCIETE_PROPRIETAIRE);
  const clients = [...new Set([...idsVendeurs, ...idsAcquereurs])];
  const societesPar = new Map(await Promise.all(clients.map(async (id) =>
    [id, await societesDeContact(id).catch(() => [])] as const)));
  const doterEntites = (p: Partie, vendeur: boolean) => {
    if (!p.contactId) return;
    const soc = societesPar.get(p.contactId) ?? [];
    const entites: Entite[] = soc.map((x) => ({
      cle: `soc:${x.id}`, nom: x.nom,
      fonction: x.associes.find((a) => a.contactId === p.contactId)?.fonction,
    }));
    if (p.societe && !entites.some((e) => e.nom.toLowerCase() === p.societe!.toLowerCase())) {
      entites.push({ cle: `nom:${p.societe}`, nom: p.societe });
    }
    p.entites = entites;
    const choix = choixEntites[p.contactId];
    const cle = choix !== undefined ? choix
      : vendeur && societeProprio && soc.some((x) => x.id === societeProprio) ? `soc:${societeProprio}` : "";
    p.entite = entites.find((e) => e.cle === cle);
  };

  const parties: Partie[] = [];
  for (const id of idsVendeurs) {
    const p = partieDe("vendeur", par.get(id));
    if (p) { doterEntites(p, true); parties.push(p); }
  }
  /* Un mandant sans fiche contact garde son nom et son e-mail du mandat. */
  for (const m of mandants) {
    if (m.contactId || !(m.email || m.nom)) continue;
    parties.push({ role: "vendeur", nom: [m.prenom, m.nom].filter(Boolean).join(" ") || m.email!, email: m.email?.toLowerCase() });
  }
  if (idsAcquereurs.length) {
    for (const id of idsAcquereurs) {
      const p = partieDe("acquereur", par.get(id));
      if (p) { doterEntites(p, false); parties.push(p); }
    }
  } else if (retenue && S(retenue.acheteur_nom)) {
    parties.push({ role: "acquereur", nom: S(retenue.acheteur_nom)! });
  }
  const charge = (cote: "vendeur" | "acquereur"): "notaire" | "clerc" =>
    S(im[`vente_charge_${cote}`]) === "clerc" && poste(`clerc_${cote}`) ? "clerc" : "notaire";
  const enCharge = { vendeur: charge("vendeur"), acquereur: charge("acquereur") };
  for (const k of ["notaire_vendeur", "clerc_vendeur", "notaire_acquereur", "clerc_acquereur", "gestionnaire"] as Poste[]) {
    const id = poste(k);
    const p = partieDe(k, id ? par.get(id) : undefined);
    if (!p) continue;
    if (k !== "gestionnaire") {
      const [quoi, cote] = k.split("_") as ["notaire" | "clerc", "vendeur" | "acquereur"];
      p.enCharge = enCharge[cote] === quoi;
    }
    parties.push(p);
  }
  const liens: LienPieces[] = Array.isArray(im.vente_liens)
    ? (im.vente_liens as LienPieces[]).filter((l) => l && typeof l.url === "string")
    : [];

  const num = (v: unknown) => (typeof v === "number" ? v : undefined);
  return {
    ouverte: !!signe || !!retenue,
    agentId: S(im.AGENT),
    mandat: signe ? { id: String(signe._id), numero: S(signe.numero), signeLe: S(signe.date_signature) } : undefined,
    offre: retenue ? {
      id: String(retenue._id), statut: String(retenue.Statut), date: S(retenue.date),
      prixHai: num(retenue.prix_hai), prixNv: num(retenue.prix_nv),
      dateCompromis: S(retenue.date_compromis), dateActe: S(retenue.date_acte),
      acheteurNom: S(retenue.acheteur_nom),
    } : undefined,
    parties,
    notaires: { vendeur: notaireV, acquereur: notaireA },
    enCharge,
    liens,
    bien: {
      adresse: adresseImmeuble(im),
      chargeVendeur: (S(signe?.Charge_hono) ?? S(im.prix_Charge_honos)) === "Vendeur",
    },
  };
}

export type Echange = Entete & {
  dossier: "reception" | "envoyes";
  /** Les parties concernées par ce message. */
  avec: { role: RolePartie; nom: string }[];
};

/**
 * Les e-mails échangés avec les parties, dans la boîte de l'agent du bien :
 * réception et envoyés, depuis la signature du mandat (ou un an).
 */
export async function echangesVente(d: DonneesVente, agentIdRepli?: string): Promise<
  { ok: true; echanges: Echange[]; boite: string } | { ok: false; erreur: string }
> {
  const adresses = d.parties.map((p) => p.email).filter((e): e is string => !!e);
  if (adresses.length === 0) return { ok: true, echanges: [], boite: "" };
  const agents = await getAgents().catch(() => []);
  const b = (d.agentId ? await boiteDe(d.agentId, agents).catch(() => undefined) : undefined)
    ?? (agentIdRepli ? await boiteDe(agentIdRepli, agents).catch(() => undefined) : undefined);
  if (!b) return { ok: false, erreur: "Aucune boîte e-mail branchée pour l'agent du bien : Mails › Ma boîte e-mail." };
  const depuis = d.mandat?.signeLe ? new Date(d.mandat.signeLe) : new Date(Date.now() - 365 * 86_400_000);
  depuis.setDate(depuis.getDate() - 7);
  try {
    const [recus, envoyes] = await Promise.all([
      chercherEchanges(b, "reception", adresses, depuis),
      chercherEchanges(b, "envoyes", adresses, depuis),
    ]);
    const qui = (m: Entete) => d.parties.filter((p) => p.email && (m.de === p.email || m.pour.includes(p.email)))
      .map((p) => ({ role: p.role, nom: p.nom }));
    const echanges: Echange[] = [
      ...recus.map((m) => ({ ...m, dossier: "reception" as const, avec: qui(m) })),
      ...envoyes.map((m) => ({ ...m, dossier: "envoyes" as const, avec: qui(m) })),
    ].sort((a, z) => String(z.date ?? "").localeCompare(String(a.date ?? "")));
    return { ok: true, echanges, boite: b.adresse };
  } catch (e) {
    return { ok: false, erreur: e instanceof Error ? e.message : String(e) };
  }
}
