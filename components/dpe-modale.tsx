"use client";

/**
 * Le recensement des DPE d'un immeuble, tel que l'ADEME les publie.
 *
 * MAV : « il faudrait que ce soit une modale dans laquelle il y a le
 * recensement des DPE, pas que cela remplisse en automatique. Une fois les DPE
 * recherchés ils restent tout de même en mémoire. »
 *
 * D'où les trois partis pris de cet écran :
 *
 *   • On RECENSE. Aucun `Type_dpe` de lot n'est touché par la recherche.
 *     L'ADEME rattache un DPE à une adresse, jamais à un numéro de lot : deux
 *     48 m² au même étage sont indiscernables, et une devinette écrite dans une
 *     fiche devient une vérité trois semaines plus tard.
 *
 *   • On GARDE. Le relevé vit dans `fi_dpe`, pas dans le miroir Bubble.
 *     Rouvrir la fenêtre n'appelle plus l'ADEME ; « Actualiser » est un geste
 *     explicite.
 *
 *   • On DISTINGUE « jamais cherché » de « rien trouvé ». Le second est une
 *     information — cet immeuble n'a pas de DPE publié — et le taire ferait
 *     relancer la recherche indéfiniment.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  estPerime, lienObservatoire, lotsPlausibles, repartition, situationDpe, trierDpe,
  type Dpe, type LotSimple, type ReleveDpe,
} from "@/lib/bo/dpe";
import { affecterDpe, chercherDpe, oublierReleveDpe, releveDpe } from "@/lib/bo/dpe-actions";

const dmy = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

export function ModaleDpe({
  immeubleId, adresse, lots, agent, onFermer,
}: {
  immeubleId: string;
  adresse: string;
  lots: LotSimple[];
  agent?: string;
  onFermer: () => void;
}) {
  const [releve, setReleve] = useState<ReleveDpe | null>(null);
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let vivant = true;
    releveDpe(immeubleId)
      .then((r) => { if (vivant) { setReleve(r); setCharge(true); } })
      .catch(() => { if (vivant) { setErreur("Le relevé enregistré n'a pas pu être lu."); setCharge(true); } });
    return () => { vivant = false; };
  }, [immeubleId]);

  const chercher = () => start(async () => {
    setErreur(null);
    try {
      setReleve(await chercherDpe(immeubleId, agent));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'interrogation de l'ADEME a échoué.");
    }
  });

  const oublier = () => start(async () => {
    await oublierReleveDpe(immeubleId);
    setReleve(null);
  });

  const dpe = useMemo(() => trierDpe(releve?.dpe ?? []), [releve]);
  const parts = useMemo(() => repartition(dpe), [dpe]);
  const [maintenant] = useState(() => Date.now());

  return (
    <div className="modal-ov" onClick={onFermer}>
      <div className="modal dpem" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          DPE de l&apos;immeuble — recensement ADEME
          <button type="button" onClick={onFermer}>✕</button>
        </div>

        <div className="modal-b">
          <div className="dpem-src">
            <b>{adresse}</b>
            <span>
              Source : base publique des DPE de l&apos;ADEME (logements existants, depuis
              juillet&nbsp;2021). C&rsquo;est la même que celle des sites d&rsquo;annonces.
            </span>
          </div>

          {!charge && <div className="fempty">Lecture du relevé enregistré…</div>}

          {charge && !releve && (
            <div className="dpem-vide">
              <p>
                <b>Aucune recherche n&apos;a encore été faite</b> sur cet immeuble.
              </p>
              <p>
                L&apos;ADEME publie tous les DPE réalisés depuis juillet 2021 : étiquette
                énergie, étiquette GES, surface, étage. On les recense ici — <b>rien n&apos;est
                écrit sur vos lots</b>, ni maintenant ni après.
              </p>
              <button className="kgo" type="button" disabled={pending} onClick={chercher}>
                <span className="ch">›</span> {pending ? "Interrogation…" : "Chercher les DPE"}
              </button>
            </div>
          )}

          {erreur && <div className="dpem-err">{erreur}</div>}

          {charge && releve && (
            <>
              <div className="dpem-bilan">
                <div className="dpem-chiffre">
                  <b>{dpe.length}</b>
                  <span>DPE publié{dpe.length > 1 ? "s" : ""}</span>
                </div>
                {/* Pastille pleine, et non le badge en flèche de la fiche : la
                    flèche est découpée au `clip-path`, elle avalait le compte. */}
                <div className="dpem-lettres">
                  {parts.map((p) => (
                    <span key={p.lettre} className={`dpem-part d${p.lettre}`}
                      title={`${p.n} DPE en ${p.lettre}`}>
                      {p.lettre}<i>{p.n}</i>
                    </span>
                  ))}
                  {parts.length === 0 && <span className="dpem-rien">aucune étiquette</span>}
                </div>
                <span className="sp" style={{ flex: 1 }} />
                <span className="dpem-quand">
                  Relevé du {dmy(releve.chercheLe)}
                  {releve.adressesTrouvees.length > 1 && (
                    <> · {releve.adressesTrouvees.length} adresses</>
                  )}
                </span>
              </div>

              {dpe.length === 0 && (
                <div className="dpem-vide">
                  <p>
                    <b>Aucun DPE publié à cette adresse.</b> La recherche a bien abouti, elle ne
                    rend rien : soit aucun diagnostic n&apos;a été déposé depuis juillet 2021,
                    soit l&apos;adresse de la fiche ne correspond pas à celle du diagnostiqueur.
                  </p>
                  <p className="dpem-note">
                    Adresse interrogée : <code>{releve.adresseDemandee}</code>
                  </p>
                </div>
              )}

              {dpe.length > 0 && (
                <>
                  <div className="dpem-liste">
                    {dpe.map((d) => (
                      <LigneDpe
                        key={d.id ?? d.numeroDpe} d={d} lots={lots} pending={pending}
                        maintenant={maintenant}
                        onAffecter={(lotId) => start(async () => {
                          if (!d.id) return;
                          await affecterDpe(d.id, lotId, immeubleId, agent);
                          setReleve(await releveDpe(immeubleId));
                        })}
                      />
                    ))}
                  </div>
                  <p className="dpem-note">
                    Le rattachement à un lot est <b>manuel et facultatif</b> : l&apos;ADEME ne
                    connaît pas vos numéros de lot, elle ne connaît qu&apos;une adresse. Quand la
                    surface et l&apos;étage concordent, le lot le plus probable est proposé en
                    tête de liste — c&apos;est une suggestion, pas un rapprochement.
                  </p>
                </>
              )}
            </>
          )}
        </div>

        <div className="modal-f">
          {releve && (
            <button className="fadd" type="button" disabled={pending} onClick={oublier}
              title="Effacer ce relevé — utile si l'adresse de la fiche était fausse au moment de la recherche">
              Oublier ce relevé
            </button>
          )}
          <span className="sp" style={{ flex: 1 }} />
          <button className="fadd" type="button" onClick={onFermer}>Fermer</button>
          {releve && (
            <button className="kgo" type="button" disabled={pending} onClick={chercher}>
              <span className="ch">›</span> {pending ? "Interrogation…" : "Actualiser"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function LigneDpe({ d, lots, pending, maintenant, onAffecter }: {
  d: Dpe;
  lots: LotSimple[];
  pending: boolean;
  maintenant: number;
  onAffecter: (lotId: string | null) => void;
}) {
  /* Les lots sont proposés du plus plausible au moins plausible, mais AUCUN
     n'est présélectionné : la sélection par défaut vaut affectation dès qu'on
     touche autre chose, et c'est exactement ce qu'on ne veut pas. */
  const proposes = useMemo(() => lotsPlausibles(d, lots), [d, lots]);
  const perime = estPerime(d, maintenant);
  const sit = situationDpe(d);

  return (
    <div className={`dpem-l${perime ? " perime" : ""}`}>
      <span className={`dpe-b d${(d.etiquetteDpe ?? "vide").toUpperCase()}`}>{d.etiquetteDpe ?? "—"}</span>
      <span className="dpem-ges" title="Étiquette gaz à effet de serre">GES {d.etiquetteGes ?? "—"}</span>
      <span className="dpem-m2">{d.surface !== undefined ? `${d.surface} m²` : "surface inconnue"}</span>
      <span className="dpem-sit">{sit || "situation non précisée"}</span>
      <span className="dpem-meta">
        {d.typeBatiment === "immeuble" && <b className="dpem-coll">DPE collectif</b>}
        {d.periodeConstruction ? ` ${d.periodeConstruction}` : ""}
        {" · "}{dmy(d.dateEtablissement)}
        {perime && <b className="dpem-per"> · périmé</b>}
      </span>
      <span className="sp" style={{ flex: 1 }} />
      <a className="dpem-lien" href={lienObservatoire(d.numeroDpe)} target="_blank" rel="noreferrer"
        title={`Fiche officielle du DPE ${d.numeroDpe}`}>fiche ↗</a>
      <select className="dpem-lot" value={d.lotId ?? ""} disabled={pending}
        title="Rattacher ce DPE à un lot — facultatif, et jamais automatique"
        onChange={(e) => onAffecter(e.target.value || null)}>
        <option value="">— non rattaché —</option>
        {proposes.map(({ lot, score }) => (
          <option key={lot.id} value={lot.id}>
            {lot.libelle}{score !== undefined && score > 0 ? ` · ${score} %` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
