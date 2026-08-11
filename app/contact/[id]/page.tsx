import Link from "next/link";
import { getContact } from "@/lib/bubble/server";
import { ContactFiche } from "@/components/contact-fiche";

export const dynamic = "force-dynamic";

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getContact(id).catch(() => null);
  if (!d) {
    return (
      <div style={{ padding: 40 }}>
        Contact introuvable. <Link href="/contacts">← Retour aux contacts</Link>
      </div>
    );
  }
  return <ContactFiche d={d} />;
}
