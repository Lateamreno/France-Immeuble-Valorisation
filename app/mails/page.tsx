import { listMails } from "@/lib/bubble/server";
import { MailsEcran } from "@/components/mails";

export const dynamic = "force-dynamic";

export default async function MailsPage() {
  const mails = await listMails().catch(() => []);
  return <MailsEcran mails={mails} />;
}
