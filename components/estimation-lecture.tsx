/* Consultation d'une estimation passée (tâche #55).
 *
 * Le BO ouvre l'estimation avec tous ses champs tels qu'ils étaient, non
 * modifiables. On reprend ce principe : mêmes rubriques que l'écran
 * d'estimation, mêmes valeurs, mais rien de saisissable — pas un champ grisé
 * qui donnerait envie de cliquer, des valeurs posées.
 *
 * Composant serveur : il n'y a rien à manipuler ici.
 */

import Link from "next/link";
import type { EstimationLecture } from "@/lib/bo/estimation-lecture";
import type { Ecarts } from "@/lib/bo/estimation-ecarts";
import { ETATS } from "@/lib/bo/dossier";
import { Avion } from "@/components/pictos";

const eur = (v?: number) => (v === undefined ? "—" : `${Math.round(v).toLocaleString("fr-FR")} €`);
const pct = (v?: number) => (v === undefined ? "—" : `${v.toFixed(1).replace(".", ",")} %`);
const nb = (v?: number) => (v === undefined ? "—" : Math.round(v).toLocaleString("fr-FR"));

/** Une note sur 5, affichée en pastilles pleines et vides. */
function Note({ valeur, libelles }: { valeur?: number; libelles: string[] }) {
  if (!valeur) return <span className="elc-v">—</span>;
  return (
    <span className="elc-note">
      <span className="elc-pastilles">
        {[1, 2, 3, 4, 5].map((n) => (
          <i key={n} className={n <= valeur ? "on" : undefined} />
        ))}
      </span>
      {libelles[valeur - 1]}
    </span>
  );
}

/**
 * Une valeur figée, signalée en rouge si la fiche dit autre chose aujourd'hui.
 *
 * On n'écrit jamais la valeur actuelle à la place : c'est le chiffre d'alors
 * qui est parti au propriétaire. Elle se lit au survol (retour #143).
 */
function V({ v, cle, ecarts }: { v: React.ReactNode; cle: string; ecarts?: Ecarts }) {
  const e = ecarts?.[cle];
  if (!e) return <>{v}</>;
  return (
    <span className="elc-chg" title={`Aujourd'hui : ${e.aujourdhui}`}>
      {v}
      <i>{e.aujourdhui}</i>
    </span>
  );
}

