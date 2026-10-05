"use client";

// Qui est aux commandes ? (retour #67)
//
// Le BO n'a pas encore d'authentification : les écrans de création prenaient
// donc le premier agent de la liste, classée par nom — d'où Guillaume
// ASTESANA affiché en « suivi par » alors que c'est Marc-Antoine qui saisit.
//
// En attendant une vraie connexion, l'agent aux commandes est retenu sur le
// poste et sert de valeur par défaut partout. Le jour où l'authentification
// arrive, seule cette fonction change.
import { useEffect, useState } from "react";
import { AGENT_DEFAUT_INITIALES as DEFAUT } from "./agent-defaut";

const CLE = "fi.agent-courant";

/**
 * Le slug retenu sur ce poste, ou `null` s'il n'y en a pas : c'est ce que les
 * écrans envoient au serveur pour dire QUI clique (la salve d'un agent est à
 * lui, pas à celui qui suit le bien). Le serveur applique le même défaut que
 * le crochet ci-dessous.
 */
export function agentCourantSlug(): string | null {
  try {
    return window.localStorage.getItem(CLE);
  } catch {
    return null;
  }
}

type Agent = { slug: string; name: string; initials?: string; id?: string };

/** Le slug de l'agent aux commandes, et de quoi en changer. */
export function useAgentCourant(agents: Agent[]) {
  const parDefaut =
    agents.find((a) => a.initials === DEFAUT)?.slug ?? agents[0]?.slug ?? "";
  const [slug, setSlug] = useState(parDefaut);

  // Le stockage local n'existe qu'au navigateur : on le lit après le rendu
  // pour que le serveur et le client affichent d'abord la même chose.
  useEffect(() => {
    try {
      const retenu = window.localStorage.getItem(CLE);
      if (retenu && agents.some((a) => a.slug === retenu)) setSlug(retenu);
    } catch {
      /* navigation privée : on garde la valeur par défaut */
    }
  }, [agents]);

  const choisir = (s: string) => {
    setSlug(s);
    try {
      window.localStorage.setItem(CLE, s);
    } catch {
      /* sans stockage, le choix ne vaut que pour la session en cours */
    }
  };

  return { slug, choisir };
}
