/* Le premier jet du rapport de commercialisation : ce que le BO remplit tout
 * seul, avant que l'agent corrige et ajoute son texte (MAV, 19/11/26).
 *
 * Pur. Il part du rapport calculé (rapport-commercialisation.ts) et rend le
 * contenu que la mise en forme sait écrire (rapport-html.ts). Tout ce qui est
 * ici reste modifiable à l'écran : c'est une proposition, pas une décision.
 */

import type { Rapport } from "./rapport-commercialisation";
import { euros, type ContenuRapport } from "./rapport-html";

/** La légende des notes, dans les mots de MAV (19/11/26). */
export const LEGENDE_NOTES =
  "Note de l'acquéreur — A : a déjà acheté. B : a déjà visité ou fait une offre, ou acteur reconnu pour son sérieux. "
  + "C : nous avons déjà échangé, sans visite ni offre à ce jour. D : inscrit de lui-même sur notre site, sans échange à ce jour.";

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const j = (iso: string) => Number(iso.slice(8, 10));
const jour1 = (n: number) => (n === 1 ? "1ᵉʳ" : String(n));
/** « 3 novembre » */
export const jourMois = (iso: string) => `${jour1(j(iso))} ${MOIS[Number(iso.slice(5, 7)) - 1]}`;
/** « 03/11 » */
export const jjmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const NOMBRES = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix"];
const enLettres = (n: number, feminin = false) => (n === 1 && feminin ? "une" : n <= 10 ? NOMBRES[n] : String(n));
const maj = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** « les 3 et 9 novembre », « le 3 novembre », « les 28 octobre et 3 novembre ». */
export function listeDeJours(isos: string[]): string {
  const jours = [...new Set(isos.map((d) => d.slice(0, 10)))].sort();
  if (!jours.length) return "";
  if (jours.length === 1) return `le ${jourMois(jours[0])}`;
  const memeMois = jours.every((d) => d.slice(0, 7) === jours[0].slice(0, 7));
  const noms = memeMois ? jours.map((d) => jour1(j(d))) : jours.map(jourMois);
  const liste = `${noms.slice(0, -1).join(", ")} et ${noms[noms.length - 1]}`;
  return `les ${liste}${memeMois ? ` ${MOIS[Number(jours[0].slice(5, 7)) - 1]}` : ""}`;
}

/** « Du 3 au 19 novembre 2026 » */
export function periode(debut: string | undefined, fin: string): string {
  const an = fin.slice(0, 4);
  if (!debut) return `Au ${jourMois(fin)} ${an}`;
  if (debut.slice(0, 7) === fin.slice(0, 7)) return `Du ${jour1(j(debut))} au ${jourMois(fin)} ${an}`;
  return `Du ${jourMois(debut)}${debut.slice(0, 4) !== an ? ` ${debut.slice(0, 4)}` : ""} au ${jourMois(fin)} ${an}`;
}

export type ContexteRapport = {
  /** Le bien, tel qu'on le nomme à son propriétaire : son adresse. */
  bien: string;
  /** La ville, pour l'objet du message. */
  ville: string;
  /** « Madame », « Monsieur » — quand il n'y a qu'un destinataire et qu'on le sait. */
  civilite?: string;
  agent: { nom: string; tel?: string };
  diffusion: ContenuRapport["diffusion"];
};

