import { ouvrirVente } from "@/lib/bo/ventes-site";
import { EcranVente } from "@/components/ventes-site";

export const dynamic = "force-dynamic";
/* La réécriture par Claude prend une à deux minutes. */
export const maxDuration = 300;

export default async function VentePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const vente = await ouvrirVente(decodeURIComponent(id));
    return <EcranVente vente={vente} />;
  } catch (e) {
    return (
      <div className="wrap vs">
        <div className="vs-msg ko">{e instanceof Error ? e.message : String(e)}</div>
      </div>
    );
  }
}
