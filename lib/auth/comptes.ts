import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_SESSION, lireSession, type Role } from "@/lib/auth/jeton";

/**
 * Qui est connecté, et ce qu'il a le droit de faire (MAV, 27/10).
 *
 * Deux rôles : la DIRECTION voit et fait tout ; un AGENT agit sur ses propres
 * dossiers. La liste complète des droits, validée par MAV, est dans
 * docs/AUTORISATIONS.md.
 */

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export type Compte = {
  id: string;
  agent_id: string;
  email: string;
  role: Role;
  actif: boolean;
  user_id: string | null;
  cree_le: string;
  derniere_connexion: string | null;
};

export async function sbComptes(path: string, init?: RequestInit) {
  if (!SB_KEY) throw new Error("Base du BO indisponible (clé Supabase absente).");
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

export async function compteParId(id: string): Promise<Compte | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const r = await sbComptes(`bo_compte?id=eq.${id}&select=*`);
  return ((await r.json()) as Compte[])[0] ?? null;
}

export async function compteParEmail(email: string): Promise<Compte | null> {
  const e = email.trim().toLowerCase();
  if (!e.includes("@")) return null;
  const r = await sbComptes(`bo_compte?email=eq.${encodeURIComponent(e)}&select=*`);
  return ((await r.json()) as Compte[])[0] ?? null;
}

export async function tousLesComptes(): Promise<Compte[]> {
  const r = await sbComptes("bo_compte?select=*&order=cree_le.asc");
  return (await r.json()) as Compte[];
}

/**
 * La connexion est-elle exigée ? Elle l'est quand `BO_AUTH=on` est posé dans
 * Vercel. Avant, le BO reste ouvert comme avant : c'est le temps que chacun
 * choisisse son mot de passe, sans que personne se retrouve à la porte.
 * Revenir à `off` la suspend, en secours.
 */
export const authActive = () => process.env.BO_AUTH?.trim().toLowerCase() === "on";

/**
 * Le compte connecté, relu en base une fois par requête : un compte désactivé
 * ou dont le rôle a changé est pris en compte tout de suite, même si son
 * cookie court encore. `null` hors connexion (crons, Claude, site).
 */
export const compteCourant = cache(async (): Promise<Compte | null> => {
  const s = await lireSession((await cookies()).get(COOKIE_SESSION)?.value);
  if (!s) return null;
  const c = await compteParId(s.c).catch(() => null);
  return c && c.actif ? c : null;
});

/**
 * Vrai pour la direction. Une personne connectée a toujours son vrai rôle ;
 * un poste non connecté n'existe que tant que la connexion n'est pas imposée,
 * et garde alors l'accès d'avant.
 */
export async function estDirection(): Promise<boolean> {
  const c = await compteCourant();
  if (c) return c.role === "direction";
  return !authActive();
}

/** Pour les pages réservées à la direction : un agent revient au tableau de bord. */
export async function exigerDirection() {
  if (!(await estDirection())) redirect("/");
}

/**
 * Un agent ne donne que ce qui est à lui (MAV, 27/10 : « Romain peut me
 * transférer un de ses contacts ou un de ses immeubles mais il ne peut pas
 * aller sur ma dashboard et se transférer un immeuble »). Rend le motif du
 * refus, ou `null` si le changement est permis.
 */
export async function refusChangementAgent(proprietaireActuel: string | null | undefined): Promise<string | null> {
  const c = await compteCourant();
  if (!c || c.role === "direction") return null;
  if (proprietaireActuel && proprietaireActuel !== c.agent_id) {
    return "Ce dossier est suivi par un collègue : seul lui, ou la direction, peut le transférer.";
  }
  return null;
}
