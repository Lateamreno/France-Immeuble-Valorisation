import "server-only";

/* Le module Mailing (MAV, 27/10) : « faire partir des e-mails en masse,
 * notamment des e-mails commerciaux pour présenter Plein Bail, la team réno ou
 * la découpe d'immeubles en bloc. On peut sélectionner tous les clients, juste
 * les vendeurs, juste les vendeurs d'un secteur… L'idée c'est de bien cibler
 * et de faire un suivi de ce qu'on a envoyé, avec notre taux de réponse. »
 *
 * Une campagne est une salve (`fi_salve`, nature « campagne ») dont chaque
 * message est préparé à l'avance dans `fi_salve_envoi` — le texte exact, déjà
 * fusionné, et un jeton. Rien ne part au moment du clic : la file est vidée par
 * le cron de chaque minute (`/api/relances/tourner`), au rythme du relais et
 * sous le plafond du jour. Fermer la page n'arrête rien ; le plafond atteint,
 * la suite part le lendemain.
 *
 * Le jeton est porté par le Message-ID : une réponse le cite dans In-Reply-To,
 * et la relève des boîtes (fi_mail_entrant) suffit à compter qui a répondu.
 * Une réponse écrite à part — nouveau message, même expéditeur — compte aussi
 * dans les trente jours.
 */

import { envoyerEnMasse, domaineEnvoi, masseConfiguree } from "@/lib/bo/mail";
import { messageIdDuJeton } from "@/lib/bo/rattachement";
import { adresseBo } from "@/lib/bo/adresse";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const PLAFOND_JOUR = Math.max(1, Number(process.env.PLAFOND_JOUR ?? 4000));
/** Une réponse sans fil (nouveau message) compte si elle arrive dans ce délai. */
export const FENETRE_REPONSE_JOURS = 30;

