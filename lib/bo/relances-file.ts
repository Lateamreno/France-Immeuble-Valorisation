// La file des salves de relances, et l'automate qui la vide.
//
// MAV, 29/09, après une salve coupée à 144 sur 189 quand iOS a suspendu
// l'onglet : « il faut qu'on puisse fermer la page une fois la commande
// lancée ». La salve ne dépend donc plus du navigateur : elle est ÉCRITE dans
// `fi_relance_salve` avec tous ses destinataires, et c'est le serveur qui
// l'envoie, paquet après paquet, jusqu'au bout.
//
// Qui fait tourner l'automate ? Deux mains, pour que ce soit à la fois rapide
// et sûr :
//   • la page, tant qu'elle est ouverte : elle rappelle `tourner` en boucle,
//     chaque tour envoie pendant une quarantaine de secondes (sous la coupure
//     Vercel à soixante) — 189 e-mails en trois à quatre minutes ;
//   • le cron Vercel, chaque minute : si la page est fermée ou l'onglet
//     suspendu, il reprend la salve là où elle en est.
// Un verrou par salve empêche les deux de travailler en même temps sur la
// même ligne, sinon un paquet partirait deux fois.
//
// Rien ne part sans le clic de l'agent : la file ne contient que ce qu'il a
// validé à l'écran, objet, message, destinataires (doctrine §7.1).
//
// Ce module est serveur seulement (clé de service) ; les actions qui
// l'appellent vivent dans relances-actions.ts, la route cron dans
// app/api/relances/tourner.

import { PLAFOND_RELANCES } from "./relances";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export type EnvoiMail = {
  contactId: string; email: string; objet: string; corps: string; propositionIds: string[]; immeubleIds?: string[];
};
export type EnvoiSms = {
  contactId?: string; tel?: string; immeubleId: string; libelle: string; propositionIds: string[]; texte?: string;
};

/** Ce qu'une salve de commercialisation emporte : ce que l'assistant a validé. */
export type ChargeCommercialisation = {
  immeubleId: string; commId: string; objet: string; message: string;
  destinataires: string[];
  pieces?: { nom: string; path?: string; url?: string }[];
  quand?: string; agentId?: string;
  /** Le nombre total d'adresses de la commercialisation (reprise comprise). */
  total: number;
};

export type SalveLigne = {
  id: string;
  created_at: string;
  updated_at: string;
  genre: "relances" | "commercialisation";
  charge: Partial<ChargeCommercialisation>;
  titre: string;
  agent_id: string | null;
  agent_nom: string | null;
  immeuble_id: string | null;
  voie: "boite" | "masse";
  expediteur: string | null;
  objet: string | null;
  corps: string | null;
  sms_texte: string | null;
  mails: EnvoiMail[];
  sms: EnvoiSms[];
  chemins: string[];
  curseur_mail: number;
  curseur_sms: number;
  fait_mail: number;
  echecs_mail: number;
  fait_sms: number;
  echecs_sms: number;
  journal: string[];
  statut: "en_cours" | "terminee" | "arretee" | "erreur";
  message: string | null;
  reprise_a: string | null;
  verrou_jusqua: string | null;
  salve_id: string | null;
  recap: string | null;
  finie_at: string | null;
};

/** Ce que les écrans affichent — jamais la liste des destinataires. */
export type EtatSalve = {
  id: string;
  genre: "relances" | "commercialisation";
  /** La commercialisation servie, pour que l'assistant reconnaisse sa salve. */
  commId?: string;
  titre: string;
  voie: "boite" | "masse";
  statut: SalveLigne["statut"];
  mails: { fait: number; total: number; echecs: number };
  sms: { fait: number; total: number; echecs: number };
  enCours: boolean;
  repriseA?: number;
  journal: string[];
  message?: string;
  termine: boolean;
  arrete: boolean;
  recap?: string;
  finieA?: number;
  creeA: number;
};

