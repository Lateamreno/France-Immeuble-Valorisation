// Données du dashboard — réplique des cartes visibles sur les captures du BO
// (dossier Drive « Dashboard »). Couche mock typée : sera branchée sur la
// Data API Bubble puis Supabase sans toucher aux composants.

export type KCard = {
  id: string;
  ville: string;
  contact: string;
  adresse: string;
  /** Photo disponible (placeholder si pas d'URL). */
  photo?: boolean;
  /** URL réelle de la photo (photo_main_compressed Bubble). */
  photoUrl?: string;
  rv?: boolean;
  /** Texte du badge orange (initiales de l'agent, ex. « RV », « MAV »). */
  rvText?: string;
  /** Ligne statut mandat (rouge) : « Mandat à signer », « Mandat expiré »… */
  statusMandat?: string;
  /** Chip date + note grise (MAJUSCULES conservées telles quelles). */
  date?: string;
  note?: string;
  /** Tag « Estimation » avec icône après la date. */
  estimation?: boolean;
  /** Note repliable (chevron ˅). */
  chevron?: boolean;
  /** Carte « en attente » : bordure rouge + frise date → motif → date. */
  wait?: { from: string; to: string; motif: string };
  prix?: string;
  fee?: string;
  /** Bouton principal. `next` = statut pipeline cible (écriture Supabase). */
  action?: { label: string; kind?: "green"; next?: number };
  /** Compteurs à droite de la rangée d'actions : propositions / visites / offres. */
  counts?: { prop: number; vis: number; off: number };
  /** Icônes d'alerte rouges (mandat / PDF / contacts) + cadenas gris. */
  redIcons?: boolean;
  /** Bouton historique visible. */
  history?: boolean;
};

export type KCol = {
  key: string;
  titre: string;
  icon: "form" | "building" | "flame" | "pdf" | "spread" | "globe" | "tool" | "bank" | "flag";
  count: number;
  fee?: string;
  cards: KCard[];
};

export type KBloc = {
  key: string;
  titre: string;
  icon: "in" | "megaphone" | "flag";
  nred: number;
  nsq: number;
  /** Bandeau VENTES : « 0 k€ HT → 45 k€ HT » + barre de progression. */
  ventes?: { left: string; right: string; pctGreen: number };
  openDefault: boolean;
  cols: [KCol, KCol, KCol];
};