export function EstimationEnLecture({ e, immeubleId, pdfUrl, onEnvoyer, ecarts }: {
  e: EstimationLecture;
  immeubleId: string;
  pdfUrl?: string;
  /** Passer à l'envoi sans quitter la page (retour #125). */
  onEnvoyer?: () => void;
  /** Ce que la fiche dit aujourd'hui, quand ça diffère (retour #143). */
  ecarts?: Ecarts;
}) {
  const avecRef = e.lignes.some((l) => l.refLoyer || l.refPrix || l.refRenta);
  const nChg = Object.keys(ecarts ?? {}).length;

  return (
    <div className="elc">
      {/* Dire d'emblée pourquoi rien ne se modifie évite qu'on cherche le
          bouton Enregistrer pendant deux minutes. */}
      <div className="elc-bandeau">
        <b>Estimation du {e.date} — consultation</b>
        <span>
          Les valeurs sont celles du jour où l&apos;estimation a été faite. La fiche a pu
          bouger depuis : c&apos;est voulu, c&apos;est ce chiffre-là qui est parti au propriétaire.
          {nChg > 0 && (
            <>
              {" "}
              <b className="elc-chg-n">
                {nChg} valeur{nChg > 1 ? "s ont" : " a"} changé depuis
              </b>
              {" "}— soulignée{nChg > 1 ? "s" : ""} de rouge, la valeur d&apos;aujourd&apos;hui
              apparaît au survol.
            </>
          )}
        </span>
      </div>

      <header className="elc-tete">
        <div>
          <h1>{e.titre}</h1>
          <p>{e.adresse}</p>
          <p className="elc-meta">
            {e.auteur ? `Par ${e.auteur} · ` : ""}créée le {e.date}
            {e.envoyeeLe ? ` · envoyée le ${e.envoyeeLe}` : ""}
            {e.statut ? ` · ${e.statut}` : ""}
          </p>
        </div>
        <span style={{ flex: 1 }} />
        <div className="elc-actions">
          {pdfUrl && (
            <a className="fadd" href={pdfUrl} target="_blank" rel="noreferrer">Ouvrir le PDF envoyé ↗</a>
          )}
          <Link className="fadd" href={`/bien/${immeubleId}/estimation/${e.id}/imprimer`}>
            Aperçu du dossier ↗
          </Link>
          {/* Reprendre, c'est renvoyer — pas rouvrir le calcul (retour #98).
              Et ça se fait dans la page : pas de changement d'URL (#125). */}
          {onEnvoyer ? (
            <button type="button" className="savebar-go" onClick={onEnvoyer}>
              <Avion /> Reprendre pour envoyer
            </button>
          ) : (
            <Link className="savebar-go" href={`/bien/${immeubleId}/estimation/${e.id}`}>
              <Avion /> Reprendre pour envoyer
            </Link>
          )}
        </div>
      </header>

      {/* ---- Le prix, en premier : c'est ce qu'on vient revoir ---- */}
      <section className="elc-prix">
        <div className="elc-prix-grand">
          <span>Prix estimé, honoraires inclus</span>
          <b><V v={eur(e.prix.hai)} cle="prix.hai" ecarts={ecarts} /></b>
        </div>
        <div className="elc-prix-trio">
          <div><span>Net vendeur</span><b><V v={eur(e.prix.nv)} cle="prix.nv" ecarts={ecarts} /></b></div>
          <div><span>Honoraires</span><b>{e.prix.honosPct ? pct(e.prix.honosPct) : "—"}</b></div>
          <div><span>Prix au m²</span><b>{e.prix.m2 ? `${nb(e.prix.m2)} €` : "—"}</b></div>
          <div><span>Rendement brut</span><b>{pct(e.prix.renta)}</b></div>
        </div>
      </section>

      {/* ---- L'état locatif figé ---- */}
      {e.lignes.length > 0 && (
        <section className="elc-sec">
          <h2>État locatif au {e.date}</h2>
          <div className="elc-tabx">
            <table className="elc-tab">
              <thead>
                <tr>
                  <th>Destination</th><th>Lots</th><th>Carrez</th><th>Occupé</th>
                  <th>Loyer HC/an</th><th>Potentiel</th>
                  {avecRef && <><th>Loyer secteur</th><th>Prix secteur</th><th>Rendement</th></>}
                </tr>
              </thead>
              <tbody>
                {e.lignes.map((l) => (
                  <tr key={l.dest}>
                    <th>{l.dest}</th>
                    <td><V v={nb(l.lots)} cle={`${l.dest}.lots`} ecarts={ecarts} /></td>
                    <td><V v={l.surface ? `${nb(l.surface)} m²` : "—"} cle={`${l.dest}.surface`} ecarts={ecarts} /></td>
                    <td><V v={l.surfaceOcc ? `${nb(l.surfaceOcc)} m²` : "—"} cle={`${l.dest}.surfaceOcc`} ecarts={ecarts} /></td>
                    <td><V v={eur(l.loyer)} cle={`${l.dest}.loyer`} ecarts={ecarts} /></td>
                    <td><V v={eur(l.loyerMax)} cle={`${l.dest}.loyerMax`} ecarts={ecarts} /></td>
                    {avecRef && (
                      <>
                        <td><V v={l.refLoyer ? `${l.refLoyer.toFixed(1).replace(".", ",")} €/m²` : "—"} cle={`${l.dest}.refLoyer`} ecarts={ecarts} /></td>
                        <td><V v={l.refPrix ? `${nb(l.refPrix)} €/m²` : "—"} cle={`${l.dest}.refPrix`} ecarts={ecarts} /></td>
                        <td><V v={pct(l.refRenta)} cle={`${l.dest}.refRenta`} ecarts={ecarts} /></td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ---- Les appréciations ---- */}
      <section className="elc-sec">
        <h2>Appréciations retenues</h2>
        <div className="elc-champs">
          <div className="elc-c"><span>Emplacement</span><Note valeur={e.scores.emp} libelles={ETATS.emp} /></div>
          <div className="elc-c"><span>Bâti</span><Note valeur={e.scores.bati} libelles={ETATS.bati} /></div>
          <div className="elc-c"><span>Lots</span><Note valeur={e.scores.lot} libelles={ETATS.lot} /></div>
          <div className="elc-c">
            <span>Cibles visées</span>
            <span className="elc-v">
              {e.cibles.length ? e.cibles.map((c) => <i key={c} className="elc-chip">{c}</i>) : "—"}
            </span>
          </div>
        </div>
      </section>

      {/* ---- Les blocs de saisie, en lecture ---- */}
      {e.blocs.map((b) => (
        <section className="elc-sec" key={b.titre}>
          <h2>{b.titre}</h2>
          <div className="elc-champs">
            {b.champs.map((c) => (
              <div className="elc-c" key={c.label}>
                <span>{c.label}</span>
                <span className="elc-v">
                  {c.valeur ?? "—"}
                  {c.note && <i className="elc-note-txt">{c.note}</i>}
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}

      {e.analyse && (
        <section className="elc-sec">
          <h2>Analyse écrite ce jour-là</h2>
          <p className="elc-analyse">{e.analyse}</p>
        </section>
      )}
    </div>
  );
}
