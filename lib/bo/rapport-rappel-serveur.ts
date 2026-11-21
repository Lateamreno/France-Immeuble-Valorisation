import "server-only";

/* Le rappel du lundi à l'agent : la lecture et l'envoi (MAV, 19/11/26).
 *
 * Chaque lundi à 8 h (heure de Paris), un e-mail par agent : ses biens en
 * vente, lesquels attendent un rapport au propriétaire, ce qu'il y a de
 * nouveau depuis le dernier, et ceux sur lesquels il ne s'est rien passé.
 * L'e-mail va à l'agent — rien ne part chez un propriétaire sans son clic.
 *
 * Un bien « en vente » : statut 5, 6 ou 7 et un mandat de vente « En cours ».
 * Son agent : celui du mandat, sinon celui de la fiche (même règle que « qui
 * signe », §10 ter). Un bien dont l'agent n'a pas d'accès actif au BO est
 * signalé à la direction.
 *
 * Une ligne de `fi_rapport_rappel` par agent et par semaine : c'est elle qui
 * empêche un second e-mail, et qui garde la trace de ce qui est parti.
 */

import { fetchAll, getAgents } from "@/lib/bubble/server";
import { adresseImmeuble } from "@/lib/mandat";
import { tousLesComptes, type Compte } from "@/lib/auth/comptes";
import { chargerRapport } from "@/lib/bo/rapport-serveur";
import {
  bienDepuisRapport, classer, htmlRappel, objetRappel, rappelVide, texteRappel, type BienRappel, type Classement,
} from "@/lib/bo/rapport-rappel";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = () => ({ apikey: SB_KEY!, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" });

const S = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const L = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).map(String).filter(Boolean) : []);

const EN_VENTE = ["5 - Commercialisé (A/B)", "6 - Commercialisé (all)", "7 - Sous offre"];

/** Le jour et l'heure de Paris, et le lundi de la semaine en cours. */
export function repereParis(d = new Date()): { lundi: boolean; heure: number; semaine: string } {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", hour12: false,
  }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const rang = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(v("weekday"));
  const jour = new Date(Date.UTC(Number(v("year")), Number(v("month")) - 1, Number(v("day")) - Math.max(rang, 0)));
  return { lundi: rang === 0, heure: Number(v("hour")) % 24, semaine: jour.toISOString().slice(0, 10) };
}

type Candidat = { id: string; libelle: string; agentId?: string };

/** Les biens en vente sous mandat, avec leur agent. Deux lectures, pas une par bien. */
async function biensEnVente(): Promise<Candidat[]> {
  const [immeubles, mandats] = await Promise.all([
    fetchAll("immeuble", [{ key: "Statut", constraint_type: "in", value: EN_VENTE }], 2000, undefined,
      ["Statut", "AGENT", "archived", "adresse_numero_rue", "adresse_rue", "adresse_zipcode", "adresse_ville"]),
    fetchAll("mandat", [{ key: "Statut", constraint_type: "equals", value: "En cours" }], 2000, undefined,
      ["IMMEUBLEs", "AGENT", "Type", "date_signature"]),
  ]);
  const agentDuMandat = new Map<string, string | undefined>();
  for (const m of mandats.sort((a, b) => String(S(a.date_signature) ?? "").localeCompare(String(S(b.date_signature) ?? "")))) {
    if (/recherche/i.test(S(m.Type) ?? "")) continue;
    for (const id of L(m.IMMEUBLEs)) agentDuMandat.set(id, S(m.AGENT));
  }
  return immeubles
    .filter((im) => im.archived !== true && agentDuMandat.has(String(im._id)))
    .map((im) => ({ id: String(im._id), libelle: adresseImmeuble(im), agentId: agentDuMandat.get(String(im._id)) ?? S(im.AGENT) }));
}

/** Quatre biens à la fois : assez pour tenir le délai, pas assez pour saturer la base. */
async function calculer(candidats: Candidat[], sansAgent = false): Promise<BienRappel[]> {
  const out: BienRappel[] = [];
  for (let i = 0; i < candidats.length; i += 4) {
    const lot = await Promise.all(candidats.slice(i, i + 4).map(async (c) => {
      const charge = await chargerRapport(c.id).catch(() => null);
      if (!charge) return null;
      const b = bienDepuisRapport(c.id, c.libelle, charge.rapport, charge.envoyes[0]?.envoye_le);
      return sansAgent ? { ...b, sansAgent: true } : b;
    }));
    out.push(...lot.filter((b): b is BienRappel => !!b));
  }
  return out;
}

export type RappelCompose = { classement: Classement; objet: string; texte: string; html: string };

function composer(biens: BienRappel[], prenom: string | undefined, base: string): RappelCompose {
  const maintenant = new Date().toISOString();
  const classement = classer(biens, maintenant);
  const ctx = { prenom, base, maintenant };
  return { classement, objet: objetRappel(classement), texte: texteRappel(classement, ctx), html: htmlRappel(classement, ctx) };
}

