/* Le rappel du lundi : « il faut envoyer un rapport au propriétaire »
 * (MAV, 19/11/26).
 *
 * « Ce pourrait être bien de faire un e-mail au commercial toutes les semaines
 * pour dire qu'il faut envoyer un rapport au propriétaire, ce qui le
 * pousserait à faire des actions […] il y aurait aussi un récap de la
 * commercialisation mais aussi ce qu'il y a de nouveau depuis le dernier
 * envoi. »
 *
 * L'e-mail va à l'agent, jamais au propriétaire : rien ne part chez un vendeur
 * sans le clic de l'agent (§7.9). Ce fichier ne fait que calculer et rédiger —
 * il est pur, donc testé ; la lecture et l'envoi sont dans
 * rapport-rappel-serveur.ts.
 */

import type { Rapport } from "./rapport-commercialisation";
import { ech, euros } from "./rapport-html";
import { jourMois } from "./rapport-contenu";

/** Un rapport par semaine : en deçà, le propriétaire vient d'être tenu au courant. */
export const DELAI_JOURS = 7;

export type BienRappel = {
  id: string;
  /** L'adresse, telle qu'elle s'affiche partout dans le BO. */
  libelle: string;
  prixMandat?: number;
  /** Le premier envoi du dossier. Absent : aucune action de commercialisation. */
  debut?: string;
  dernierRapport?: string;
  /** Le dernier envoi ou la dernière relance. */
  derniereAction?: string;
  chiffres: { contactes: number; repondants: number; visites: number; offres: number; offreHaute?: number };
  /** Ce qui s'est ajouté depuis le dernier rapport. Absent : aucun rapport encore. */
  nouveau?: { contactes: number; reponses: number; visites: number; offres: number };
  /** Les points du contrôle « as-tu bien tout noté ? », sans aucun nom. */
  aVerifier: string[];
  /** Le bien n'a pas d'agent qui ait un accès actif au BO : il est signalé à la direction. */
  sansAgent?: boolean;
};

export type Classement = {
  /** Un rapport est dû, et il y a de quoi l'écrire. */
  aEnvoyer: BienRappel[];
  /** Un rapport est dû, mais rien ne s'est passé depuis le dernier (ou depuis le mandat). */
  rienDeNouveau: BienRappel[];
  /** Le propriétaire a eu son rapport il y a moins d'une semaine. */
  aJour: BienRappel[];
};

const jours = (de: string, a: string) => Math.floor((Date.parse(a) - Date.parse(de)) / 86_400_000);
const pluriel = (n: number, mot: string, pl = `${mot}s`) => `${n} ${n > 1 ? pl : mot}`;
const ilYA = (n: number) => (n <= 0 ? "aujourd'hui" : n === 1 ? "hier" : `il y a ${n} jours`);

/** Ce que le rappel retient d'un rapport calculé. */
export function bienDepuisRapport(id: string, libelle: string, r: Rapport, dernierRapport?: string): BienRappel {
  const derniereAction = r.actions.map((a) => a.dateFin ?? a.date).filter(Boolean).sort().pop();
  return {
    id, libelle,
    prixMandat: r.barometre?.prixMandat,
    debut: r.debut,
    dernierRapport,
    derniereAction,
    chiffres: {
      contactes: r.chiffres.contactes, repondants: r.chiffres.repondants,
      visites: r.chiffres.visites, offres: r.chiffres.offres, offreHaute: r.chiffres.offreHaute,
    },
    nouveau: dernierRapport && r.nouveau
      ? { contactes: r.nouveau.contactes, reponses: r.nouveau.reponses, visites: r.nouveau.visites, offres: r.nouveau.offres }
      : undefined,
    aVerifier: r.controles.filter((c) => c.niveau === "alerte").map((c) => c.titre.replace(/[.\s]+$/, "")),
  };
}

/** Y a-t-il de quoi écrire au propriétaire ? */
function aDuNouveau(b: BienRappel): boolean {
  if (!b.dernierRapport) return b.chiffres.contactes > 0 || b.chiffres.visites > 0 || b.chiffres.offres > 0;
  const n = b.nouveau;
  return !!n && n.contactes + n.reponses + n.visites + n.offres > 0;
}

