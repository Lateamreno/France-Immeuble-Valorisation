// Référentiels (option sets Bubble) — EXTRAITS DES DONNÉES RÉELLES du BO,
// pas devinés : croisement de l'endpoint /api/1.1/meta (56 option sets
// déclarés) et des valeurs distinctes présentes dans le miroir Supabase.
// Toute liste déroulante de l'app doit venir d'ici.

/* --- Lots --- */
export const DESTINATIONS = ["Logement", "Commerce", "Bureau", "Logistique", "Cave", "Parking", "Annexe"];

export const TYPES_LOT = [
  // Logements
  "Studio", "Studio + ext", "T1", "T2", "T2 + ext", "T3", "T3 + ext", "T4", "T4 + ext",
  "T5", "T5 + ext", "T6", "T6 + ext", "T7", "T7 + ext",
  "Duplex studio", "Duplex T1", "Duplex T2", "Duplex T2 + ext", "Duplex T3", "Duplex T3 + ext",
  "Duplex T4", "Duplex T4 + ext", "Duplex T5", "Duplex T5 + ext", "Duplex T6", "Duplex T6 + ext",
  "Duplex T7", "Duplex (n.c.)", "Duplex (n.c.) + ext", "Loft", "Loft + ext", "Maison", "Chambre",
  // Activités / commerces
  "Boutique", "Local commercial", "Local d'activites", "Grande enseigne", "Espace de vente",
  "Show-room", "Plateau", "Bureaux", "Atelier", "Espace de stockage", "Reserve", "Sous-sol",
  "Agence de voyages", "Agence immobiliere", "Association", "Assurance", "Banque", "Boucherie",
  "Boulangerie", "Café", "Charcuterie", "Concession", "Epicerie", "Fromagerie",
  "Magasin d'ameublement", "Magasin de vetements", "Pharmacie", "Pizzeria", "Poissonnerie",
  "Poste", "Restaurant", "Salon de coiffure", "Supermarche",
  // Annexes
  "Cave", "Box", "Parking", "WC", "Autre",
];

/** Le libellé exact du bail « rattaché », employé partout tel quel. */
export const RATTACHE = "Rattaché à un lot";

export const TYPES_BAIL = [
  "Nu", "Meuble", "Airbnb", "3/6/9", "Précaire", "Loi 48", "Loi 89", "Civil", "Ferme",
  /* #171 — un parking ou une cave loué AVEC un appartement, sous un loyer
     global unique. Le lot existe, il est occupé, mais son loyer est déjà
     compté ailleurs : le rattacher évite de le compter deux fois. */
  RATTACHE,
  "n.c.", "Vide",
];

/** États des lots (pas de « PC purge » ni « Constructible » côté lot). */
export const ETATS_LOT = ["Neuf", "Renove", "Bon etat", "Etat d'usage", "Travaux", "n.c."];

/** États du bâti / composants (inclut Constructible et PC purge). */
export const ETATS_BATI = [
  "Neuf", "Renove", "Bon etat", "Etat d'usage", "Travaux", "Constructible", "PC purge", "n.c.",
];

export const TYPES_DPE = ["A", "B", "C", "D", "E", "F", "G", "G+", "Vierge", "n.c."];

/* --- Immeuble --- */
export const STATUTS_IMMEUBLE = [
  "0 - RETIRé", "1 - FORMULAIRE", "2 - Estimation", "3 - A transformer", "4 - OK pour vendre",
  "5 - Commercialisé (A/B)", "6 - Commercialisé (all)", "7 - Sous offre",
  "8 - Compromis programmé", "9 - Sous compromis", "10 - Acte programmé", "11 - VENDU",
];

export const MOTIFS_VENTE = [
  "Arbitrage", "Déménagement", "Départ à l'étranger", "Financement projet annexe",
  "Retraite", "Autre", "n.c.",
];

export const MOTIFS_ARCHIVAGE = [
  "Ne souhaite pas vendre", "Ne répond plus", "Désaccord sur le prix", "Déjà vendu (en direct)",
  "Déjà vendu (via intermédiaire)", "Vendu par France Immeuble", "Mandat expiré",
  "Résiliation du mandat (par le vendeur)", "Résiliation du mandat (par France Immeuble)",
  "N'est pas propriétaire", "Agent immobilier", "Préfère vendre à la découpe", "Hors Secteur",
  "Pas un immeuble", "Mauvaises coordonnées", "Doublon", "Autre",
];

export const TENSIONS_LOCATIVES = ["Très faible", "Faible", "Modérée", "Forte", "Très forte", "n.c."];

export const TYPES_ZONE_PLU = [
  "Centre ancien", "Urbaine", "Urbaine mixte", "Péri-urbaine", "Mixité sociale",
  "Projet Urbain", "Protégée", "Zone commerciale", "Zone d'activités",
];

/* --- Suivi --- */
export const MOTIFS_STANDBY = [
  "Attente infos", "Attente documents", "Temps de réflexion", "Point avec co-décisionnaires",
  "Démarche locative", "Travaux en cours", "Délai administratif", "Vacances", "Maladie", "Autre",
];
export const STATUTS_SUIVI = ["Traité", "En attente", "A relancer"];
export const TYPES_SUIVI = ["Manuel", "Formulaire", "Estimation"];