/** Qui reçoit quoi : chaque agent ses biens, la direction ceux qui n'ont pas d'agent actif. */
async function repartition() {
  const [candidats, comptes, agents] = await Promise.all([biensEnVente(), tousLesComptes(), getAgents().catch(() => [])]);
  const actifs = comptes.filter((c) => c.actif && c.email && c.agent_id);
  const idsActifs = new Set(actifs.map((c) => c.agent_id));
  const orphelins = candidats.filter((c) => !c.agentId || !idsActifs.has(c.agentId));
  const prenomDe = (agentId: string) => agents.find((a) => a.id === agentId)?.name?.split(/\s+/)[0];
  return { candidats, actifs, orphelins, prenomDe };
}

async function rappelDuCompte(compte: Compte, r: Awaited<ReturnType<typeof repartition>>, base: string): Promise<RappelCompose> {
  const siens = await calculer(r.candidats.filter((c) => c.agentId === compte.agent_id));
  const orphelins = compte.role === "direction" ? await calculer(r.orphelins, true) : [];
  return composer([...siens, ...orphelins], r.prenomDe(compte.agent_id), base);
}

async function baseBo(): Promise<string> {
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return prod ? `https://${prod}` : "https://france-immeuble-valorisation.vercel.app";
}

/** Prend la semaine pour cet agent. Faux : un autre passage l'a déjà prise. */
async function reserver(agentId: string, semaine: string): Promise<boolean> {
  const res = await fetch(`${SB_URL}/rest/v1/fi_rapport_rappel`, {
    method: "POST", headers: { ...H(), Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify({ agent_id: agentId, semaine }), cache: "no-store",
  });
  if (!res.ok) throw new Error(`Réservation du rappel ${res.status}`);
  return ((await res.json()) as unknown[]).length > 0;
}
const ligne = (agentId: string, semaine: string) =>
  `${SB_URL}/rest/v1/fi_rapport_rappel?agent_id=eq.${encodeURIComponent(agentId)}&semaine=eq.${semaine}`;

/**
 * Le passage du lundi, appelé par le cron toutes les dix minutes entre 8 h et
 * 9 h de Paris. Chaque agent n'est servi qu'une fois par semaine ; si le
 * passage manque de temps, le suivant finit. `force` : hors du lundi 8 h, pour
 * un passage de rattrapage (la règle « une fois par semaine » tient toujours).
 */
export async function envoyerRappelsRapports(force = false): Promise<{ agents: number; sans: number; semaine: string } | null> {
  if (!SB_KEY) return null;
  const { lundi, heure, semaine } = repereParis();
  if (!force && !(lundi && heure === 8)) return null;
  const { envoyerMail, mailConfigure } = await import("@/lib/bo/mail");
  if (!mailConfigure()) return null;
  const debut = Date.now();
  const r = await repartition();
  const base = await baseBo();
  let agents = 0, sans = 0;
  for (const compte of r.actifs) {
    if (Date.now() - debut > 200_000) break;
    if (!(await reserver(compte.agent_id, semaine))) continue;
    try {
      const m = await rappelDuCompte(compte, r, base);
      const c = m.classement;
      const bilan = { a_envoyer: c.aEnvoyer.length, rien_de_nouveau: c.rienDeNouveau.length, a_jour: c.aJour.length };
      if (rappelVide(c)) { sans += 1; }
      else {
        await envoyerMail({ to: compte.email, subject: m.objet, text: m.texte, html: m.html });
        agents += 1;
      }
      await fetch(ligne(compte.agent_id, semaine), {
        method: "PATCH", headers: { ...H(), Prefer: "return=minimal" },
        body: JSON.stringify({ ...bilan, envoye_le: rappelVide(c) ? null : new Date().toISOString() }), cache: "no-store",
      });
    } catch {
      /* L'envoi a échoué : la semaine est rendue, le passage suivant réessaie. */
      await fetch(ligne(compte.agent_id, semaine), { method: "DELETE", headers: H(), cache: "no-store" }).catch(() => undefined);
    }
  }
  return { agents, sans, semaine };
}

/** L'essai : le rappel de cette personne, envoyé à elle seule, sans prendre la semaine. */
export async function essayerRappel(compte: Compte): Promise<{ ok: boolean; message: string }> {
  const { envoyerMail, mailConfigure } = await import("@/lib/bo/mail");
  if (!mailConfigure()) return { ok: false, message: "Échec : l'envoi d'e-mails n'est pas configuré." };
  const m = await rappelDuCompte(compte, await repartition(), await baseBo());
  const c = m.classement;
  if (rappelVide(c)) {
    return { ok: true, message: c.aJour.length
      ? `Rien à envoyer : vos ${c.aJour.length} bien(s) en vente ont eu leur rapport il y a moins de sept jours. Lundi, vous ne recevriez rien.`
      : "Rien à envoyer : aucun bien en vente sous mandat à votre nom. Lundi, vous ne recevriez rien." };
  }
  await envoyerMail({ to: compte.email, subject: `[Essai] ${m.objet}`, text: m.texte, html: m.html });
  return { ok: true, message: `Envoyé à ${compte.email} : ${c.aEnvoyer.length} rapport(s) à envoyer, ${c.rienDeNouveau.length} bien(s) sans rien de nouveau.` };
}

/** Pour la vérification locale : ce que recevrait cet agent, sans rien envoyer. */
export async function apercuRappel(agentId: string): Promise<RappelCompose | null> {
  const r = await repartition();
  const compte = r.actifs.find((c) => c.agent_id === agentId);
  return compte ? rappelDuCompte(compte, r, await baseBo()) : null;
}
