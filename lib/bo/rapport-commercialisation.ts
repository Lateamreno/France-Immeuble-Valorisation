/* Le rapport de commercialisation (MAV, 19/11/26).
 *
 * « Un bouton pour éditer un rapport de commercialisation : les dates de
 * commercialisation et relances et les modes de contact, le nombre de
 * personnes contactées et le nombre de retours, les retours en question avec
 * la note des contacts, les visites effectuées et leur retour, une partie de
 * texte libre. » Il vit dans le Suivi de la vente et part au propriétaire.
 *
 * Ce fichier est le calcul, pur : il reçoit ce que la base sait du bien et
 * rend le rapport et les CONTRÔLES — l'alerte « as-tu bien tout noté ? » que
 * l'agent lit avant de rédiger. Rien ici ne lit la base ni n'envoie quoi que
 * ce soit ; voir rapport-serveur.ts et rapport-actions.ts.
 *
 * Deux lectures de la même personne : l'agent voit son NOM dans les contrôles
 * (c'est son fichier), le propriétaire ne voit qu'une INITIALE et un profil —
 * choix de MAV : aucun nom d'acquéreur ne circule, et le propriétaire ne peut
 * pas contacter l'acquéreur sans l'agence.
 */

export type Personne = {
  contactId?: string;
  /** Le nom complet : pour l'agent seulement, jamais dans le rapport. */
  nom: string;
  /** « M. D. » : les initiales du prénom et du nom, points compris (retour #626). */
  initiales: string;
  /** « marchand de biens », « investisseur »… */
  profil?: string;
  /** La classe A–D de l'acquéreur. */
  note?: string;
};

export type EntreesRapport = {
  maintenant: string;
  /** La date du dernier rapport envoyé : ce qui est « nouveau » se compte depuis. */
  depuis?: string;
  prixMandat?: number;
  /** Les envois groupés du dossier. */
  salves: { id: string; date: string; mails: number; mobiles: number }[];
  /** Les relances groupées, quand la base en garde la trace. */
  relances?: { date: string; nombre: number; mode?: string }[];
  propositions: {
    id: string;
    qui: Personne;
    creeLe: string;
    salveId?: string;
    statut: string;
    motifRefus?: string;
    commentaire?: string;
    commentaireLe?: string;
    relanceLe?: string;
    retourSms?: string;
    interesseLe?: string;
    dossierLe?: string;
  }[];
  reponses: { propositionId?: string; canal: string; recuLe: string; traite: boolean; texte?: string }[];
  visites: {
    id: string; date: string; statut: string; qui: Personne;
    /** Ce que l'agent a écrit POUR le vendeur. */
    retourVendeur?: string;
    /** Sa note à lui : proposée au rapport, à relire. */
    retourInterne?: string;
    source?: string;
  }[];
  offres: { id: string; date?: string; statut: string; prixHai?: number; qui: Personne; motifRefus?: string }[];
};

export type Action = { date: string; dateFin?: string; libelle: string; mode: string; nombre: number };

export type LigneRetour = {
  cle: string;
  /** Le nom complet : pour l'écran de l'agent, jamais dans le rapport. */
  nom: string;
  qui: string;
  note?: string;
  date?: string;
  texte: string;
  nature: "refus" | "interesse" | "autre";
};

export type LigneVisite = {
  cle: string;
  date: string;
  /** Le nom complet : pour l'écran de l'agent, jamais dans le rapport. */
  nom: string;
  qui: string;
  note?: string;
  texte: string;
  /** Le texte vient de la note de l'agent, pas du champ écrit pour le vendeur. */
  aRelire: boolean;
  source?: string;
};

export type LigneOffre = { cle: string; date?: string; nom: string; qui: string; note?: string; montant?: number; statut: string };

export type Controle = {
  niveau: "alerte" | "ok";
  titre: string;
  detail?: string;
  /** Où l'agent va compléter. */
  geste?: "offre" | "reponses" | "visite" | "suite";
};

export type Rapport = {
  debut?: string;
  fin: string;
  actions: Action[];
  chiffres: {
    contactes: number;
    repondants: number;
    /** En pourcentage entier. */
    tauxReponse: number;
    dossiers: number;
    interesses: number;
    refus: number;
    refusMotives: number;
    visites: number;
    offres: number;
    offreHaute?: number;
  };
  parNote: { note: string; contactes: number; repondants: number }[];
  retours: LigneRetour[];
  /** Les refus dont on ne sait rien (bouton « Pas intéressé », refus sans motif). */
  refusSansExplication: number;
  visites: LigneVisite[];
  offres: LigneOffre[];
  barometre?: { prixMandat: number; offreHaute?: { montant: number; date?: string; pct: number; ecart: number } };
  visitesParSource: { source: string; nombre: number }[];
  /** Ce qui s'est ajouté depuis le dernier rapport. */
  nouveau?: { depuis: string; contactes: number; reponses: number; visites: number; offres: number };
  controles: Controle[];
};

