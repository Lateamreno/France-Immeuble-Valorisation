"use client";

/* Réglage des boîtes e-mail, une par agent.
 *
 * Le geste est en deux temps, volontairement : on vérifie, PUIS on enregistre.
 * Enregistrer des identifiants qu'on n'a pas essayés, c'est laisser l'agent
 * croire sa boîte branchée et lui faire découvrir le contraire au premier
 * message qu'il attend.
 */

import { useState, useTransition } from "react";
import { enregistrerBoite, supprimerBoite, verifierBoite } from "@/lib/bo/boite-actions";

export type BoiteAffichee = {
  agentId: string;
  agentNom: string;
  adresse?: string;
  nomAffiche?: string;
  imapHost?: string;
  imapPort?: number;
  smtpHost?: string;
  smtpPort?: number;
  origine?: "base" | "environnement";
};

/* Les réglages des fournisseurs courants : l'agent choisit le sien et ne tape
   que son adresse et son mot de passe. Trois champs de moins à se tromper. */
const FOURNISSEURS: { cle: string; nom: string; imap: string; imapPort: number; smtp: string; smtpPort: number }[] = [
  { cle: "ovh-exchange", nom: "OVH Exchange", imap: "ex5.mail.ovh.net", imapPort: 993, smtp: "ex5.mail.ovh.net", smtpPort: 587 },
  { cle: "ovh", nom: "OVH (mail classique)", imap: "ssl0.ovh.net", imapPort: 993, smtp: "ssl0.ovh.net", smtpPort: 465 },
  { cle: "gmail", nom: "Gmail / Google Workspace", imap: "imap.gmail.com", imapPort: 993, smtp: "smtp.gmail.com", smtpPort: 587 },
  { cle: "microsoft", nom: "Microsoft 365 / Outlook", imap: "outlook.office365.com", imapPort: 993, smtp: "smtp.office365.com", smtpPort: 587 },
  { cle: "autre", nom: "Autre — je saisis les serveurs", imap: "", imapPort: 993, smtp: "", smtpPort: 587 },
];

export function EcranReglages({ boites, chiffrementOk }: {
  boites: BoiteAffichee[];
  chiffrementOk: boolean;
}) {
  return (
    <div className="rgl">
      <header className="rgl-h">
        <h1>Boîtes e-mail</h1>
        <p>
          Chaque commercial branche sa propre boîte. L&apos;application lit et écrit
          directement dessus : un message lu sur le téléphone apparaît lu ici, et un
          message supprimé ici disparaît du téléphone.
        </p>
      </header>

      {!chiffrementOk && (
        <div className="dif-avis" style={{ marginBottom: 16 }}>
          <b>MAIL_CRYPTO_KEY n&apos;est pas posée.</b> Sans elle, un mot de passe ne peut pas
          être chiffré — et je refuse de l&apos;écrire en clair dans la base. Posez cette
          variable dans Vercel (n&apos;importe quelle chaîne longue), puis revenez ici.
        </div>
      )}

      <div className="rgl-liste">
        {boites.map((b) => <Carte key={b.agentId} b={b} actif={chiffrementOk} />)}
      </div>
    </div>
  );
}

