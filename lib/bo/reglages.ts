// Réglages de l'agence (retour #191).
//
// Ce que l'admin y met pilote le reste du site : l'identité qui s'imprime sur
// les documents, le barème d'honoraires, les logos. Une seule ligne dans
// `fi_reglages`, table de l'application — Bubble ne la connaît pas et ne
// l'écrase donc jamais, contrairement aux tables `bo_*`.
//
// Les valeurs manquantes retombent sur les constantes du code : le site
// fonctionne avant que quoi que ce soit ait été saisi, et un réglage effacé
// par erreur ne casse rien.
import "server-only";
import { unstable_cache } from "next/cache";
import { BAREME, type Tranche } from "@/lib/bareme";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const TAG_REGLAGES = "fi_reglages";

export type Reglages = {
  /** Identité imprimée sur les mandats et les dossiers. */
  agence: {
    nom: string;
    formeCapital: string;
    siren: string;
    siege: string;
    carte: string;
    garantie: string;
    representant: string;
    telephone: string;
    email: string;
    site: string;
  };
  /** Barème d'honoraires — un maximum opposable depuis l'arrêté de 2022. */
  bareme: Tranche[];
  /** Remise consentie au vendeur en cas de vente directe au locataire, en %. */
  remiseLocataire: number;
};

/** Ce que le code sait faire sans qu'on ait rien réglé. */
export const REGLAGES_DEFAUT: Reglages = {
  agence: {
    nom: "France Immeuble S.A.S.",
    formeCapital: "SAS au capital de 100 000,00 €",
    siren: "835 369 562 — RCS Paris",
    siege: "66 avenue des Champs-Élysées, 75008 Paris",
    carte: "CPI 7501 2018 000 026 00 — CCI Paris Île-de-France",
    garantie: "Garantie financière 120 000 € (GALIAN) · RCP MMA Entreprises n° 120 137 405",
    representant: "Marc-Antoine VOCI, Président",
    telephone: "01.72.87.52.22",
    email: "contact@france-immeuble.fr",
    site: "www.france-immeuble.fr",
  },
  bareme: BAREME,
  remiseLocataire: 20,
};

const fusion = (v: Partial<Reglages> | null): Reglages => ({
  agence: { ...REGLAGES_DEFAUT.agence, ...(v?.agence ?? {}) },
  bareme: Array.isArray(v?.bareme) && v.bareme.length ? v.bareme : REGLAGES_DEFAUT.bareme,
  remiseLocataire:
    typeof v?.remiseLocataire === "number" && v.remiseLocataire >= 0 && v.remiseLocataire <= 100
      ? v.remiseLocataire
      : REGLAGES_DEFAUT.remiseLocataire,
});

/**
 * Les réglages en vigueur.
 *
 * Mis en cache sous une étiquette : l'écriture la décroche, et l'écran voit
 * son changement tout de suite. Sans clé de service — en développement local
 * par exemple — on rend les valeurs par défaut plutôt que de tomber.
 */
export const lireReglages = unstable_cache(
  async (): Promise<Reglages> => {
    if (!SB_KEY) return fusion(null);
    const res = await fetch(`${SB_URL}/rest/v1/fi_reglages?cle=eq.agence&select=valeurs&limit=1`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
      cache: "no-store",
    }).catch(() => null);
    if (!res?.ok) return fusion(null);
    const rows = (await res.json()) as { valeurs: Partial<Reglages> }[];
    return fusion(rows[0]?.valeurs ?? null);
  },
  ["fi_reglages"],
  { tags: [TAG_REGLAGES] },
);