const propre = (v?: string) => (v ?? "").replace(/\s+/g, " ").trim();
const jourDe = (iso: string) => iso.slice(0, 10);
const pluriel = (n: number, mot: string, pl = `${mot}s`) => `${n} ${n > 1 ? pl : mot}`;

/** « B. — marchand de biens » : ce que le propriétaire lit d'un acquéreur. */
export function etiquette(p: Personne): string {
  return p.profil ? `${p.initiales} — ${p.profil}` : p.initiales;
}

/**
 * Les initiales d'une personne, prénom puis nom : « M. D. » (retour #626 —
 * « nom et prénom en initiales, pas juste le nom »). Sans prénom, celle du nom ;
 * sans fiche, celles des deux premiers mots du nom saisi ou de la société.
 */
export function initialesDe(prenom?: string, nom?: string, repli?: string): string {
  const lettre = (s?: string) => propre(s).normalize("NFD").replace(/[^A-Za-z]/g, "").charAt(0).toUpperCase();
  const lettres = [lettre(prenom), lettre(nom)].filter(Boolean);
  if (lettres.length === 0) lettres.push(...propre(repli).split(/[\s-]+/).map(lettre).filter(Boolean).slice(0, 2));
  return lettres.length ? lettres.map((l) => `${l}.`).join(" ") : "X.";
}

/** Un refus qui ne dit rien : le bouton de la carte, ou un motif vide. */
const sansExplication = (motif?: string) => !propre(motif) || /bouton rcs|^pas int[ée]ress[ée]\.?$/i.test(propre(motif));

const estRefus = (statut: string) => /^refus/i.test(statut);
const estInteresse = (statut: string) => /int[ée]ress/i.test(statut);
const visiteFaite = (statut: string) => /effectu/i.test(statut);
const visiteAnnulee = (statut: string) => /annul/i.test(statut);

/**
 * Une offre écrite dans une note : « Offre à 500 k€ HAI », « offre de
 * 1,2 M€ », « offre 480 000 € ». Rend le montant en euros, ou rien.
 */
