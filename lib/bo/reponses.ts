// Les réponses des acquéreurs aux envois de dossier (MAV, 12/11) : e-mail,
// SMS, boutons de la carte RCS, réponse depuis le compte du site.
//
// La table `fi_reponse` est remplie par des déclencheurs de la base (migration
// `reponses_acquereurs`) : ce module ne fait que la lire et la marquer.
//   · Qui est prévenu : l'agent qui a envoyé le dossier (AGENTs de la
//     proposition, sinon son créateur).
//   · Une réponse reste « à traiter » jusqu'au clic « Traité » ; l'ouvrir ne
//     suffit pas.
//   · Le BO sonne quand elle arrive, et l'agent reçoit un récapitulatif par
//     e-mail à 8 h et à 14 h.
//
// Module serveur seulement.
import "server-only";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = () => ({ apikey: SB_KEY ?? "", Authorization: `Bearer ${SB_KEY ?? ""}`, "Content-Type": "application/json" });

export type Canal = "email" | "sms" | "rcs_interesse" | "rcs_dossier" | "rcs_non" | "rcs_visite" | "site";

export type Reponse = {
  id: string;
  propositionId: string;
  immeubleId?: string;
  contactId?: string;
  agentId?: string;
  canal: Canal;
  texte?: string;
  recuLe: string;
  traiteLe?: string;
  /** Ce que l'écran montre : la personne, son téléphone, le bien. */
  contact?: {
    nom: string; prenom?: string; nomFamille?: string; tel?: string; email?: string;
    /** Pour la vignette contact habituelle (#620). */
    immeubles: number; recherches: number; note?: string;
  };
  bien?: { libelle: string; prix?: string };
  /** Le statut de la proposition (« Envoyée », « Refusée (sans offre) »…). */
  statut?: string;
};

type Ligne = {
  id: string; proposition_id: string; immeuble_id: string | null; contact_id: string | null; agent_id: string | null;
  canal: Canal; texte: string | null; recu_le: string; traite_le: string | null;
};

async function sb<T>(chemin: string, init?: RequestInit): Promise<T[]> {
  if (!SB_KEY) return [];
  const r = await fetch(`${SB_URL}/rest/v1/${chemin}`, { ...init, headers: { ...H(), ...(init?.headers ?? {}) }, cache: "no-store" }).catch(() => null);
  if (!r?.ok) return [];
  const t = await r.text();
  return t ? (JSON.parse(t) as T[]) : [];
}

const S = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const liste = (ids: (string | null | undefined)[]) => [...new Set(ids.filter((x): x is string => !!x))].map((x) => `"${x}"`).join(",");
const euros = (n: unknown) => (typeof n === "number" && n > 0 ? `${Math.round(n).toLocaleString("fr-FR")} €` : undefined);

/** Les contacts, biens et propositions des lignes, en trois lectures. */
async function habiller(lignes: Ligne[]): Promise<Reponse[]> {
  if (lignes.length === 0) return [];
  const [contacts, biens, props] = await Promise.all([
    liste(lignes.map((l) => l.contact_id)) ? sb<{ id: string; data: Record<string, unknown> }>(`bo_contact?select=id,data&id=in.(${liste(lignes.map((l) => l.contact_id))})`) : [],
    liste(lignes.map((l) => l.immeuble_id)) ? sb<{ id: string; data: Record<string, unknown> }>(`bo_immeuble?select=id,data&id=in.(${liste(lignes.map((l) => l.immeuble_id))})`) : [],
    sb<{ id: string; data: Record<string, unknown> }>(`bo_proposition?select=id,data->>Statut&id=in.(${liste(lignes.map((l) => l.proposition_id))})`),
  ]);
  const cMap = new Map(contacts.map((c) => [c.id, c.data]));
  const bMap = new Map(biens.map((b) => [b.id, b.data]));
  const pMap = new Map((props as unknown as { id: string; Statut?: string }[]).map((p) => [p.id, p.Statut]));
  return lignes.map((l) => {
    const c = l.contact_id ? cMap.get(l.contact_id) : undefined;
    const b = l.immeuble_id ? bMap.get(l.immeuble_id) : undefined;
    const civ = S(c?.["Civilité"]);
    const nom = c ? [civ === "Monsieur" ? "M." : civ === "Madame" ? "Mme" : civ, S(c["prénom"]), S(c.nom)?.toUpperCase()].filter(Boolean).join(" ") || S(c.email) || "Contact" : "Contact";
    const cp = S(b?.adresse_zipcode);
    const ville = S(b?.adresse_ville);
    return {
      id: l.id,
      propositionId: l.proposition_id,
      immeubleId: l.immeuble_id ?? undefined,
      contactId: l.contact_id ?? undefined,
      agentId: l.agent_id ?? undefined,
      canal: l.canal,
      texte: l.texte ?? undefined,
      recuLe: l.recu_le,
      traiteLe: l.traite_le ?? undefined,
      contact: c ? {
        nom, prenom: S(c["prénom"]), nomFamille: S(c.nom)?.toUpperCase(),
        tel: S(c.portable_formatted) ?? S(c.portable) ?? S(c.fixe_formatted) ?? S(c.fixe), email: S(c.email),
        immeubles: Array.isArray(c.IMMEUBLES) ? (c.IMMEUBLES as unknown[]).length : 0,
        recherches: Array.isArray(c.RECHERCHEs) ? (c.RECHERCHEs as unknown[]).length : 0,
        note: S(c.Note),
      } : undefined,
      bien: b ? { libelle: [lieu(ville, cp), S(b.adresse_rue)].filter(Boolean).join(" · ") || "Bien", prix: euros(b.prix_hai) } : undefined,
      statut: pMap.get(l.proposition_id),
    };
  });
}

