"use client";

/**
 * Le choix du mot de passe.
 *
 * Une seule case, et une règle unique : douze caractères. Pas de majuscule
 * obligatoire, pas de chiffre imposé — les règles de composition produisent
 * « Motdepasse1! », que tout le monde devine, alors que la longueur protège
 * vraiment. On le dit à l'écran plutôt que de le faire deviner, et on propose
 * de voir ce qu'on tape : un mot de passe masqué mal tapé, c'est un compte
 * qu'on n'ouvre jamais.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { poserMotDePasse } from "@/lib/bo/espace-client-actions";
import type { Reponse } from "@/lib/bo/espace-modele";

export function PoserMotDePasse({ jeton, usage }: {
  jeton: string; usage: "activation" | "reinitialisation";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mdp, setMdp] = useState("");
  const [vu, setVu] = useState(false);
  const [avis, setAvis] = useState<Reponse | null>(null);

  const assezLong = mdp.length >= 12;

  return (
    <main className="ep-wrap etroit">
      <header className="ep-hd">
        <span className="ep-marque">FRANCE IMMEUBLE</span>
        <h1>{usage === "activation" ? "Bienvenue dans votre espace" : "Nouveau mot de passe"}</h1>
      </header>

      <section className="ep-bloc">
        <p className="ep-intro">
          {usage === "activation"
            ? "Choisissez un mot de passe : il vous servira à revenir sur votre espace quand vous voudrez."
            : "Choisissez votre nouveau mot de passe."}
        </p>

        <label className="ep-lab" htmlFor="ea-mdp">Mot de passe</label>
        <div className="ep-mdp">
          <input
            id="ea-mdp" className="ep-champ" type={vu ? "text" : "password"}
            autoComplete="new-password" value={mdp}
            onChange={(e) => { setMdp(e.target.value); setAvis(null); }}
            onKeyDown={(e) => { if (e.key === "Enter" && assezLong) document.getElementById("ea-go")?.click(); }}
          />
          <button type="button" onClick={() => setVu(!vu)}>{vu ? "Masquer" : "Voir"}</button>
        </div>
        <p className={`ep-regle${assezLong ? " ok" : ""}`}>
          {assezLong ? "✓ C'est bon." : `Au moins 12 caractères — une petite phrase fait très bien l'affaire (${mdp.length}/12).`}
        </p>

        <div className="ep-actions">
          <button id="ea-go" className="ep-go" type="button" disabled={pending || !assezLong}
            onClick={() => start(async () => {
              const r = await poserMotDePasse(jeton, mdp);
              if (r.ok) router.replace("/espace");
              else setAvis(r);
            })}>
            {pending ? "…" : "Entrer dans mon espace"}
          </button>
        </div>
        {avis && <p className={`ep-avis${avis.ok ? " ok" : " ko"}`}>{avis.message}</p>}
      </section>
    </main>
  );
}
