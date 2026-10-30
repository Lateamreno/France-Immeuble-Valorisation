/* Consultation d'une estimation passée (tâche #55, refondue au retour #492).
 *
 * Le BO ouvre l'estimation avec tous ses champs tels qu'ils étaient, non
 * modifiables. MAV, 20/10 : « quand j'ouvre l'estimation je veux la
 * présentation des prix avec les deux colonnes actuel et potentiel ainsi que
 * les prix au m², rendements brut, nets et acte en main. Faut faire aussi
 * ressortir les éléments de loyers, de surfaces et de travaux. Repense
 * complètement cette page pour que les infos sautent aux yeux de façon
 * visuelle avec des pictos. »
 *
 * D'où l'ordre : le prix, puis le BILAN en deux colonnes (le bien tel qu'il
 * est, tel qu'il sera travaux faits et lots reloués), puis les trois chiffres
 * qui le fondent — surfaces, loyers, travaux — en tuiles à picto, puis l'état
 * locatif, les appréciations, le secteur et l'analyse. Rien de saisissable.
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
const ou = (v: number, f: (x: number) => string) => (v > 0 ? f(v) : "—");

/** Les pictos de la page, au trait, sur une grille de 24. */
const P = {
  prix: <><circle cx="12" cy="12" r="9" /><path d="M14.5 9.2a3 3 0 0 0-5 2.3c0 1.3.8 2 2.5 2.5s2.5 1.2 2.5 2.5a3 3 0 0 1-5 2.3M12 6.5v2M12 15.5v2" /></>,
  m2: <><path d="M4 20V4h16" /><path d="M4 8h3M4 12h3M4 16h3M8 4v3M12 4v3M16 4v3" /><path d="M11 20v-6h6v6" /></>,
  loyer: <><rect x="3" y="7" width="18" height="12" rx="2" /><circle cx="12" cy="13" r="2.6" /><path d="M6 10h.01M18 16h.01" /></>,
  surface: <><path d="M4.5 8V4.5H8M16 4.5h3.5V8M19.5 16v3.5H16M8 19.5H4.5V16" /><path d="M9 12h6M12 9v6" /></>,
  travaux: <><path d="M14.5 5.5 18.5 9.5 9 19H5v-4z" /><path d="M12.5 7.5 16.5 11.5" /><path d="M15 4l5 5" /></>,
  renta: <><path d="M4 18 10 11l4 4 6-8" /><path d="M20 7v5h-5" /></>,
  net: <><path d="M4 18 10 11l4 4 6-8" /><path d="M20 7v5h-5" /><path d="M3 21h18" /></>,
  aem: <><path d="M6 20V9l6-4 6 4v11" /><path d="M10 20v-5h4v5" /><path d="M3 20h18" /></>,
  charges: <><path d="M12 4.2v15.3M8.5 19.5h7" /><path d="M4.5 6.6h15" /><path d="m5.5 6.6-2.7 6.6M5.5 6.6l2.7 6.6M2.8 13.2a2.7 2.7 0 0 0 5.4 0" /><path d="m18.5 6.6-2.7 6.6M18.5 6.6l2.7 6.6M15.8 13.2a2.7 2.7 0 0 0 5.4 0" /></>,
  occupation: <><path d="M3 10.5 12 4l9 6.5" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></>,
};
function Pic({ k, className }: { k: keyof typeof P; className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} aria-hidden>{P[k]}</svg>;
}

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

/* Les deux blocs que les tuiles remplacent : leurs chiffres sont désormais
   mis en avant, les répéter en liste plus bas brouillerait la page. */
