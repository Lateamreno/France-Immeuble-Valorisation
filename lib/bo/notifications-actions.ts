"use server";

/* Ce qui est arrivé depuis le dernier coup d'œil (MAV, 30/10) : les sons du BO.
 *
 * Deux comptes, rien d'autre — l'écran ne reçoit ni nom ni objet :
 *   · les formulaires reçus (immeubles à l'étape « 1 - FORMULAIRE » créés
 *     depuis), pour tout le monde : depuis #513, un formulaire n'est attribué
 *     à personne d'office ;
 *   · les e-mails rangés par la relève dans la boîte de la personne connectée.
 */

import { compteCourant } from "@/lib/auth/comptes";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function compter(table: string, filtre: string): Promise<number> {
  if (!SB_KEY) return 0;
  const res = await fetch(`${SB_URL}/rest/v1/${table}?select=id&${filtre}`, {
    method: "HEAD",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Prefer: "count=exact", Range: "0-0" },
    cache: "no-store",
  }).catch(() => null);
  const total = res?.headers.get("content-range")?.split("/")[1];
  return total && total !== "*" ? parseInt(total, 10) || 0 : 0;
}

async function adresseDe(agentId: string): Promise<string | undefined> {
  if (!SB_KEY) return undefined;
  const res = await fetch(
    `${SB_URL}/rest/v1/fi_boite_agent?select=adresse&actif=eq.true&agent_id=eq.${encodeURIComponent(agentId)}&limit=1`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, cache: "no-store" },
  ).catch(() => null);
  const [l] = res?.ok ? ((await res.json()) as { adresse?: string }[]) : [];
  return l?.adresse?.toLowerCase();
}

export async function nouveautes(depuis: string): Promise<{ formulaires: number; emails: number; maintenant: string }> {
  const maintenant = new Date().toISOString();
  const t = Date.parse(depuis);
  /* Une date absente ou trop ancienne ne rejoue pas toute l'histoire : on ne
     sonne que pour l'heure écoulée, au plus. */
  if (!Number.isFinite(t) || Date.now() - t > 3_600_000) return { formulaires: 0, emails: 0, maintenant };
  const iso = encodeURIComponent(new Date(t).toISOString());
  const moi = await compteCourant();
  const adresse = moi ? await adresseDe(moi.agent_id) : undefined;
  const [formulaires, emails] = await Promise.all([
    compter("bo_immeuble", `data->>Statut=like.${encodeURIComponent("1 *")}&data->>${encodeURIComponent("Created Date")}=gt.${iso}`),
    /* `boite` vaut « adresse/dossier » (une boîte peut avoir plusieurs dossiers relevés). */
    adresse ? compter("fi_mail_entrant", `boite=ilike.${encodeURIComponent(`${adresse}/*`)}&cree_le=gt.${iso}`) : Promise.resolve(0),
  ]);
  return { formulaires, emails, maintenant };
}
