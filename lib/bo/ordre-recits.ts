import "server-only";
// Un ordre de publication des récits relus, exécuté par le cron de chaque minute.
//
// MAV, 04/11 : « publie les 44 récits ». La publication est un geste de la
// direction (bouton « Publier les N récits », écran Ventes du site). Quand MAV
// la donne par écrit plutôt qu'au clic, l'ordre est posé dans `fi_reglages`
// (clé `ordre_publier_recits`, avec qui et quand) et le cron l'exécute, quatre
// ventes par passage, sans rien choisir : seuls les récits DÉJÀ relus partent,
// avec les mêmes contrôles qu'au clic (anonymat, six faits au moins). Une vente
// refusée sort de la file et reste à relire à la main.
//
// L'ordre ne vaut qu'une fois : il s'efface quand la file est vide, et il
// expire au bout de 24 h. Le cron n'en pose jamais lui-même : rien ne part
// sans une décision de MAV (doctrine §7.1).
//
// Pas de "use server" ici : ce fichier ne doit pas devenir une action
// appelable depuis le navigateur.
import { publierRecitsRelus } from "./ventes-site";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CLE = "ordre_publier_recits";
const VALIDITE_MS = 24 * 3600 * 1000;

const entetes = () => ({ apikey: SB_KEY ?? "", Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" });

async function lireOrdre(): Promise<{ maj_le: string; maj_par?: string } | null> {
  if (!SB_KEY) return null;
  const res = await fetch(`${SB_URL}/rest/v1/fi_reglages?cle=eq.${CLE}&select=maj_le,maj_par&limit=1`, { headers: entetes(), cache: "no-store" });
  if (!res.ok) return null;
  return ((await res.json()) as { maj_le: string; maj_par?: string }[])[0] ?? null;
}

async function effacerOrdre() {
  await fetch(`${SB_URL}/rest/v1/fi_reglages?cle=eq.${CLE}`, { method: "DELETE", headers: entetes(), cache: "no-store" }).catch(() => undefined);
}

/** Un passage : rien sans ordre ; sinon un paquet de récits relus, puis l'ordre s'efface quand tout est parti. */
export async function tournerOrdreRecits() {
  const ordre = await lireOrdre();
  if (!ordre) return null;
  if (Date.now() - new Date(ordre.maj_le).getTime() > VALIDITE_MS) {
    await effacerOrdre();
    return { expire: true };
  }
  const r = await publierRecitsRelus(undefined, 4);
  if (r.ok && r.restant === 0) await effacerOrdre();
  return { par: ordre.maj_par, ...r };
}
