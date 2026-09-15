// Réglage des boîtes e-mail — une par agent.
import { getAgents } from "@/lib/bubble/server";
import { toutesLesBoites } from "@/lib/mails/boites";
import { chiffrementDisponible } from "@/lib/mails/coffre";
import { EcranReglages, type BoiteAffichee } from "@/components/mails/reglages";

export const dynamic = "force-dynamic";

export default async function ReglagesMails() {
  const agents = (await getAgents().catch(() => [])).filter((a) => a.actif);
  const boites = await toutesLesBoites(agents).catch(() => []);

  /* Un agent sans boîte doit apparaître quand même : c'est là qu'il la branche. */
  const lignes: BoiteAffichee[] = agents.map((a) => {
    const b = boites.find((x) => x.agentId === a.id);
    return {
      agentId: a.id,
      agentNom: a.name,
      adresse: b?.adresse,
      nomAffiche: b?.nomAffiche,
      imapHost: b?.imap.host,
      imapPort: b?.imap.port,
      smtpHost: b?.smtp.host,
      smtpPort: b?.smtp.port,
      origine: b?.origine,
    };
  });

  return <EcranReglages boites={lignes} chiffrementOk={chiffrementDisponible()} />;
}
