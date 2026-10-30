import Link from "next/link";
import { SocieteFiche } from "@/components/societe-fiche";
import { chargerSocietesNommees } from "@/lib/bo/societes-actions";
import { immeublesDeSociete, mandatsDeSociete } from "@/lib/bo/societes-lecture";

export const dynamic = "force-dynamic";

const S = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "");

/**
 * La fiche d'une société (retour #489) : son identité, ses associés avec leur
 * fonction, les immeubles qu'elle détient et les mandats qu'elle a signés.
 * Elle n'a ni liste ni entrée de menu : on y arrive depuis la personne, le
 * bien ou le mandat — c'est une entité de facturation et de signature, pas
 * un répertoire.
 */
export default async function SocietePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [s] = await chargerSocietesNommees([id]).catch(() => []);
  if (!s) {
    return (
      <div style={{ padding: 40 }}>
        Société introuvable. <Link href="/contacts">← Retour aux contacts</Link>
      </div>
    );
  }
  const [immeubles, mandats] = await Promise.all([
    immeublesDeSociete(id).catch(() => []),
    mandatsDeSociete(s).catch(() => []),
  ]);
  return (
    <SocieteFiche
      s={s}
      immeubles={immeubles.map((im) => ({
        id: String(im._id),
        libelle: `${S(im.adresse_ville)} — ${[S(im.adresse_numero_rue), S(im.adresse_rue)].filter(Boolean).join(" ")}`.trim(),
        statut: S(im.Statut).replace(/^\d+ - /, ""),
      }))}
      mandats={mandats.map((m) => ({
        id: String(m._id),
        immeubleId: Array.isArray(m.IMMEUBLEs) ? String((m.IMMEUBLEs as unknown[])[0] ?? "") : "",
        numero: m.numero !== undefined && m.numero !== null && m.numero !== "" ? String(m.numero) : undefined,
        date: S(m.date_signature ?? m["Created Date"]).slice(0, 10).split("-").reverse().join("/"),
        statut: S(m.Statut),
      }))}
    />
  );
}
