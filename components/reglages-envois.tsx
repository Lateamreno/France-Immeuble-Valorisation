"use client";

// Réglages › Envois : l'état des deux routes (§7.1) et le pont des retours SMS.
//
// MAV : « j'aimerais lancer une commercialisation sur le nouveau BO et vérifier
// que tout soit OK ». Jusqu'ici la vérification se faisait dans les variables
// Vercel, à l'aveugle ; et `brancherRetoursSms` existait sans qu'aucun écran
// ne l'appelle. Ce bloc lit l'état côté serveur (aucune valeur secrète ne
// descend au navigateur : seulement « présent / absent ») et porte le seul
// geste à faire une fois : déclarer nos adresses de réception chez MailingVox.
import { useState, useTransition } from "react";
import { brancherRetoursSms } from "@/lib/bo/actions";

export type EtatEnvois = {
  masse: { configure: boolean; expediteur: string; plafondJour: number };
  sms: {
    configure: boolean;
    message: string;
    expediteur?: string;
    plafond: number;
    numeroStop: string;
    secretWebhook: boolean;
  };
  siteUrl: string | null;
};

function Ligne({ ok, libelle, detail }: { ok: boolean | "info"; libelle: string; detail?: string }) {
  return (
    <li className={`rgl-env-l ${ok === "info" ? "info" : ok ? "ok" : "ko"}`}>
      <span className="rgl-env-p" aria-hidden>{ok === "info" ? "·" : ok ? "✓" : "!"}</span>
      <span>
        <b>{libelle}</b>
        {detail && <> — {detail}</>}
      </span>
    </li>
  );
}

export function ReglagesEnvois({ etat }: { etat: EtatEnvois }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <>
      <h2 className="fsub">Envois : e-mails de masse et SMS</h2>
      <p className="rgl-aide">
        Les deux routes d&apos;une commercialisation. Rien ne part sans un clic dans l&apos;assistant ;
        cet écran dit seulement si le clic aura un effet.
      </p>

      <ul className="rgl-env">
        <Ligne
          ok={etat.masse.configure}
          libelle="E-mails de masse (SendGrid)"
          detail={etat.masse.configure
            ? `expéditeur ${etat.masse.expediteur}, ${etat.masse.plafondJour.toLocaleString("fr-FR")} messages par jour au plus`
            : "relais non configuré : les salves seront refusées, les e-mails un-à-un ne sont pas concernés"}
        />
        <Ligne
          ok={etat.sms.configure}
          libelle="SMS (MailingVox)"
          detail={`${etat.sms.message} Plafond ${etat.sms.plafond} par envoi.`}
        />
        <Ligne
          ok="info"
          libelle={`STOP au ${etat.sms.numeroStop}`}
          detail="numéro annoncé dans chaque message ; à confirmer avec MailingVox avant le premier envoi"
        />
        <Ligne
          ok={etat.sms.secretWebhook}
          libelle="Retours SMS (réponses, STOP, accusés)"
          detail={etat.sms.secretWebhook
            ? "le secret est en place : brancher une fois, ci-dessous"
            : "MAILINGVOX_WEBHOOK_SECRET absente : les réponses et les STOP resteront dans MailingVox, ils ne remonteront pas ici"}
        />
        <Ligne
          ok={!!etat.siteUrl}
          libelle="Adresse publique du BO"
          detail={etat.siteUrl
            ? etat.siteUrl
            : "SITE_URL absente : les liens envoyés par e-mail (espace client) pointent sur l'adresse par défaut"}
        />
      </ul>

      <div className="rgl-env-act">
        <button
          type="button" className="fchip" disabled={pending || !etat.sms.configure || !etat.sms.secretWebhook}
          onClick={() => start(async () => {
            const r = await brancherRetoursSms();
            setMsg((r.ok ? "" : "Échec : ") + r.message);
          })}
        >
          {pending ? "Déclaration…" : "Brancher les retours MailingVox"}
        </button>
        <span className="rgl-aide">
          Déclare chez MailingVox les trois adresses où pousser réponses, STOP et accusés. À faire une
          fois par adresse publique, depuis la production.
        </span>
      </div>
      {msg && <p className={msg.startsWith("Échec") ? "rgl-err" : "rgl-ok"}>{msg}</p>}
    </>
  );
}