const H = () => ({ apikey: SB_KEY!, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" });

async function lire(filtre: string): Promise<SalveLigne[]> {
  if (!SB_KEY) return [];
  const res = await fetch(`${SB_URL}/rest/v1/fi_relance_salve?${filtre}`, { headers: H(), cache: "no-store" });
  if (!res.ok) throw new Error(`Lecture fi_relance_salve ${res.status} : ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as SalveLigne[];
}

async function ecrire(methode: "POST" | "PATCH", corps: Record<string, unknown>, filtre = ""): Promise<SalveLigne[]> {
  if (!SB_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY absente : écriture impossible");
  const res = await fetch(`${SB_URL}/rest/v1/fi_relance_salve${filtre ? `?${filtre}` : ""}`, {
    method: methode,
    headers: { ...H(), Prefer: "return=representation" },
    body: JSON.stringify({ ...corps, updated_at: new Date().toISOString() }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Écriture fi_relance_salve ${res.status} : ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as SalveLigne[];
}

export function versEtat(l: SalveLigne): EtatSalve {
  const enCours = l.statut === "en_cours";
  const totalMails = l.genre === "commercialisation" ? (l.charge.destinataires?.length ?? 0) : l.mails.length;
  return {
    id: l.id, genre: l.genre ?? "relances", commId: l.charge.commId, titre: l.titre, voie: l.voie, statut: l.statut,
    mails: { fait: l.fait_mail, total: totalMails, echecs: l.echecs_mail },
    sms: { fait: l.fait_sms, total: l.sms.length, echecs: l.echecs_sms },
    enCours,
    repriseA: enCours && l.reprise_a ? new Date(l.reprise_a).getTime() : undefined,
    journal: l.journal ?? [],
    message: l.message ?? undefined,
    termine: l.statut === "terminee",
    arrete: l.statut === "arretee",
    recap: l.recap ?? undefined,
    finieA: l.finie_at ? new Date(l.finie_at).getTime() : undefined,
    creeA: new Date(l.created_at).getTime(),
  };
}

/** Inscrit une salve validée à l'écran. Elle est aussitôt « en cours ». */
export async function inscrire(s: {
  titre: string; agentId?: string; agentNom?: string; immeubleId?: string;
  mails: EnvoiMail[]; sms: EnvoiSms[]; chemins?: string[];
}): Promise<EtatSalve> {
  const mail = await import("./mail");
  const voie: "boite" | "masse" = s.mails.length && mail.masseConfiguree() ? "masse" : "boite";
  let expediteur: string | null = null;
  let salveId: string | null = null;
  if (voie === "masse" && s.mails.length) {
    const { voieRelancesGroupees, ouvrirSalveRelances } = await import("./relances-actions");
    const v = await voieRelancesGroupees(s.agentId);
    expediteur = v.expediteur || null;
    salveId = (await ouvrirSalveRelances({
      titre: s.titre, total: s.mails.length, objet: s.mails[0].objet, corps: s.mails[0].corps,
      agentId: s.agentId, immeubleId: s.immeubleId,
    })) || null;
  }
  const [l] = await ecrire("POST", {
    titre: s.titre, agent_id: s.agentId ?? null, agent_nom: s.agentNom ?? null, immeuble_id: s.immeubleId ?? null,
    voie, expediteur, objet: s.mails[0]?.objet ?? null, corps: s.mails[0]?.corps ?? null, sms_texte: s.sms[0]?.texte ?? null,
    mails: s.mails, sms: s.sms, chemins: s.chemins ?? [], salve_id: salveId, statut: "en_cours",
  });
  return versEtat(l);
}

/** Inscrit les e-mails d'une commercialisation (MAV, 29/09 : « mets aussi
 *  les e-mails de commercialisation sur la file »). Même file, même
 *  automate : l'assistant se ferme, l'envoi continue. */
export async function inscrireCommercialisation(titre: string, ch: ChargeCommercialisation, agentNom?: string): Promise<EtatSalve> {
  const [l] = await ecrire("POST", {
    genre: "commercialisation", charge: ch,
    titre, agent_id: ch.agentId ?? null, agent_nom: agentNom ?? null, immeuble_id: ch.immeubleId,
    voie: "masse", expediteur: null, objet: ch.objet, corps: ch.message, sms_texte: null,
    mails: [], sms: [], chemins: [`/bien/${ch.immeubleId}`], salve_id: null, statut: "en_cours",
  });
  return versEtat(l);
}

/** L'état d'une salve, ou de la salve active la plus récente. */
export async function etat(id?: string): Promise<EtatSalve | null> {
  const lignes = id
    ? await lire(`id=eq.${encodeURIComponent(id)}&limit=1`)
    : await lire(`statut=eq.en_cours&order=created_at.asc&limit=1`);
  return lignes[0] ? versEtat(lignes[0]) : null;
}

/** La dernière salve, en cours ou finie depuis peu : ce que la pastille montre. */
export async function derniere(): Promise<EtatSalve | null> {
  const depuis = new Date(Date.now() - 10 * 60_000).toISOString();
  const lignes = await lire(`or=(statut.eq.en_cours,finie_at.gte.${encodeURIComponent(depuis)})&order=created_at.desc&limit=1`);
  return lignes[0] ? versEtat(lignes[0]) : null;
}

/** Arrête une salve : ce qui est parti reste marqué, le reste attend. */
export async function arreter(id: string): Promise<EtatSalve | null> {
  const [l] = await ecrire("PATCH", { statut: "arretee", finie_at: new Date().toISOString() },
    `id=eq.${encodeURIComponent(id)}&statut=eq.en_cours`);
  if (!l) return etat(id);
  await recapituler(l);
  return etat(id);
}

/* Douze e-mails par paquet sur le relais, six par la boîte ; cent SMS (une
   seule campagne MailingVox par paquet). Un tour s'arrête après `BUDGET_MS`,
   sous la coupure Vercel à soixante secondes ; le tour suivant reprend au
   curseur. Un paquet ne s'entame que s'il reste de quoi le finir : un paquet
   de douze e-mails avec pièce jointe prend jusqu'à vingt secondes, et c'est
   un paquet entamé à huit secondes de la fin qui faisait couper la page à
   soixante (vu le 29/09 : « la page a buggé »). */
const LOT_RELAIS = 12;
const LOT_BOITE = 6;
const LOT_SMS = 100;
const MARGE_MAIL_MS = 22_000;
const MARGE_SMS_MS = 12_000;
const BUDGET_MS = 40_000;
const VERROU_MS = 75_000;
const HEURE = 3_600_000;

/**
 * Fait avancer la salve pendant au plus `budgetMs`, puis rend son état.
 * Réentrant : deux appels simultanés (la page et le cron) ne se marchent
 * pas dessus grâce au verrou.
 */
export async function tourner(id: string, budgetMs = BUDGET_MS): Promise<EtatSalve | null> {
  const debut = Date.now();
  const maintenant = new Date().toISOString();
  /* Prendre le verrou : une seule main à la fois. */
  const prises = await ecrire("PATCH", { verrou_jusqua: new Date(Date.now() + VERROU_MS).toISOString() },
    `id=eq.${encodeURIComponent(id)}&statut=eq.en_cours&or=(verrou_jusqua.is.null,verrou_jusqua.lt.${encodeURIComponent(maintenant)})`);
  const l = prises[0];
  if (!l) return etat(id);

  const journal = [...(l.journal ?? [])];
  const patch: Record<string, unknown> = {};
  const poser = async (p: Record<string, unknown>) => {
    Object.assign(patch, p);
    await ecrire("PATCH", { ...p, journal: journal.slice(-200), verrou_jusqua: new Date(Date.now() + VERROU_MS).toISOString() },
      `id=eq.${encodeURIComponent(id)}`);
  };
  const tempsRestant = () => budgetMs - (Date.now() - debut);
  /* L'agent a-t-il demandé l'arrêt entre deux paquets ? */
  const encoreEnCours = async () => (await lire(`id=eq.${encodeURIComponent(id)}&select=statut`))[0]?.statut === "en_cours";

  try {
    if (l.genre === "commercialisation") {
      await tournerCommercialisation(l, { poser, journal, tempsRestant, encoreEnCours });
      return etat(id);
    }
    const { envoyerRelances, relancesDerniereHeure } = await import("./relances-actions");
    const { relancerParSms } = await import("./propositions-actions");
    const relais = l.voie === "masse";
    const lot = relais ? LOT_RELAIS : LOT_BOITE;
    let curseur = l.curseur_mail;
    let fait = l.fait_mail;
    let echecs = l.echecs_mail;

    /* La pause de la boîte (plafond horaire) : si l'heure de reprise n'est
       pas venue, on rend la main, le cron repassera. */
    if (l.reprise_a && new Date(l.reprise_a).getTime() > Date.now()) {
      await poser({ verrou_jusqua: null });
      return etat(id);
    }

    while (curseur < l.mails.length && tempsRestant() > MARGE_MAIL_MS) {
      if (!(await encoreEnCours())) break;
      const paquet = l.mails.slice(curseur, curseur + lot);
      if (!relais) {
        const f = await relancesDerniereHeure();
        if (f.n + paquet.length > PLAFOND_RELANCES && f.premiere) {
          const reprise = new Date(new Date(f.premiere).getTime() + HEURE + 15_000).toISOString();
          await poser({ reprise_a: reprise, curseur_mail: curseur, fait_mail: fait, echecs_mail: echecs, verrou_jusqua: null });
          return etat(id);
        }
      }
      const r = await envoyerRelances(paquet, l.agent_id ?? undefined, undefined, l.chemins ?? [], {
        voie: relais ? "masse" : "boite", salveId: l.salve_id ?? undefined, avant: { envoyes: fait, echecs },
      });
      curseur += paquet.length;
      fait += r.envoyes;
      echecs += r.echecs;
      journal.push(...r.journal);
      await poser({ curseur_mail: curseur, fait_mail: fait, echecs_mail: echecs, reprise_a: null });
    }

    let curseurSms = l.curseur_sms;
    let faitSms = l.fait_sms;
    let echecsSms = l.echecs_sms;
    while (curseur >= l.mails.length && curseurSms < l.sms.length && tempsRestant() > MARGE_SMS_MS) {
      if (!(await encoreEnCours())) break;
      const paquet = l.sms.slice(curseurSms, curseurSms + LOT_SMS);
      const s = await relancerParSms(paquet, l.agent_nom ?? undefined, l.chemins ?? []);
      curseurSms += paquet.length;
      faitSms += s.envoyes;
      echecsSms += s.echecs;
      journal.push(...s.journal);
      await poser({ curseur_sms: curseurSms, fait_sms: faitSms, echecs_sms: echecsSms });
      /* Plus de crédit MailingVox : inutile d'enchaîner, la salve s'arrête en
         erreur et le dit ; ce qui n'est pas parti n'est pas marqué. */
      if (s.arret) throw new Error(s.arret);
    }

    const finie = curseur >= l.mails.length && curseurSms >= l.sms.length;
    if (finie && (await encoreEnCours())) {
      await poser({ statut: "terminee", finie_at: new Date().toISOString(), verrou_jusqua: null });
      const [fin] = await lire(`id=eq.${encodeURIComponent(id)}`);
      if (fin) await recapituler(fin);
    } else {
      await poser({ verrou_jusqua: null });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    /* Une erreur de route (relais absent, plafond du jour, clé) arrête la
       salve et le dit ; ce qui est parti reste marqué. */
    await poser({ statut: "erreur", message, finie_at: new Date().toISOString(), verrou_jusqua: null });
    const [fin] = await lire(`id=eq.${encodeURIComponent(id)}`);
    if (fin) await recapituler(fin);
  }
  return etat(id);
}

/**
 * Les e-mails d'une commercialisation, par paquets de douze : chaque paquet
 * passe par `envoyerMailsCommercialisation`, qui inscrit sur la
 * commercialisation elle-même les adresses servies (la reprise s'en sert) et
 * la marque envoyée quand tout est parti. Ici on ne fait qu'avancer le
 * curseur et compter.
 */
async function tournerCommercialisation(l: SalveLigne, o: {
  poser: (p: Record<string, unknown>) => Promise<void>;
  journal: string[];
  tempsRestant: () => number;
  encoreEnCours: () => Promise<boolean>;
}) {
  const ch = l.charge as ChargeCommercialisation;
  const adresses = ch.destinataires ?? [];
  const { envoyerMailsCommercialisation } = await import("./actions");
  let curseur = l.curseur_mail;
  let fait = l.fait_mail;
  let echecs = l.echecs_mail;
  /* Un paquet avec ses pièces jointes prend dix secondes : on ne l'entame que
     s'il reste de quoi le finir. */
  while (curseur < adresses.length && o.tempsRestant() > MARGE_MAIL_MS) {
    if (!(await o.encoreEnCours())) break;
    const lot = adresses.slice(curseur, curseur + LOT_RELAIS);
    const r = await envoyerMailsCommercialisation({
      immeubleId: ch.immeubleId, commId: ch.commId, objet: ch.objet, message: ch.message,
      destinataires: lot, pieces: ch.pieces, quand: ch.quand, agentId: ch.agentId, total: ch.total,
    });
    if (!r.ok || !("envoyes" in r)) throw new Error(("message" in r && r.message) || "L'envoi s'est interrompu.");
    curseur += lot.length;
    fait += r.envoyes;
    echecs += r.echecs.length;
    o.journal.push(...r.echecs.map((e) => `E-mail ${e.email} : ${e.raison}`));
    await o.poser({ curseur_mail: curseur, fait_mail: fait, echecs_mail: echecs });
  }
  if (curseur >= adresses.length && (await o.encoreEnCours())) {
    await o.poser({ statut: "terminee", finie_at: new Date().toISOString(), verrou_jusqua: null });
    const [fin] = await lire(`id=eq.${encodeURIComponent(l.id)}`);
    if (fin) await recapituler(fin);
  } else {
    await o.poser({ verrou_jusqua: null });
  }
}

/** Un tour sur la salve active la plus ancienne : ce que le cron appelle. */
export async function tournerLaFile(budgetMs = BUDGET_MS): Promise<EtatSalve | null> {
  const [l] = await lire(`statut=eq.en_cours&order=created_at.asc&limit=1`);
  if (!l) return null;
  return tourner(l.id, budgetMs);
}

/** Le récapitulatif dans la boîte de l'agent, une fois, à la fin. */
async function recapituler(l: SalveLigne) {
  if (l.recap) return;
  if (l.fait_mail + l.fait_sms + l.echecs_mail + l.echecs_sms === 0) return;
  const { recapSalveRelances } = await import("./relances-actions");
  let recap: string;
  try {
    const r = await recapSalveRelances({
      titre: l.titre, agentId: l.agent_id ?? undefined, voie: l.voie, expediteur: l.expediteur ?? undefined,
      objet: l.objet ?? "", corps: l.corps ?? "",
      mails: { fait: l.fait_mail, total: l.genre === "commercialisation" ? ((l.charge as ChargeCommercialisation).destinataires?.length ?? 0) : l.mails.length, echecs: l.echecs_mail },
      sms: { fait: l.fait_sms, total: l.sms.length, echecs: l.echecs_sms },
      journal: l.journal ?? [],
      destinataires: l.genre === "commercialisation"
        ? ((l.charge as ChargeCommercialisation).destinataires ?? [])
        : [...l.mails.map((m) => m.email), ...l.sms.filter((s) => s.tel).map((s) => `${s.libelle} (SMS)`)],
      arretee: l.statut !== "terminee", smsTexte: l.sms_texte ?? undefined,
    });
    recap = r.ok ? `Récapitulatif envoyé à ${r.adresse}.` : `Récapitulatif non envoyé : ${r.message ?? "?"}`;
  } catch (e) {
    recap = `Récapitulatif non envoyé : ${e instanceof Error ? e.message : String(e)}`;
  }
  await ecrire("PATCH", { recap }, `id=eq.${encodeURIComponent(l.id)}`).catch(() => undefined);
}