export async function sb<T = Record<string, unknown>>(
  chemin: string, init?: RequestInit & { prefer?: string },
): Promise<{ lignes: T[]; total?: number }> {
  if (!SB_KEY) throw new Error("Base indisponible (clé Supabase absente).");
  const res = await fetch(`${SB_URL}/rest/v1/${chemin}`, {
    ...init,
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json",
      ...(init?.prefer ? { Prefer: init.prefer } : {}),
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Supabase ${res.status} : ${(await res.text()).slice(0, 200)}`);
  const plage = res.headers.get("content-range");
  const total = plage?.includes("/") ? Number(plage.split("/")[1]) : undefined;
  const txt = await res.text();
  return { lignes: txt ? (JSON.parse(txt) as T[]) : [], total: Number.isFinite(total) ? total : undefined };
}

/** Tout lire, mille lignes à la fois : l'API plafonne chaque réponse. */
async function toutLire<T>(chemin: string, max = 60_000): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; offset < max; offset += 1000) {
    const { lignes } = await sb<T>(`${chemin}&limit=1000&offset=${offset}`);
    out.push(...lignes);
    if (lignes.length < 1000) break;
  }
  return out;
}

/** Combien de messages de la file pour cette campagne, dans ce statut. */
async function compter(salveId: string, statut: string): Promise<number> {
  const r = await sb(`fi_salve_envoi?select=id&salve_id=eq.${salveId}&statut=eq.${statut}&limit=1`, { prefer: "count=exact" });
  return r.total ?? 0;
}

/** Les messages de campagne partis aujourd'hui : ils comptent dans le plafond commun. */
export async function envoisCampagnesDuJour(): Promise<number> {
  const debut = new Date();
  debut.setHours(0, 0, 0, 0);
  const r = await sb(`fi_salve_envoi?select=id&statut=eq.envoye&envoye_le=gte.${debut.toISOString()}&limit=1`, { prefer: "count=exact" })
    .catch(() => ({ lignes: [], total: 0 }));
  return r.total ?? 0;
}

/** Les salves classiques d'aujourd'hui (hors campagnes) : l'autre moitié du plafond. */
async function envoisSalvesDuJour(): Promise<number> {
  const debut = new Date();
  debut.setHours(0, 0, 0, 0);
  const r = await sb<{ envoyes: number | null }>(
    `fi_salve?select=envoyes&nature=neq.campagne&statut=eq.envoyee&envoye_at=gte.${debut.toISOString()}`,
  ).catch(() => ({ lignes: [] as { envoyes: number | null }[] }));
  return r.lignes.reduce((s, l) => s + (l.envoyes ?? 0), 0);
}

export async function resteDuJour(): Promise<number> {
  const [a, b] = await Promise.all([envoisCampagnesDuJour(), envoisSalvesDuJour()]);
  return Math.max(0, PLAFOND_JOUR - a - b);
}

/** Le lien de désinscription d'un destinataire. */
export async function lienDesabonnement(jeton: string): Promise<string> {
  return `${await adresseBo()}/desabonnement?t=${encodeURIComponent(jeton)}`;
}

/** Le pied de chaque e-mail de campagne. La prospection commerciale par e-mail
 *  doit offrir un moyen simple de s'y opposer, à chaque message (LCEN, art.
 *  L34-5 du code des postes et communications électroniques). */
export function piedCampagne(lien: string): string {
  return "\n\n—\nVous recevez ce message parce que vous êtes en relation avec France Immeuble. "
    + `Pour ne plus recevoir nos e-mails : ${lien}`;
}

type LigneEnvoi = { id: string; salve_id: string; email: string; jeton: string; objet: string; corps: string };
type Campagne = { id: string; expediteur: { nom?: string; email?: string; telephone?: string } | null; agent_id: string | null };

/**
 * Un tour de file, appelé par le cron. Prend la plus ancienne campagne en
 * cours, la verrouille le temps du tour, et envoie ce que le temps et le
 * plafond du jour permettent. Rend ce qui a été fait.
 */
export async function tournerCampagnes(budgetMs: number): Promise<{ campagne?: string; envoyes: number; echecs: number; reste?: number } | null> {
  if (budgetMs < 5_000 || !masseConfiguree()) return null;
  const debut = Date.now();
  const { lignes: enCours } = await sb<Campagne>(
    "fi_salve?select=id,expediteur,agent_id&nature=eq.campagne&statut=eq.en_cours&order=created_at.asc&limit=5",
  );
  for (const c of enCours) {
    /* Le verrou : deux tours qui se chevauchent n'enverraient pas deux fois le
       même message, mais ils doubleraient la cadence. On le prend, ou on passe. */
    const jusqua = new Date(Date.now() + budgetMs + 15_000).toISOString();
    const maintenant = new Date().toISOString();
    const pris = await sb(
      `fi_salve?id=eq.${c.id}&or=(verrou_jusqua.is.null,verrou_jusqua.lt.${maintenant})`,
      { method: "PATCH", body: JSON.stringify({ verrou_jusqua: jusqua }), prefer: "return=representation" },
    );
    if (pris.lignes.length === 0) continue;

    let envoyes = 0, echecs = 0;
    try {
      const reste = await resteDuJour();
      if (reste <= 0) return { campagne: c.id, envoyes: 0, echecs: 0, reste: 0 };
      const { lignes } = await sb<LigneEnvoi>(
        `fi_salve_envoi?select=id,salve_id,email,jeton,objet,corps&salve_id=eq.${c.id}&statut=eq.a_envoyer&order=cree_le.asc&limit=${Math.min(reste, 200)}`,
      );
      const domaine = domaineEnvoi();
      const agent = c.expediteur ?? {};
      for (const l of lignes) {
        if (Date.now() - debut > budgetMs - 2_000) break;
        const lien = await lienDesabonnement(l.jeton);
        try {
          await envoyerEnMasse({
            to: l.email, subject: l.objet, text: l.corps + piedCampagne(lien),
            replyTo: agent.email, agent,
            messageId: messageIdDuJeton(l.jeton, domaine),
            /* L'en-tête vise la route qui accepte le désabonnement « en un
               clic » (POST) ; le lien du pied ouvre une page à confirmer. */
            desabonnementUrl: lien.replace("/desabonnement?", "/api/desabonnement?"),
          });
          await sb(`fi_salve_envoi?id=eq.${l.id}`, {
            method: "PATCH", body: JSON.stringify({ statut: "envoye", envoye_le: new Date().toISOString(), erreur: null }),
          });
          envoyes += 1;
        } catch (e) {
          await sb(`fi_salve_envoi?id=eq.${l.id}`, {
            method: "PATCH", body: JSON.stringify({ statut: "echec", erreur: (e instanceof Error ? e.message : String(e)).slice(0, 300) }),
          });
          echecs += 1;
        }
        /* Quatre messages par seconde au plus, comme les salves (§7.1). */
        await new Promise((r) => setTimeout(r, 250));
      }
    } finally {
      const [faits, rates, restants] = await Promise.all([
        compter(c.id, "envoye"), compter(c.id, "echec"), compter(c.id, "a_envoyer"),
      ]);
      await sb(`fi_salve?id=eq.${c.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          envoyes: faits, echecs: rates, verrou_jusqua: null,
          ...(restants === 0 ? { statut: "envoyee", envoye_at: new Date().toISOString() } : {}),
        }),
      });
    }
    return { campagne: c.id, envoyes, echecs };
  }
  return null;
}

