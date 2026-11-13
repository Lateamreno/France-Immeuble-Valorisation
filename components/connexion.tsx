"use client";

/**
 * Les écrans de connexion du BO (MAV, 27/10). Deux gestes seulement : se
 * connecter, ou recevoir un lien pour choisir son mot de passe — la première
 * fois comme en cas d'oubli. Le mot de passe ne transite que vers Supabase
 * Auth ; le BO ne le garde nulle part.
 */
import { useActionState, useState } from "react";
import { changerMonMotDePasse, connecter, definirMotDePasse, demanderLien, type Retour } from "@/lib/auth/actions";

function Cadre({ children, sous }: { children: React.ReactNode; sous: string }) {
  return (
    <main className="cnx">
      <div className="cnx-carte">
        <div className="cnx-marque">France Immeuble</div>
        <p className="cnx-sous">{sous}</p>
        {children}
      </div>
    </main>
  );
}

export function Connexion({ suite }: { suite?: string }) {
  const [mode, setMode] = useState<"connexion" | "lien">("connexion");
  const [rc, entrer, enCours] = useActionState<Retour | null, FormData>(connecter, null);
  const [rl, lien, envoi] = useActionState<Retour | null, FormData>(demanderLien, null);

  if (mode === "lien") {
    return (
      <Cadre sous="Première connexion ou mot de passe oublié">
        <form action={lien} className="cnx-form">
          <label htmlFor="email-l">Votre e-mail professionnel</label>
          <input id="email-l" name="email" type="email" autoComplete="email" required autoFocus />
          <button type="submit" className="kgo" disabled={envoi}>
            <span className="ch">›</span> {envoi ? "Envoi…" : "Recevoir le lien"}
          </button>
          {rl && <p className={rl.ok ? "cnx-ok" : "cnx-err"} role="status">{rl.message}</p>}
        </form>
        <button type="button" className="cnx-lien" onClick={() => setMode("connexion")}>Revenir à la connexion</button>
      </Cadre>
    );
  }
  return (
    <Cadre sous="Back-office">
      <form action={entrer} className="cnx-form">
        <input type="hidden" name="suite" value={suite ?? "/"} />
        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="username" required autoFocus />
        <label htmlFor="mdp">Mot de passe</label>
        <input id="mdp" name="mdp" type="password" autoComplete="current-password" required />
        <button type="submit" className="kgo" disabled={enCours}>
          <span className="ch">›</span> {enCours ? "Connexion…" : "Se connecter"}
        </button>
        {rc && !rc.ok && <p className="cnx-err" role="alert">{rc.message}</p>}
      </form>
      <button type="button" className="cnx-lien" onClick={() => setMode("lien")}>Première connexion ou mot de passe oublié</button>
    </Cadre>
  );
}

export function ChoixMotDePasse({ jeton }: { jeton: string }) {
  const [r, choisir, enCours] = useActionState<Retour | null, FormData>(definirMotDePasse, null);
  if (!jeton) {
    return (
      <Cadre sous="Lien incomplet">
        <p className="cnx-err">Ce lien est incomplet. Demandez-en un nouveau depuis la page de connexion.</p>
        <a className="cnx-lien" href="/connexion">Aller à la connexion</a>
      </Cadre>
    );
  }
  return (
    <Cadre sous="Choisissez votre mot de passe">
      <form action={choisir} className="cnx-form">
        <input type="hidden" name="t" value={jeton} />
        <label htmlFor="mdp">Mot de passe (dix caractères au moins)</label>
        <input id="mdp" name="mdp" type="password" autoComplete="new-password" minLength={10} required autoFocus />
        <label htmlFor="mdp2">Le même, une seconde fois</label>
        <input id="mdp2" name="mdp2" type="password" autoComplete="new-password" minLength={10} required />
        <button type="submit" className="kgo" disabled={enCours}>
          <span className="ch">›</span> {enCours ? "Enregistrement…" : "Enregistrer et entrer"}
        </button>
        {r && !r.ok && <p className="cnx-err" role="alert">{r.message}</p>}
      </form>
    </Cadre>
  );
}

/** « Mon mot de passe » : chacun change le sien, dans le BO, quand il veut. */
export function ChangerMotDePasse() {
  const [r, changer, enCours] = useActionState<Retour | null, FormData>(changerMonMotDePasse, null);
  return (
    <form action={changer} className="cnx-form mdp-page" key={r?.ok ? "fait" : "saisie"}>
      <label htmlFor="actuel">Mot de passe actuel</label>
      <input id="actuel" name="actuel" type="password" autoComplete="current-password" required />
      <label htmlFor="mdp">Nouveau mot de passe (dix caractères au moins)</label>
      <input id="mdp" name="mdp" type="password" autoComplete="new-password" minLength={10} required />
      <label htmlFor="mdp2">Le même, une seconde fois</label>
      <input id="mdp2" name="mdp2" type="password" autoComplete="new-password" minLength={10} required />
      <button type="submit" className="kgo" disabled={enCours}>
        <span className="ch">›</span> {enCours ? "Enregistrement…" : "Changer mon mot de passe"}
      </button>
      {r && <p className={r.ok ? "cnx-ok" : "cnx-err"} role="status">{r.message}</p>}
    </form>
  );
}
