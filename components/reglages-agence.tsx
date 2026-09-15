"use client";

// Réglages de l'agence (retour #191).
//
// « C'est pour que tout soit modifié dans le site selon ce que je mettrai là. »
// D'où deux principes tenus ici :
//
//   · rien n'est écrit en dur ailleurs quand ça peut vivre ici — l'identité
//     imprimée sur les documents, le barème d'honoraires, la remise consentie
//     en vente directe au locataire ;
//   · aucun enregistrement ne part sans confirmation, parce qu'un barème
//     changé par mégarde se retrouve sur des mandats signés avant qu'on s'en
//     aperçoive. Le code personnel à six chiffres viendra s'ajouter à cette
//     confirmation quand l'authentification existera.
import { useState, useTransition } from "react";
import { majReglages } from "@/lib/bo/actions";
import { BarreEnregistrer } from "@/components/barre-enregistrer";
import type { Reglages } from "@/lib/bo/reglages";

const CHAMPS_AGENCE: { cle: keyof Reglages["agence"]; label: string; aide?: string; large?: boolean }[] = [
  { cle: "nom", label: "Raison sociale" },
  { cle: "formeCapital", label: "Forme et capital", large: true },
  { cle: "siren", label: "SIREN / RCS" },
  { cle: "siege", label: "Siège social", large: true },
  { cle: "carte", label: "Carte professionnelle", aide: "Imprimée en pied de chaque page de mandat", large: true },
  { cle: "garantie", label: "Garantie financière et RCP", large: true },
  { cle: "representant", label: "Représentant légal" },
  { cle: "telephone", label: "Téléphone" },
  { cle: "email", label: "Adresse de contact" },
  { cle: "site", label: "Site web", aide: "C'est là que le barème est réputé consultable" },
];

export function ReglagesAgence({ initial }: { initial: Reglages }) {
  const [v, setV] = useState<Reglages>(initial);
  const [pending, start] = useTransition();
  const [confirme, setConfirme] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const empreinte = JSON.stringify(v);
  const modifie = empreinte !== JSON.stringify(initial);

  const majAgence = (cle: keyof Reglages["agence"], val: string) =>
    setV((x) => ({ ...x, agence: { ...x.agence, [cle]: val } }));

  const majTranche = (i: number, champ: "jusqua" | "taux" | "minimum", val: string) =>
    setV((x) => ({
      ...x,
      bareme: x.bareme.map((t, j) =>
        j === i ? { ...t, [champ]: val.trim() === "" ? 0 : Number(val.replace(",", ".")) } : t),
    }));

  const enregistrer = () =>
    start(async () => {
      const r = await majReglages(v as unknown as Record<string, unknown>);
      setConfirme(false);
      setMsg(r.ok ? "Réglages enregistrés — ils s'appliquent immédiatement." : `Échec : ${r.message}`);
    });

  return (
    <div className="fiche-main rgl">
      <h1 className="lstx-titre">Réglages de l&apos;agence</h1>
      <p className="rgl-intro">
        Ce qui est saisi ici sert partout : l&apos;identité s&apos;imprime sur les mandats et les dossiers,
        le barème calcule les honoraires de chaque nouveau mandat. Les mandats déjà signés ne bougent
        pas — ils portent les valeurs du jour de leur signature.
      </p>

      <div className="rgl-avert">
        <b>Accès non restreint pour l&apos;instant.</b> Le back-office n&apos;a pas encore
        d&apos;authentification : il n&apos;existe donc pas de compte agent à distinguer du vôtre. Cet
        écran sera réservé à l&apos;admin, et protégé par votre code à six chiffres, le jour où la
        connexion existera.
      </div>

      <h2 className="fsub">L&apos;agence sur les documents</h2>
      <div className="rgl-grid">
        {CHAMPS_AGENCE.map((c) => (
          <label key={c.cle} className={`rgl-ch${c.large ? " large" : ""}`}>
            <span className="l">{c.label}</span>
            <input className="mi" value={v.agence[c.cle]} onChange={(e) => majAgence(c.cle, e.target.value)} />
            {c.aide && <span className="a">{c.aide}</span>}
          </label>
        ))}
      </div>

      <h2 className="fsub">Barème d&apos;honoraires</h2>
      <p className="rgl-aide">
        Depuis l&apos;arrêté du 26 janvier 2022, le barème affiché est un <b>maximum opposable</b> : le
        taux pratiqué peut être inférieur, jamais supérieur. Le minimum s&apos;applique quand le
        pourcentage donne moins que lui.
      </p>
      <table className="rgl-bareme">
        <thead>
          <tr><th>Net vendeur jusqu&apos;à</th><th className="num">Taux TTC</th><th className="num">Minimum TTC</th></tr>
        </thead>
        <tbody>
          {v.bareme.map((t, i) => (
            <tr key={i}>
              <td>
                {Number.isFinite(t.jusqua) ? (
                  <input className="mi" inputMode="numeric" value={String(t.jusqua)}
                    onChange={(e) => majTranche(i, "jusqua", e.target.value)} />
                ) : (
                  <span className="rgl-audela">au-delà</span>
                )}
              </td>
              <td className="num">
                <input className="mi" inputMode="decimal" value={String(t.taux)}
                  onChange={(e) => majTranche(i, "taux", e.target.value)} /> %
              </td>
              <td className="num">
                <input className="mi" inputMode="numeric" value={String(t.minimum)}
                  onChange={(e) => majTranche(i, "minimum", e.target.value)} /> €
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="fsub">Vente directe au locataire</h2>
      <label className="rgl-ch">
        <span className="l">Remise consentie au vendeur</span>
        <input className="mi" inputMode="decimal" value={String(v.remiseLocataire)}
          onChange={(e) => setV((x) => ({ ...x, remiseLocataire: Number(e.target.value.replace(",", ".")) || 0 }))} />
        <span className="a">
          En pourcentage des honoraires. Le prix HAI ne bouge pas : c&apos;est le net vendeur qui monte.
        </span>
      </label>

      {msg && <p className={msg.startsWith("Échec") ? "rgl-err" : "rgl-ok"}>{msg}</p>}

      <BarreEnregistrer
        modifie={modifie} pending={pending} plein
        onEnregistrer={() => setConfirme(true)}
        onAnnuler={() => { setV(initial); setMsg(null); }}
      >
        {modifie ? "Ces réglages s'appliquent à tout le site" : "Tout est enregistré"}
      </BarreEnregistrer>

      {/* La confirmation : un barème changé par mégarde se retrouve sur des
          mandats avant qu'on s'en aperçoive. */}
      {confirme && (
        <div className="modal-ov" onClick={() => setConfirme(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">Confirmer le changement<button type="button" onClick={() => setConfirme(false)}>✕</button></div>
            <div className="modal-b">
              <p>
                Ces réglages pilotent le site entier. Le barème servira à calculer les honoraires de
                <b> tous les mandats créés à partir de maintenant</b> ; l&apos;identité s&apos;imprimera
                sur tous les documents générés.
              </p>
              <p className="rgl-aide">Les mandats déjà signés ne sont pas touchés.</p>
            </div>
            <div className="modal-f">
              <button type="button" className="fchip" onClick={() => setConfirme(false)}>Annuler</button>
              <button type="button" className="savebar-go" disabled={pending} onClick={enregistrer}>
                {pending ? "Enregistrement…" : "Confirmer et enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
