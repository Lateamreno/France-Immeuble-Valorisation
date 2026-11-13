// Typologies de lot proposees selon la destination.
//
// Partage entre le tableau (ecran large) et les cartes (telephone) : le
// tableau importe les cartes, donc les cartes ne peuvent pas importer le
// tableau en retour sans creer un cycle d'imports.
import { TYPES_LOT } from "@/lib/referentiels";

/* Typologies proposées selon la destination (un bureau n'est jamais un T2). */
export const TYPES_PAR_DESTINATION: Record<string, string[]> = {
  Logement: TYPES_LOT.filter((t) =>
    /^(Studio|T[1-7]|Duplex|Loft|Maison|Chambre)/.test(t)),
  Commerce: [
    "Boutique", "Local commercial", "Grande enseigne", "Espace de vente", "Show-room",
    "Agence de voyages", "Agence immobiliere", "Assurance", "Banque", "Boucherie",
    "Boulangerie", "Café", "Charcuterie", "Concession", "Epicerie", "Fromagerie",
    "Magasin d'ameublement", "Magasin de vetements", "Pharmacie", "Pizzeria",
    "Poissonnerie", "Poste", "Restaurant", "Salon de coiffure", "Supermarche", "Association",
  ],
  Bureau: ["Bureaux", "Plateau", "Local d'activites", "Show-room"],
  Logistique: ["Atelier", "Espace de stockage", "Local d'activites", "Reserve", "Sous-sol"],
  Cave: ["Cave", "Sous-sol", "Reserve"],
  Parking: ["Parking", "Box"],
  Annexe: ["WC", "Chambre", "Cave", "Box", "Autre"],
};
export const typesFor = (dest: string, current?: string, ajouts: { destination: string; label: string }[] = []) => {
  const base = TYPES_PAR_DESTINATION[dest] ?? TYPES_LOT;
  const perso = ajouts.filter((t) => t.destination === dest).map((t) => t.label);
  const list = [...base, ...perso.filter((t) => !base.includes(t)), "Autre"];
  return current && !list.includes(current) ? [current, ...list] : list;
};

