"use client";

/* La fiche d'une société (retour #489).
 *
 * Une société n'est pas un contact : elle n'a ni téléphone ni projet, elle a
 * une immatriculation, un capital, un siège, des ASSOCIÉS (des contacts, avec
 * leur fonction) — et c'est elle qui signe le mandat et reçoit la facture.
 * D'où une fiche courte : identité, associés, ce qu'elle détient, ce qu'elle
 * a signé. */
import { useState, useTransition } from "react";
import Link from "next/link";
import { Champ } from "@/components/champ";
import { ContactPicker } from "@/components/contact-picker";
import { PastilleStatut } from "@/components/pastille";
import { detacherAssocie, majSociete, rattacherAssocie } from "@/lib/bo/societes-actions";
import { FONCTIONS_ASSOCIE, representantDe, type SocieteNommee } from "@/lib/societes";
import { useQuestion } from "@/components/modale";

const LIGNE = "cfx-r cfx-v";

export function SocieteFiche({ s, immeubles, mandats }: {
  s: SocieteNommee;
  immeubles: { id: string; libelle: string; statut: string }[];
  mandats: { id: string; immeubleId: string; numero?: string; date: string; statut: string }[];
}) {
  const [nom, setNom] = useState(s.nom);
  const [forme, setForme] = useState(s.forme ?? "");
  const [siren, setSiren] = useState(s.siren ?? "");
  const [rcs, setRcs] = useState(s.rcs ?? "");
  const [capital, setCapital] = useState(s.capital === undefined ? "" : String(s.capital));
  const [siege, setSiege] = useState(s.siege ?? "");
  const courant = JSON.stringify({ nom, forme, siren, rcs, capital, siege });
  const [enBase, setEnBase] = useState(courant);
  const modifie = courant !== enBase;
  const [pending, start] = useTransition();
  const [picker, setPicker] = useState(false);
  const { confirmer, question } = useQuestion();
  const representant = representantDe(s);

  const save = () =>
    start(async () => {
      setEnBase(courant);
      await majSociete(s.id, {
        nom: nom.trim(), forme: forme.trim(), siren: siren.trim(), rcs: rcs.trim(),
        capital: capital ? Number(capital.replace(/[^\d.]/g, "")) : undefined, siege: siege.trim(),
      });
    });

  return (
    <div className="cfx soc">
      <div className="cfx-colle">
        <header className="cfx-top">
          <div className="cfx-ava soc">
            <svg viewBox="0 0 24 24" aria-hidden><path d="M4 20V9.5l5-2.5V20M9 20V4.5l5 2v13.5M14 20v-8h6v8M4 20h17" /></svg>
          </div>
          <div className="cfx-id">
            <h1>{s.nom}</h1>
            <div className="cfx-sous">
              {[s.forme, s.siren && `SIREN ${s.siren}`, s.rcs && `RCS ${s.rcs}`, s.siege].filter(Boolean).join(" · ") || "Immatriculation à renseigner"}
            </div>
            {representant && (
              <div className="cfx-sous">
                Représentée par{" "}
                <Link href={`/contact/${representant.contactId}`}>
                  {s.associesNommes.find((a) => a.contactId === representant.contactId)?.nom ?? "un associé"}
                </Link>
                {representant.fonction ? `, ${representant.fonction.toLowerCase()}` : ""}
              </div>
            )}
          </div>
        </header>
      </div>

      <div className="cfx-body">
        <div className="cfx-infos">
          <div className="cfx-form">
            <section className="cfx-bloc">
              <h2>Identité</h2>
              <Champ libelle="Raison sociale" gauche className={LIGNE}>
                <input value={nom} onChange={(e) => setNom(e.target.value)} />
              </Champ>
              <div className="cfx-duo">
                <Champ libelle="Forme" gauche className={LIGNE}>
                  <input value={forme} onChange={(e) => setForme(e.target.value)} placeholder="SCI, SAS, SARL…" />
                </Champ>
                <Champ libelle="Capital social" gauche className={LIGNE}>
                  <input className="droite" value={capital} inputMode="decimal" onChange={(e) => setCapital(e.target.value)} />
                </Champ>
              </div>
              <div className="cfx-duo">
                <Champ libelle="SIREN" gauche className={LIGNE}>
                  <input value={siren} onChange={(e) => setSiren(e.target.value)} />
                </Champ>
                <Champ libelle="RCS" gauche className={LIGNE}>
                  <input value={rcs} onChange={(e) => setRcs(e.target.value)} placeholder="Ville du greffe" />
                </Champ>
              </div>
              <Champ libelle="Siège social" gauche className={LIGNE}>
                <input value={siege} onChange={(e) => setSiege(e.target.value)} />
              </Champ>
              {s.kbis && (
                <div className="cfx-r">
                  <label>Kbis</label>
                  <div className="cfx-v">
                    <a className="cfx-pj" href={s.kbis.startsWith("/") ? s.kbis : `/api/photo?u=${encodeURIComponent(s.kbis)}`} target="_blank" rel="noreferrer">
                      Kbis{s.kbisLe ? ` déposé le ${s.kbisLe.split("-").reverse().join("/")}` : ""}
                    </a>
                  </div>
                </div>
              )}
              {modifie && (
                <div className="soc-barre">
                  <button type="button" className="fadd" onClick={() => {
                    setNom(s.nom); setForme(s.forme ?? ""); setSiren(s.siren ?? ""); setRcs(s.rcs ?? "");
                    setCapital(s.capital === undefined ? "" : String(s.capital)); setSiege(s.siege ?? "");
                  }}>Annuler</button>
                  <button type="button" className="kgo" disabled={pending} onClick={save}>
                    <span className="ch">›</span> Enregistrer
                  </button>
                </div>
              )}
            </section>

            <section className="cfx-bloc">
              <h2>Associés et dirigeants</h2>
              {s.associesNommes.length === 0 && (
                <div className="fempty">Aucun associé rattaché : une société sans personne derrière ne peut ni signer ni être facturée.</div>
              )}
              <div className="soc-assoc">
                {s.associesNommes.map((a) => (
                  <AssocieLigne key={a.contactId} societeId={s.id} a={a}
                    onDetacher={() => confirmer(
                      `${a.nom} ne sera plus associé de ${s.nom}. Sa fiche contact n'est pas modifiée.`,
                      { titre: "Détacher cet associé ?", oui: "Détacher", danger: true },
                    ).then((oui) => { if (oui) start(() => detacherAssocie(s.id, a.contactId)); })} />
                ))}
              </div>
              <button type="button" className="fadd" onClick={() => setPicker(true)}>+ Rattacher un associé</button>
            </section>
          </div>

          <aside className="cfx-side">
            <section className="cfx-bloc">
              <h2>Immeubles détenus</h2>
              {immeubles.length === 0 && <div className="fempty">Aucun immeuble ne désigne cette société comme détentrice.</div>}
              {immeubles.map((im) => (
                <Link key={im.id} href={`/bien/${im.id}`} className="soc-ligne">
                  <span>{im.libelle}</span>
                  {im.statut && <PastilleStatut statut={im.statut} />}
                </Link>
              ))}
            </section>
            <section className="cfx-bloc">
              <h2>Mandats signés</h2>
              {mandats.length === 0 && <div className="fempty">Aucun mandat au nom de cette société.</div>}
              {mandats.map((m) => (
                <Link key={m.id} href={m.immeubleId ? `/bien/${m.immeubleId}/mandat/${m.id}` : `/mandat/${m.id}`} className="soc-ligne">
                  <span>{m.numero ? `Mandat n° ${m.numero}` : "Mandat sans numéro"} · {m.date}</span>
                  {m.statut && <PastilleStatut statut={m.statut} />}
                </Link>
              ))}
            </section>
          </aside>
        </div>
      </div>

      {picker && (
        <ContactPicker
          titre={`Rattacher un associé à ${s.nom}`}
          libelleValider="Rattacher"
          onAnnuler={() => setPicker(false)}
          onValider={(c) => { setPicker(false); start(() => rattacherAssocie(s.id, c.id)); }}
        />
      )}
      {question}
    </div>
  );
}

function AssocieLigne({ societeId, a, onDetacher }: {
  societeId: string;
  a: { contactId: string; nom: string; fonction?: string };
  onDetacher: () => void;
}) {
  const [fonction, setFonction] = useState(a.fonction ?? "");
  const [, start] = useTransition();
  return (
    <div className={`soc-assoc-l${fonction.trim() ? "" : " sans"}`}>
      <Link href={`/contact/${a.contactId}`} className="nom">{a.nom}</Link>
      <input list={`soc-fonctions-${a.contactId}`} value={fonction} placeholder="Fonction — à préciser"
        onChange={(e) => setFonction(e.target.value)}
        onBlur={() => { if ((fonction.trim() || "") !== (a.fonction ?? "")) start(() => rattacherAssocie(societeId, a.contactId, fonction.trim() || undefined)); }} />
      <datalist id={`soc-fonctions-${a.contactId}`}>
        {FONCTIONS_ASSOCIE.map((f) => <option key={f} value={f} />)}
      </datalist>
      <button type="button" className="xdel" title="Détacher cet associé" onClick={onDetacher}>✕</button>
    </div>
  );
}
