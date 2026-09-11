"use client";

// Assistant de commercialisation — reprend l'enchaînement du BO :
// Dossier → Mandat → Acheteurs → E-mails → SMS.
//
// Doctrine §7.1, inchangée : l'outil PRÉPARE, l'agent ENVOIE. Les e-mails
// partent du client de messagerie de l'agent ; les SMS peuvent maintenant
// partir d'ici par Twilio, mais seulement derrière un bouton et une
// confirmation qui rappelle le nombre de destinataires et de segments
// facturés. Aucun envoi automatique, jamais.
import { useEffect, useMemo, useState, useTransition } from "react";
import type { BienData } from "@/lib/bubble/server";
import { destinataires, paquets, type Acquereur } from "@/lib/bo/matching";
import { dmy, euros, libelleDossier } from "@/lib/format";
import {
  messageCommercialisation, objetCommercialisation, type BienMail,
} from "@/lib/bo/mail-commercialisation";
import { oublier, useMemoire } from "@/lib/memoire";
import { createCommercialisation, envoyerSmsCommercialisation, etatEnvoiSms, markCommercialisationSent } from "@/lib/bo/actions";

const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const ETAPES = ["Dossier", "Mandat", "Acheteurs", "E-mails", "SMS"] as const;
type Etape = (typeof ETAPES)[number];