export function classer(biens: BienRappel[], maintenant: string): Classement {
  const c: Classement = { aEnvoyer: [], rienDeNouveau: [], aJour: [] };
  for (const b of biens) {
    if (b.dernierRapport && jours(b.dernierRapport, maintenant) < DELAI_JOURS) c.aJour.push(b);
    else if (aDuNouveau(b)) c.aEnvoyer.push(b);
    else c.rienDeNouveau.push(b);
  }
  /* Le plus ancien d'abord : jamais de rapport, puis le rapport le plus vieux. */
  const anciennete = (b: BienRappel) => b.dernierRapport ?? "";
  c.aEnvoyer.sort((x, y) => anciennete(x).localeCompare(anciennete(y)));
  c.rienDeNouveau.sort((x, y) => (x.derniereAction ?? "").localeCompare(y.derniereAction ?? ""));
  return c;
}

/** Rien à dire à l'agent : aucun e-mail ne part. */
export const rappelVide = (c: Classement) => c.aEnvoyer.length + c.rienDeNouveau.length === 0;

export function objetRappel(c: Classement): string {
  const n = c.aEnvoyer.length + c.rienDeNouveau.length;
  return n === 1 ? "1 rapport au propriétaire à envoyer cette semaine" : `${n} rapports aux propriétaires à envoyer cette semaine`;
}

/** « Dernier rapport le 12 novembre, il y a 8 jours. » */
export function phraseRapport(b: BienRappel, maintenant: string): string {
  if (b.dernierRapport) return `Dernier rapport le ${jourMois(b.dernierRapport)}, ${ilYA(jours(b.dernierRapport, maintenant))}.`;
  if (b.debut) return `Aucun rapport envoyé depuis le début de la commercialisation, le ${jourMois(b.debut)}.`;
  return "Aucun rapport envoyé.";
}

/** « Depuis : 12 acquéreurs contactés, 3 réponses, 1 visite. » — seulement ce qui n'est pas nul. */
export function phraseNouveau(b: BienRappel): string | undefined {
  const n = b.nouveau;
  if (!n) return undefined;
  const parts = [
    n.contactes ? pluriel(n.contactes, "acquéreur contacté", "acquéreurs contactés") : "",
    n.reponses ? pluriel(n.reponses, "réponse") : "",
    n.visites ? pluriel(n.visites, "visite") : "",
    n.offres ? pluriel(n.offres, "offre") : "",
  ].filter(Boolean);
  return parts.length ? `Depuis : ${parts.join(", ")}.` : undefined;
}

/** « Depuis le début : 187 contactés, 14 répondants, 3 visites, 1 offre (la plus haute à 500 000 €). » */
export function phraseTotal(b: BienRappel): string | undefined {
  const c = b.chiffres;
  if (!c.contactes && !c.visites && !c.offres) return undefined;
  const offre = c.offres
    ? `${pluriel(c.offres, "offre")}${c.offreHaute ? ` (${c.offres > 1 ? "la plus haute " : ""}à ${euros(c.offreHaute)})` : ""}`
    : "aucune offre";
  return `Depuis le début : ${pluriel(c.contactes, "contacté", "contactés")}, ${pluriel(c.repondants, "répondant")}, ${pluriel(c.visites, "visite")}, ${offre}.`;
}

/** Pourquoi il n'y a rien à dire : c'est la ligne qui doit faire agir. */
export function phraseCalme(b: BienRappel, maintenant: string): string {
  if (!b.derniereAction) return "Mandat en cours, aucun envoi du dossier à ce jour.";
  const n = jours(b.derniereAction, maintenant);
  const base = `Dernière action le ${jourMois(b.derniereAction)}, ${ilYA(n)}.`;
  return b.dernierRapport ? `Rien de nouveau depuis le rapport du ${jourMois(b.dernierRapport)}. ${base}` : base;
}

export type ContexteRappel = { prenom?: string; base: string; maintenant: string };

const lienBien = (base: string, id: string) => `${base}/bien/${encodeURIComponent(id)}?sect=vente&ecran=vente`;
const titre = (b: BienRappel) => `${b.libelle}${b.prixMandat ? ` — ${euros(b.prixMandat)}` : ""}${b.sansAgent ? " (sans agent actif dans le BO)" : ""}`;