/* ------------------------------------------------------------- Statistiques */

export type LigneCampagne = {
  id: string;
  libelle: string;
  objet: string;
  corps: string;
  cible: string;
  resume: string;
  statut: "en_cours" | "suspendue" | "envoyee" | "annulee";
  creeLe: string;
  envoyeLe?: string;
  agent?: string;
  total: number;
  envoyes: number;
  echecs: number;
  enFile: number;
  reponses: number;
  desabonnes: number;
};

export type DestinataireCampagne = {
  email: string; nom?: string; contactId?: string;
  statut: "a_envoyer" | "envoye" | "echec" | "retire";
  envoyeLe?: string; erreur?: string;
  reponse?: { le: string; objet: string; id: string };
  desabonne?: string;
};

type Envoi = { salve_id: string; email: string; nom: string | null; contact_id: string | null; jeton: string; statut: DestinataireCampagne["statut"]; envoye_le: string | null; erreur: string | null };
type Entrant = { id: string; de: string | null; objet: string | null; recu_le: string; in_reply_to: string | null; references_: string[] | null };

/** Qui a répondu, pour un lot d'envois : par le fil d'abord (le jeton cité),
 *  sinon par l'adresse dans la fenêtre de trente jours. */
async function reponsesDe(envois: Envoi[]): Promise<Map<string, { le: string; objet: string; id: string }>> {
  const partis = envois.filter((e) => e.envoye_le);
  const out = new Map<string, { le: string; objet: string; id: string }>();
  if (partis.length === 0) return out;
  const depuis = partis.reduce((m, e) => (e.envoye_le! < m ? e.envoye_le! : m), partis[0].envoye_le!);
  const entrants = await toutLire<Entrant>(
    `fi_mail_entrant?select=id,de,objet,recu_le,in_reply_to,references_&recu_le=gte.${encodeURIComponent(depuis)}&order=recu_le.asc`, 20_000,
  ).catch(() => [] as Entrant[]);
  const parJeton = new Map(partis.map((e) => [e.jeton, e]));
  const parAdresse = new Map<string, Envoi[]>();
  for (const e of partis) {
    const k = e.email.trim().toLowerCase();
    parAdresse.set(k, [...(parAdresse.get(k) ?? []), e]);
  }
  for (const m of entrants) {
    const cites = `${m.in_reply_to ?? ""} ${(m.references_ ?? []).join(" ")}`.match(/<([a-z0-9]{12})\.fi@/g) ?? [];
    let cible: Envoi | undefined;
    for (const c of cites) { cible = parJeton.get(c.slice(1, 13)); if (cible) break; }
    if (!cible && m.de) {
      const adr = (m.de.match(/<([^>]+)>/)?.[1] ?? m.de).trim().toLowerCase();
      cible = (parAdresse.get(adr) ?? []).find((e) => {
        const ecart = (new Date(m.recu_le).getTime() - new Date(e.envoye_le!).getTime()) / 86_400_000;
        return ecart >= 0 && ecart <= FENETRE_REPONSE_JOURS;
      });
    }
    if (cible && !out.has(cible.jeton)) out.set(cible.jeton, { le: m.recu_le, objet: m.objet ?? "", id: m.id });
  }
  return out;
}

type SalveBrute = {
  id: string; libelle: string | null; objet: string | null; corps: string | null; cible: string | null;
  filtres: { resume?: string } | null; statut: string; created_at: string; envoye_at: string | null;
  expediteur: { nom?: string } | null; total: number | null; envoyes: number | null; echecs: number | null;
};