/* --- État technique --- */
export const TYPES_COMPOSANT = [
  "Parties communes", "Ascenseur", "Assainissement", "Charpente", "Chauffage", "Combles",
  "Electricité", "Façade", "Fenêtres", "Plomberie", "Toiture", "Ventilation", "Volets", "Autre",
];

/** Matériaux par type de composant (relevés sur les captures du BO). */
export const MATERIAUX: Record<string, string[]> = {
  "Façade": ["Crépi", "Briques", "Béton", "Peinture", "Pierres", "Bois", "Double peau", "Enduit", "Colombages", "Autre"],
  "Toiture": ["Tuiles", "Ardoises", "Zinc", "Bac acier", "Terrasse", "Autre"],
  "Fenêtres": ["Simple vitrage", "Double vitrage", "Double et Simple vitrage", "PVC", "Bois", "Alu", "Autre"],
  "Chauffage": ["Central gaz", "Central fuel", "Central collectif", "Individuel electrique", "Individuel gaz", "Pompe à chaleur", "Autre"],
  "Charpente": ["Bois", "Métal", "Béton", "Autre"],
  "Assainissement": ["Tout à l'égout", "Fosse septique", "Micro-station", "Autre"],
};

export const URGENCES = ["Haute", "Moyenne", "Basse"];

/* --- Charges --- */
export const TYPES_CHARGE = [
  "Taxe Foncière", "Taxe Bureau", "Cotisation Foncière des Entreprises", "CRL",
  "Poubelles", "Ménage", "Internet", "Gaz", "Fuel", "Entretien", "Electricité", "Eau",
  "Assurance", "Ascenseur", "Autre",
];
/** Charges considérées comme « Taxes et impôts » dans l'onglet Charges. */
export const TAXES = new Set(["Taxe Foncière", "Taxe Bureau", "Cotisation Foncière des Entreprises", "CRL"]);

/* --- Mandats --- */
export const STATUTS_MANDAT = [
  "Attente infos", "A rédiger", "Attente signature", "En cours", "Expiré", "Vendu", "Annulé",
];
export const TYPES_EXCLU = ["Simple", "Semi-exclusif", "Exclusif"];
export const CHARGES_HONOS = ["Vendeur", "Acheteur"];

/* --- Contacts / recherches --- */
export const CIBLES = ["Investisseur", "Marchand de biens", "Patrimonial", "Promoteur"];

/** Profils d'un contact (champ `Types`) — valeurs réellement présentes en base,
 *  dans l'ordre de fréquence : c'est la liste que propose le BO. */
export const PROFILS_CONTACT = [
  "Investisseur", "Marchand", "Promoteur", "Foncière", "Agent immobilier",
  "Gestionnaire", "Exploitant", "Apporteur", "Partenaire", "Notaire",
  "Banquier", "Avocat", "Architecte", "Lotisseur", "Technicien", "Locataire",
];

/** Classement acquéreur — libellés donnés par MAV.
 *
 *  Le classement est une échelle d'engagement, pas une appréciation : il monte
 *  tout seul quand l'acquéreur agit. Une visite ou une offre le fait passer en
 *  B, un achat ou une offre acceptée en A. D'où `notePromue()` plus bas, qui
 *  relit les actes plutôt que de faire confiance à la lettre enregistrée. */
export const NOTES_CONTACT: { cle: string; label: string }[] = [
  { cle: "A", label: "A (Acheteur connu sur la place ou ayant déjà acheté — ou offre au prix sur un dossier)" },
  { cle: "B", label: "B (Client ayant déjà visité ou fait une offre)" },
  { cle: "C", label: "C (Acheteur contacté)" },
  { cle: "D", label: "D (Acheteur jamais contacté ou mauvais acquéreur)" },
];

/** Rang d'une note : A vaut mieux que B, qui vaut mieux que C… */
export const rangNote = (n?: string) => ({ A: 0, B: 1, C: 2, D: 3 }[n ?? ""] ?? 4);
export const SOURCES_CONTACT = [
  "Site web", "Site - Formulaire Vendre", "Site - Formulaire Estimer", "Site - Formulaire Contact",
  "Site - Formulaire Alerte", "Site - Formulaire Off Market", "Site - Formulaire Besoin d'un conseil",
  "Site - Signup (Alerte)", "Appel à l'agence", "E-mail à contact@", "Linkedin", "Facebook",
  "SeLoger", "LeBonCoin", "LaBonnePierre", "Autre portail immobilier", "Relationnel", "Prospection",
  "Parrainage", "Notaire", "Interragence", "Acheteur", "Immeuble acheté avec France Immeuble", "Autre",
];
export const CIVILITES = ["Monsieur", "Madame"];

/* --- Commercialisation --- */
export const STATUTS_VISITE = ["En attente", "Confirmée", "Effectuée", "Annulée"];
export const STATUTS_OFFRE = [
  "En cours", "Contre offre", "Acceptée", "Refusée",
  "Compromis programmé", "Compromis signé", "Vente prévue", "Vendu",
];
export const STATUTS_ESTIMATION = ["1 - PDF manquant", "2 - A envoyer", "3 - Envoyée", "4 - Interne"];

/** Ajoute une valeur héritée (venant de Bubble) en tête de liste si absente. */
export const withCurrent = (current: unknown, list: string[]) =>
  typeof current === "string" && current && !list.includes(current) ? [current, ...list] : list;
