"use client";

/* Réglage des boîtes e-mail, une par agent.
 *
 * Le geste est en deux temps, volontairement : on vérifie, PUIS on enregistre.
 * Enregistrer des identifiants qu'on n'a pas essayés, c'est laisser l'agent
 * croire sa boîte branchée et lui faire découvrir le contraire au premier
 * message qu'il attend.
 */

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  enregistrerBoite, envoisAilleursBoite, rapatrierEnvoisBoite, supprimerBoite, verifierBoite,
} from "@/lib/bo/boite-actions";

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
   que son adresse et son mot de passe. Trois champs de moins à se tromper.
 *
 * Chez France Immeuble il n'y a que deux cas, et l'ordre de cette liste le dit :
 * les boîtes e-mail OVH (pro1.mail.ovh.net) pour tout le monde, et l'Exchange
 * de MAV (ex5.mail.ovh.net). Les deux parlent IMAP 993 en SSL et SMTP 587 en
 * STARTTLS — relevé sur la page « Paramètres POP et IMAP » d'OVH. */
type Fournisseur = {
  cle: string; nom: string; aide?: string;
  imap: string; imapPort: number; smtp: string; smtpPort: number;
};

const FOURNISSEURS: Fournisseur[] = [
  { cle: "ovh-pro", nom: "OVH — boîte e-mail (pro1)",
    aide: "Le cas courant : toutes les boîtes de l'agence sauf l'Exchange de MAV.",
    imap: "pro1.mail.ovh.net", imapPort: 993, smtp: "pro1.mail.ovh.net", smtpPort: 587 },
  { cle: "ovh-exchange", nom: "OVH Exchange (ex5)",
    aide: "La boîte Exchange de MAV.",
    imap: "ex5.mail.ovh.net", imapPort: 993, smtp: "ex5.mail.ovh.net", smtpPort: 587 },
  { cle: "ovh-mutualise", nom: "OVH mutualisé (MX Plan)",
    aide: "Les boîtes livrées avec un hébergement web, pas les boîtes Pro.",
    imap: "ssl0.ovh.net", imapPort: 993, smtp: "ssl0.ovh.net", smtpPort: 465 },
  { cle: "gmail", nom: "Gmail / Google Workspace", imap: "imap.gmail.com", imapPort: 993, smtp: "smtp.gmail.com", smtpPort: 587 },
  { cle: "microsoft", nom: "Microsoft 365 / Outlook", imap: "outlook.office365.com", imapPort: 993, smtp: "smtp.office365.com", smtpPort: 587 },
  { cle: "autre", nom: "Autre — je saisis les serveurs", imap: "", imapPort: 993, smtp: "", smtpPort: 587 },
];

/** Le fournisseur d'une boîte déjà branchée, reconnu à son serveur IMAP. */
const fournisseurDe = (imapHost?: string) =>
  imapHost
    ? FOURNISSEURS.find((f) => f.imap && f.imap === imapHost)?.cle ?? "autre"
    /* Rien de branché : on propose le cas courant de l'agence. */
    : "ovh-pro";

export function EcranReglages({ boites, chiffrementOk }: {
  boites: BoiteAffichee[];
  chiffrementOk: boolean;
}) {
  return (
    <div className="rgl">
      <header className="rgl-h">
        {/* On entre dans les réglages, il faut pouvoir en ressortir
            (retour #129). */}
        <Link className="rgl-retour" href="/mails">
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M20 12H5" /><path d="m11 6-6 6 6 6" />
          </svg>
          Retour aux mails
        </Link>
        <h1>Boîtes e-mail</h1>
        <p>
          Chaque commercial branche sa propre boîte. L&apos;application lit et écrit
          directement dessus : un message lu sur le téléphone apparaît lu ici, et un
          message supprimé ici disparaît du téléphone.
        </p>
        <p>
          Chez nous il n&apos;y a que deux cas : les boîtes e-mail OVH, sur{" "}
          <b>pro1.mail.ovh.net</b>, et l&apos;Exchange de MAV, sur{" "}
          <b>ex5.mail.ovh.net</b>. Dans les deux cas, réception en IMAP 993 (SSL) et
          envoi en 587 (TLS) — il n&apos;y a que l&apos;adresse et le mot de passe à saisir.
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

/* MAV, 19/11/26 : les envois que le BO a rangés dans un doublon du dossier
   d'envoi (« Éléments envoyés » à côté du vrai « Sent Items ») : on dit
   combien il y en a, et on les déplace sur un clic — rien d'automatique. */
function EnvoisAilleurs({ agentId }: { agentId: string }) {
  const [r, setR] = useState<Awaited<ReturnType<typeof envoisAilleursBoite>> | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texte: string } | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    let vivant = true;
    envoisAilleursBoite(agentId).then((x) => { if (vivant) setR(x); }).catch(() => undefined);
    return () => { vivant = false; };
  }, [agentId]);
  if (msg) return <div className={msg.ok ? "rgl-ok" : "dif-avis"} style={{ marginTop: 10 }}>{msg.texte}</div>;
  if (!r?.ok || r.lots.length === 0) return null;
  const total = r.lots.reduce((t, l) => t + l.nombre, 0);
  const depuis = new Date(r.depuis).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  return (
    <div className="dif-avis rgl-ailleurs" style={{ marginTop: 10 }}>
      <span>
        <b>{total} message{total > 1 ? "s envoyés" : " envoyé"} depuis le {depuis} {total > 1 ? "sont" : "est"} dans « {r.lots.map((l) => l.de).join(" », « ")} ».</b>
        Ni le webmail ni le téléphone ne montrent ce dossier comme vos envois. Les déplacer les range dans « {r.lots[0].vers} »,
        pièces jointes comprises ; rien n&apos;est supprimé.
      </span>
      <button type="button" className="fadd" disabled={pending}
        onClick={() => start(async () => {
          const x = await rapatrierEnvoisBoite(agentId).catch(() => ({ ok: false, message: "Le BO n'a pas répondu." }));
          setMsg({ ok: x.ok, texte: x.message });
        })}>
        {pending ? "Déplacement…" : `Les déplacer dans « ${r.lots[0].vers} »`}
      </button>
    </div>
  );
}

function Carte({ b, actif }: { b: BoiteAffichee; actif: boolean }) {
  const [ouvert, setOuvert] = useState(!b.adresse);
  const [fournisseur, setFournisseur] = useState(fournisseurDe(b.imapHost));
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
              {f.aide && <i className="rgl-aide">{f.aide}</i>}
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

          {b.adresse && <EnvoisAilleurs agentId={b.agentId} />}

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