export function AssistantCommercialisation({
  b, matchId, dossierId, cibles, onFermer,
}: {
  b: BienData;
  matchId: string;
  dossierId?: string;
  cibles: Acquereur[];
  onFermer: () => void;
}) {
  /* Retour #329 — « fais en sorte qu'on ne puisse pas perdre notre progression
     quand on se balade dans les autres onglets du BO. » Une commercialisation,
     c'est un e-mail rédigé, un SMS relu, un lien de partage collé : sortir de
     la fiche pour vérifier un chiffre suffisait à tout perdre. Toute la saisie
     de l'assistant passe donc par la mémoire d'écran, rangée sous le matching
     auquel elle appartient — deux commercialisations ne se mélangent pas. */
  const memo = `com:${matchId}`;
  const [etape, setEtape] = useMemoire<Etape>(`${memo}:etape`, "Dossier");
  const [pending, start] = useTransition();
  const [commId, setCommId] = useMemoire<string | undefined>(`${memo}:commId`, undefined);
  const [creees, setCreees] = useMemoire(`${memo}:creees`, 0);
  const [mailsEnvoyes, setMailsEnvoyes] = useMemoire(`${memo}:mails`, false);
  const [smsEnvoyes, setSmsEnvoyes] = useMemoire(`${memo}:sms-envoyes`, false);

  const dossiers = b.dossiers;
  const [dossier, setDossier] = useMemoire(`${memo}:dossier`, dossierId ?? S(dossiers[0]?._id));
  const mandats = b.mandats;
  const [mandat, setMandat] = useMemoire(`${memo}:mandat`, S(mandats[0]?._id));
  const [lien, setLien] = useMemoire(`${memo}:lien`, "");

  /* Sortir de l'assistant — « Fermer » comme « Terminer » — referme le
     dossier : la mémoire de CETTE commercialisation est jetée, sinon la
     suivante rouvrirait le message de la précédente. */
  const fermer = () => { oublier(`${memo}:`); onFermer(); };

  const prixHai = typeof b.im.prix_hai === "number" ? (b.im.prix_hai as number) : undefined;

  /* Ce que l'objet et le corps ont besoin de savoir du bien (#357, #358).
     Le rendement POTENTIEL n'est pas en base : on le déduit du rapport entre
     les loyers de marché des lots et les loyers encaissés, appliqué au
     rendement de la fiche. Passer par le rapport plutôt que par un nouveau
     calcul évite de refabriquer la base de prix — et donc d'annoncer un
     chiffre qui contredirait celui affiché sur la carte. */
  const bienMail: BienMail = useMemo(() => {
    const somme = (cle: string, repli?: string) => b.lots.reduce((t, l) => {
      const v = typeof l[cle] === "number" ? (l[cle] as number)
        : repli && typeof l[repli] === "number" ? (l[repli] as number) : 0;
      return t + v;
    }, 0);
    const loyers = somme("loyer");
    const loyersMax = somme("loyer_max", "loyer");
    const renta = typeof b.im.fin_renta_ba === "number" ? b.im.fin_renta_ba : undefined;
    return {
      ville: b.ville,
      codePostal: b.im.adresse_zipcode,
      surfaceCarrez: b.im.surface_carrez,
      prixHai,
      /* La fiche ne remonte pas toujours `prix_hai_m2` : à Lille il est absent
         et l'objet sortait sans prix au m². Le calcul de secours porte sur les
         mêmes deux nombres que Bubble utilise. */
      prixM2: typeof b.im.prix_hai_m2 === "number" ? b.im.prix_hai_m2
        : prixHai && typeof b.im.surface_carrez === "number" && b.im.surface_carrez > 0
          ? prixHai / b.im.surface_carrez
          : undefined,
      occupation: b.im.occupation_lots,
      renta,
      rentaPotentielle: renta !== undefined && loyers > 0
        ? Math.round((renta * loyersMax / loyers) * 10) / 10
        : undefined,
      destinations: b.lots.map((l) => String(l.Destination ?? "")).filter(Boolean),
      agentNom: b.agentNom,
      agentTel: b.agentTel,
    };
  }, [b, prixHai]);

  const [objet, setObjet] = useMemoire(`${memo}:objet`, objetCommercialisation(bienMail));
  const [message, setMessage] = useMemoire(`${memo}:message`, messageCommercialisation(bienMail, lien));
  const [sms, setSms] = useMemoire(`${memo}:sms`, smsParDefaut(b));

  const dest = useMemo(() => destinataires(cibles), [cibles]);
  const lots = paquets(dest.telephones, 50);

  // Alerte du BO : le prix du dossier peut avoir divergé de celui de la fiche.
  const doc = dossiers.find((x) => S(x._id) === dossier);
  const prixDossier = typeof doc?.prix_hai === "number" ? (doc.prix_hai as number) : undefined;
  const man = mandats.find((x) => S(x._id) === mandat);
  const prixMandat = typeof man?.prix_hai === "number" ? (man.prix_hai as number) : undefined;
  const ecart =
    [prixHai, prixDossier, prixMandat].filter((v) => v !== undefined).length > 1 &&
    new Set([prixHai, prixDossier, prixMandat].filter((v) => v !== undefined)).size > 1;

  const creer = () =>
    start(async () => {
      const res = await createCommercialisation({
        immeubleId: String(b.im._id),
        agentId: String(b.im.AGENT ?? "") || undefined,
        matchId,
        dossierId: dossier || undefined,
        mandatId: mandat || undefined,
        lienPartage: lien || undefined,
        objet,
        message,
        smsTexte: sms,
        cibles: cibles.map((a) => ({
          rechercheId: a.rechercheId,
          contactId: a.contactId,
          email: a.email,
          telephone: a.telephone,
          /* Le grade décide de la colonne du dashboard après l'envoi : A/B
             seulement → « Commercialisés aux clients A et B », dès qu'un C, un
             D ou un sans-grade est dedans → « à tous les clients ». */
          note: a.note,
        })),
      });
      setCommId(res.commercialisationId);
      setCreees(res.propositions);
      setEtape("E-mails");
    });

  const copier = (txt: string) => navigator.clipboard?.writeText(txt);

  /* L'état du pont Twilio, demandé à l'ouverture de l'étape SMS. On ne le
     devine pas côté navigateur : les identifiants ne descendent jamais ici. */
  const [pont, setPont] = useState<{ configure: boolean; message: string; plafond: number } | null>(null);
  const [envoi, setEnvoi] = useState<string | null>(null);
  useEffect(() => {
    if (etape !== "SMS" || pont) return;
    let vivant = true;
    etatEnvoiSms().then((e) => { if (vivant) setPont(e); }).catch(() => undefined);
    return () => { vivant = false; };
  }, [etape, pont]);

  /* Doctrine §7.1 : l'application prépare, l'agent envoie. D'où la
     confirmation qui rappelle le nombre exact de destinataires et de segments
     facturés — c'est le dernier moment où l'erreur de ciblage coûte zéro. */
  const envoyerLesSms = () =>
    commId && start(async () => {
      const nb = dest.telephones.length;
      const seg = Math.max(1, Math.ceil(sms.length / 160)) * nb;
      if (!confirm(
        `Envoyer ce SMS à ${nb} numéro${nb > 1 ? "s" : ""} ?\n\n` +
        `Environ ${seg} segment${seg > 1 ? "s" : ""} facturé${seg > 1 ? "s" : ""}. ` +
        "Un SMS parti ne se rattrape pas.",
      )) return;
      const r = await envoyerSmsCommercialisation({
        immeubleId: String(b.im._id), commId, texte: sms, numeros: dest.telephones,
      });
      if (r.ok) {
        setSmsEnvoyes(true);
        setEnvoi(`${r.envoyes} SMS envoyés (${r.segments} segments).`
          + (r.echecs && r.echecs.length ? ` ${r.echecs.length} en échec : ${r.echecs.slice(0, 3).map((x) => `${x.numero} — ${x.raison}`).join(" · ")}` : ""));
      } else {
        setEnvoi(r.message ?? "L'envoi n'a pas abouti.");
      }
    });

  return (
    <div className="asst">
      <div className="asst-h">
        <span className="asst-t">Nouvelle commercialisation</span>
        <span className="sp" style={{ flex: 1 }} />
        <button className="fadd" type="button" onClick={fermer}>Fermer</button>
      </div>

      <div className="asst-steps">
        {ETAPES.map((e, i) => (
          <button
            key={e} type="button"
            className={`${etape === e ? "on" : ""}${ETAPES.indexOf(etape) > i ? " ok" : ""}`}
            disabled={!commId && (e === "E-mails" || e === "SMS")}
            onClick={() => setEtape(e)}
          ><i>{i + 1}</i> {e}</button>
        ))}
      </div>

      {ecart && (
        <div className="asst-alerte">
          ⚠ Informations différentes entre l&apos;immeuble, le dossier et le mandat.
          <div className="asst-cmp">
            <span>Immeuble <b>{euros(prixHai) ?? "n.c."}</b></span>
            <span>Dossier <b>{euros(prixDossier) ?? "n.c."}</b></span>
            <span>Mandat <b>{euros(prixMandat) ?? "n.c."}</b></span>
          </div>
        </div>
      )}

      {etape === "Dossier" && (
        <div className="asst-b">
          <span className="mlab">Dossier de commercialisation</span>
          {dossiers.length === 0 ? (
            <div className="fempty">Aucun dossier généré. Vous pouvez commercialiser sans dossier, mais l&apos;e-mail n&apos;aura rien à joindre.</div>
          ) : (
            <select className="min" value={dossier} onChange={(e) => setDossier(e.target.value)}>
              <option value="">Sans dossier</option>
              {dossiers.map((x) => (
                <option key={S(x._id)} value={S(x._id)}>{libelleDossierChiffre(x)}</option>
              ))}
            </select>
          )}
          {/* Retour #355 — « à côté de la version et de la date tu mettras
              aussi le prix HAI, la renta et le prix au m², en rouge ou vert
              selon si c'est au-dessus ou en dessous du secteur ». Une liste
              déroulante ne sait pas porter de couleur : les chiffres du
              dossier RETENU se lisent donc juste en dessous, colorés. */}
          {doc && <ChiffresDossier d={doc} secteur={b.secteur} />}
          {/* Et la pièce jointe elle-même, « pour qu'on puisse le vérifier
              avant envoi ». Pas de bouton pour la retirer : elle se change à
              la ligne du dessus, c'est le même geste en plus clair. */}
          {doc && <PieceJointe d={doc} />}

          <span className="mlab">
            Lien de partage du dossier
            {/* Retour #354 — le grand encart transfer.it prenait le tiers de
                l'étape pour dire une chose qui tient en un mot. Il devient un
                picto à côté du titre. */}
            <a className="asst-tr-mini" href="https://transfer.it/start" target="_blank" rel="noreferrer"
              title="Déposer les pièces sur transfer.it et récupérer le lien">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 16V4M8 8l4-4 4 4" />
                <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
              </svg>
              Créer un lien transfer.it
            </a>
          </span>
          <input className="min" placeholder="https://… (dossier, photos, plans)" value={lien}
            onChange={(e) => { setLien(e.target.value); setMessage(messageCommercialisation(bienMail, e.target.value)); }} />
          <div className="asst-note">
            Le lien est inséré dans le corps de l&apos;e-mail. Préférez un lien expirant : il circulera
            auprès de {dest.emails.length} destinataires. RGPD : caviardez les baux avant de les
            déposer — le nom, la profession et les coordonnées d&apos;un locataire n&apos;ont rien à
            faire dans un dossier d&apos;acquéreur.
          </div>
          <div className="wnav"><span className="sp" style={{ flex: 1 }} />
            <button className="kgo" type="button" onClick={() => setEtape("Mandat")}><span className="ch">›</span> Continuer</button>
          </div>
        </div>
      )}

      {etape === "Mandat" && (
        <div className="asst-b">
          <span className="mlab">Mandat rattaché</span>
          {mandats.length === 0 ? (
            <div className="fempty">Aucun mandat sur cet immeuble.</div>
          ) : (
            <select className="min" value={mandat} onChange={(e) => setMandat(e.target.value)}>
              <option value="">Sans mandat</option>
              {mandats.map((m) => (
                <option key={S(m._id)} value={S(m._id)}>{libelleMandat(m)}</option>
              ))}
            </select>
          )}
          <div className="wnav">
            <button className="fadd" type="button" onClick={() => setEtape("Dossier")}>← Retour</button>
            <span className="sp" style={{ flex: 1 }} />
            <button className="kgo" type="button" onClick={() => setEtape("Acheteurs")}><span className="ch">›</span> Continuer</button>
          </div>
        </div>
      )}

      {etape === "Acheteurs" && (
        <div className="asst-b">
          <div className="asst-rec">
            <span><b>{cibles.length}</b> acquéreurs ciblés</span>
            <span><b>{dest.emails.length}</b> e-mails</span>
            <span><b>{dest.telephones.length}</b> téléphones</span>
            <span className="off">{cibles.length - dest.joignables.length} injoignables</span>
          </div>
          <div className="asst-note">
            Une proposition sera créée pour chaque acquéreur ciblé, et l&apos;immeuble sera marqué
            « déjà proposé » sur sa recherche — il n&apos;apparaîtra plus dans les prochains matchings.
          </div>
          <span className="mlab">Objet de l&apos;e-mail</span>
          <input className="min" value={objet} onChange={(e) => setObjet(e.target.value)} />
          <span className="mlab">Message</span>
          <textarea className="min" rows={12} value={message} onChange={(e) => setMessage(e.target.value)} />
          <div className="mrow">
            <button className="fadd" type="button" onClick={() => { setObjet(objetCommercialisation(bienMail)); setMessage(messageCommercialisation(bienMail, lien)); }}>Régénérer l&apos;objet et le message</button>
            <button className="fadd" type="button" onClick={() => copier(message)}>Copier le message</button>
          </div>
          <div className="wnav">
            <button className="fadd" type="button" onClick={() => setEtape("Mandat")}>← Retour</button>
            <span className="sp" style={{ flex: 1 }} />
            <button
              className="kgo" type="button" disabled={pending || cibles.length === 0}
              style={pending ? { opacity: 0.5 } : undefined} onClick={creer}
            ><span className="ch">›</span> Créer {cibles.length} propositions</button>
          </div>
        </div>
      )}

      {etape === "E-mails" && (
        <div className="asst-b">
          <div className="asst-ok">✓ {creees} propositions créées.</div>
          <span className="mlab">Destinataires ({dest.emails.length})</span>
          <textarea className="min mono" rows={5} readOnly value={dest.emails.join("; ")} />
          <div className="mrow">
            <button className="fadd" type="button" onClick={() => copier(dest.emails.join("; "))}>Copier les {dest.emails.length} adresses</button>
            <a className="fadd" href={`mailto:?bcc=${encodeURIComponent(dest.emails.join(","))}&subject=${encodeURIComponent(objet)}&body=${encodeURIComponent(message)}`}>
              Ouvrir dans le client mail
            </a>
          </div>
          <div className="asst-note">
            Les adresses sont dédoublonnées : un acquéreur ayant plusieurs recherches ne reçoit qu&apos;un e-mail.
            Utilisez la copie cachée.
          </div>
          <div className="wnav">
            <span className="sp" style={{ flex: 1 }} />
            <button
              className="fadd" type="button" disabled={pending || mailsEnvoyes}
              onClick={() => commId && start(async () => {
                await markCommercialisationSent(String(b.im._id), commId, "mail");
                setMailsEnvoyes(true);
                setEtape("SMS");
              })}
            >{mailsEnvoyes ? "E-mails marqués envoyés ✓" : "Marquer les e-mails comme envoyés"}</button>
          </div>
        </div>
      )}

      {etape === "SMS" && (
        <div className="asst-b">
          <span className="mlab">Message SMS</span>
          <textarea className="min" rows={4} value={sms} onChange={(e) => setSms(e.target.value)} />
          <div className="asst-note">{sms.length} caractères — au-delà de 160, l&apos;opérateur facture plusieurs SMS.</div>

          <span className="mlab">Numéros ({dest.telephones.length}) — {lots.length} paquet{lots.length > 1 ? "s" : ""} de 50</span>
          {lots.length === 0 && <div className="fempty">Aucun numéro exploitable parmi les acquéreurs ciblés.</div>}
          {lots.map((lot, i) => (
            <div className="asst-lot" key={i}>
              <div className="asst-lot-h">
                Paquet {i + 1} — {lot.length} numéros
                <button className="fadd" type="button" onClick={() => copier(lot.join(","))}>Copier les numéros</button>
              </div>
              <textarea className="min mono" rows={3} readOnly value={lot.join(", ")} />
            </div>
          ))}
          <div className="asst-note">
            Numéros normalisés au format international et dédoublonnés. Les saisies inexploitables
            ont été écartées plutôt qu&apos;envoyées telles quelles.
          </div>
          {/* L'envoi direct par Twilio. Il ne remplace pas le marquage manuel :
              beaucoup d'envois se font encore depuis le téléphone de l'agent,
              et il faut pouvoir dire « c'est fait » sans passer par ici. */}
          {pont && (
            <div className={pont.configure ? "asst-note" : "dif-simu"}>
              {!pont.configure && <b>Envoi automatique indisponible</b>}
              {pont.message}
              {pont.configure && ` Plafond par envoi : ${pont.plafond} numéros.`}
            </div>
          )}
          {envoi && <div className="asst-ok">{envoi}</div>}
          <div className="wnav">
            <span className="sp" style={{ flex: 1 }} />
            <button
              className="fadd" type="button" disabled={pending || smsEnvoyes}
              onClick={() => commId && start(async () => {
                await markCommercialisationSent(String(b.im._id), commId, "sms");
                setSmsEnvoyes(true);
              })}
            >{smsEnvoyes ? "SMS marqués envoyés ✓" : "Marquer les SMS comme envoyés"}</button>
            {pont?.configure && (
              <button className="kgo" type="button"
                disabled={pending || smsEnvoyes || dest.telephones.length === 0}
                onClick={envoyerLesSms}>
                <span className="ch">›</span> Envoyer les {dest.telephones.length} SMS
              </button>
            )}
            <button className="fadd" type="button" onClick={fermer}>Terminer</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Ce que porte une ligne de dossier et de mandat ---------- */

const N = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;
const pct = (v: unknown) =>
  N(v) === undefined ? undefined : `${N(v)!.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;

/**
 * Le libellé d'un dossier dans la liste déroulante (retour #355).
 *
 * MAV : « à côté de la version et de la date tu mettras aussi le prix HAI, la
 * renta et le prix au m² ». Choisir entre « Dossier V1 » et « Dossier V2 »
 * sans voir sur quels chiffres ils reposent, c'est choisir à l'aveugle — et
 * c'est ce dossier-là qui part chez les acquéreurs.
 */
function libelleDossierChiffre(d: Record<string, unknown>): string {
  const m2 = N(d.prix_hai) && N(d.surface) ? Math.round(N(d.prix_hai)! / N(d.surface)!) : undefined;
  const bouts = [
    euros(d.prix_hai),
    pct(d.renta_actuelle),
    m2 ? `${m2.toLocaleString("fr-FR")} €/m²` : undefined,
  ].filter(Boolean);
  return bouts.length ? `${libelleDossier(d)} · ${bouts.join(" · ")}` : libelleDossier(d);
}

/**
 * Les chiffres du dossier retenu, colorés face au secteur (#355).
 *
 * Une `<option>` ne sait pas porter de couleur — aucun navigateur ne la
 * stylera de façon fiable. Les chiffres se relisent donc sous la liste, où
 * une pastille verte ou rouge veut dire quelque chose.
 *
 * Attention au sens, il n'est pas le même des deux côtés : sur le PRIX au m²,
 * le vert est EN DESSOUS du secteur ; sur le RENDEMENT, il est AU-DESSUS.
 * Les deux disent « bonne nouvelle pour qui achète », comme sur les cartes du
 * tableau de bord.
 */
function ChiffresDossier({ d, secteur }: { d: Record<string, unknown>; secteur: Record<string, unknown> | null }) {
  const prixM2 = N(d.prix_hai) && N(d.surface) ? N(d.prix_hai)! / N(d.surface)! : undefined;
  const refPrix = N(secteur?.["0 - prix"]);
  const renta = N(d.renta_actuelle);
  const refRenta = N(secteur?.["0 - renta _%"]);

  const couleur = (v?: number, ref?: number, vertEnDessous = true) => {
    if (v === undefined || ref === undefined) return "";
    const sous = v < ref;
    if (Math.abs(v / ref - 1) < 0.005) return "";
    return (vertEnDessous ? sous : !sous) ? " vert" : " rouge";
  };

  return (
    <div className="asst-chiffres">
      {euros(d.prix_hai) && <span className="ac-v">{euros(d.prix_hai)}</span>}
      {prixM2 !== undefined && (
        <span className={`ac-p${couleur(prixM2, refPrix, true)}`}
          title={refPrix ? `Secteur : ${Math.round(refPrix).toLocaleString("fr-FR")} €/m²` : "Pas de prix de secteur relevé"}>
          {Math.round(prixM2).toLocaleString("fr-FR")} €/m²
        </span>
      )}
      {renta !== undefined && (
        <span className={`ac-p${couleur(renta, refRenta, false)}`}
          title={refRenta ? `Secteur : ${refRenta.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : "Pas de rendement de secteur relevé"}>
          {pct(renta)} brut
        </span>
      )}
      {/* MAV : « renta max en général on met la renta potentielle ». Les
          chiffres lui donnent raison — sur 344 dossiers complets, 268 sont
          compatibles avec un calcul « loyers de marché », et 202 sur 344 ont
          un max au-dessus de l'actuel. Lille était l'exception.

          Restent 25 dossiers où le max est INFÉRIEUR à l'actuel, et ce sont
          de vraies anomalies de saisie (Amiens : loyers 84 000 € qui tombent
          à 60 000 € au « max »). On ne les cache pas derrière le mot
          « potentiel » : la pastille le dit. */}
      {N(d.renta_max) !== undefined && renta !== undefined && N(d.renta_max) !== renta && (
        N(d.renta_max)! > renta ? (
          <span className="ac-v off">{pct(d.renta_max)} au potentiel</span>
        ) : (
          <span className="ac-p rouge"
            title={`Le « potentiel » de ce dossier (${pct(d.renta_max)}) est SOUS le rendement actuel (${pct(renta)}) : `
              + "les loyers de marché saisis sont inférieurs aux loyers en place. À vérifier dans l'état locatif."}>
            {pct(d.renta_max)} « potentiel » — incohérent
          </span>
        )
      )}
    </div>
  );
}