/** La phrase « ce qui a été fait », tirée des actions. */
export function phraseActions(r: Rapport): string {
  const envois = r.actions.filter((a) => /envoi du dossier/i.test(a.libelle));
  const relances = r.actions.filter((a) => a.libelle === "Relance");
  const seuls = r.actions.filter((a) => /individuel/i.test(a.libelle));
  const mobile = envois.some((a) => /mobile/i.test(a.mode));
  const morceaux: string[] = [];
  if (envois.length) {
    morceaux.push(`${maj(enLettres(envois.length))} ${envois.length > 1 ? "envois" : "envoi"} du dossier, ${listeDeJours(envois.map((a) => a.date))}, par e-mail${mobile ? " et par message sur mobile" : ""}`);
  }
  if (relances.length) {
    const t = `${enLettres(relances.length, true)} ${relances.length > 1 ? "relances" : "relance"}, ${listeDeJours(relances.map((a) => a.date))}`;
    morceaux.push(morceaux.length ? `puis ${t}` : maj(t));
  }
  let phrase = morceaux.join(", ");
  if (phrase) phrase += ".";
  const n = seuls.reduce((t, a) => t + a.nombre, 0);
  if (n) phrase += `${phrase ? " " : ""}${maj(enLettres(n))} ${n > 1 ? "envois individuels" : "envoi individuel"}${envois.length ? " en complément" : ""}.`;
  return phrase;
}

export function contenuParDefaut(r: Rapport, ctx: ContexteRapport): ContenuRapport {
  const c = r.chiffres;
  const lancee = r.debut ? `, lancée le ${jourMois(r.debut)}` : "";
  const offre = c.offres === 0
    ? { valeur: "0", libelle: "offre à ce jour" }
    : { valeur: String(c.offres), libelle: `${c.offres > 1 ? "offres, la plus haute" : "offre,"} à ${c.offreHaute ? `${euros(c.offreHaute)} HAI` : "préciser"}` };
  const parNote = r.parNote.filter((l) => l.repondants > 0)
    .map((l) => `${l.note || "sans note"} ${l.repondants}`).join(" · ");
  const retoursNote = [
    r.refusSansExplication ? `${r.refusSansExplication > 1 ? `${r.refusSansExplication} refus sont arrivés` : "1 refus est arrivé"} sans explication.` : "",
    parNote ? `Répondants par note : ${parNote}.` : "",
  ].filter(Boolean).join(" ");
  const b = r.barometre;
  return {
    objet: `${ctx.ville || ctx.bien} — point de commercialisation au ${jourMois(r.fin)}`,
    bien: ctx.bien,
    periode: periode(r.debut, r.fin),
    salutation: ctx.civilite ? `Bonjour ${ctx.civilite},` : "Bonjour,",
    intro: `Voici le point sur la commercialisation de votre immeuble${lancee}.`,
    chiffres: [
      { valeur: String(c.contactes), libelle: c.contactes > 1 ? "acquéreurs contactés" : "acquéreur contacté" },
      { valeur: String(c.repondants), libelle: c.repondants > 1 ? "ont répondu" : "a répondu" },
      { valeur: String(c.visites), libelle: c.visites > 1 ? "visites effectuées" : "visite effectuée" },
      offre,
    ],
    fait: phraseActions(r),
    retient: "",
    libre: "",
    signature: ["Cordialement,", "", ctx.agent.nom, "France Immeuble", ctx.agent.tel ?? ""].filter((l, i) => i < 2 || l).join("\n"),

    actions: r.actions.map((a) => ({
      date: a.dateFin ? `${jjmm(a.date)} au ${jjmm(a.dateFin)}` : jjmm(a.date),
      libelle: a.libelle, mode: a.mode, nombre: String(a.nombre),
    })),
    chiffresDetail: [
      { valeur: String(c.contactes), libelle: "acquéreurs contactés" },
      { valeur: String(c.repondants), libelle: `ont répondu (${c.tauxReponse} %)` },
      { valeur: String(c.dossiers), libelle: c.dossiers > 1 ? "dossiers téléchargés" : "dossier téléchargé" },
      { valeur: String(c.refus), libelle: `refus, dont ${c.refusMotives} ${c.refusMotives > 1 ? "motivés" : "motivé"}` },
    ],
    retours: r.retours.map((x) => ({ qui: x.qui, note: x.note, texte: x.texte })),
    retoursNote,
    visites: r.visites.map((v) => ({ date: jjmm(v.date), qui: v.qui, note: v.note, texte: v.texte })),
    offres: r.offres.map((o) => ({
      date: o.date ? jjmm(o.date) : "", qui: o.qui, note: o.note,
      montant: o.montant ? `${euros(o.montant)} HAI` : "—", statut: o.statut,
    })),
    diffusion: ctx.diffusion,
    legende: LEGENDE_NOTES,

    plait: [],
    bloque: [],
    barometre: b ? {
      prixMandat: b.prixMandat,
      offreHaute: b.offreHaute?.montant,
      offreLibelle: b.offreHaute ? `Offre la plus haute${b.offreHaute.date ? ` · ${jjmm(b.offreHaute.date)}` : ""}` : undefined,
      reperes: [],
      commentaire: b.offreHaute
        ? `L'offre la plus haute est à ${b.offreHaute.pct} % du prix du mandat, soit ${euros(b.offreHaute.ecart)} d'écart.`
        : "Aucune offre n'a été reçue à ce jour.",
    } : undefined,
    pistes: [],
    suite: "",
  };
}

