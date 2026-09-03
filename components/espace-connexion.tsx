"use client";

/**
 * Connexion à l'espace client, et mot de passe oublié.
 *
 * Deux états dans un seul écran plutôt que deux pages : quelqu'un qui a oublié
 * son mot de passe est déjà en train d'échouer, on ne l'envoie pas ailleurs.
 *
 * Aucun message ne dit si l'adresse est connue — ni ici, ni côté serveur. Un
 * formulaire qui répond « adresse inconnue » devient un annuaire des clients
 * de l'agence, à tester une adresse à la fois.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { connexion, motDePasseOublie } from "@/lib/bo/compte-actions";
import type { Reponse } from "@/lib/bo/espace-modele";

export function Connexion() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [oubli, setOubli] = useState(false);
  const [email, setEmail] = useState("");
  const [mdp, setMdp] = useState("");
  const [avis, setAvis] = useState<Reponse | null>(null);

  const valider = () =>
    start(async () => {
      if (oubli) {
        setAvis(await motDePasseOublie(email));
        return;
      }
      const r = await connexion(email, mdp);
      if (r.ok) router.refresh();
      else setAvis(r);
    });

  return (
    <main className="ep-wrap etroit">
      <header className="ep-hd">
        <span className="ep-marque">FRANCE IMMEUBLE</span>
        <h1>Votre espace</h1>
        <p className="ep-sous">
          Vos immeubles, vos recherches et l&apos;avancement de vos dossiers.
        </p>
      </header>

      <section className="ep-bloc">
        <h2>{oubli ? "Mot de passe oublié" : "Connexion"}</h2>
        {oubli && (
          <p className="ep-intro">
            Indiquez l&apos;adresse e-mail de votre espace : nous vous envoyons un lien
            pour en choisir un nouveau.
          </p>
        )}

        <label className="ep-lab" htmlFor="ec-mail">Adresse e-mail</label>
        <input
          id="ec-mail" className="ep-champ" type="email" autoComplete="username"
          value={email} onChange={(e) => { setEmail(e.target.value); setAvis(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") valider(); }}
        />

        {!oubli && (
          <>
            <label className="ep-lab" htmlFor="ec-mdp">Mot de passe</label>
            <input
              id="ec-mdp" className="ep-champ" type="password" autoComplete="current-password"
              value={mdp} onChange={(e) => { setMdp(e.target.value); setAvis(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") valider(); }}
            />
          </>
        )}

        <div className="ep-actions">
          <button className="ep-go" type="button" onClick={valider}
            disabled={pending || !email.includes("@") || (!oubli && mdp.length === 0)}>
            {pending ? "…" : oubli ? "Envoyer le lien" : "Se connecter"}
          </button>
          <button className="ep-lien-b" type="button"
            onClick={() => { setOubli(!oubli); setAvis(null); }}>
            {oubli ? "Revenir à la connexion" : "Mot de passe oublié ?"}
          </button>
        </div>
        {avis && <p className={`ep-avis${avis.ok ? " ok" : " ko"}`}>{avis.message}</p>}

        <p className="ep-fine">
          Votre espace est ouvert par votre conseiller. Si vous n&apos;en avez pas encore,
          appelez-nous au 01.72.87.52.22 — nous vous l&apos;ouvrons en deux minutes.
        </p>
      </section>
    </main>
  );
}
