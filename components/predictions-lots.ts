"use client";

/**
 * La prédiction de prix de chaque lot, pour la vue « Valeurs » de l'état
 * locatif (MAV, 15/11/26 : « un état locatif dans lequel j'ai une prédiction
 * du prix que tu me proposes, et moi je mets à la main le prix qui me plaît,
 * lot par lot »).
 *
 * La prédiction est celle de l'onglet « Étude découpe » : surface × prix au m²
 * du secteur, ajustée des pourcentages de l'étude ; au rendement pour un local
 * loué ; au forfait pour une cave ou un parking. Les ventes DVF ne se
 * chargent que quand la vue les demande.
 */
import { useEffect, useMemo, useState } from "react";
import type { BienData } from "@/lib/bubble/server";
import { calculerEtude, type LotEvalue } from "@/lib/bo/etude-decoupe";
import type { DonneesEtude } from "@/lib/bo/etude-decoupe-serveur";

type Donnees = Extract<DonneesEtude, { ok: true }>;

export type Predictions =
  | { etat: "attente" }
  | { etat: "erreur"; message: string }
  | { etat: "ok"; parLot: Map<string, LotEvalue> };

export function usePredictionsLots(b: BienData, actif: boolean): Predictions {
  const immeubleId = String(b.im._id);
  const [donnees, setDonnees] = useState<Donnees | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!actif || donnees) return;
    let vivant = true;
    fetch(`/api/etude-decoupe?immeuble=${encodeURIComponent(immeubleId)}`)
      .then((r) => r.json() as Promise<DonneesEtude>)
      .then((d) => { if (vivant) { if (d.ok) setDonnees(d); else setErreur(d.raison); } })
      .catch(() => { if (vivant) setErreur("Les ventes DVF n'ont pas pu être chargées."); });
    return () => { vivant = false; };
  }, [actif, donnees, immeubleId]);

  return useMemo<Predictions>(() => {
    if (erreur) return { etat: "erreur", message: erreur };
    if (!donnees) return { etat: "attente" };
    const etude = calculerEtude(b.lots, donnees.ventes, donnees.finDonnees, donnees.reglages);
    return { etat: "ok", parLot: new Map(etude.lots.map((l) => [l.id, l])) };
  }, [donnees, erreur, b.lots]);
}
