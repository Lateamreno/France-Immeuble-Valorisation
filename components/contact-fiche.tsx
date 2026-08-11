"use client";

// Fiche contact — réplique du BO : en-tête (nom + badges ACHETEUR/VENDEUR +
// profil), actions Appeler / E-mail, blocs Typologie · Coordonnées ·
// Informations · Société · Notes · Source, sous-onglets avec compteurs.
import { useState, useTransition } from "react";
import Link from "next/link";
import type { ContactData } from "@/lib/bubble/server";
import { dmy, euros } from "@/lib/format";
import { updateContact } from "@/lib/bo/actions";

const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const PROFILS = ["Investisseur", "Marchand de biens", "Patrimonial", "Promoteur"];
const SOURCES = [
  "Site web", "Site - Formulaire Vendre", "Site - Formulaire Estimer", "Appel à l'agence",
  "Linkedin", "Relationnel", "SeLoger", "Prospection", "Facebook", "LeBonCoin",
  "Interragence", "Parrainage", "Autre",
];

export function ContactFiche({ d }: { d: ContactData }) {
  const c = d.c;
  const id = String(c._id);
  const [tab, setTab] = useState("infos");
  const [pending, start] = useTransition();

  const [prenom, setPrenom] = useState(S(c["prénom"]));
  const [nom, setNom] = useState(S(c.nom));
  const [civ, setCiv] = useState(S(c["Civilité"]) || "Monsieur");
  const [email, setEmail] = useState(S(c.email));
  const [portable, setPortable] = useState(S(c.portable));
  const [fixe, setFixe] = useState(S(c.fixe));
  const [acheteur, setAcheteur] = useState(c.acheteur === true);
  const [vendeur, setVendeur] = useState(c.vendeur === true);
  const [types, setTypes] = useState<string[]>(Array.isArray(c.Types) ? (c.Types as string[]) : []);
  const [source, setSource] = useState(S(c.Source));
  const [remarques, setRemarques] = useState(S(c.remarques));
  const [entreprise, setEntreprise] = useState(S(c.entreprise_nom));

  const fullName = [civ === "Monsieur" ? "M." : civ === "Madame" ? "Mme" : civ, prenom, nom.toUpperCase()].filter(Boolean).join(" ");

  const save = () =>
    start(() =>
      updateContact(id, {
        "Civilité": civ, "prénom": prenom || undefined, nom: nom || undefined,
        email: email || undefined, portable: portable || undefined, fixe: fixe || undefined,
        acheteur, vendeur, Types: types, Source: source || undefined,
        remarques: remarques || undefined, entreprise_nom: entreprise || undefined,
      }),
    );

  const tabs = [
    { key: "infos", label: "Informations", n: 0 },
    { key: "immeubles", label: "Immeubles", n: d.immeubles.length },
    { key: "recherches", label: "Recherches", n: d.recherches.length },
    { key: "propositions", label: "Propositions", n: d.propositions.length },
    { key: "questions", label: "Questions", n: d.questions.length },
    { key: "visites", label: "Visites", n: d.visites.length },
    { key: "offres", label: "Offres", n: d.offres.length },
    { key: "suivis", label: "Suivis", n: d.suivis.length },
  ];

  return (
    <div className="wiz" style={{ maxWidth: 960 }}>
      <div className="whead">
        <div className="wtitle">{fullName || S(c.entreprise_nom) || "Contact"}</div>
        <Link href="/contacts" className="wclose">✕ Retour aux contacts</Link>
      </div>
      <div className="mhband">
        {acheteur && <span className="badge-g">ACHETEUR</span>}
        {vendeur && <span className="badge-o">VENDEUR</span>}
        {types.map((t) => <span key={t} className="chip">{t}</span>)}
        <span className="sp" style={{ flex: 1 }} />
        {portable && <a className="fadd" href={`tel:${portable}`}>Appeler</a>}
        {email && <a className="fadd" href={`mailto:${email}`}>Envoyer un e-mail</a>}
      </div>

      <div className="ftabs">
        {tabs.map((t) => (
          <button key={t.key} type="button" className={`ftab${tab === t.key ? " on" : ""}`} onClick={() => setTab(t.key)}>
            {t.label}{t.n > 0 && <span className="n">{t.n}</span>}
          </button>
        ))}
      </div>

      <div className="wbody">
        {tab === "infos" && (
          <>
            <div className="fsub">Typologie</div>
            <div className="mrow" style={{ marginBottom: 6 }}>
              <button type="button" className={`mopt${acheteur ? " on" : ""}`} onClick={() => setAcheteur(!acheteur)}>Acheter</button>
              <button type="button" className={`mopt${vendeur ? " on" : ""}`} onClick={() => setVendeur(!vendeur)}>Vendre</button>
            </div>
            <div className="mrow">
              {PROFILS.map((p) => (
                <button key={p} type="button" className={`mopt${types.includes(p) ? " on" : ""}`}
                  onClick={() => setTypes(types.includes(p) ? types.filter((x) => x !== p) : [...types, p])}>{p}</button>
              ))}
            </div>
            <div className="fsub" style={{ marginTop: 14 }}>Coordonnées</div>
            <div className="mrow" style={{ alignItems: "center" }}>
              <input className="min" style={{ width: 150 }} placeholder="Portable" value={portable} onChange={(e) => setPortable(e.target.value)} />
              <input className="min" style={{ width: 150 }} placeholder="Fixe" value={fixe} onChange={(e) => setFixe(e.target.value)} />
              <input className="min" style={{ width: 230 }} placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="fsub" style={{ marginTop: 14 }}>Informations</div>
            <div className="mrow" style={{ alignItems: "center" }}>
              <select className="min" style={{ width: 110 }} value={civ} onChange={(e) => setCiv(e.target.value)}>
                <option>Monsieur</option><option>Madame</option>
              </select>
              <input className="min" style={{ width: 140 }} placeholder="Prénom" value={prenom} onChange={(e) => setPrenom(e.target.value)} />
              <input className="min" style={{ width: 160 }} placeholder="NOM" value={nom} onChange={(e) => setNom(e.target.value)} />
            </div>
            <div className="fsub" style={{ marginTop: 14 }}>Société</div>
            <input className="min" style={{ maxWidth: 280 }} placeholder="Raison sociale" value={entreprise} onChange={(e) => setEntreprise(e.target.value)} />
            <div className="fsub" style={{ marginTop: 14 }}>Notes et remarques</div>
            <textarea className="min" rows={3} placeholder="Ecrivez ici..." value={remarques} onChange={(e) => setRemarques(e.target.value)} />
            <div className="fsub" style={{ marginTop: 14 }}>Source</div>
            <select className="min" style={{ maxWidth: 260 }} value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">—</option>
              {[...new Set([source, ...SOURCES])].filter(Boolean).map((s) => <option key={s}>{s}</option>)}
            </select>
            <div className="wnav">
              <span className="sp" style={{ flex: 1 }} />
              <button className="kgo" type="button" disabled={pending} style={pending ? { opacity: 0.5 } : undefined} onClick={save}>
                <span className="ch">›</span> Enregistrer
              </button>
            </div>
          </>
        )}

        {tab === "immeubles" && (
          <>
            {d.immeubles.length === 0 && <div className="fempty">Aucun immeuble.</div>}
            {d.immeubles.map((im) => (
              <Link key={String(im._id)} href={`/bien/${im._id}`} className="chrow" style={{ textDecoration: "none" }}>
                <span className="t">{S(im.adresse_ville)} ({S(im.adresse_zipcode)}) - {[S(im.adresse_numero_rue), S(im.adresse_rue)].filter(Boolean).join(" ")}</span>
                <span className="c">{S(im.Statut).replace(/^\d+ - /, "")}</span>
                <span className="sp" style={{ flex: 1 }} />
                <span className="v">{euros(im.prix_hai) ?? ""}</span>
              </Link>
            ))}
          </>
        )}

        {tab === "recherches" && (
          <>
            {d.recherches.length === 0 && <div className="fempty">Aucune recherche.</div>}
            {d.recherches.map((r) => (
              <div key={String(r._id)} className="chrow">
                <span className="t">{Array.isArray(r.dpts) ? (r.dpts as string[]).join(", ") : S(r.dpts)}</span>
                <span className="c">{S(r.Cible)}</span>
                <span className="c">{euros(r.prix_min) ?? "0 €"} à {euros(r.prix_max) ?? "∞"}{typeof r.renta === "number" ? ` · ≥ ${r.renta} %` : ""}</span>
                <span className="sp" style={{ flex: 1 }} />
                {r.archived === true && <span className="badge-o">Archivée</span>}
              </div>
            ))}
          </>
        )}

        {tab === "propositions" && (
          <>
            {d.propositions.length === 0 && <div className="fempty">Aucune proposition.</div>}
            {d.propositions.map((p) => (
              <div key={String(p._id)} className="chrow">
                <span className="t">{dmy(p.date_envoi) ?? dmy(p["Created Date"])}</span>
                <span className="c">{S(p.Statut)}</span>
                <span className="sp" style={{ flex: 1 }} />
                {p.IMMEUBLE ? <Link className="fadd" href={`/bien/${p.IMMEUBLE}`}>Voir le bien</Link> : null}
              </div>
            ))}
          </>
        )}

        {tab === "questions" && (
          <>
            {d.questions.length === 0 && <div className="fempty">Aucune question.</div>}
            {d.questions.map((q) => (
              <div key={String(q._id)} className="chrow">
                <span className="t">{dmy(q["Created Date"])}</span>
                <span className="c" style={{ whiteSpace: "normal" }}>{S(q.message).slice(0, 180)}</span>
                <span className="sp" style={{ flex: 1 }} />
                {q.ended === true ? <span className="badge-g">Clôturée</span> : <span className="badge-o">En cours</span>}
              </div>
            ))}
          </>
        )}

        {tab === "visites" && (
          <>
            {d.visites.length === 0 && <div className="fempty">Aucune visite.</div>}
            {d.visites.map((v) => (
              <div key={String(v._id)} className="chrow">
                <span className="t">Visite du {dmy(v.date)}</span>
                <span className="c">{S(v.Statut)}</span>
                <span className="sp" style={{ flex: 1 }} />
                {v.IMMEUBLE ? <Link className="fadd" href={`/bien/${v.IMMEUBLE}`}>Voir le bien</Link> : null}
              </div>
            ))}
          </>
        )}

        {tab === "offres" && (
          <>
            {d.offres.length === 0 && <div className="fempty">Aucune offre.</div>}
            {d.offres.map((o) => (
              <div key={String(o._id)} className="chrow">
                <span className="t">Offre du {dmy(o.date)}</span>
                <span className="c">{euros(o.prix_hai) ?? ""} HAI · {S(o.Statut)}</span>
                <span className="sp" style={{ flex: 1 }} />
                {Array.isArray(o.IMMEUBLEs) && (o.IMMEUBLEs as string[])[0] ? (
                  <Link className="fadd" href={`/bien/${(o.IMMEUBLEs as string[])[0]}`}>Voir le bien</Link>
                ) : null}
              </div>
            ))}
          </>
        )}

        {tab === "suivis" && (
          <>
            {d.suivis.length === 0 && <div className="fempty">Aucun suivi.</div>}
            {d.suivis.map((s) => (
              <div key={String(s._id)} className="chrow">
                <span className="t">{dmy(s.date_start ?? s["Created Date"])}</span>
                <span className="c" style={{ whiteSpace: "normal" }}>{S(s.notes).slice(0, 200)}</span>
                <span className="sp" style={{ flex: 1 }} />
                <span className="badge-o">{S(s.Motif_standby ?? s.Type)}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