export function texteRappel(c: Classement, ctx: ContexteRappel): string {
  const l: string[] = [`Bonjour${ctx.prenom ? ` ${ctx.prenom}` : ""},`, ""];
  l.push("Le point de la semaine sur vos biens en vente. Aucun rapport ne part tout seul : chacun se relit et s'envoie depuis le Suivi de la vente du bien.", "");
  if (c.aEnvoyer.length) {
    l.push(`RAPPORT À ENVOYER (${c.aEnvoyer.length})`, "");
    for (const b of c.aEnvoyer) {
      l.push(titre(b), phraseRapport(b, ctx.maintenant));
      const n = phraseNouveau(b); if (n) l.push(n);
      const t = phraseTotal(b); if (t) l.push(t);
      if (b.aVerifier.length) l.push(`À vérifier avant d'envoyer : ${b.aVerifier.join(" ; ")}.`);
      l.push(lienBien(ctx.base, b.id), "");
    }
  }
  if (c.rienDeNouveau.length) {
    l.push(`RIEN DE NOUVEAU À DIRE AU PROPRIÉTAIRE (${c.rienDeNouveau.length})`, "");
    for (const b of c.rienDeNouveau) l.push(titre(b), phraseCalme(b, ctx.maintenant), lienBien(ctx.base, b.id), "");
  }
  if (c.aJour.length) {
    l.push(`À jour (rapport de moins de ${DELAI_JOURS} jours) : ${c.aJour.map((b) => b.libelle).join(" ; ")}.`, "");
  }
  return l.join("\n").trimEnd();
}

/* Même parti pris que le rapport au propriétaire : tableaux, styles sur chaque
   balise, aucune image, 600 px au plus — lisible sur mobile et dans une
   messagerie qui bloque les images. */
export function htmlRappel(c: Classement, ctx: ContexteRappel): string {
  const P = "margin:0 0 6px;font:14px/1.5 Arial,Helvetica,sans-serif;color:#21262d";
  const bloc = (b: BienRappel, corps: string[], fond: string) => `
<tr><td style="padding:0 0 10px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e1ded5;border-radius:6px;background:${fond}">
<tr><td style="padding:12px 14px">
<p style="${P};font-weight:bold;font-size:15px"><a href="${ech(lienBien(ctx.base, b.id))}" style="color:#21262d;text-decoration:underline">${ech(b.libelle)}</a>${b.prixMandat ? `<span style="font-weight:normal;color:#626973"> — ${ech(euros(b.prixMandat))}</span>` : ""}</p>
${b.sansAgent ? `<p style="${P};color:#a2560f">Sans agent actif dans le BO.</p>` : ""}
${corps.map((t) => `<p style="${P}">${t}</p>`).join("\n")}
</td></tr></table>
</td></tr>`;
  const section = (libelle: string) =>
    `<tr><td style="padding:14px 0 8px;font:bold 12px/1.4 Arial,Helvetica,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#8f7326">${ech(libelle)}</td></tr>`;
  const lignes: string[] = [];
  if (c.aEnvoyer.length) {
    lignes.push(section(`Rapport à envoyer (${c.aEnvoyer.length})`));
    for (const b of c.aEnvoyer) {
      const corps = [ech(phraseRapport(b, ctx.maintenant))];
      const n = phraseNouveau(b); if (n) corps.push(`<b>${ech(n)}</b>`);
      const t = phraseTotal(b); if (t) corps.push(`<span style="color:#626973">${ech(t)}</span>`);
      if (b.aVerifier.length) corps.push(`<span style="color:#a2560f">À vérifier avant d'envoyer : ${ech(b.aVerifier.join(" ; "))}.</span>`);
      lignes.push(bloc(b, corps, "#ffffff"));
    }
  }
  if (c.rienDeNouveau.length) {
    lignes.push(section(`Rien de nouveau à dire au propriétaire (${c.rienDeNouveau.length})`));
    for (const b of c.rienDeNouveau) lignes.push(bloc(b, [ech(phraseCalme(b, ctx.maintenant))], "#fbf6ee"));
  }
  if (c.aJour.length) {
    lignes.push(`<tr><td style="padding:10px 0 0;font:13px/1.5 Arial,Helvetica,sans-serif;color:#626973">À jour (rapport de moins de ${DELAI_JOURS} jours) : ${ech(c.aJour.map((b) => b.libelle).join(" ; "))}.</td></tr>`);
  }
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f5f1">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f1"><tr><td align="center" style="padding:20px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
<tr><td style="padding:0 0 4px"><p style="${P}">Bonjour${ctx.prenom ? ` ${ech(ctx.prenom)}` : ""},</p>
<p style="${P}">Le point de la semaine sur vos biens en vente. Aucun rapport ne part tout seul : chacun se relit et s'envoie depuis le <b>Suivi de la vente</b> du bien.</p></td></tr>
${lignes.join("\n")}
</table></td></tr></table></body></html>`;
}
