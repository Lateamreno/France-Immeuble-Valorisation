"use client";

// Réglages › Envois — l'essai RCS (MAV, 02/11 : « tu l'envoies à moi-même,
// on va voir si ça marche »). Au compte de MAV seulement.
//
// Deux temps, comme tout envoi du BO : on PRÉPARE la carte (ce qui partira,
// mot pour mot), puis on l'envoie d'un clic. Un seul numéro.
import { useState, useTransition } from "react";
import { adresseWebhookRcs, apercuRcs, envoyerRcsEssai } from "@/lib/bo/actions";
import { copierTexte } from "@/components/copier";
import { TelephoneRcs } from "@/components/carte-rcs";

type Carte = {
  titre: string; texte: string; photo?: string; lienDossier?: string; lienPerime?: boolean; repli: string;
};

export function EssaiRcs({ actif }: { actif: boolean }) {
  const [bien, setBien] = useState("");
  const [numero, setNumero] = useState("06 30 76 83 81");
  const [carte, setCarte] = useState<Carte | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <section className="rcs-essai">
      <h3 className="fsub">Essai RCS</h3>
      <p className="rgl-aide">
        La carte « un immeuble correspondant à votre recherche » : photo principale, type, ville,
        surface, renta potentielle, prix HAI, et les boutons Intéressé / Pas intéressé / Télécharger
        le dossier. Collez le lien de la fiche du bien, regardez la carte, puis envoyez-la à un seul
        numéro.
      </p>
      <div className="rcs-champs">
        <input
          className="mi" placeholder="Lien de la fiche du bien" value={bien}
          onChange={(e) => { setBien(e.target.value); setCarte(null); setMsg(null); }}
        />
        <input className="mi rcs-num" inputMode="tel" value={numero} onChange={(e) => setNumero(e.target.value)} />
        <button
          type="button" className="fchip" disabled={pending || !bien.trim()}
          onClick={() => start(async () => {
            setMsg(null);
            const r = await apercuRcs(bien);
            if (r.ok) setCarte(r.carte); else { setCarte(null); setMsg({ ok: false, t: r.message }); }
          })}
        >
          Préparer la carte
        </button>
      </div>

      {carte && (
        <div className="rcs-apercu">
          <TelephoneRcs carte={carte} />
          <div className="rcs-cote">
            {!carte.lienDossier && (
              <p className="rcs-alerte">
                {carte.lienPerime
                  ? "Le lien transfer.it du dossier est périmé (ou expire sous cinq jours) : la carte part sans le bouton « Télécharger le dossier »."
                  : "Aucun lien transfer.it sur les dossiers de ce bien : la carte part sans le bouton « Télécharger le dossier »."}
              </p>
            )}
            <button
              type="button" className="fchip prim" disabled={pending || !actif || !carte.photo}
              onClick={() => start(async () => {
                const r = await envoyerRcsEssai({ bien, numero });
                setMsg(r.ok
                  ? {
                    ok: true,
                    t: `Parti${r.campagne ? ` (campagne MailingVox n° ${r.campagne})` : ""}, par l'agent ${r.agent}. `
                      + (r.proposition
                        ? "La proposition de ce bien à ce numéro recevra le bouton touché."
                        : "Aucune proposition « Envoyée » de ce bien n'attend ce numéro : la réponse restera au journal."),
                  }
                  : { ok: false, t: r.message });
              })}
            >
              {pending ? "Envoi…" : `Envoyer à ${numero}`}
            </button>
          </div>
        </div>
      )}

      <div className="rgl-env-act">
        <button
          type="button" className="fchip" disabled={pending}
          onClick={() => start(async () => {
            const r = await adresseWebhookRcs();
            if (!r.ok) { setMsg({ ok: false, t: r.message }); return; }
            const ok = await copierTexte(r.url);
            setMsg(ok
              ? { ok: true, t: "Adresse copiée. Collez-la chez MailingVox, dans les paramètres du compte, au webhook des réponses RCS." }
              : { ok: false, t: "Le navigateur a refusé la copie." });
          })}
        >
          Copier l&apos;adresse du webhook RCS
        </button>
        <span className="rgl-aide">
          Les boutons touchés et les accusés RCS arrivent sur cette adresse. Leur API ne sait pas la
          déclarer : à coller une fois dans le compte MailingVox. Elle contient la clé de la serrure,
          elle n&apos;est donc jamais affichée.
        </span>
      </div>
      {msg && <p className={msg.ok ? "rgl-ok" : "rgl-err"}>{msg.t}</p>}
    </section>
  );
}