const BLOCS_REPRIS = new Set(["L'immeuble ce jour-là", "Charges et travaux"]);

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
  const { actuel, potentiel, identiques } = e.bilan;
  const c = e.cles;
  const deltaLoyers = c.loyers > 0 && c.loyersMax > c.loyers ? Math.round(((c.loyersMax - c.loyers) / c.loyers) * 100) : 0;
  const libres = Math.max(0, c.carrez - c.carrezOcc);

  /** Une ligne du bilan : libellé à picto, valeur actuelle, valeur potentielle. */
  const ligne = (k: keyof typeof P, label: string, a: string, p: string, aide?: string) => (
    <tr key={label}>
      <th><Pic k={k} />{label}{aide && <i>{aide}</i>}</th>
      <td>{a}</td>
      {!identiques && <td className="pot">{p}</td>}
    </tr>
  );

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
          <Pic k="prix" className="elc-prix-pic" />
          <div>
            <span>Prix estimé, honoraires inclus</span>
            <b><V v={eur(e.prix.hai)} cle="prix.hai" ecarts={ecarts} /></b>
          </div>
        </div>
        <div className="elc-prix-trio">
          <div><span>Net vendeur</span><b><V v={eur(e.prix.nv)} cle="prix.nv" ecarts={ecarts} /></b></div>
          <div><span>Honoraires</span><b>{e.prix.honosPct ? pct(e.prix.honosPct) : "—"}</b></div>
          <div><span>Prix au m²</span><b>{e.prix.m2 ? `${nb(e.prix.m2)} €` : "—"}</b></div>
        </div>
      </section>

      {/* ---- Le bilan : actuel / potentiel (#492) ---- */}
      <section className="elc-sec">
        <h2>Ce que le prix donne</h2>
        <div className="elc-tabx">
          <table className="elc-bilan">
            <thead>
              <tr>
                <th />
                <th>
                  <b>Actuel</b>
                  <i>le bien tel qu&apos;il est</i>
                </th>
                {!identiques && (
                  <th className="pot">
                    <b>Potentiel</b>
                    <i>travaux faits, lots reloués</i>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {ligne("prix", "Prix de revient", eur(actuel.prix), eur(potentiel.prix), identiques ? undefined : "prix HAI + travaux")}
              {ligne("m2", "Prix au m²", ou(actuel.prixM2, (x) => `${nb(x)} €`), ou(potentiel.prixM2, (x) => `${nb(x)} €`))}
              {ligne("loyer", "Loyers HC par an", eur(actuel.loyers), eur(potentiel.loyers))}
              {ligne("renta", "Rendement brut", ou(actuel.brut, pct), ou(potentiel.brut, pct), "loyers / prix")}
              {ligne("net", "Rendement net de charges", ou(actuel.net, pct), ou(potentiel.net, pct), "charges non récupérables déduites")}
              {ligne("aem", "Rendement net acte en main", ou(actuel.aem, pct), ou(potentiel.aem, pct), "frais d'acquisition inclus (~7,5 %)")}
            </tbody>
          </table>
        </div>
        {identiques && (
          <p className="elc-bilan-note">Une seule colonne : ni travaux à prévoir, ni loyer potentiel au-dessus des loyers en place.</p>
        )}
      </section>

      {/* ---- Les trois chiffres qui font le prix ---- */}
      <section className="elc-kpis">
        <div className="elc-kpi">
          <Pic k="surface" />
          <div>
            <span>Surfaces</span>
            <b>{ou(c.carrez, (x) => `${nb(x)} m²`)}<small> Carrez</small></b>
            <i>
              {c.lots > 0 ? `${c.lots} lot${c.lots > 1 ? "s" : ""} · ` : ""}
              {c.carrez > 0 ? `${nb(c.carrezOcc)} m² occupés` : "surface non renseignée"}
              {libres > 0 && c.carrez > 0 ? ` · ${nb(libres)} m² libres` : ""}
            </i>
          </div>
          {c.occupation > 0 && <em className="elc-kpi-tag"><Pic k="occupation" />{nb(c.occupation)} % occupé</em>}
        </div>
        <div className="elc-kpi">
          <Pic k="loyer" />
          <div>
            <span>Loyers</span>
            <b>{eur(c.loyers)}<small> HC / an</small></b>
            <i>
              {c.loyersMax > c.loyers
                ? `potentiel ${eur(c.loyersMax)} / an${deltaLoyers > 0 ? ` (+${deltaLoyers} %)` : ""}`
                : "au niveau du potentiel estimé"}
            </i>
          </div>
          {c.loyers > 0 && <em className="elc-kpi-tag">{eur(c.loyers / 12)} / mois</em>}
        </div>
        <div className="elc-kpi">
          <Pic k="travaux" />
          <div>
            <span>Travaux</span>
            <b>{c.travaux > 0 ? eur(c.travaux) : "Aucun"}</b>
            <i>
              {c.travaux > 0
                ? [c.travauxBati > 0 && `bâti ${eur(c.travauxBati)}`, c.travauxLots > 0 && `lots ${eur(c.travauxLots)}`].filter(Boolean).join(" · ") || "montant global"
                : "aucun travaux retenu dans l'estimation"}
            </i>
          </div>
          {c.charges > 0 && <em className="elc-kpi-tag"><Pic k="charges" />{eur(c.charges)} de charges non récup. / an</em>}
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
              {e.cibles.length ? e.cibles.map((x) => <i key={x} className="elc-chip">{x}</i>) : "—"}
            </span>
          </div>
        </div>
      </section>

      {/* ---- Les blocs de saisie, en lecture — hors ceux que les tuiles reprennent ---- */}
      {e.blocs.filter((b) => !BLOCS_REPRIS.has(b.titre)).map((b) => (
        <section className="elc-sec" key={b.titre}>
          <h2>{b.titre}</h2>
          <div className="elc-champs">
            {b.champs.map((ch) => (
              <div className="elc-c" key={ch.label}>
                <span>{ch.label}</span>
                <span className="elc-v">
                  {ch.valeur ?? "—"}
                  {ch.note && <i className="elc-note-txt">{ch.note}</i>}
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
