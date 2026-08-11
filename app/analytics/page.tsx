// Datas — reporting entonnoir 12 mois (réplique de l'esprit des écrans
// « Data » du BO : volumes par étape de la chaîne + taux de conversion).
import { getDatas } from "@/lib/bubble/server";
import { euros } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DatasPage() {
  const d = await getDatas().catch(() => null);
  if (!d) {
    return (
      <div className="lst-page">
        <h1 className="lst-title">Datas</h1>
        <div className="fempty">Données indisponibles.</div>
      </div>
    );
  }
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)} %` : "—");
  const blocs: { titre: string; lignes: [string, string][] }[] = [
    {
      titre: "Acquéreurs",
      lignes: [
        ["Contacts créés", String(d.contacts)],
        ["Recherches créées", String(d.recherches)],
      ],
    },
    {
      titre: "Sourcing",
      lignes: [
        ["Immeubles créés", String(d.immeubles)],
        ["Formulaires reçus (statut 1)", String(d.formulaires)],
      ],
    },
    {
      titre: "Estimations",
      lignes: [
        ["Estimations créées", String(d.estimations)],
        ["Estimations envoyées", String(d.estimationsEnvoyees)],
        ["Taux d'envoi", pct(d.estimationsEnvoyees, d.estimations)],
      ],
    },
    {
      titre: "Mandats",
      lignes: [
        ["Mandats créés", String(d.mandats)],
        ["Mandats signés", String(d.mandatsSignes)],
        ["Taux de signature", pct(d.mandatsSignes, d.mandats)],
      ],
    },
    {
      titre: "Visites",
      lignes: [
        ["Visites", String(d.visites)],
        ["Visites effectuées", String(d.visitesEffectuees)],
      ],
    },
    {
      titre: `Offres (${euros(d.offresHonosHt) ?? "0 €"} HT)`,
      lignes: [
        ["Offres reçues", String(d.offres)],
        ["Offres acceptées et +", String(d.offresAcceptees)],
        ["Taux d'acceptation", pct(d.offresAcceptees, d.offres)],
      ],
    },
    {
      titre: "Ventes",
      lignes: [
        ["Ventes signées (offres Vendu)", String(d.ventes)],
        ["Honoraires HT des ventes", euros(d.ventesHonosHt) ?? "0 €"],
      ],
    },
  ];
  return (
    <div className="lst-page">
      <h1 className="lst-title">Datas — 12 derniers mois</h1>
      <div className="wgrid">
        {blocs.map((b) => (
          <div key={b.titre} className="wcard">
            <div className="h">{b.titre}</div>
            {b.lignes.map(([l, v]) => (
              <div key={l} className="v" style={{ display: "flex", gap: 8 }}>
                <span style={{ flex: 1, color: "var(--gray-txt)" }}>{l}</span>
                <b>{v}</b>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: "var(--gray-lt)", marginTop: 12 }}>
        Volumes calculés sur les objets créés au cours des 12 derniers mois (miroir Supabase).
        Funnels par population et objectifs par agent : à venir.
      </div>
    </div>
  );
}
