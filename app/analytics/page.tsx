// Datas — reporting du BO : volumes sur 12 mois, entonnoir de la chaîne de
// vente avec le poids de chaque étape et la répartition par agent, taux de
// conversion, et état du portefeuille.
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

  const keur = (v: number) => `${Math.round(v / 1000).toLocaleString("fr-FR")} k€`;
  const blocs: { titre: string; lignes: [string, string][] }[] = [
    {
      titre: "Acquéreurs",
      lignes: [
        ["Contacts créés", d.contacts.toLocaleString("fr-FR")],
        ["Recherches créées", d.recherches.toLocaleString("fr-FR")],
      ],
    },
    {
      titre: "Sourcing",
      lignes: [
        ["Immeubles créés", d.immeubles.toLocaleString("fr-FR")],
        ["Formulaires reçus", String(d.formulaires)],
        ["Formulaires validés", String(d.formulairesValides)],
        ["Archivés", String(d.immeublesArchives)],
      ],
    },
    {
      titre: "Estimations",
      lignes: [
        ["Estimations créées", String(d.estimations)],
        ["Estimations envoyées", String(d.estimationsEnvoyees)],
      ],
    },
    {
      titre: "Mandats",
      lignes: [
        ["Mandats créés", String(d.mandats)],
        ["Mandats signés", String(d.mandatsSignes)],
      ],
    },
    {
      titre: "Commercialisation",
      lignes: [
        ["Propositions envoyées", d.propositions.toLocaleString("fr-FR")],
        ["Propositions refusées", String(d.propositionsRefusees)],
        ["Visites", String(d.visites)],
        ["Visites effectuées", String(d.visitesEffectuees)],
      ],
    },
    {
      titre: "Offres et ventes",
      lignes: [
        ["Offres reçues", `${d.offres} · ${keur(d.offresHonosHt)} HT`],
        ["Offres acceptées", String(d.offresAcceptees)],
        ["Compromis", `${d.compromis} · ${keur(d.compromisHonosHt)} HT`],
        ["Ventes signées", `${d.ventes} · ${keur(d.ventesHonosHt)} HT`],
      ],
    },
  ];

  const taux: [string, number][] = [
    ["Retour des propositions", d.taux.retour],
    ["Proposés → visités", d.taux.visite],
    ["Visités → offre reçue", d.taux.offre],
    ["Offres acceptées", d.taux.offreAcceptee],
    ["Passage en compromis", d.taux.compromis],
    ["Signature des ventes", d.taux.vente],
  ];

  const agents = [...new Set(d.entonnoir.flatMap((e) => Object.keys(e.parAgent)))].sort();

  return (
    <div className="lst-page">
      <h1 className="lst-title">Datas</h1>
      <div className="dt-sub">12 derniers mois — tous agents</div>

      <div className="dt-port">
        <span><b>{d.portefeuille.enCours}</b> immeubles en cours</span>
        <span><b>{d.portefeuille.enAttente}</b> en attente</span>
        <span className="off"><b>{d.portefeuille.archives}</b> archivés</span>
        <span><b>{d.immeublesVisites}</b> immeubles visités</span>
      </div>

      <h2 className="dt-h2">Entonnoir</h2>
      <div className="dt-funnel">
        {d.entonnoir.map((e) => (
          <div className="dt-et" key={e.cle}>
            <div className="dt-et-h">
              <span className="n">{e.n.toLocaleString("fr-FR")}</span>
              <span className="l">{e.label}</span>
              <span className="p">{e.pct} %</span>
            </div>
            <div className="dt-bar"><i style={{ width: `${Math.max(1, e.pct)}%` }} /></div>
            <div className="dt-ag">
              {agents.map((a) => (
                <span key={a} className={e.parAgent[a] ? "" : "off"}>{a} {e.parAgent[a] ?? 0}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <h2 className="dt-h2">Taux de conversion</h2>
      <div className="dt-taux">
        {taux.map(([l, v]) => (
          <div className="dt-t" key={l}>
            <div className="dt-t-v">{v.toLocaleString("fr-FR")} %</div>
            <div className="dt-t-l">{l}</div>
            <div className="dt-bar"><i style={{ width: `${Math.min(100, v)}%` }} /></div>
          </div>
        ))}
      </div>

      <h2 className="dt-h2">Volumes</h2>
      <div className="dt-grid">
        {blocs.map((b) => (
          <div className="dt-c" key={b.titre}>
            <div className="dt-c-t">{b.titre}</div>
            {b.lignes.map(([l, v]) => (
              <div className="dt-l" key={l}><span>{l}</span><b>{v}</b></div>
            ))}
          </div>
        ))}
        <div className="dt-c">
          <div className="dt-c-t">Mandats signés par agent</div>
          {Object.entries(d.mandatsParAgent).sort((a, b) => b[1] - a[1]).map(([a, n]) => (
            <div className="dt-l" key={a}><span>{a}</span><b>{n}</b></div>
          ))}
        </div>
        <div className="dt-c">
          <div className="dt-c-t">Offres par agent</div>
          {Object.entries(d.offresParAgent).sort((a, b) => b[1] - a[1]).map(([a, n]) => (
            <div className="dt-l" key={a}><span>{a}</span><b>{n}</b></div>
          ))}
        </div>
      </div>
      <div className="dt-sub" style={{ marginTop: 14 }}>
        Honoraires HT signés sur la période : <b>{euros(d.ventesHonosHt) ?? "0 €"}</b>
      </div>
    </div>
  );
}
