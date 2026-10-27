"use client";

/**
 * Qui est connecté, côté écran (MAV, 27/10). Le serveur fait foi pour chaque
 * droit ; ce contexte ne sert qu'à ne pas montrer un bouton qui serait refusé.
 *
 * Il retient aussi l'agent connecté comme « agent aux commandes » du poste
 * (lib/bo/agent-courant.ts) : depuis la connexion, ce n'est plus un choix,
 * c'est la personne connectée.
 */
import { createContext, useContext, useEffect, type ReactNode } from "react";

export type SessionEcran = {
  direction: boolean; agentSlug?: string; nom?: string; email?: string;
  /** MAV seul : l'outil de correction et le droit de passer outre (#558). */
  outrepasser?: boolean;
};

const Ctx = createContext<SessionEcran>({ direction: true });

export function SessionProvider({ value, children }: { value: SessionEcran; children: ReactNode }) {
  useEffect(() => {
    if (!value.agentSlug) return;
    try { window.localStorage.setItem("fi.agent-courant", value.agentSlug); } catch { /* poste sans stockage */ }
  }, [value.agentSlug]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