/**
 * La pièce jointe du dossier retenu (#355 : « qu'on puisse le vérifier avant
 * envoi », #359 : « on devrait voir la PJ qui va être envoyée avec le poids »).
 *
 * Le poids n'est pas en base. Il se demande au fichier lui-même, par une
 * requête `HEAD` : c'est une info que seul le serveur qui l'héberge connaît,
 * et elle décide de la délivrabilité de la salve.
 */
function PieceJointe({ d }: { d: Record<string, unknown> }) {
  const url = [d.pdf, d.FILE].map(S).find((u) => u.length > 0);
  const [poids, setPoids] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    if (!url) return;
    let vivant = true;
    const abs = url.startsWith("//") ? `https:${url}` : url;
    fetch(abs, { method: "HEAD" })
      .then((r) => {
        const l = Number(r.headers.get("content-length"));
        if (vivant) setPoids(Number.isFinite(l) && l > 0 ? l : null);
      })
      .catch(() => { if (vivant) setPoids(null); });
    return () => { vivant = false; };
  }, [url]);

  if (!url) {
    return <div className="asst-note">Ce dossier n&apos;a pas de PDF rattaché : l&apos;e-mail partira sans pièce jointe.</div>;
  }
  const abs = url.startsWith("//") ? `https:${url}` : url;
  const mo = typeof poids === "number" ? poids / 1_048_576 : undefined;
  return (
    <a className={`asst-pj${mo !== undefined && mo > 3 ? " lourd" : ""}`} href={abs} target="_blank" rel="noreferrer">
      <span className="asst-pj-i" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6" /></svg>
      </span>
      <span className="asst-pj-t">
        <b>{libelleDossier(d)} — ouvrir la pièce jointe</b>
        {/* Trois états, pas deux : « en cours », « connu », et « refusé ». Le
            serveur qui héberge le PDF peut très bien répondre sans autoriser
            la lecture de l'en-tête depuis le navigateur — laisser « en cours
            de lecture » pour toujours serait le pire des trois. */}
        {poids === undefined ? "Lecture du poids…"
          : poids === null ? "Poids non communiqué par l'hébergeur — ouvrez la pièce pour le vérifier."
          : mo! > 3 ? `${mo!.toFixed(1)} Mo — au-delà de 3 Mo, la délivrabilité chute.`
          : `${mo!.toFixed(1)} Mo`}
      </span>
    </a>
  );
}

