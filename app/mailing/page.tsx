// Écran Mailing (MAV, 27/10) : les campagnes commerciales ciblées et leur
// suivi — ce qui est parti, ce qui attend, qui a répondu, qui s'est
// désinscrit. Le moteur est dans lib/bo/campagnes.ts.
import { getAgentFiche, getAgents } from "@/lib/bubble/server";
import { messagesTypes } from "@/lib/mails/serveur";
import { campagnes } from "@/lib/bo/campagnes";
import { compteCourant, estDirection } from "@/lib/auth/comptes";
import { masseConfiguree } from "@/lib/bo/mail";
import { Mailing } from "@/components/mailing";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mailing · France Immeuble" };

export default async function PageMailing() {
  const [liste, mt, agents, compte, direction] = await Promise.all([
    campagnes().catch(() => []),
    messagesTypes().catch(() => []),
    getAgents().catch(() => []),
    compteCourant(),
    estDirection(),
  ]);
  /* L'expéditeur d'une campagne, c'est la personne connectée : les réponses
     reviennent dans SA boîte (Reply-To). */
  const actifs = agents.filter((a) => a.actif);
  const moi = (compte ? actifs.find((a) => a.id === compte.agent_id) : undefined)
    ?? actifs.find((a) => a.slug === "marc-antoine") ?? actifs[0];
  const fiche = moi ? await getAgentFiche(moi.id).catch(() => null) : null;
  const s2 = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

  return (
    <Mailing
      campagnes={liste}
      modeles={mt}
      direction={direction}
      relais={masseConfiguree()}
      agent={{
        id: moi?.id ?? "",
        nom: moi?.name ?? "France Immeuble",
        email: s2(fiche?.email),
        telephone: s2(fiche?.["portable (TXT)"]) ?? s2(fiche?.portable),
      }}
    />
  );
}
