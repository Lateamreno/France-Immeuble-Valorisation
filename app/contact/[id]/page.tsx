import Link from "next/link";
import { getContact, mailsDuContact } from "@/lib/bubble/server";
import { ContactFiche } from "@/components/contact-fiche";
import { compteDuContact } from "@/lib/bo/comptes-bo";

export const dynamic = "force-dynamic";

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [d, echanges, compte] = await Promise.all([
    getContact(id).catch(() => null),
    mailsDuContact(id).catch(() => []),
    compteDuContact(id).catch(() => null),
  ]);
  if (!d) {
    return (
      <div style={{ padding: 40 }}>
        Contact introuvable. <Link href="/contacts">← Retour aux contacts</Link>
      </div>
    );
  }
    /* Le secret ne quitte JAMAIS le serveur : on ne passe à l'écran que l'état
     du compte, pas l'empreinte du mot de passe. */
  return (
    <ContactFiche
      d={d} echanges={echanges}
      compte={compte}
    />
  );
}