/**
 * Le libellé d'un mandat dans la liste (retour #356).
 *
 * MAV : « à côté du numéro de mandat et du statut tu mettras le prix hai, le
 * montant des honos en % et la date de signature ». La date retenue est
 * `date_effet` — le miroir Bubble n'a pas de champ « signé le », et c'est
 * elle que le mandat porte comme point de départ.
 */
function libelleMandat(m: Record<string, unknown>): string {
  const tete = `${S(m.Type) || "Mandat"} ${m.numero ? `n°${S(m.numero)}` : "sans numéro"} — ${S(m.Statut)}`;
  const bouts = [
    euros(m.prix_hai),
    N(m.honos_taux) !== undefined ? `${pct(m.honos_taux)} d'honoraires` : undefined,
    dmy(m.date_effet) ? `effet ${dmy(m.date_effet)}` : undefined,
  ].filter(Boolean);
  return bouts.length ? `${tete} · ${bouts.join(" · ")}` : tete;
}

/* ---------- Messages par défaut, fusionnés depuis la fiche ---------- */


function smsParDefaut(b: BienData) {
  const im = b.im;
  const bits = [
    `Immeuble à vendre ${b.ville || ""}`.trim(),
    typeof im.surface_carrez === "number" ? `${Math.round(im.surface_carrez as number)} m²` : "",
    typeof im.fin_renta_ba === "number" ? `${im.fin_renta_ba} % brut` : "",
    euros(im.prix_hai) ?? "",
  ].filter(Boolean);
  return `${bits.join(" · ")} — dossier sur demande. France Immeuble. STOP au 36111`;
}
