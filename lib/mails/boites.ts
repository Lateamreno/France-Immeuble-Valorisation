/* Les boîtes e-mail des agents.
 *
 * Changement de doctrine demandé par MAV : la messagerie du BO n'est pas une
 * boîte d'envoi de service, c'est la VRAIE boîte de chaque commercial, lue et
 * écrite en direct. Le serveur IMAP est la source de vérité — pas nous. Un
 * message lu sur le téléphone est lu dans l'app, et réciproquement.
 *
 * Deux façons de déclarer une boîte, dans cet ordre :
 *   1. la table `fi_boite_agent` (l'agent se connecte lui-même, mot de passe
 *      chiffré) ;
 *   2. les variables d'environnement, numérotées par agent — c'est ce qui
 *      permet de démarrer à deux sans écran de réglage.
 *
 *      MAIL_1_AGENT   = marc-antoine          (le slug de l'agent)
 *      MAIL_1_ADRESSE = ma.voci@france-immeuble.fr
 *      MAIL_1_HOST    = ex5.mail.ovh.net      (Exchange — la boîte de MAV)
 *      MAIL_1_PASS    = ...
 *      MAIL_2_AGENT   = romain
 *      MAIL_2_HOST    = pro1.mail.ovh.net     (boîte e-mail OVH — tous les autres)
 *      ...
 *
 *   Les ports et le serveur d'envoi ont des valeurs par défaut ; on ne les
 *   pose que s'ils diffèrent (MAIL_1_IMAP_PORT, MAIL_1_SMTP_HOST, …). Les deux
 *   serveurs de l'agence parlent le même protocole : IMAP 993 en SSL, SMTP 587
 *   en STARTTLS — c'est exactement ce que valent les défauts ci-dessous.
 */

import { dechiffrer } from "@/lib/mails/coffre";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export type Boite = {
  agentId: string;
  /** Slug de l'agent quand la boîte vient des variables d'environnement. */
  agentSlug?: string;
  adresse: string;
  nomAffiche?: string;
  imap: { host: string; port: number; user: string; pass: string };
  smtp: { host: string; port: number; user: string; pass: string };
  /** Noms réels des dossiers chez le fournisseur, quand on les a déjà appris. */
  dossiers?: Record<string, string>;
  /** D'où vient la configuration — l'écran de réglage le dit à l'agent. */
  origine: "base" | "environnement";
};

const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/* ------------------------------------------------- variables d'env --- */

/** Les boîtes déclarées en variables, dans l'ordre des numéros. */
export function boitesEnvironnement(): Boite[] {
  const out: Boite[] = [];
  /* On s'arrête au premier numéro absent : dix créneaux suffisent largement,
     et une boucle sans borne sur process.env n'a rien à offrir de plus. */
  for (let i = 1; i <= 10; i++) {
    const p = (cle: string) => txt(process.env[`MAIL_${i}_${cle}`]);
    const adresse = p("ADRESSE");
    const pass = p("PASS");
    const host = p("HOST");
    if (!adresse || !pass || !host) continue;

    const imapHost = p("IMAP_HOST") ?? host;
    const smtpHost = p("SMTP_HOST") ?? host;
    const user = p("USER") ?? adresse;
    out.push({
      agentId: "",
      agentSlug: p("AGENT"),
      adresse,
      nomAffiche: p("NOM"),
      imap: { host: imapHost, port: Number(p("IMAP_PORT") ?? 993), user, pass },
      /* 587 par défaut : c'est le port STARTTLS, celui qu'Exchange attend.
         Le 465 (TLS implicite) reste possible en le posant explicitement. */
      smtp: { host: smtpHost, port: Number(p("SMTP_PORT") ?? 587), user: p("SMTP_USER") ?? user, pass: p("SMTP_PASS") ?? pass },
      origine: "environnement",
    });
  }
  return out;
}

/* ------------------------------------------------------- table --- */

type LigneBoite = {
  agent_id: string;
  adresse: string;
  nom_affiche: string | null;
  imap_host: string; imap_port: number; imap_user: string;
  smtp_host: string; smtp_port: number; smtp_user: string;
  secret_imap: string; secret_smtp: string | null;
  dossiers: Record<string, string>;
  actif: boolean;
};

async function lignesBoites(agentId?: string): Promise<LigneBoite[]> {
  if (!SB_KEY) return [];
  const filtre = agentId ? `&agent_id=eq.${encodeURIComponent(agentId)}` : "";
  const res = await fetch(`${SB_URL}/rest/v1/fi_boite_agent?select=*&actif=eq.true${filtre}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    cache: "no-store",
  });
  if (!res.ok) return [];
  return (await res.json()) as LigneBoite[];
}

function versBoite(l: LigneBoite): Boite | null {
  /* Un secret qu'on ne sait pas déchiffrer (clé changée, ligne abîmée) ne doit
     pas faire tomber l'écran : la boîte est simplement absente, et l'agent la
     reconfigure. */
  const pass = dechiffrer(l.secret_imap);
  if (!pass) return null;
  const passSmtp = l.secret_smtp ? dechiffrer(l.secret_smtp) ?? pass : pass;
  return {
    agentId: l.agent_id,
    adresse: l.adresse,
    nomAffiche: l.nom_affiche ?? undefined,
    imap: { host: l.imap_host, port: l.imap_port, user: l.imap_user, pass },
    smtp: { host: l.smtp_host, port: l.smtp_port, user: l.smtp_user, pass: passSmtp },
    dossiers: l.dossiers ?? {},
    origine: "base",
  };
}

/* ------------------------------------------------- résolution --- */

/**
 * La boîte d'un agent. La table prime sur les variables : c'est elle que
 * l'agent peut corriger lui-même, sans redéploiement.
 *
 * `agents` sert à rapprocher le slug déclaré en variable de l'identifiant réel.
 */
export async function boiteDe(
  agentId: string,
  agents: { id: string; slug: string; name: string }[] = [],
): Promise<Boite | undefined> {
  const enBase = (await lignesBoites(agentId)).map(versBoite).find(Boolean);
  if (enBase) return enBase;

  const agent = agents.find((a) => a.id === agentId);
  const env = boitesEnvironnement().find(
    (b) => (agent && b.agentSlug === agent.slug) || b.agentId === agentId,
  );
  return env ? { ...env, agentId, nomAffiche: env.nomAffiche ?? agent?.name } : undefined;
}

/** Toutes les boîtes connues, pour l'écran de réglage. */
export async function toutesLesBoites(
  agents: { id: string; slug: string; name: string }[] = [],
): Promise<Boite[]> {
  const enBase = (await lignesBoites()).map(versBoite).filter((b): b is Boite => !!b);
  const dejaLa = new Set(enBase.map((b) => b.agentId));
  const env = boitesEnvironnement()
    .map((b) => {
      const agent = agents.find((a) => a.slug === b.agentSlug);
      return agent ? { ...b, agentId: agent.id, nomAffiche: b.nomAffiche ?? agent.name } : b;
    })
    /* Une boîte en variable dont l'agent s'est reconfiguré en base n'a plus
       lieu d'être : la base gagne, sinon on lirait deux fois la même boîte. */
    .filter((b) => b.agentId && !dejaLa.has(b.agentId));
  return [...enBase, ...env];
}

/** Le diagnostic affiché quand rien n'est configuré. */
export function diagnosticBoites() {
  const env = boitesEnvironnement();
  return {
    enEnvironnement: env.length,
    slugs: env.map((b) => b.agentSlug ?? "(sans MAIL_n_AGENT)"),
    cleDeChiffrement: !!txt(process.env.MAIL_CRYPTO_KEY),
  };
}