export async function campagnes(): Promise<LigneCampagne[]> {
  const { lignes: salves } = await sb<SalveBrute>(
    "fi_salve?select=id,libelle,objet,corps,cible,filtres,statut,created_at,envoye_at,expediteur,total,envoyes,echecs&nature=eq.campagne&order=created_at.desc&limit=100",
  );
  if (salves.length === 0) return [];
  const ids = salves.map((s) => s.id).join(",");
  const [envois, desabo] = await Promise.all([
    toutLire<Envoi>(`fi_salve_envoi?select=salve_id,email,nom,contact_id,jeton,statut,envoye_le,erreur&salve_id=in.(${ids})&order=cree_le.asc`),
    toutLire<{ salve_id: string | null }>(`fi_desabonnement?select=salve_id&salve_id=in.(${ids})&order=le.asc`),
  ]);
  const rep = await reponsesDe(envois);
  return salves.map((s) => {
    const mes = envois.filter((e) => e.salve_id === s.id);
    return {
      id: s.id,
      libelle: s.libelle || s.objet || "Campagne",
      objet: s.objet ?? "",
      corps: s.corps ?? "",
      cible: s.cible ?? "",
      resume: s.filtres?.resume ?? "",
      statut: (["en_cours", "suspendue", "envoyee", "annulee"].includes(s.statut) ? s.statut : "envoyee") as LigneCampagne["statut"],
      creeLe: s.created_at,
      envoyeLe: s.envoye_at ?? undefined,
      agent: s.expediteur?.nom,
      total: s.total ?? mes.length,
      envoyes: mes.filter((e) => e.statut === "envoye").length,
      echecs: mes.filter((e) => e.statut === "echec").length,
      enFile: mes.filter((e) => e.statut === "a_envoyer").length,
      reponses: mes.filter((e) => rep.has(e.jeton)).length,
      desabonnes: desabo.filter((d) => d.salve_id === s.id).length,
    };
  });
}

export async function destinatairesCampagne(salveId: string): Promise<DestinataireCampagne[]> {
  if (!/^[0-9a-f-]{36}$/i.test(salveId)) return [];
  const [envois, desabo] = await Promise.all([
    toutLire<Envoi>(`fi_salve_envoi?select=salve_id,email,nom,contact_id,jeton,statut,envoye_le,erreur&salve_id=eq.${salveId}&order=cree_le.asc`),
    toutLire<{ email: string; le: string }>(`fi_desabonnement?select=email,le&salve_id=eq.${salveId}&order=le.asc`),
  ]);
  const rep = await reponsesDe(envois);
  const des = new Map(desabo.map((d) => [d.email.toLowerCase(), d.le]));
  return envois.map((e) => ({
    email: e.email, nom: e.nom ?? undefined, contactId: e.contact_id ?? undefined,
    statut: e.statut, envoyeLe: e.envoye_le ?? undefined, erreur: e.erreur ?? undefined,
    reponse: rep.get(e.jeton),
    desabonne: des.get(e.email.toLowerCase()),
  }));
}

/* ------------------------------------------------------------ Désinscription */

/** La ligne d'envoi derrière un lien de désinscription, ou rien. */
export async function envoiDuJeton(jeton: string): Promise<{ email: string; contact_id: string | null; salve_id: string } | null> {
  if (!/^[a-z0-9]{12}$/.test(jeton)) return null;
  const { lignes } = await sb<{ email: string; contact_id: string | null; salve_id: string }>(
    `fi_salve_envoi?select=email,contact_id,salve_id&jeton=eq.${jeton}&limit=1`,
  ).catch(() => ({ lignes: [] as { email: string; contact_id: string | null; salve_id: string }[] }));
  return lignes[0] ?? null;
}

/** Les adresses qui ont refusé nos e-mails, en minuscules. */
export async function adressesDesabonnees(): Promise<Set<string>> {
  const lignes = await toutLire<{ email: string }>("fi_desabonnement?select=email&order=email.asc")
    .catch(() => [] as { email: string }[]);
  return new Set(lignes.map((l) => l.email.trim().toLowerCase()));
}
