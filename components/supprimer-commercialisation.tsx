"use client";

// « Tant que les e-mails ne sont pas envoyés je veux pouvoir annuler et
// supprimer une commercialisation » (MAV, 03/11).
//
// Le bouton n'apparaît que sur une commercialisation dont rien n'est parti ;
// le serveur (`supprimerCommercialisation`) refait toutes les vérifications —
// un contrôle qui ne vit que dans le navigateur n'en est pas un.
import { useState, useTransition } from "react";
import { useQuestion } from "@/components/modale";
import { supprimerCommercialisation } from "@/lib/bo/actions";

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Rien n'est parti : ni e-mail, ni SMS, ni RCS. */
export function commercialisationSupprimable(c: Record<string, unknown>): boolean {
  return c.prop_sent !== true
    && n(c.mails_envoyes) === 0
    && !(Array.isArray(c.mails_faits) && c.mails_faits.length > 0)
    && c.prop_sms_sent !== true
    && !c.sms_campagne && !c.rcs_campagne;
}

export function BoutonSupprimerCommercialisation({ c, onFait, libelle = "Annuler et supprimer" }: {
  c: Record<string, unknown>;
  onFait?: (message: string) => void;
  libelle?: string;
}) {
  const { confirmer, question } = useQuestion();
  const [pending, start] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  if (!commercialisationSupprimable(c)) return null;
  const nb = Array.isArray(c.PROPOSITIONs) ? (c.PROPOSITIONs as unknown[]).length : 0;
  return (
    <>
      <button
        type="button" className="fadd cm-suppr" disabled={pending}
        onClick={async (e) => {
          e.stopPropagation();
          const ok = await confirmer(
            <>
              Supprimer cette commercialisation ? Aucun e-mail, SMS ni RCS n&apos;est parti.
              <br /><br />
              {nb > 1 ? `Ses ${nb} propositions sont effacées` : "Sa proposition est effacée"}, et
              chaque recherche visée pourra de nouveau recevoir ce bien.
            </>,
            { titre: "Annuler la commercialisation", oui: "Supprimer", non: "Garder", danger: true },
          );
          if (!ok) return;
          start(async () => {
            setErreur(null);
            const r = await supprimerCommercialisation(String(c._id));
            if (r.ok) onFait?.(r.message);
            else setErreur(r.message);
          });
        }}
      >{pending ? "Suppression…" : libelle}</button>
      {erreur && <div className="dif-simu">{erreur}</div>}
      {question}
    </>
  );
}