/* ------------------------------------------------- Plein Bail, en mots --- */

/** Ce que Plein Bail dit d'une annonce (lib/bo/diffusion.ts `Retombees`), réduit à ce qu'on en lit. */
export type RetombeesLues = {
  periode?: { depuis?: string; jusqu_a?: string };
  vues?: number; visiteurs?: number; impressions?: number; position_moyenne?: number;
  contacts?: number; telephones?: number; favoris?: number; alertes?: number;
  sources?: Record<string, number>;
};

/* Par où les visiteurs sont arrivés. Une clé que Plein Bail ajouterait un jour
   s'affiche telle quelle plutôt que de disparaître. */
const ORIGINES: Record<string, string> = {
  recherche: "recherche sur Plein Bail", alerte: "alerte e-mail", direct: "lien direct",
  moteur: "moteur de recherche", site: "autres pages du site", externe: "autre site",
};
const nombre = (n: number) => Math.round(n).toLocaleString("fr-FR").replace(/[\u202f\u00a0]/g, " ");

/**
 * Le bloc « Plein Bail » de la diffusion : les compteurs en tuiles, l'origine
 * des visiteurs en une phrase. Un compteur que Plein Bail n'envoie pas ne
 * s'affiche pas — on n'écrit jamais « 0 » pour « on ne sait pas ».
 */
export function blocPleinBail(pb: RetombeesLues): ContenuRapport["diffusion"][number] {
  const ligne = (v: number | undefined, libelle: string, valeur?: string) =>
    (typeof v === "number" ? { libelle, valeur: valeur ?? nombre(v) } : null);
  const lignes = [
    ligne(pb.impressions, "apparitions dans les résultats"),
    ligne(pb.position_moyenne, "position moyenne dans les résultats",
      typeof pb.position_moyenne === "number" ? pb.position_moyenne.toFixed(1).replace(".", ",") : undefined),
    ligne(pb.vues, "consultations de l'annonce"),
    ligne(pb.visiteurs, "visiteurs distincts"),
    ligne(pb.contacts, (pb.contacts ?? 0) > 1 ? "messages reçus" : "message reçu"),
    ligne(pb.telephones, (pb.telephones ?? 0) > 1 ? "téléphones demandés" : "téléphone demandé"),
    ligne(pb.alertes, "alertes envoyées à des acquéreurs"),
    ligne(pb.favoris, (pb.favoris ?? 0) > 1 ? "mises en favori" : "mise en favori"),
  ].filter((x): x is { libelle: string; valeur: string } => !!x);
  const origines = Object.entries(pb.sources ?? {}).filter(([, n]) => typeof n === "number" && n > 0)
    .sort((a, b) => b[1] - a[1]).map(([k, n]) => `${ORIGINES[k] ?? k} ${nombre(n)}`);
  const d = pb.periode?.depuis, j = pb.periode?.jusqu_a;
  return {
    source: d && j ? `Plein Bail — ${periode(d, j).replace(/^D/, "d")}` : "Plein Bail",
    lignes,
    note: origines.length ? `Origine des visiteurs : ${origines.join(", ")}.` : undefined,
  };
}