/** « Paris 18e », « Péronne (80) ». */
function lieu(ville?: string, cp?: string): string | undefined {
  const c = cp?.replace(/\s/g, "");
  if (c && /^75\d{3}$/.test(c) && (!ville || /^paris/i.test(ville))) {
    const n = parseInt(c.slice(3), 10);
    return n >= 1 && n <= 20 ? `Paris ${n === 1 ? "1er" : `${n}e`}` : "Paris";
  }
  return ville && c ? `${ville} (${c.slice(0, 2)})` : ville;
}

/** #619 (MAV, 12/11) : « Me mets pas les notifs de téléchargement de dossier ».
 *  Le téléchargement reste noté sur la proposition, il ne notifie plus. */
const SANS = "&canal=neq.rcs_dossier";

const CHAMPS = "id,proposition_id,immeuble_id,contact_id,agent_id,canal,texte,recu_le,traite_le";

/**
 * Les réponses d'un agent : à traiter d'abord (les plus récentes en tête),
 * ou toutes celles des trente derniers jours. Sans agent (BO ouvert sans
 * connexion, en secours), toutes les réponses.
 */
export async function reponsesDe(agentId: string | null, quoi: "a_traiter" | "toutes" = "a_traiter", limite = 60): Promise<Reponse[]> {
  const filtreAgent = agentId ? `&agent_id=eq.${encodeURIComponent(agentId)}` : "";
  const filtre = quoi === "a_traiter" ? "&traite_le=is.null" : `&recu_le=gt.${encodeURIComponent(new Date(Date.now() - 30 * 86_400_000).toISOString())}`;
  return habiller(await sb<Ligne>(`fi_reponse?select=${CHAMPS}${SANS}${filtreAgent}${filtre}&order=recu_le.desc&limit=${limite}`));
}

/** Combien de réponses attendent l'agent. */
export async function compterReponses(agentId: string | null): Promise<number> {
  if (!SB_KEY) return 0;
  const filtreAgent = agentId ? `&agent_id=eq.${encodeURIComponent(agentId)}` : "";
  const r = await fetch(`${SB_URL}/rest/v1/fi_reponse?select=id&traite_le=is.null${SANS}${filtreAgent}`, {
    method: "HEAD", headers: { ...H(), Prefer: "count=exact", Range: "0-0" }, cache: "no-store",
  }).catch(() => null);
  const total = r?.headers.get("content-range")?.split("/")[1];
  return total && total !== "*" ? parseInt(total, 10) || 0 : 0;
}

/** Les réponses arrivées depuis une date, pour le son. */
export async function compterNouvelles(agentId: string | null, depuis: string): Promise<number> {
  if (!SB_KEY) return 0;
  const filtreAgent = agentId ? `&agent_id=eq.${encodeURIComponent(agentId)}` : "";
  const r = await fetch(`${SB_URL}/rest/v1/fi_reponse?select=id${SANS}&cree_le=gt.${encodeURIComponent(depuis)}${filtreAgent}`, {
    method: "HEAD", headers: { ...H(), Prefer: "count=exact", Range: "0-0" }, cache: "no-store",
  }).catch(() => null);
  const total = r?.headers.get("content-range")?.split("/")[1];
  return total && total !== "*" ? parseInt(total, 10) || 0 : 0;
}

/** Les réponses d'un bien encore à traiter, quel que soit l'agent : ce que la fiche montre. */
export async function reponsesDuBien(immeubleId: string): Promise<Reponse[]> {
  return habiller(await sb<Ligne>(`fi_reponse?select=${CHAMPS}${SANS}&immeuble_id=eq.${encodeURIComponent(immeubleId)}&traite_le=is.null&order=recu_le.desc&limit=200`));
}

/** « Traité » : la réponse quitte la cloche, la fiche et le tableau de bord. */
export async function marquerTraitees(ids: string[], par: string | null): Promise<void> {
  const propres = ids.filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  if (!SB_KEY || propres.length === 0) return;
  await fetch(`${SB_URL}/rest/v1/fi_reponse?id=in.(${propres.join(",")})&traite_le=is.null`, {
    method: "PATCH", headers: { ...H(), Prefer: "return=minimal" },
    body: JSON.stringify({ traite_le: new Date().toISOString(), traite_par: par }), cache: "no-store",
  });
}

