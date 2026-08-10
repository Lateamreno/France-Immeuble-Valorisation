// Données du dashboard 9 cases.
//
// Couche de données mock, typée sur la forme cible : elle sera remplacée par
// des lectures Supabase (couche operations) et/ou Bubble (migration) sans
// toucher aux composants. Les exemples reprennent des dossiers réels du BO
// Bubble (cf. docs/cartographie/) pour valider la maquette sur de la vraie
// matière.

export type CardBadge = {
  label: string;
  tone?: "ok" | "warn" | "late";
};

export type DashCard = {
  id: string;
  ville: string;
  cp: string;
  adresse: string;
  contact: string;
  note?: string;
  prix?: string;
  badges?: CardBadge[];
  /** Libellé du bouton d'avancement (franchit l'étape, comme le BO actuel). */
  action?: string;
};

export type DashCase = {
  key: string;
  titre: string;
  total: number;
  enAttente?: number;
  cards: DashCard[];
};

export type DashBloc = {
  key: "prospection" | "commercialisation" | "bouclage";
  titre: string;
  resume: string;
  cases: [DashCase, DashCase, DashCase];
};

export const DASHBOARD: DashBloc[] = [
  {
    key: "prospection",
    titre: "Prospection",
    resume: "336 dossiers · 16 en attente",
    cases: [
      {
        key: "a-contacter",
        titre: "À contacter",
        total: 4,
        enAttente: 2,
        cards: [
          {
            id: "p1",
            ville: "Marseille",
            cp: "13",
            adresse: "70 Rue Caisserie",
            contact: "Formulaire Vendre",
            note: "Reçu le 23/06 — immeuble mixte, 1 commerce + 3 logements",
            action: "Contacté",
          },
          {
            id: "p2",
            ville: "Épinay-sur-Seine",
            cp: "93",
            adresse: "12 Rue de Paris",
            contact: "Formulaire Vendre",
            note: "Reçu le 02/07 — souhaite vendre dès maintenant",
            action: "Contacté",
          },
        ],
      },
      {
        key: "a-estimer",
        titre: "À estimer",
        total: 5,
        cards: [
          {
            id: "p3",
            ville: "Villejuif",
            cp: "94800",
            adresse: "9 Avenue de Paris",
            contact: "W. ABERGEL",
            note: "145 m² · 62 % occupé · petit immeuble mixte",
            prix: "640 000 €",
            action: "Estimer",
          },
          {
            id: "p4",
            ville: "Gennevilliers",
            cp: "92230",
            adresse: "25 Avenue des Grésillons",
            contact: "MAV",
            note: "Estimation du 21/07 — PDF manquant",
            prix: "3 748 000 €",
            badges: [{ label: "PDF manquant", tone: "warn" }],
            action: "Estimer",
          },
        ],
      },
      {
        key: "a-convertir",
        titre: "À convertir",
        total: 15,
        enAttente: 6,
        cards: [
          {
            id: "p5",
            ville: "Faches-Thumesnil",
            cp: "59",
            adresse: "81 Rue Jean Jaurès",
            contact: "R. BOUGAILLOU",
            note: "Mess voc laissé le 23/04",
            prix: "680 000 €",
            action: "OK pour vendre",
          },
          {
            id: "p6",
            ville: "Chelles",
            cp: "77",
            adresse: "40 Avenue de la Résistance",
            contact: "N. DANIEL",
            note: "A toujours un voisin intéressé mais…",
            prix: "2 340 000 €",
            badges: [{ label: "Temps de réflexion → 07/09", tone: "warn" }],
            action: "OK pour vendre",
          },
        ],
      },
    ],
  },
  {
    key: "commercialisation",
    titre: "Commercialisation",
    resume: "36 en cours · 2 clients A/B · 20 diffusés",
    cases: [
      {
        key: "signature-contrat",
        titre: "Signature contrat",
        total: 5,
        enAttente: 1,
        cards: [
          {
            id: "c1",
            ville: "Montreuil",
            cp: "93",
            adresse: "15 Rue de Normandie",
            contact: "N. LANSKI",
            note: "Mandat #2098 · exclusif · à signer",
            prix: "2 425 000 €",
            badges: [{ label: "À signer", tone: "warn" }],
            action: "Signé",
          },
          {
            id: "c2",
            ville: "Saint-Maur-des-Fossés",
            cp: "94",
            adresse: "8 Avenue du Bac",
            contact: "P. VOCI",
            note: "Mandat à rédiger",
            prix: "3 120 000 €",
            badges: [{ label: "Pas de numéro", tone: "late" }],
            action: "Rédiger",
          },
        ],
      },
      {
        key: "devis",
        titre: "Devis",
        total: 4,
        cards: [
          {
            id: "c3",
            ville: "Brueil-en-Vexin",
            cp: "78440",
            adresse: "37 Rue du Vexin",
            contact: "E. LEPIED",
            note: "Dossier V4 · 214 emails · 198 propositions à relancer",
            prix: "1 050 000 €",
            badges: [{ label: "198 à relancer", tone: "late" }],
            action: "Relancer",
          },
          {
            id: "c4",
            ville: "Isbergues",
            cp: "62",
            adresse: "101 Rue de Guarbecque",
            contact: "RV",
            note: "Diffusion du 26/06 · clients A et B",
            prix: "661 500 €",
            badges: [{ label: "Clients A/B", tone: "ok" }],
            action: "Diffuser à tous",
          },
        ],
      },
      {
        key: "rdv",
        titre: "RDV",
        total: 9,
        enAttente: 2,
        cards: [
          {
            id: "c5",
            ville: "Nanterre",
            cp: "92",
            adresse: "55 Rue Volant",
            contact: "A. BERGUE",
            note: "Visite du 14/04 à 10h30",
            badges: [{ label: "Confirmée", tone: "ok" }],
            action: "Compte-rendu",
          },
          {
            id: "c6",
            ville: "Drancy",
            cp: "93",
            adresse: "113 Rue Diderot",
            contact: "S. SOARES",
            note: "Visite du 05/05 à 12h30",
            badges: [{ label: "À confirmer", tone: "warn" }],
            action: "Confirmer",
          },
        ],
      },
    ],
  },
  {
    key: "bouclage",
    titre: "Bouclage",
    resume: "3 offres acceptées · 45 k€ HT compromis · 0 k€ encaissé 2026",
    cases: [
      {
        key: "demarches-locatives",
        titre: "Démarches locatives",
        total: 2,
        cards: [
          {
            id: "b1",
            ville: "Bruyères-sur-Oise",
            cp: "95",
            adresse: "1 Rue du Pont",
            contact: "A. CUBIZOLLES",
            note: "Découpe : congés à purger avant vente des lots",
            badges: [{ label: "Préemption L. 75", tone: "warn" }],
            action: "Notifier",
          },
        ],
      },
      {
        key: "ventes",
        titre: "Ventes",
        total: 3,
        cards: [
          {
            id: "b2",
            ville: "Corbeil-Essonnes",
            cp: "91",
            adresse: "2 Rue Féray",
            contact: "M. LONCHAMPT",
            note: "Offre acceptée — compromis à programmer",
            prix: "450 000 €",
            badges: [{ label: "18 k€ honos", tone: "ok" }],
            action: "Programmer le compromis",
          },
          {
            id: "b3",
            ville: "Paris",
            cp: "75003",
            adresse: "22 Rue du Pont aux Choux",
            contact: "MAV",
            note: "Compromis signé — acte prévu T4",
            badges: [{ label: "100 k€ honos", tone: "ok" }],
            action: "Acte signé",
          },
        ],
      },
      {
        key: "bouclage",
        titre: "Bouclage",
        total: 3,
        cards: [
          {
            id: "b4",
            ville: "Drancy",
            cp: "93",
            adresse: "5 Rue Marcelin Berthelot",
            contact: "MAV",
            note: "Vente signée — facturation honoraires",
            prix: "73 k€ HT",
            badges: [{ label: "À facturer", tone: "warn" }],
            action: "Facturer",
          },
          {
            id: "b5",
            ville: "Marseille",
            cp: "13002",
            adresse: "70 Rue Caisserie",
            contact: "SJ · MAV",
            note: "Vente signée — encaissé",
            prix: "29 k€ HT",
            badges: [{ label: "Encaissé", tone: "ok" }],
          },
        ],
      },
    ],
  },
];
