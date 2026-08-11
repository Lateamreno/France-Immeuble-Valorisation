"use client";

// Assistant de commercialisation — reprend l'enchaînement du BO :
// Dossier → Mandat → Acheteurs → E-mails → SMS. Rien n'est envoyé par
// l'outil : il prépare le message et les destinataires, l'agent envoie
// (doctrine de validation humaine avant tout envoi).
import { useMemo, useState, useTransition } from "react";
import type { BienData } from "@/lib/bubble/server";
import { destinataires, paquets, type Acquereur } from "@/lib/bo/matching";
import { dmy, euros } from "@/lib/format";
import { createCommercialisation, markCommercialisationSent } from "@/lib/bo/actions";

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
  const [etape, setEtape] = useState<Etape>("Dossier");
  const [pending, start] = useTransition();
  const [commId, setCommId] = useState<string>();
  const [creees, setCreees] = useState(0);
  const [mailsEnvoyes, setMailsEnvoyes] = useState(false);
  const [smsEnvoyes, setSmsEnvoyes] = useState(false);

  const dossiers = b.dossiers;
  const [dossier, setDossier] = useState(dossierId ?? S(dossiers[0]?._id));
  const mandats = b.mandats;
  const [mandat, setMandat] = useState(S(mandats[0]?._id));
  const [lien, setLien] = useState("");

  const ville = b.ville || "l'immeuble";
  const prixHai = typeof b.im.prix_hai === "number" ? (b.im.prix_hai as number) : undefined;

  const [objet, setObjet] = useState(`Immeuble à vendre à ${ville}`);
  const [message, setMessage] = useState(messageParDefaut(b, lien));
  const [sms, setSms] = useState(smsParDefaut(b));

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
        })),
      });
      setCommId(res.commercialisationId);
      setCreees(res.propositions);
      setEtape("E-mails");
    });

  const copier = (txt: string) => navigator.clipboard?.writeText(txt);

  return (
    <div className="asst">
      <div className="asst-h">
        <span className="asst-t">Nouvelle commercialisation</span>
        <span className="sp" style={{ flex: 1 }} />
        <button className="fadd" type="button" onClick={onFermer}>Fermer</button>
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
                <option key={S(x._id)} value={S(x._id)}>{S(x.titre) || "Dossier"} — {dmy(x["Created Date"])}</option>
              ))}
            </select>
          )}
          <span className="mlab">Lien de partage du dossier</span>
          <input className="min" placeholder="https://… (dossier, photos, plans)" value={lien}
            onChange={(e) => { setLien(e.target.value); setMessage(messageParDefaut(b, e.target.value)); }} />
          <div className="asst-note">
            Le lien est inséré dans le corps de l&apos;e-mail. Préférez un lien expirant : il circulera
            auprès de {dest.emails.length} destinataires.
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
                <option key={S(m._id)} value={S(m._id)}>
                  {S(m.Type) || "Mandat"} {m.numero ? `n°${S(m.numero)}` : "sans numéro"} — {S(m.Statut)}
                </option>
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
            <button className="fadd" type="button" onClick={() => setMessage(messageParDefaut(b, lien))}>Générer le message par défaut</button>
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
          <div className="wnav">
            <span className="sp" style={{ flex: 1 }} />
            <button
              className="fadd" type="button" disabled={pending || smsEnvoyes}
              onClick={() => commId && start(async () => {
                await markCommercialisationSent(String(b.im._id), commId, "sms");
                setSmsEnvoyes(true);
              })}
            >{smsEnvoyes ? "SMS marqués envoyés ✓" : "Marquer les SMS comme envoyés"}</button>
            <button className="kgo" type="button" onClick={onFermer}><span className="ch">›</span> Terminer</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Messages par défaut, fusionnés depuis la fiche ---------- */

function messageParDefaut(b: BienData, lien: string) {
  const im = b.im;
  const n = (v: unknown, s = "") => (typeof v === "number" ? `${Math.round(v).toLocaleString("fr-FR")}${s}` : null);
  const lignes = [
    n(im.surface_carrez, " m² Carrez"),
    typeof im.nb_lots === "number" ? `${im.nb_lots} lots` : null,
    n(im.occupation_lots, " % occupé"),
    typeof im.fin_renta_ba === "number" ? `${im.fin_renta_ba} % de rendement brut` : null,
    euros(im.prix_hai) ? `${euros(im.prix_hai)} honoraires inclus` : null,
  ].filter(Boolean);

  return [
    "Bonjour,",
    "",
    `Nous commercialisons un immeuble de rapport à ${b.ville || "vendre"}${b.adresse ? ` — ${b.adresse}` : ""}.`,
    "",
    ...lignes.map((l) => `• ${l}`),
    "",
    typeof im.descriptif === "string" && im.descriptif ? String(im.descriptif) : "",
    "",
    lien ? `Le dossier complet est disponible ici : ${lien}` : "Le dossier complet est disponible sur demande.",
    "",
    "Ce bien correspond aux critères que vous nous avez communiqués. Je reste à votre disposition",
    "pour organiser une visite ou vous transmettre des éléments complémentaires.",
    "",
    "Bien à vous,",
    "France Immeuble",
  ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}

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
