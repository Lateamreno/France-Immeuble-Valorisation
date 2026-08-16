"use client";

// Fiche contact — réplique du BO : en-tête (nom + badges ACHETEUR/VENDEUR +
// profil), actions Appeler / E-mail, blocs Typologie · Coordonnées ·
// Informations · Société · Notes · Source, sous-onglets avec compteurs.
import { useState, useTransition } from "react";
import Link from "next/link";
import { Copier } from "@/components/copier";
import type { ContactData, FilMail } from "@/lib/bubble/server";
import { dmy, euros } from "@/lib/format";
import { EchangesContact } from "@/components/mails";
import { archiverContact, updateContact } from "@/lib/bo/actions";

const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));
import { CIBLES as PROFILS, MOTIFS_ARCHIVAGE, SOURCES_CONTACT as SOURCES } from "@/lib/referentiels";

const NOTES = ["A", "B", "C", "D"];

/** Le BO propose « + Ajouter … » dans chaque onglet ; la création passe par
 *  la barre d'actions du bas, qui pré-remplit le contact. */
function AjouterDepuisBarre({ quoi }: { quoi: string }) {
  return (
    <div className="cf-add">
      + Ajouter {quoi} — via la barre d&apos;actions en bas de l&apos;écran
    </div>
  );
}

