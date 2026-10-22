import Link from "next/link";
import { getContact, mailsDuContact } from "@/lib/bubble/server";
import { ContactFiche } from "@/components/contact-fiche";

export const dynamic = "force-dynamic";

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [d, echanges] = await Promise.all([
    getContact(id).catch(() => null),
    mailsDuContact(id).catch(() => []),
  ]);
  if (!d) {
    return (
      <div style={{ padding: 40 }}>
        Contact introuvable. <Link href="/contacts">← Retour aux contacts</Link>
      </div>
    );
  }
  return <ContactFiche d={d} echanges={echanges} />;
}