function Carte({ b, actif }: { b: BoiteAffichee; actif: boolean }) {
  const [ouvert, setOuvert] = useState(!b.adresse);
  const [fournisseur, setFournisseur] = useState(
    b.imapHost === "ex5.mail.ovh.net" ? "ovh-exchange" : b.imapHost ? "autre" : "ovh-exchange",
  );
  const f = FOURNISSEURS.find((x) => x.cle === fournisseur) ?? FOURNISSEURS[0];

  const [adresse, setAdresse] = useState(b.adresse ?? "");
  const [nomAffiche, setNomAffiche] = useState(b.nomAffiche ?? b.agentNom);
  const [motDePasse, setMotDePasse] = useState("");
  const [imapHost, setImapHost] = useState(b.imapHost ?? f.imap);
  const [imapPort, setImapPort] = useState(String(b.imapPort ?? f.imapPort));
  const [smtpHost, setSmtpHost] = useState(b.smtpHost ?? f.smtp);
  const [smtpPort, setSmtpPort] = useState(String(b.smtpPort ?? f.smtpPort));

  const [verdict, setVerdict] = useState<{ ok: boolean; texte: string } | null>(null);
  const [pending, start] = useTransition();

  const choisirFournisseur = (cle: string) => {
    setFournisseur(cle);
    const x = FOURNISSEURS.find((y) => y.cle === cle);
    if (!x || cle === "autre") return;
    setImapHost(x.imap); setImapPort(String(x.imapPort));
    setSmtpHost(x.smtp); setSmtpPort(String(x.smtpPort));
  };

  const reglage = () => ({
    agentId: b.agentId,
    adresse: adresse.trim(),
    nomAffiche: nomAffiche.trim() || undefined,
    imapHost: imapHost.trim(), imapPort: Number(imapPort) || 993,
    smtpHost: smtpHost.trim(), smtpPort: Number(smtpPort) || 587,
    motDePasse: motDePasse || undefined,
  });

  const verifier = () =>
    start(async () => {
      setVerdict(null);
      const v = await verifierBoite(reglage());
      setVerdict(v.ok
        ? { ok: true, texte: `Connexion réussie. Dossiers reconnus : ${v.dossiers.filter((d) => d.role).map((d) => d.nom).join(", ") || "aucun"}.` }
        : { ok: false, texte: v.erreur });
    });

  const enregistrer = () =>
    start(async () => {
      setVerdict(null);
      try {
        await enregistrerBoite(reglage());
        setMotDePasse("");
        setVerdict({ ok: true, texte: "Boîte enregistrée et vérifiée." });
        setOuvert(false);
      } catch (e) {
        setVerdict({ ok: false, texte: e instanceof Error ? e.message : String(e) });
      }
    });

  return (
    <section className={`rgl-c${b.adresse ? " ok" : ""}`}>
      <header onClick={() => setOuvert(!ouvert)}>
        <b>{b.agentNom}</b>
        {b.adresse
          ? <span className="rgl-adr">{b.adresse}</span>
          : <span className="rgl-non">Aucune boîte branchée</span>}
        {b.origine === "environnement" && (
          <i className="rgl-env" title="Déclarée en variables d'environnement">variables</i>
        )}
        <span style={{ flex: 1 }} />
        <span className="rgl-chev">{ouvert ? "˄" : "˅"}</span>
      </header>

      {ouvert && (
        <div className="rgl-b">
          <div className="rgl-duo">
            <label><span>Fournisseur</span>
              <select value={fournisseur} onChange={(e) => choisirFournisseur(e.target.value)}>
                {FOURNISSEURS.map((x) => <option key={x.cle} value={x.cle}>{x.nom}</option>)}
              </select>
            </label>
            <label><span>Nom affiché</span>
              <input value={nomAffiche} onChange={(e) => setNomAffiche(e.target.value)} />
            </label>
          </div>

          <div className="rgl-duo">
            <label><span>Adresse e-mail</span>
              <input type="email" value={adresse} onChange={(e) => setAdresse(e.target.value)}
                placeholder="prenom.nom@france-immeuble.fr" />
            </label>
            <label><span>Mot de passe</span>
              <input type="password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)}
                placeholder={b.adresse ? "inchangé" : "mot de passe de la boîte"} autoComplete="new-password" />
            </label>
          </div>

          {fournisseur === "autre" && (
            <div className="rgl-quatre">
              <label><span>Serveur IMAP</span>
                <input value={imapHost} onChange={(e) => setImapHost(e.target.value)} /></label>
              <label><span>Port</span>
                <input value={imapPort} onChange={(e) => setImapPort(e.target.value)} /></label>
              <label><span>Serveur SMTP</span>
                <input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} /></label>
              <label><span>Port</span>
                <input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} /></label>
            </div>
          )}

          <p className="rgl-note">
            Réception <b>{imapHost || "—"}:{imapPort}</b> · envoi <b>{smtpHost || "—"}:{smtpPort}</b>.
            Le mot de passe est chiffré avant d&apos;être enregistré et ne redescend jamais
            dans le navigateur.
          </p>

          {verdict && (
            <div className={verdict.ok ? "rgl-ok" : "dif-avis"} style={{ marginTop: 10 }}>{verdict.texte}</div>
          )}

          <div className="rgl-f">
            {b.adresse && (
              <button type="button" className="fadd danger" disabled={pending}
                onClick={() => start(() => supprimerBoite(b.agentId))}>Débrancher</button>
            )}
            <span style={{ flex: 1 }} />
            <button type="button" className="fadd" disabled={pending || !adresse.trim()} onClick={verifier}>
              Vérifier la connexion
            </button>
            <button type="button" className="savebar-go"
              disabled={pending || !actif || !adresse.trim() || (!motDePasse && !b.adresse)}
              onClick={enregistrer}>
              <span className="ch">›</span> Enregistrer
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
