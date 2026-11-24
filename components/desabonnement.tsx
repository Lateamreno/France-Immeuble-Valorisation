"use client";

import { useState, useTransition } from "react";
import { desabonner } from "@/lib/bo/campagnes-actions";

/** La page du lien de désinscription : une carte, un bouton, une réponse. */
export function Desabonnement({ jeton, email }: { jeton: string; email?: string }) {
  const [r, setR] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <main className="cnx">
      <div className="cnx-carte">
        <div className="cnx-marque">France Immeuble</div>
        <p className="cnx-sous">Vos e-mails</p>
        {!email ? (
          <p className="cnx-err">Ce lien n&apos;est pas reconnu. Répondez simplement à notre e-mail en demandant à ne plus en recevoir : c&apos;est pris en compte.</p>
        ) : r?.ok ? (
          <p className="cnx-ok" role="status">{r.message}</p>
        ) : (
          <div className="cnx-form">
            <p className="desabo-t">Ne plus recevoir les e-mails de France Immeuble à l&apos;adresse <b>{email}</b> ?</p>
            <button type="button" className="kgo" disabled={pending}
              onClick={() => start(async () => setR(await desabonner(jeton).catch(() => ({ ok: false, message: "Un souci est survenu, réessayez dans un instant." }))))}>
              <span className="ch">›</span> {pending ? "Un instant…" : "Me désinscrire"}
            </button>
            {r && !r.ok && <p className="cnx-err" role="alert">{r.message}</p>}
          </div>
        )}
      </div>
    </main>
  );
}
