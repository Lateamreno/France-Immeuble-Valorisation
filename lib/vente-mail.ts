/* Les e-mails du suivi de la vente (retours #568 et #570).
 *
 * Du texte pur, sans accès au serveur : la fenêtre « Écrire » le recalcule à
 * chaque changement de destinataire ou de lien, tant que l'agent n'a pas
 * retouché le corps. Le modèle de mise en relation est celui que MAV écrit à
 * la main depuis des années ; il ne fait que le remplir.
 */

import type { DonneesVente, LienPieces, Partie } from "@/lib/bo/vente";

/** Ce qu'un lien de pièces peut contenir — les cases à cocher (#570). */
export const PIECES_LIEN = [
  "Notre mandat",
  "L'offre",
  "Les diagnostics en notre possession",
  "Notre dossier",
  "La dernière taxe foncière",
  "L'acte de propriété",
  "Les plans",
  "Les baux",
  "D'autres éléments du dossier",
];

export type Signature = { nom: string; tel?: string };

const estNotaire = (p: Partie) => p.role.startsWith("notaire");
const estClerc = (p: Partie) => p.role.startsWith("clerc");
const euros = (n: number) => `${Math.round(n).toLocaleString("fr-FR").replace(/ /g, " ")} €`;
const jour = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("fr-FR") : "");

/** « Sophie CISSOKHO », le nom de famille en capitales. */
function prenomNom(p: Partie): string {
  if (!p.nomFamille && !p.prenom) return p.nom;
  return [p.prenom, p.nomFamille?.toUpperCase()].filter(Boolean).join(" ");
}

/** Comment on le nomme dans une phrase : « Maître VOLLE », « Madame Sophie CISSOKHO ». */
function designer(p: Partie, avecPrenom = true): string {
  if (estNotaire(p)) return `Maître ${avecPrenom ? prenomNom(p) : (p.nomFamille?.toUpperCase() ?? p.nom)}`;
  const nom = avecPrenom ? prenomNom(p) : (p.nomFamille?.toUpperCase() ?? p.nom);
  return p.civilite ? `${p.civilite} ${nom}` : prenomNom(p);
}

/**
 * La formule d'appel (#568) : « Bonjour Maître VOLLE, » au notaire, « Chers
 * Maîtres, » à plusieurs notaires, « Bonjour Madame MARTIN, » à un clerc.
 */
export function salutation(a: Partie[]): string {
  if (a.length === 0) return "Bonjour,";
  if (a.length > 1 && a.every(estNotaire)) return "Chers Maîtres,";
  const noms = a.map((p) => designer(p, false));
  const liste = noms.length > 1 ? `${noms.slice(0, -1).join(", ")} et ${noms[noms.length - 1]}` : noms[0];
  return `Bonjour ${liste},`;
}

/** L'objet de tous les e-mails de la vente : « VENTE CISSOKHO / TAL CORPORATE ». */
export function objetVente(d: DonneesVente): string {
  const nomDe = (p: Partie) => (p.entite?.nom ?? p.nomFamille ?? p.nom).toUpperCase();
  const v = d.parties.filter((p) => p.role === "vendeur").map(nomDe);
  const a = d.parties.filter((p) => p.role === "acquereur").map(nomDe);
  return `VENTE ${[...new Set(v)].join(" - ") || "VENDEUR"} / ${[...new Set(a)].join(" - ") || d.offre?.acheteurNom?.toUpperCase() || "ACQUÉREUR"}`;
}

const fem = (p?: Partie) => p?.civilite === "Madame";

/** Le bloc de coordonnées d'une personne, une information par ligne. */
function coordonnees(p: Partie): string[] {
  /* Retour #571 : le client parle au nom de l'entité de facturation choisie
     sur sa carte — la société d'abord, son représentant ensuite. */
  const tete = p.entite
    ? [p.entite.nom, `Représentée par ${p.civilite ? `${p.civilite.toLowerCase()} ` : ""}${prenomNom(p)}${p.entite.fonction ? `, ${p.entite.fonction.toLowerCase()}` : ""}`]
    : [estNotaire(p) ? designer(p) : prenomNom(p)];
  return [...tete, p.email, p.tel].filter((x): x is string => !!x);
}

/** Un côté de la vente : les clients, puis leur notaire et son clerc. */
function cote(d: DonneesVente, c: "vendeur" | "acquereur"): string[] {
  const clients = d.parties.filter((p) => p.role === c);
  const pluriel = clients.length > 1;
  const titre = c === "vendeur" ? (pluriel ? "Vendeurs :" : "Vendeur :") : (pluriel ? "Acquéreurs :" : "Acquéreur :");
  const blocs: string[] = [titre, ""];
  if (clients.length === 0 && c === "acquereur" && d.offre?.acheteurNom) blocs.push(d.offre.acheteurNom, "");
  for (const p of clients) blocs.push(...coordonnees(p), "");
  const notaire = d.parties.find((p) => p.role === `notaire_${c}`);
  const clerc = d.parties.find((p) => p.role === `clerc_${c}`);
  if (notaire) {
    const accord = pluriel ? "Représentés par leur notaire :"
      : fem(clients[0]) || clients[0]?.entite ? "Représentée par son notaire :" : "Représenté par son notaire :";
    blocs.push(accord, "", ...coordonnees(notaire), "");
  }
  if (clerc) {
    blocs.push(`Dossier suivi par ${fem(clerc) ? "sa clerc" : "son clerc"} :`, "", designer(clerc), ...[clerc.email, clerc.tel].filter((x): x is string => !!x), "");
  }
  return blocs;
}

