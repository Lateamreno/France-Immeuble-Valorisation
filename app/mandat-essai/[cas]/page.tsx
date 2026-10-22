// Banc d'essai du mandat — scénarios de la spécification (§ 12).
//
// Le BO ne contient pas de mandat de chaque régime, et il n'est pas question
// d'en fabriquer dans les données de MAV pour tester. Cette page rend le
// document à partir de jeux d'essai figés : c'est ce qui permet de vérifier
// qu'aucune page ne déborde et que les trois régimes sortent bien.
//
// Elle ne part JAMAIS en production : hors preview et hors local, elle répond
// 404 comme une route inexistante.
import { notFound } from "next/navigation";
import { redigerMandatBloc } from "@/lib/bo/mandat-doc";
import { MandatDoc } from "@/components/mandat-doc";
import type { Mandant } from "@/lib/mandat";
import "../../mandat-doc.css";

export const dynamic = "force-dynamic";

const physique = (n: number, fonction: string): Mandant => ({
  uid: `p${n}`, personne: "physique", qualite: n % 2 ? "Monsieur" : "Madame",
  prenom: ["Étienne", "Hélène", "Bernard", "Claire", "Gilles", "Sophie"][n % 6],
  nom: ["LAURENT", "MOREAU", "DUPONT", "BERNARD", "MARCHAND", "PETIT"][n % 6],
  dateNaissance: "12 mars 1962", lieuNaissance: "Paris 14e arrondissement",
  adresse: "8 rue Lecourbe, 75015 Paris", fonction,
});

const morale = (fonction: string): Mandant => ({
  uid: "m", personne: "morale", qualite: "Monsieur", prenom: "Étienne", nom: "LAURENT",
  fonction,
  societe: {
    nom: "SCI DU MARCHÉ CENTRAL", siren: "512 447 903", rcs: "Bobigny",
    capital: 1000, siege: "14 rue de la Fontaine, 93100 Montreuil",
  },
});

const lot = (n: number, destination: string, surface: number, loyer?: number) => ({
  _id: `l${n}`, numero: n, Destination: destination,
  surface_carrez: surface, loyer, Type_bail: loyer ? "Habitation" : "Vide",
});

/** L'immeuble commun à tous les scénarios. */
const IM = {
  adresse_ville: "Montreuil", adresse_zipcode: "93100",
  adresse_numero_rue: "18", adresse_rue: "avenue Gambetta",
  year_constru: 1968, nb_etage: 3,
};

const base = {
  numero: 2109, date_effet: "2026-08-27T00:00:00Z",
  "durée_tot_month": 12, prix_nv: 4400000, honos_taux: 5,
  honos_ttc: 220000, prix_hai: 4620000, Charge_hono: "Acheteur",
  ref_cadastre: "section AL numéro 214", surface_terrain: 612,
};

const LIBRES = [
  lot(1, "Commerce", 137), lot(2, "Commerce", 137), lot(3, "Commerce", 138),
  ...Array.from({ length: 12 }, (_, i) => lot(10 + i, "Logement", 64)),
  ...Array.from({ length: 10 }, (_, i) => lot(30 + i, "Stationnement", 0)),
];
const OCCUPES = LIBRES.map((l, i) => (i % 3 === 0 ? l : { ...l, loyer: 600, Type_bail: "Habitation" }));

const CAS: Record<string, { titre: string; m: Record<string, unknown>; mandants: Mandant[]; lots: Record<string, unknown>[] }> = {
  "simple-1-physique": {
    titre: "Simple · 1 mandant personne physique · bien libre",
    m: { ...base, Type_exclu: "Simple", "durée_irrevoc_days": 14 },
    mandants: [physique(0, "Propriétaire")], lots: LIBRES,
  },
  "semi-2-mandants": {
    titre: "Semi-exclusif · 2 mandants · bien partiellement occupé",
    m: { ...base, Type_exclu: "Semi-exclusif", "durée_irrevoc_days": 30, "durée_exclu_jours": 90, Charge_hono: "Vendeur" },
    mandants: [physique(0, "Indivisaire"), physique(1, "Indivisaire")], lots: OCCUPES,
  },
  "exclusif-3-dont-morale": {
    titre: "Exclusif · 3 mandants dont une personne morale",
    m: { ...base, Type_exclu: "Exclusif", "durée_irrevoc_days": 60 },
    mandants: [morale("Gérant"), physique(0, "Copropriétaire"), physique(1, "Copropriétaire")],
    lots: LIBRES,
  },
  "exclusif-4-mandants": {
    titre: "Exclusif · 4 mandants — la limite d'une page",
    m: { ...base, Type_exclu: "Exclusif", "durée_irrevoc_days": 90 },
    mandants: [physique(0, "Indivisaire"), physique(1, "Indivisaire"), physique(2, "Indivisaire"), physique(3, "Indivisaire")],
    lots: OCCUPES,
  },
  "exclusif-sans-numero": {
    titre: "Exclusif · sans numéro de registre ni prix — les trous doivent apparaître",
    m: { Type_exclu: "Exclusif", date_effet: "2026-08-27T00:00:00Z" },
    mandants: [{ uid: "x", personne: "physique", fonction: "Propriétaire" }], lots: [],
  },
};

export default async function Essai({
  params, searchParams,
}: {
  params: Promise<{ cas: string }>;
  searchParams: Promise<{ nu?: string }>;
}) {
  if (process.env.VERCEL_ENV === "production") notFound();
  const { cas } = await params;
  const { nu } = await searchParams;
  const c = CAS[cas];
  if (!c) {
    return (
      <div style={{ padding: 40, fontFamily: "system-ui" }}>
        <h1 style={{ fontSize: 18, marginBottom: 12 }}>Scénarios du mandat</h1>
        <ul>
          {Object.entries(CAS).map(([k, v]) => (
            <li key={k} style={{ margin: "6px 0" }}>
              <a href={`/mandat-essai/${k}`} style={{ color: "#44525f" }}>{v.titre}</a>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const { doc } = redigerMandatBloc({ m: c.m, im: IM, lots: c.lots, mandants: c.mandants });
  return <MandatDoc d={doc} nu={!!nu} />;
}