export const DASHBOARD: KBloc[] = [
  {
    key: "prospects",
    titre: "PROSPECTS",
    icon: "in",
    nred: 3,
    nsq: 36,
    openDefault: true,
    cols: [
      {
        key: "formulaires",
        titre: "Formulaires a traiter",
        icon: "form",
        count: 5,
        cards: [
          { id: "f1", ville: "Faches-Thumesnil (59)", contact: "R. BOUGAILLOU", rv: true, date: "23/04/26", note: "Mess voc laisser le 23/04/26", adresse: "81 Rue Jean Jaurès", action: { label: "Contacté" }, history: true },
          { id: "f2", ville: "Lisle-sur-Tarn (81)", contact: "K. AYACHE", rv: true, date: "08/04/26", note: "MESS VOC LE 08/04/26", adresse: "29 Place Paul Saissac", action: { label: "Contacté" }, history: true },
          { id: "f3", ville: "Marseille (13)", contact: "Y. MALO", rv: true, date: "23/06/26", note: "Formulaire", chevron: true, adresse: "131 Boulevard Baille", action: { label: "Contacté" } },
          { id: "f4", ville: "Épinay-sur-Seine (93)", contact: "I. JACQUEMIN", rv: true, date: "02/07/26", note: "Formulaire", chevron: true, adresse: "106 Avenue Jean Jaurès", action: { label: "Contacté" } },
        ],
      },
      {
        key: "a-estimer",
        titre: "Immeubles a estimer",
        icon: "building",
        count: 15,
        cards: [
          { id: "e1", ville: "Chelles (77)", contact: "B. DA COSTA", photo: true, rv: true, date: "23/04/26", note: "encore mess vocal le 23/04/26", adresse: "52 Avenue du Maréchal Foch", action: { label: "Estimer" }, history: true },
          { id: "e2", ville: "Collonges-sous-Salève (74)", contact: "J. ORY", rv: true, date: "12/05/26", note: "Mess voc + SMS LE 12/05/26", adresse: "31 Route d'Annemasse", action: { label: "Estimer" }, history: true },
          { id: "e3", ville: "Perpignan (66)", contact: "D. SOLER", rv: true, date: "12/05/26", note: "Mess voc le 12/05/26", adresse: "14 Plaça del Puig", action: { label: "Estimer" }, history: true },
          { id: "e4", ville: "Amiens (80)", contact: "J. DERVIN", rv: true, date: "14/05/26", note: "MESS VOC LE 14/05/2026", adresse: "3 Rue Vivien", action: { label: "Estimer" }, history: true },
        ],
      },
      {
        key: "a-transformer",
        titre: "A transformer",
        icon: "flame",
        count: 16,
        cards: [
          { id: "t1", ville: "Vaires-sur-Marne (77)", contact: "N. DANIEL", photo: true, rv: true, wait: { from: "18/02/26", to: "18/02/26", motif: "Point avec co-décisionnaires" }, adresse: "100 Rue de la Liberté", prix: "680 000 €", action: { label: "Réactiver", kind: "green" }, history: true },
          { id: "t2", ville: "Le Raincy (93)", contact: "L. DROBAC", photo: true, rv: true, wait: { from: "25/03/26", to: "25/04/26", motif: "Temps de réflexion" }, adresse: "9 Allée Clémencet", prix: "1 600 000 €", action: { label: "Réactiver", kind: "green" }, history: true },
          { id: "t3", ville: "Brie-Comte-Robert (77)", contact: "N. DANIEL", photo: true, rv: true, wait: { from: "25/03/26", to: "26/04/26", motif: "Vacances" }, adresse: "1 Rue Gambetta", prix: "780 000 €", action: { label: "Réactiver", kind: "green" }, history: true },
          { id: "t4", ville: "Trappes (78)", contact: "M. MAQUIN", photo: true, rv: true, date: "30/04/26", note: "A toujours un voisin intéréssé mais...", chevron: true, adresse: "37 Rue Jean Jaurès", action: { label: "OK pour vendre" }, history: true },
        ],
      },
    ],
  },
  {
    key: "commercialisations",
    titre: "COMMERCIALISATIONS",
    icon: "megaphone",
    nred: 2,
    nsq: 20,
    openDefault: false,
    cols: [
      {
        key: "preparation",
        titre: "Preparation mandat et dossier",
        icon: "pdf",
        count: 7,
        cards: [
          { id: "p1", ville: "Montmorency (95)", contact: "M. HAYON", photo: true, rv: true, wait: { from: "26/03/26", to: "30/04/26", motif: "Attente infos" }, adresse: "15 Rue de Pontoise", prix: "840 000 €", action: { label: "Réactiver", kind: "green" }, history: true },
          { id: "p2", ville: "Ivry-sur-Seine (94)", contact: "G. JOURNET", photo: true, rv: true, wait: { from: "26/03/26", to: "16/05/26", motif: "Autre" }, adresse: "5 Boulevard de Brandebourg", prix: "1 890 000 €", action: { label: "Réactiver", kind: "green" }, history: true },
          { id: "p3", ville: "Saint-Germain-des-Prés (45)", contact: "J. FRUGIER", photo: true, rv: true, date: "03/04/26", note: "MESS VOC LAISSE LE 03/04/26", adresse: "20 Avenue de Pourprix", prix: "360 000 €", redIcons: true, history: true },
          { id: "p4", ville: "Rueil-Malmaison (92)", contact: "A. DEVELAY", photo: true, rv: true, date: "26/03/26", note: "MESSAGE VOC LE 26/03/26", adresse: "53 Rue Gallieni", prix: "2 340 000 €", history: true },
        ],
      },
      {
        key: "clients-ab",
        titre: "Commercialises aux clients A et B",
        icon: "spread",
        count: 0,
        cards: [],
      },
      {
        key: "tous-clients",
        titre: "Commercialises a tous les clients",
        icon: "globe",
        count: 13,
        cards: [
          { id: "c1", ville: "Saint-Maur-des-Fossés (94)", contact: "P. VOCI", photo: true, rv: true, statusMandat: "Mandat à signer", date: "24/11/20", estimation: true, adresse: "106 Boulevard de la Marne", prix: "3 120 000 €", counts: { prop: 1, vis: 0, off: 0 } },
          { id: "c2", ville: "Verneuil d'Avre et d'Iton (27)", contact: "M. RICHARD", photo: true, rv: true, statusMandat: "Mandat expiré", date: "23/03/26", note: "Nous n'avions pas de contacts intér...", chevron: true, adresse: "13 Place de Verdun", prix: "661 500 €", counts: { prop: 10, vis: 1, off: 0 }, history: true },
          { id: "c3", ville: "Isbergues (62)", contact: "A. MAESTRACCI", photo: true, rv: true, date: "05/05/26", estimation: true, adresse: "101 Rue de Guarbecque", prix: "2 320 000 €", counts: { prop: 13, vis: 0, off: 1 }, history: true },
          { id: "c4", ville: "Angerville (91)", contact: "N. MAYANT", photo: true, rv: true, statusMandat: "Mandat expiré", adresse: "", counts: { prop: 0, vis: 0, off: 0 } },
        ],
      },
    ],
  },
  {
    key: "ventes",
    titre: "VENTES",
    icon: "flag",
    nred: 0,
    nsq: 3,
    ventes: { left: "0 k€ HT", right: "45 k€ HT", pctGreen: 1.5 },
    openDefault: false,
    cols: [
      {
        key: "offres-acceptees",
        titre: "Offres acceptees",
        icon: "tool",
        count: 3,
        fee: "45 k€ HT",
        cards: [
          { id: "v1", ville: "Corbeil-Essonnes (91)", contact: "M. LONCHAMPT", photo: true, rv: true, date: "15/03/21", estimation: true, adresse: "53 Rue des Caillettes", fee: "18 k€", prix: "450 000 €", action: { label: "Programmer le compromis" } },
          { id: "v2", ville: "Montereau-Fault-Yonne (77)", contact: "N. AHMED", photo: true, rv: true, date: "08/09/25", note: "Il est parti à l'étranger et est se...", chevron: true, adresse: "6 Place Pierre Semard", fee: "17 k€", prix: "475 000 €", action: { label: "Programmer le compromis" }, history: true },
          { id: "v3", ville: "Montereau-Fault-Yonne (77)", contact: "M. AHMED", photo: true, rv: true, adresse: "34 Bis Avenue de Surville", fee: "10 k€", prix: "256 000 €", action: { label: "Programmer le compromis" } },
        ],
      },
      { key: "compromis", titre: "Compromis signes", icon: "bank", count: 0, cards: [] },
      { key: "vendus", titre: "Vendus en 2026", icon: "flag", count: 0, cards: [] },
    ],
  },
];