/** Le prix, comme le mandat l'a fixé : honoraires inclus, à la charge de qui. */
function phrasePrix(d: DonneesVente): string | undefined {
  const o = d.offre;
  if (!o?.prixHai) return undefined;
  const honos = o.prixNv ? o.prixHai - o.prixNv : undefined;
  const qui = d.bien.chargeVendeur ? "du vendeur" : "de l'acquéreur";
  const mandat = d.mandat?.numero
    ? ` conformément au mandat de vente n°${d.mandat.numero}${d.mandat.signeLe ? ` en date du ${jour(d.mandat.signeLe)}` : ""}`
    : "";
  return `La vente de l'immeuble a été consentie au prix de ${euros(o.prixHai)} honoraires inclus`
    + (honos && honos > 0 ? ` dont ${euros(honos)} d'honoraires TTC à la charge ${qui} (soit ${euros(o.prixNv!)} net vendeur)` : "")
    + `${mandat}.`;
}

/** Une pièce par ligne, comme MAV les écrit : virgule, point à la dernière. */
const enListe = (l: string[]) => l.map((x, i) => `${x}${i === l.length - 1 ? "." : ","}`);

function signature(s: Signature): string[] {
  return ["Cordialement", "", s.nom, "France Immeuble", ...(s.tel ? [s.tel] : [])];
}

/** Le premier e-mail aux notaires : qui est qui, le prix, les pièces (#570). */
export function mailMiseEnRelation(d: DonneesVente, a: Partie[], s: Signature, lien?: LienPieces): string {
  /* Une société se nomme d'abord, son représentant ensuite (« TAL CORPORATE
     (représentée par Monsieur Daniel SABBAH) »). */
  const nommer = (p: Partie) => (p.entite ? `${p.entite.nom} (représentée par ${designer(p)})` : designer(p));
  const vendeurs = d.parties.filter((p) => p.role === "vendeur").map(nommer);
  const acquereurs = d.parties.filter((p) => p.role === "acquereur");
  const qui = acquereurs.length ? acquereurs.map(nommer) : d.offre?.acheteurNom ? [d.offre.acheteurNom] : [];
  const et = (l: string[]) => (l.length > 1 ? `${l.slice(0, -1).join(", ")} et ${l[l.length - 1]}` : l[0] ?? "");
  const lignes: string[] = [
    salutation(a), "",
    `Nous nous occupons de la vente d'un immeuble sis ${d.bien.adresse}`
      + (vendeurs.length ? ` appartenant à ${et(vendeurs)}` : "")
      + (qui.length ? ` et pour lequel ${et(qui)} ${qui.length > 1 ? "souhaitent se porter acquéreurs" : "souhaite se porter acquéreur"}` : "")
      + ". Les vendeurs, ainsi que les acquéreurs, m'ont communiqué vos coordonnées afin que je puisse vous demander "
      + "de rédiger la promesse. Vous trouverez ci-dessous les coordonnées des parties prenantes au dossier ainsi que "
      + "les éléments en notre possession sur l'immeuble :",
    "",
    ...cote(d, "vendeur"),
    ...cote(d, "acquereur"),
  ];
  const prix = phrasePrix(d);
  if (prix) lignes.push(prix, "");
  lignes.push(
    "Je vous remercie de bien vouloir me communiquer les pièces dont vous avez besoin pour la rédaction de la "
    + "promesse afin que je puisse vous aider à les réunir rapidement en vue de la signature de cette dernière."
    + (lien ? " Dans un premier temps, vous trouverez un lien contenant les éléments suivants :" : ""),
    "",
  );
  if (lien) {
    lignes.push(...enListe(lien.pieces), "", `Voici le lien en question : ${lien.url}`, "");
  }
  /* Le gestionnaire, seulement s'il y en a un (#570). */
  const g = d.parties.find((p) => p.role === "gestionnaire");
  if (g) {
    const elle = fem(g);
    lignes.push(
      `${elle ? "Une gestionnaire" : "Un gestionnaire"} s'occupe de l'immeuble. Je peux faire l'interface avec `
      + `${elle ? "elle" : "lui"} si vous le souhaitez pour la partie locative et technique ; sinon, voici ses coordonnées :`,
      "",
      ...(g.societe
        ? [g.societe.toUpperCase(), `représentée par ${designer(g, false)}`]
        : [designer(g)]),
      ...[g.tel, g.email].filter((x): x is string => !!x),
      "",
    );
  }
  lignes.push(
    "Je reste à votre entière disposition pour tout complément d'information."
    + (lien ? " Pouvez-vous par ailleurs me confirmer la bonne réception du lien et le bon téléchargement des documents s'il vous plaît ?" : ""),
    "",
    ...signature(s),
  );
  return lignes.join("\n");
}

