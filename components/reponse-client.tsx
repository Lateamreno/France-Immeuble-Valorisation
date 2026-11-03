"use client";

import { useState, useTransition } from "react";
import { repondreProposition } from "@/lib/bo/reponse-actions";

/** La page des liens « Intéressé / Pas intéressé » : une carte, un bouton, une réponse. */
export function ReponseClient({ p, r, s, titre, reconnu }: { p: string; r: "oui" | "non"; s: string; titre?: string; reconnu: boolean }) {
  const [res, setRes] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <main className="cnx">
      <div className="cnx-carte">
        <div className="cnx-marque">France Immeuble</div>
        <p className="cnx-sous">Votre réponse</p>
        {!reconnu ? (
          <p className="cnx-err">Ce lien n&apos;est pas reconnu. Répondez simplement à notre e-mail : c&apos;est pris en compte.</p>
        ) : res?.ok ? (
          <p className="cnx-ok" role="status">{res.message}</p>
        ) : (
          <div className="cnx-form">
            <p className="desabo-t">
              {r === "non"
                ? <>Vous n&apos;êtes pas intéressé par {titre} ? Nous ne vous relancerons plus sur ce dossier.</>
                : <>Vous êtes intéressé par {titre} ? Nous vous rappelons rapidement.</>}
            </p>
            <button type="button" className="kgo" disabled={pending}
              onClick={() => start(async () => setRes(await repondreProposition(p, r, s).catch(() => ({ ok: false, message: "Un souci est survenu, réessayez dans un instant." }))))}>
              <span className="ch">›</span> {pending ? "Un instant…" : r === "non" ? "Confirmer : pas intéressé" : "Confirmer : intéressé"}
            </button>
            {res && !res.ok && <p className="cnx-err" role="alert">{res.message}</p>}
          </div>
        )}
      </div>
    </main>
  );
}
