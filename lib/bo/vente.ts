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
import { lireMandants } from "@/lib/mandat";
import { boiteDe } from "@/lib/mails/boites";
import { chercherEchanges, type Entete } from "@/lib/mails/client";

const S = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** L'ordre d'avancement d'une offre : la plus avancée est la vente en cours. */
const RANG_OFFRE: Record<string, number> = {
  "Acceptée": 1, "Compromis programmé": 2, "Compromis signé": 3, "Vente prévue": 4, "Vendu": 5,
};

export type RolePartie = "vendeur" | "acquereur" | "notaire_vendeur" | "notaire_acquereur";
export const LIBELLE_ROLE: Record<RolePartie, string> = {
  vendeur: "Vendeur", acquereur: "Acquéreur",
  notaire_vendeur: "Notaire du vendeur", notaire_acquereur: "Notaire de l'acquéreur",
};

export type Partie = {
  role: RolePartie;
  contactId?: string;
  nom: string;
  societe?: string;
  email?: string;
  tel?: string;
};

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
};

function partieDe(role: RolePartie, c: Record<string, unknown> | undefined, repli?: string): Partie | undefined {
  if (!c && !repli) return undefined;
  const nom = c ? [S(c["prénom"]), S(c.nom)].filter(Boolean).join(" ") || S(c.entreprise_nom) || S(c.email) || "Contact" : repli!;
  return {
    role, nom,
    contactId: c ? String(c._id) : undefined,
    societe: c ? S(c.entreprise_nom) : undefined,
    email: c ? S(c.email)?.toLowerCase() : undefined,
    tel: c ? S(c.portable_formatted) ?? S(c.portable) : undefined,
  };
}

export async function donneesVente(immeubleId: string): Promise<DonneesVente> {
  const [ims, mandats, offres] = await Promise.all([
    fetchAll("immeuble", [{ key: "_id", constraint_type: "equals", value: immeubleId }], 1),
    fetchAll("mandat", [{ key: "IMMEUBLEs", constraint_type: "contains", value: immeubleId }], 50).catch(() => []),
    fetchAll("offre", [{ key: "IMMEUBLEs", constraint_type: "contains", value: immeubleId }], 50).catch(() => []),
  ]);
  const im = ims[0];
  if (!im) return { ouverte: false, parties: [], notaires: {} };

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
  const notaireV = S(im.vente_notaire_vendeur);
  const notaireA = S(im.vente_notaire_acquereur);
  const ids = [...new Set([...idsVendeurs, ...idsAcquereurs, notaireV, notaireA].filter((x): x is string => !!x))];
  const contacts = ids.length
    ? await fetchAll("contact", [{ key: "_id", constraint_type: "in", value: ids }], 40).catch(() => [])
    : [];
  const par = new Map(contacts.map((c) => [String(c._id), c]));

  const parties: Partie[] = [];
  for (const id of idsVendeurs) {
    const p = partieDe("vendeur", par.get(id));
    if (p) parties.push(p);
  }
  /* Un mandant sans fiche contact garde son nom et son e-mail du mandat. */
  for (const m of mandants) {
    if (m.contactId || !(m.email || m.nom)) continue;
    parties.push({ role: "vendeur", nom: [m.prenom, m.nom].filter(Boolean).join(" ") || m.email!, email: m.email?.toLowerCase() });
  }
  if (idsAcquereurs.length) {
    for (const id of idsAcquereurs) {
      const p = partieDe("acquereur", par.get(id));
      if (p) parties.push(p);
    }
  } else if (retenue && S(retenue.acheteur_nom)) {
    parties.push({ role: "acquereur", nom: S(retenue.acheteur_nom)! });
  }
  const nv = partieDe("notaire_vendeur", notaireV ? par.get(notaireV) : undefined);
  const na = partieDe("notaire_acquereur", notaireA ? par.get(notaireA) : undefined);
  if (nv) parties.push(nv);
  if (na) parties.push(na);

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