/**
 * La version « clients » de la mise en relation (#571) : le mail aux notaires
 * porte les coordonnées de tous et des pièces confidentielles ; chaque client
 * reçoit, à part, un mot qui dit que les notaires sont en relation et, en
 * gros, ce qui leur a été transmis. Un message par côté : le vendeur ne voit
 * jamais l'adresse de l'acquéreur, ni l'inverse.
 */
export function mailInformationClient(
  d: DonneesVente, c: "vendeur" | "acquereur", a: Partie[], s: Signature, lien?: LienPieces,
): string {
  const autre = c === "vendeur" ? "acquereur" : "vendeur";
  const notaire = (x: "vendeur" | "acquereur") => d.parties.find((p) => p.role === `notaire_${x}`);
  const clerc = (x: "vendeur" | "acquereur") => d.parties.find((p) => p.role === `clerc_${x}`);
  const lui = notaire(c);
  const lAutre = notaire(autre);
  const pluriel = a.length > 1 || d.parties.filter((p) => p.role === c).length > 1;
  const quiAutre = autre === "vendeur" ? "du vendeur" : "de l'acquéreur";
  const relation = lui && lAutre
    ? `j'ai mis en relation votre notaire, ${designer(lui)}, et celui ${quiAutre}, ${designer(lAutre)}, afin qu'ils préparent la promesse de vente`
    : lAutre
      ? `j'ai pris contact avec le notaire ${quiAutre}, ${designer(lAutre)}, afin de préparer la promesse de vente`
      : lui
        ? `j'ai pris contact avec votre notaire, ${designer(lui)}, afin de préparer la promesse de vente`
        : "j'ai mis les notaires en relation afin qu'ils préparent la promesse de vente";
  const suivi = clerc(c);
  const transmis = [
    "les coordonnées des parties",
    "les conditions de la vente (prix et honoraires)",
    ...(lien ? [`un premier lien contenant ${lien.pieces.map((x) => x.charAt(0).toLowerCase() + x.slice(1)).join(", ").replace(/, ([^,]*)$/, " et $1")}`] : []),
  ];
  return [
    salutation(a), "",
    `Je vous informe que ${relation}.`, "",
    `Je leur ai transmis ${transmis.slice(0, -1).join(", ")}${transmis.length > 1 ? (/^[aeiouyéh]/i.test(transmis[transmis.length - 1]) ? " ainsi qu'" : " ainsi que ") : ""}${transmis[transmis.length - 1]}.`
      + (suivi ? ` Chez votre notaire, le dossier est suivi par ${designer(suivi)}.` : ""),
    "",
    `Votre notaire pourra revenir vers vous pour compléter le dossier ; je reste à votre disposition pour réunir les pièces avec vous et vous tiendrai informé${pluriel ? "s" : a.some(fem) ? "e" : ""} de l'avancement.`,
    "",
    ...signature(s),
  ].join("\n");
}

/** Un message libre : la formule d'appel, la place pour écrire, la signature. */
export function mailLibre(a: Partie[], s: Signature, lien?: LienPieces): string {
  return [
    salutation(a), "", "",
    ...(lien ? ["Vous trouverez les éléments suivants à ce lien :", "", ...enListe(lien.pieces), "", lien.url, ""] : []),
    "",
    ...signature(s),
  ].join("\n");
}

export type ModeleVente = "notaires" | "client_vendeur" | "client_acquereur" | "libre";

/**
 * Les destinataires par défaut d'un modèle. Aux notaires : de chaque côté,
 * celui qui suit le dossier en « À », l'autre en copie. À un client : les
 * clients de ce côté-là, et eux seuls.
 */
export function destinatairesParDefaut(d: DonneesVente, m: ModeleVente = "notaires"): Record<string, "a" | "cc"> {
  const out: Record<string, "a" | "cc"> = {};
  for (const p of d.parties) {
    if (!p.email) continue;
    if (m === "client_vendeur" || m === "client_acquereur") {
      if (p.role === (m === "client_vendeur" ? "vendeur" : "acquereur")) out[p.email] = "a";
    } else if (estNotaire(p) || estClerc(p)) {
      out[p.email] = p.enCharge ? "a" : "cc";
    }
  }
  return out;
}

/**
 * Le garde-fou de confidentialité (#571) : la version notaires ne part pas à
 * un client, et la version d'un client ne part pas à l'autre côté. Rend la
 * raison du refus, ou rien.
 */
export function destinataireInterdit(m: ModeleVente, p: Partie): string | undefined {
  if (m === "notaires" && (p.role === "vendeur" || p.role === "acquereur")) {
    return "la version notaires contient les coordonnées de tous les clients et le lien vers les pièces : utilisez « Information du vendeur / de l'acquéreur » pour les clients";
  }
  if (m === "client_vendeur" && p.role === "acquereur") return "l'acquéreur reçoit sa propre version";
  if (m === "client_acquereur" && p.role === "vendeur") return "le vendeur reçoit sa propre version";
  return undefined;
}