/** Toutes les réponses encore ouvertes d'une proposition (un geste sur la proposition les traite). */
export async function traiterProposition(propositionId: string, par: string | null): Promise<void> {
  if (!SB_KEY) return;
  await fetch(`${SB_URL}/rest/v1/fi_reponse?proposition_id=eq.${encodeURIComponent(propositionId)}&traite_le=is.null`, {
    method: "PATCH", headers: { ...H(), Prefer: "return=minimal" },
    body: JSON.stringify({ traite_le: new Date().toISOString(), traite_par: par }), cache: "no-store",
  });
}

/* ------------------------------------------------ Le récapitulatif (D) */

export const LIBELLE_CANAL: Record<Canal, string> = {
  email: "a répondu par e-mail",
  sms: "a répondu par SMS",
  rcs_interesse: "est intéressé (carte RCS)",
  rcs_dossier: "a téléchargé le dossier (carte RCS)",
  rcs_non: "n'est pas intéressé (carte RCS)",
  rcs_visite: "demande une visite (carte RCS)",
  site: "a répondu depuis son compte du site",
};

/** L'heure de Paris, pour les deux rendez-vous du récapitulatif. */
function heureParis(d = new Date()): { h: number; m: number } {
  const p = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  return { h: Number(p.find((x) => x.type === "hour")?.value), m: Number(p.find((x) => x.type === "minute")?.value) };
}

/**
 * À 8 h et à 14 h (heure de Paris), un e-mail par agent : les réponses
 * arrivées depuis le dernier récapitulatif et pas encore traitées. Appelé par
 * le cron de chaque minute ; ne fait rien hors des dix premières minutes de
 * ces deux heures. Une réponse n'entre que dans un seul récapitulatif.
 * `force` : pour l'essai, à n'importe quelle heure.
 */
export async function envoyerRecapitulatifs(force = false): Promise<{ agents: number; reponses: number } | null> {
  const { h, m } = heureParis();
  if (!force && !((h === 8 || h === 14) && m < 10)) return null;
  if (!SB_KEY) return null;
  /* Seulement ce qui est arrivé avant l'heure pile : une réponse de 8 h 03
     attend le récapitulatif de 14 h, au lieu d'un second e-mail à 8 h 04. */
  const pile = new Date(Date.now() - m * 60_000);
  pile.setSeconds(0, 0);
  const avant = force ? "" : `&cree_le=lt.${encodeURIComponent(pile.toISOString())}`;
  const lignes = await sb<Ligne>(`fi_reponse?select=${CHAMPS}${SANS}&traite_le=is.null&mail_envoye_le=is.null&agent_id=not.is.null${avant}&order=recu_le.asc&limit=500`);
  if (lignes.length === 0) return { agents: 0, reponses: 0 };
  const { tousLesComptes } = await import("@/lib/auth/comptes");
  const comptes = (await tousLesComptes()).filter((c) => c.actif);
  const { envoyerMail, mailConfigure } = await import("@/lib/bo/mail");
  if (!mailConfigure()) return null;
  const { adresseBo } = await import("@/lib/bo/adresse");
  const base = await adresseBo().catch(() => "https://france-immeuble-valorisation.vercel.app");
  const parAgent = new Map<string, Ligne[]>();
  for (const l of lignes) parAgent.set(l.agent_id!, [...(parAgent.get(l.agent_id!) ?? []), l]);
  let agents = 0, n = 0;
  for (const [agentId, ls] of parAgent) {
    const compte = comptes.find((c) => c.agent_id === agentId);
    if (!compte?.email) continue;
    const rs = await habiller(ls);
    const lignesMail = rs.map((r) => {
      const extrait = r.texte && r.canal !== "rcs_interesse" && r.canal !== "rcs_dossier" && r.canal !== "rcs_non"
        ? ` — « ${r.texte.replace(/\s+/g, " ").slice(0, 140)}${r.texte.length > 140 ? "…" : ""} »` : "";
      return `· ${r.contact?.nom ?? "Un acquéreur"} ${LIBELLE_CANAL[r.canal]} — ${r.bien?.libelle ?? "bien"}${extrait}`;
    });
    try {
      await envoyerMail({
        to: compte.email,
        subject: `${rs.length} réponse${rs.length > 1 ? "s" : ""} d'acquéreur${rs.length > 1 ? "s" : ""} à traiter`,
        text: [
          `Bonjour,`,
          "",
          `${rs.length > 1 ? "Ces acquéreurs ont" : "Cet acquéreur a"} répondu à un dossier que vous avez envoyé :`,
          "",
          ...lignesMail,
          "",
          `Les traiter dans le BO (cloche « Réponses » du menu) : ${base}/?reponses=1`,
        ].join("\n"),
      });
      await fetch(`${SB_URL}/rest/v1/fi_reponse?id=in.(${ls.map((l) => l.id).join(",")})`, {
        method: "PATCH", headers: { ...H(), Prefer: "return=minimal" },
        body: JSON.stringify({ mail_envoye_le: new Date().toISOString() }), cache: "no-store",
      });
      agents += 1; n += ls.length;
    } catch { /* la prochaine minute de la fenêtre réessaie */ }
  }
  return { agents, reponses: n };
}
