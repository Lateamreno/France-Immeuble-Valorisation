"use client";

// Rattrapage des façades : le stock d'immeubles arrivés avant que la capture
// n'existe. Par paquets, pour que l'agent voie l'avancement et puisse
// s'arrêter — et parce que Google limite le débit d'une clé.
//
// Une fois le stock passé, ce bouton ne sert plus : chaque nouvelle fiche
// capture sa façade à la création, et plus rien n'appelle Google ensuite.
import { useState, useTransition } from "react";
import { capturerFacadesManquantes } from "@/lib/bo/actions";

const PAQUET = 40;

export function RattrapageFacades({ manquantes }: { manquantes: number }) {
  const [enCours, start] = useTransition();
  const [bilan, setBilan] = useState<string | null>(null);
  const [restants, setRestants] = useState(manquantes);

  if (restants <= 0 && !bilan) return null;

  const lancer = () =>
    start(async () => {
      const r = await capturerFacadesManquantes(PAQUET);
      setRestants(r.restants);
      setBilan(
        r.traites === 0
          ? "Rien à récupérer."
          : `${r.captures} façade${r.captures > 1 ? "s" : ""} récupérée${r.captures > 1 ? "s" : ""}` +
            (r.echecs > 0 ? `, ${r.echecs} sans vue de rue` : "") +
            (r.restants > 0 ? ` · ${r.restants} restant${r.restants > 1 ? "s" : ""}` : " · terminé"),
      );
    });

  return (
    <span className="fac-rat">
      <button type="button" className="fadd" disabled={enCours} onClick={lancer}
        title="Récupère la façade Google des immeubles sans photo, une seule fois par immeuble. Elle sert de repère dans l'outil et reste à remplacer par une vraie photo.">
        {enCours ? "Récupération…" : `Récupérer ${Math.min(PAQUET, restants)} façades (${restants} sans photo)`}
      </button>
      {bilan && <em className="fac-bilan">{bilan}</em>}
    </span>
  );
}