export function offreDansTexte(texte?: string): number | undefined {
  const t = propre(texte);
  if (!t) return undefined;
  const m = /\boffre\b[^.\n]{0,50}?(\d{1,3}(?:[   .]\d{3})+|\d+(?:[.,]\d+)?)\s?(k€|k\b|m€|m\b|€|euros?)/i.exec(t);
  if (!m) return undefined;
  const brut = m[1];
  const unite = m[2].toLowerCase();
  const groupe = /[   .]\d{3}/.test(brut);
  const n = groupe ? Number(brut.replace(/[   .]/g, "")) : Number(brut.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const montant = unite.startsWith("k") ? n * 1_000 : unite.startsWith("m") ? n * 1_000_000 : n;
  /* Un prix d'immeuble : en dessous de 10 000 €, c'est autre chose (un loyer,
     un prix au m²). */
  return montant >= 10_000 ? Math.round(montant) : undefined;
}

/** Les noms d'une liste, à la française : « A, B et C ». */
function enumerer(noms: string[]): string {
  if (noms.length <= 1) return noms.join("");
  return `${noms.slice(0, -1).join(", ")} et ${noms[noms.length - 1]}`;
}

const jjmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export function construireRapport(e: EntreesRapport): Rapport {
  const fin = e.maintenant;
  const props = e.propositions;

  /* ---- Les actions, dans l'ordre ---- */
  const actions: Action[] = [];
  const salves = [...e.salves].sort((a, b) => a.date.localeCompare(b.date));
  salves.forEach((s, i) => {
    const nombre = props.filter((p) => p.salveId === s.id).length || Math.max(s.mails, s.mobiles);
    const modes = [s.mails ? `E-mail (${s.mails})` : "", s.mobiles ? `message mobile (${s.mobiles})` : ""].filter(Boolean);
    actions.push({
      date: s.date,
      libelle: i === 0 ? "Premier envoi du dossier" : "Nouvel envoi du dossier",
      mode: modes.join(" + ") || "E-mail",
      nombre,
    });
  });
  const idsSalves = new Set(salves.map((s) => s.id));
  const seuls = props.filter((p) => !p.salveId || !idsSalves.has(p.salveId));
  if (seuls.length) {
    const dates = seuls.map((p) => p.creeLe).sort();
    actions.push({
      date: dates[0], dateFin: jourDe(dates[dates.length - 1]) !== jourDe(dates[0]) ? dates[dates.length - 1] : undefined,
      libelle: seuls.length > 1 ? "Envois individuels" : "Envoi individuel", mode: "E-mail", nombre: seuls.length,
    });
  }
  if (e.relances?.length) {
    for (const r of e.relances) actions.push({ date: r.date, libelle: "Relance", mode: r.mode ?? "E-mail", nombre: r.nombre });
  } else {
    /* À défaut d'un journal des relances, la dernière relance de chaque
       proposition : c'est un minimum, une relance plus ancienne est écrasée. */
    const parJour = new Map<string, number>();
    for (const p of props) if (p.relanceLe) parJour.set(jourDe(p.relanceLe), (parJour.get(jourDe(p.relanceLe)) ?? 0) + 1);
    for (const [j, n] of parJour) actions.push({ date: j, libelle: "Relance", mode: "E-mail", nombre: n });
  }
  const debut = actions.map((a) => a.date).sort()[0];
  /* Dans l'ordre des dates ; les envois individuels, étalés sur toute la
     période, ferment le tableau au lieu de l'ouvrir. */
  const individuel = (a: Action) => /individuel/i.test(a.libelle);
  actions.sort((a, b) => Number(individuel(a)) - Number(individuel(b)) || a.date.localeCompare(b.date));

  /* ---- Qui a répondu ---- */
  const reponsesPar = new Map<string, EntreesRapport["reponses"]>();
  for (const r of e.reponses) {
    if (!r.propositionId) continue;
    reponsesPar.set(r.propositionId, [...(reponsesPar.get(r.propositionId) ?? []), r]);
  }
  const aRepondu = (p: EntreesRapport["propositions"][number]) =>
    reponsesPar.has(p.id) || p.statut !== "Envoyée" || !!propre(p.commentaire) || !!propre(p.retourSms)
    || !!p.interesseLe || !!p.dossierLe;
  const contactes = new Set(props.map((p) => p.qui.contactId ?? p.id));
  const repondants = new Set(props.filter(aRepondu).map((p) => p.qui.contactId ?? p.id));
  const dossiers = props.filter((p) => p.dossierLe || (reponsesPar.get(p.id) ?? []).some((r) => r.canal === "rcs_dossier")).length;
  const refusees = props.filter((p) => estRefus(p.statut));
  const interesses = props.filter((p) => !estRefus(p.statut) && (estInteresse(p.statut) || p.interesseLe
    || (reponsesPar.get(p.id) ?? []).some((r) => r.canal === "rcs_interesse")));

  const NOTES = ["A", "B", "C", "D"];
  const noteDe = (n?: string) => (n && NOTES.includes(n) ? n : "");
  const parNote = [...NOTES, ""].map((note) => ({
    note,
    contactes: new Set(props.filter((p) => noteDe(p.qui.note) === note).map((p) => p.qui.contactId ?? p.id)).size,
    repondants: new Set(props.filter((p) => noteDe(p.qui.note) === note && aRepondu(p)).map((p) => p.qui.contactId ?? p.id)).size,
  })).filter((l) => l.contactes > 0);

  /* ---- Les retours qui disent quelque chose ---- */
  const retours: LigneRetour[] = [];
  let refusSansExplication = 0;
  for (const p of props) {
    const refus = estRefus(p.statut);
    const texte = refus && !sansExplication(p.motifRefus) ? propre(p.motifRefus) : propre(p.commentaire);
    if (!texte) { if (refus) refusSansExplication++; continue; }
    retours.push({
      cle: p.id,
      nom: p.qui.nom,
      qui: etiquette(p.qui),
      note: noteDe(p.qui.note) || undefined,
      date: p.commentaireLe,
      texte,
      nature: refus ? "refus" : estInteresse(p.statut) || p.interesseLe ? "interesse" : "autre",
    });
  }
  const rang = { interesse: 0, autre: 1, refus: 2 } as const;
  retours.sort((a, b) => rang[a.nature] - rang[b.nature] || (a.note ?? "Z").localeCompare(b.note ?? "Z"));

  /* ---- Les visites ---- */
  const faites = e.visites.filter((v) => visiteFaite(v.statut)).sort((a, b) => a.date.localeCompare(b.date));
  const visites: LigneVisite[] = faites.map((v) => ({
    cle: v.id,
    date: v.date,
    nom: v.qui.nom,
    qui: v.qui.initiales,
    note: noteDe(v.qui.note) || undefined,
    texte: propre(v.retourVendeur) || propre(v.retourInterne),
    aRelire: !propre(v.retourVendeur) && !!propre(v.retourInterne),
    source: propre(v.source) || undefined,
  }));
  const sources = new Map<string, number>();
  for (const v of faites) {
    const s = propre(v.source) || "Notre fichier";
    sources.set(s, (sources.get(s) ?? 0) + 1);
  }
  const visitesParSource = [...sources.entries()].map(([source, nombre]) => ({ source, nombre }))
    .sort((a, b) => b.nombre - a.nombre);

  /* ---- Les offres et le baromètre ---- */
  const offres: LigneOffre[] = [...e.offres].sort((a, b) => (b.prixHai ?? 0) - (a.prixHai ?? 0)).map((o) => ({
    cle: o.id, date: o.date, nom: o.qui.nom, qui: etiquette(o.qui), note: noteDe(o.qui.note) || undefined, montant: o.prixHai, statut: o.statut,
  }));
  const haute = e.offres.filter((o) => (o.prixHai ?? 0) > 0).sort((a, b) => (b.prixHai ?? 0) - (a.prixHai ?? 0))[0];
  const barometre = e.prixMandat && e.prixMandat > 0 ? {
    prixMandat: e.prixMandat,
    offreHaute: haute ? {
      montant: haute.prixHai!, date: haute.date,
      pct: Math.round((haute.prixHai! / e.prixMandat) * 100),
      ecart: Math.round(e.prixMandat - haute.prixHai!),
    } : undefined,
  } : undefined;

  /* ---- Ce qui est nouveau depuis le dernier rapport ---- */
  const d = e.depuis;
  const nouveau = d ? {
    depuis: d,
    contactes: new Set(props.filter((p) => p.creeLe > d).map((p) => p.qui.contactId ?? p.id)).size,
    reponses: e.reponses.filter((r) => r.recuLe > d).length,
    visites: faites.filter((v) => v.date > d).length,
    offres: e.offres.filter((o) => (o.date ?? "") > d).length,
  } : undefined;

  /* ---- Les contrôles : « as-tu bien tout noté ? » ---- */
  const controles: Controle[] = [];

  /* Une offre écrite dans une note, jamais saisie. */
  const montantsSaisis = e.offres.map((o) => o.prixHai ?? 0);
  const dejaSaisie = (m: number, contactId?: string) =>
    e.offres.some((o) => contactId && o.qui.contactId === contactId)
    || montantsSaisis.some((x) => x > 0 && Math.abs(x - m) / m < 0.02);
  for (const v of e.visites) {
    const m = offreDansTexte(v.retourInterne) ?? offreDansTexte(v.retourVendeur);
    if (m && !dejaSaisie(m, v.qui.contactId)) {
      controles.push({
        niveau: "alerte", geste: "offre",
        titre: "Une offre est écrite dans un retour de visite, mais aucune offre n'est saisie.",
        detail: `Visite du ${jjmm(v.date)} avec ${v.qui.nom} : « ${propre(v.retourInterne) || propre(v.retourVendeur)} ». Sans offre saisie, le rapport dirait « aucune offre ».`,
      });
    }
  }
  for (const p of props) {
    const m = offreDansTexte(p.commentaire);
    if (m && !dejaSaisie(m, p.qui.contactId)) {
      controles.push({
        niveau: "alerte", geste: "offre",
        titre: "Une offre est écrite dans un retour, mais aucune offre n'est saisie.",
        detail: `${p.qui.nom} : « ${propre(p.commentaire)} ».`,
      });
    }
  }

  /* Des réponses reçues que personne n'a traitées. */
  const aTraiter = e.reponses.filter((r) => !r.traite);
  if (aTraiter.length) {
    const LIB: Record<string, [string, string]> = {
      email: ["e-mail", "e-mails"], sms: ["SMS", "SMS"],
      rcs_interesse: ["bouton « Intéressé »", "boutons « Intéressé »"],
      rcs_dossier: ["dossier téléchargé", "dossiers téléchargés"],
      rcs_non: ["bouton « Pas intéressé »", "boutons « Pas intéressé »"],
      site: ["réponse depuis le site", "réponses depuis le site"],
    };
    const parCanal = new Map<string, number>();
    for (const r of aTraiter) parCanal.set(r.canal, (parCanal.get(r.canal) ?? 0) + 1);
    const detail = [...parCanal.entries()].map(([c, n]) => `${n} ${(LIB[c] ?? [c, c])[n > 1 ? 1 : 0]}`).join(", ");
    controles.push({
      niveau: "alerte", geste: "reponses",
      titre: aTraiter.length > 1 ? `${aTraiter.length} réponses ne sont pas encore traitées.` : "1 réponse n'est pas encore traitée.",
      detail: `${detail}.`,
    });
  }

  /* Un acquéreur intéressé, puis plus rien. */
  const visiteurs = new Set(e.visites.map((v) => v.qui.contactId).filter(Boolean));
  const offrants = new Set(e.offres.map((o) => o.qui.contactId).filter(Boolean));
  const sansSuite = interesses.filter((p) => !propre(p.commentaire)
    && !(p.qui.contactId && (visiteurs.has(p.qui.contactId) || offrants.has(p.qui.contactId))));
  if (sansSuite.length) {
    controles.push({
      niveau: "alerte", geste: "suite",
      titre: sansSuite.length > 1
        ? `${sansSuite.length} acquéreurs sont « Intéressé » sans visite ni suite notée.`
        : "1 acquéreur est « Intéressé » sans visite ni suite notée.",
      detail: `${enumerer(sansSuite.slice(0, 6).map((p) => p.qui.nom))}${sansSuite.length > 6 ? "…" : ""}.`,
    });
  }

  /* Des visites dont la date est passée et qui ne sont ni faites ni annulées. */
  const enSuspens = e.visites.filter((v) => v.date < fin && !visiteFaite(v.statut) && !visiteAnnulee(v.statut));
  if (enSuspens.length) {
    controles.push({
      niveau: "alerte", geste: "visite",
      titre: enSuspens.length > 1
        ? `${enSuspens.length} visites sont passées sans être notées « effectuée » ou « annulée ».`
        : "1 visite est passée sans être notée « effectuée » ou « annulée ».",
      detail: `${enumerer(enSuspens.map((v) => `${v.qui.nom} le ${jjmm(v.date)}`))}.`,
    });
  }
  const sansRetour = faites.filter((v) => !propre(v.retourVendeur) && !propre(v.retourInterne));
  if (sansRetour.length) {
    controles.push({
      niveau: "alerte", geste: "visite",
      titre: sansRetour.length > 1 ? `${sansRetour.length} visites effectuées n'ont pas de retour.` : "1 visite effectuée n'a pas de retour.",
      detail: `${enumerer(sansRetour.map((v) => `${v.qui.nom} le ${jjmm(v.date)}`))}.`,
    });
  }

  /* Ce qui est en ordre, dit aussi : l'agent vérifie d'un coup d'œil. */
  if (faites.length) {
    controles.push({
      niveau: "ok", geste: "visite",
      titre: `${pluriel(faites.length, "visite effectuée", "visites effectuées")}${sansRetour.length ? "" : faites.length > 1 ? ", toutes avec un retour" : ", avec son retour"}.`,
      detail: `${enumerer(faites.map((v) => `${v.qui.nom} le ${jjmm(v.date)}`))}. En manque-t-il une ?`,
    });
  } else {
    controles.push({ niveau: "ok", geste: "visite", titre: "Aucune visite effectuée n'est notée.", detail: "Y en a-t-il eu une ?" });
  }
  if (refusees.length) {
    const motives = refusees.length - refusSansExplication;
    controles.push({
      niveau: "ok",
      titre: `${pluriel(refusees.length, "refus noté", "refus notés")}, dont ${motives} avec ${motives > 1 ? "leur" : "sa"} raison.`,
      detail: refusSansExplication
        ? `${refusSansExplication > 1 ? `Les ${refusSansExplication} autres n'ont` : "L'autre n'a"} pas d'explication (bouton « Pas intéressé », ou motif vide).`
        : undefined,
    });
  }
  const rangC = { alerte: 0, ok: 1 } as const;
  controles.sort((a, b) => rangC[a.niveau] - rangC[b.niveau]);

  return {
    debut,
    fin,
    actions,
    chiffres: {
      contactes: contactes.size,
      repondants: repondants.size,
      tauxReponse: contactes.size ? Math.round((repondants.size / contactes.size) * 100) : 0,
      dossiers,
      interesses: interesses.length,
      refus: refusees.length,
      refusMotives: refusees.length - refusSansExplication,
      visites: faites.length,
      offres: e.offres.length,
      offreHaute: haute?.prixHai,
    },
    parNote,
    retours,
    refusSansExplication,
    visites,
    offres,
    barometre,
    visitesParSource,
    nouveau,
    controles,
  };
}
