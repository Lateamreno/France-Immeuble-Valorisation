"use server";

// #608 : le loyer HC du secteur pour un lot, demandé au clic sur sa case
// « loyer potentiel ». Le calcul est dans loyer-secteur.ts ; ici on lit la
// valeur retenue du secteur de l'immeuble et la Carte des loyers de sa commune.

import { getPrixSecteur } from "@/lib/bubble/server";
import { calculerLoyerSecteur, type CarteLoyers, type LoyerSecteur } from "@/lib/bo/loyer-secteur";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function lire<T>(chemin: string): Promise<T[]> {
  if (!SB_KEY) return [];
  const r = await fetch(`${SB_URL}/rest/v1/${chemin}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, cache: "no-store",
  }).catch(() => null);
  return r?.ok ? ((await r.json()) as T[]) : [];
}

const norm = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Le code INSEE de la commune — l'arrondissement pour Paris, Lyon et Marseille, comme la Carte des loyers. */
async function inseeDe(cp: string, ville: string): Promise<string | undefined> {
  const c = cp.replace(/\s/g, "");
  if (/^750\d\d$/.test(c)) return `751${c.slice(3)}`;
  if (/^6900\d$/.test(c)) return `6938${c.slice(4)}`;
  if (/^130\d\d$/.test(c) && Number(c.slice(3)) >= 1 && Number(c.slice(3)) <= 16) return `132${c.slice(3)}`;
  if (!c && !ville) return undefined;
  const q = c ? `codePostal=${encodeURIComponent(c)}` : `nom=${encodeURIComponent(ville)}`;
  const r = await fetch(`https://geo.api.gouv.fr/communes?${q}&fields=nom,code&limit=20`, { next: { revalidate: 604800 } }).catch(() => null);
  const communes = r?.ok ? ((await r.json().catch(() => [])) as { nom: string; code: string }[]) : [];
  return (communes.find((x) => norm(x.nom) === norm(ville)) ?? communes[0])?.code;
}

export async function loyerSecteurDuLot(input: {
  immeubleId: string; destination: string; typeLot: string; surface?: number;
}): Promise<LoyerSecteur> {
  try {
    const [secteur, [im]] = await Promise.all([
      getPrixSecteur(input.immeubleId).catch(() => null),
      lire<{ data: Record<string, unknown> }>(`bo_immeuble?id=eq.${encodeURIComponent(input.immeubleId)}&select=data&limit=1`),
    ]);
    let carte: CarteLoyers | null = null;
    if (input.destination === "Logement" && im) {
      const insee = await inseeDe(String(im.data.adresse_zipcode ?? ""), String(im.data.adresse_ville ?? ""));
      if (insee) {
        const [l] = await lire<Record<string, unknown>>(`bo_loyers_commune?code_insee=eq.${insee}&select=libelle,millesime,loyer_m2,loyer_m2_t12,loyer_m2_t3,loyer_m2_maison&limit=1`);
        const n = (v: unknown) => (v === null || v === undefined || v === "" ? undefined : Number(v));
        if (l) carte = { commune: String(l.libelle ?? ""), millesime: Number(l.millesime) || 2025, tous: n(l.loyer_m2), t12: n(l.loyer_m2_t12), t3: n(l.loyer_m2_t3), maison: n(l.loyer_m2_maison) };
      }
    }
    return calculerLoyerSecteur({ ...input, secteur, carte });
  } catch (e) {
    return { ok: false, raison: e instanceof Error ? e.message : String(e) };
  }
}