export function ContactFiche({ d, echanges = [] }: {
  d: ContactData;
  /** E-mails échangés avec ce contact (module Mails). */
  echanges?: FilMail[];
}) {
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
  const [note, setNote] = useState(S(c.Note));
  const [naissance, setNaissance] = useState(S(c.date_naissance).slice(0, 10));
  const [lieuNaissance, setLieuNaissance] = useState(S(c.lieu_naissance_geo));
  const [adresse, setAdresse] = useState(S(c.adresse_geo));
  const [notifSms, setNotifSms] = useState(c.notif_sms === true);
  const [notifMail, setNotifMail] = useState(c.notif_email === true);
  const [interagence, setInteragence] = useState(c.interagence === true);

  const fullName = [civ === "Monsieur" ? "M." : civ === "Madame" ? "Mme" : civ, prenom, nom.toUpperCase()].filter(Boolean).join(" ");

  const save = () =>
    start(() =>
      updateContact(id, {
        "Civilité": civ, "prénom": prenom || undefined, nom: nom || undefined,
        email: email || undefined, portable: portable || undefined, fixe: fixe || undefined,
        acheteur, vendeur, Types: types, Source: source || undefined,
        remarques: remarques || undefined, entreprise_nom: entreprise || undefined,
        Note: note || undefined,
        date_naissance: naissance || undefined,
        lieu_naissance_geo: lieuNaissance || undefined,
        adresse_geo: adresse || undefined,
        notif_sms: notifSms, notif_email: notifMail, interagence,
      }),
    );

  const tabs = [
    { key: "infos", label: "Informations", n: 0 },
    { key: "immeubles", label: "Immeubles", n: d.immeubles.length },
    { key: "recherches", label: "Recherches", n: d.recherches.length },
    { key: "mandats", label: "Mandats", n: d.mandats.length },
    { key: "propositions", label: "Propositions", n: d.propositions.length },
    { key: "questions", label: "Questions", n: d.questions.length },
    { key: "visites", label: "Visites", n: d.visites.length },
    { key: "offres", label: "Offres", n: d.offres.length },
    { key: "suivis", label: "Suivis", n: d.suivis.length },
    // Les e-mails échangés avec ce contact (module Mails).
    { key: "echanges", label: "Échanges", n: echanges.length },
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
        {note && <span className={`note n${note}`} title={`Classement acquéreur ${note}`}>{note}</span>}
        {portable && (
          <>
            <a className="fadd" href={`tel:${portable}`}>Appeler</a>
            <Copier valeur={portable} titre="Copier le téléphone" petit>Copier</Copier>
          </>
        )}
        {email && (
          <>
            <a className="fadd" href={`mailto:${email}`}>Envoyer un e-mail</a>
            <Copier valeur={email} titre="Copier l'e-mail" petit>Copier</Copier>
          </>
        )}
        <button type="button" className="fadd" disabled={pending}
          onClick={() => {
            const motif = prompt(`Motif d'archivage ?\n\n${MOTIFS_ARCHIVAGE.join(" · ")}`, "Doublon");
            if (motif) start(() => archiverContact(id, motif));
          }}>Archiver ce contact</button>
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
            {d.agentNom && (
              <div style={{ fontSize: 12.5, color: "var(--gray-txt)", marginBottom: 8 }}>
                Suivi par <b style={{ color: "var(--slate)" }}>{d.agentNom}</b>
              </div>
            )}
            <div className="mrow" style={{ marginBottom: 6 }}>
              <button type="button" className={`mopt${acheteur ? " on" : ""}`} onClick={() => setAcheteur(!acheteur)}>Acheter</button>
              <button type="button" className={`mopt${vendeur ? " on" : ""}`} onClick={() => setVendeur(!vendeur)}>Vendre</button>
              <button type="button" className={`mopt${interagence ? " on" : ""}`} onClick={() => setInteragence(!interagence)}>Interagence</button>
            </div>
            <div className="mrow" style={{ marginBottom: 6, alignItems: "center" }}>
              <span style={{ fontSize: 12.5, color: "var(--gray-txt)" }}>Classement</span>
              {NOTES.map((x) => (
                <button key={x} type="button" className={`mopt${note === x ? " on" : ""}`}
                  onClick={() => setNote(note === x ? "" : x)}>{x}</button>
              ))}
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
            <div className="mrow" style={{ alignItems: "center", marginTop: 6 }}>
              <label style={{ fontSize: 12 }}>Date de naissance <input className="min" type="date" style={{ width: 140 }} value={naissance} onChange={(e) => setNaissance(e.target.value)} /></label>
              <input className="min" style={{ width: 190 }} placeholder="Lieu de naissance" value={lieuNaissance} onChange={(e) => setLieuNaissance(e.target.value)} />
              <input className="min" style={{ flex: 1, minWidth: 220 }} placeholder="Adresse" value={adresse} onChange={(e) => setAdresse(e.target.value)} />
            </div>
            <div className="fsub" style={{ marginTop: 14 }}>Société</div>
            <input className="min" style={{ maxWidth: 280 }} placeholder="Raison sociale" value={entreprise} onChange={(e) => setEntreprise(e.target.value)} />
            <div className="fsub" style={{ marginTop: 14 }}>Notes et remarques</div>
            <textarea className="min" rows={3} placeholder="Ecrivez ici..." value={remarques} onChange={(e) => setRemarques(e.target.value)} />
            <div className="fsub" style={{ marginTop: 14 }}>Notifications</div>
            <div className="mrow">
              <button type="button" className={`mopt${notifSms ? " on" : ""}`} onClick={() => setNotifSms(!notifSms)}>SMS : {notifSms ? "Oui" : "Non"}</button>
              <button type="button" className={`mopt${notifMail ? " on" : ""}`} onClick={() => setNotifMail(!notifMail)}>E-mail : {notifMail ? "Oui" : "Non"}</button>
            </div>
            <div className="fsub" style={{ marginTop: 14 }}>Source</div>
            <select className="min" style={{ maxWidth: 260 }} value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">—</option>
              {[...new Set([source, ...SOURCES])].filter(Boolean).map((s) => <option key={s}>{s}</option>)}
            </select>
            <div style={{ fontSize: 12, color: "var(--gray-lt)", marginTop: 14 }}>
              Créé le {dmy(c["Created Date"]) ?? "?"}
              {d.agentNom ? ` par ${d.agentNom}` : ""}
              {S(c.Source) ? ` (source : ${S(c.Source)})` : ""}
            </div>
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
            <AjouterDepuisBarre quoi="un immeuble" />
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
            <AjouterDepuisBarre quoi="une recherche" />
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

        {tab === "mandats" && (
          <>
            <AjouterDepuisBarre quoi="un mandat" />
            {d.mandats.length === 0 && <div className="fempty">Aucun mandat.</div>}
            {d.mandats.map((m) => (
              <Link key={String(m._id)} href={`/mandat/${m._id}`} className="chrow" style={{ textDecoration: "none" }}>
                <span className="t">{S(m.Type)} {S(m.Type_exclu)}</span>
                <span className="c">{m.numero ? `#${m.numero}` : "Pas de numéro"}</span>
                <span className="c">{dmy(m.date_effet)}{m.date_fin ? ` → ${dmy(m.date_fin)}` : ""}</span>
                <span className="sp" style={{ flex: 1 }} />
                <span className="v">{euros(m.prix_hai) ?? ""}</span>
                {S(m.Statut) && <span className="badge-o">{S(m.Statut)}</span>}
              </Link>
            ))}
          </>
        )}

        {tab === "propositions" && (
          <>
            <AjouterDepuisBarre quoi="une proposition" />
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
            <AjouterDepuisBarre quoi="une question" />
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
            <AjouterDepuisBarre quoi="une visite" />
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
            <AjouterDepuisBarre quoi="une offre" />
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
            <AjouterDepuisBarre quoi="un suivi" />
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
        {tab === "echanges" && (
          <>
            <div className="fsub">Échanges par e-mail</div>
            <EchangesContact mails={echanges} />
          </>
        )}
      </div>
    </div>
  );
}
