"use client";

// « Valide les textes de tous les immeubles vendus » (MAV, 03/11). Les récits
// ont été relus et récrits ; ce bouton les met en ligne d'un geste, par
// paquets, chacun passant par « Valider et publier » côté serveur.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuestion } from "@/components/modale";
import { publierRecitsRelus } from "@/lib/bo/ventes-site";

export function PublierRecits({ nombre }: { nombre: number }) {
  const { confirmer, question } = useQuestion();
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [bilan, setBilan] = useState<{ publiees: number; restant: number; refus: { commune: string; message: string }[] } | null>(null);
  if (nombre === 0 && !bilan) return null;
  const lancer = async () => {
    if (!(await confirmer(
      <>
        Publier sur le site les {nombre} récits relus ?<br /><br />
        Chacun repasse le contrôle d&apos;anonymat avant de partir. Les chiffres qui ne mettent
        pas la vente en valeur (délais longs, écarts importants avec l&apos;estimation) ont été
        retirés de leur fiche.
      </>,
      { titre: "Publier les récits", oui: "Publier" },
    ))) return;
    setEnCours(true);
    let total = 0;
    const refus: { commune: string; message: string }[] = [];
    let restant = nombre;
    for (let tour = 0; tour < 30 && restant > 0; tour++) {
      const r = await publierRecitsRelus().catch((e) => ({ ok: false as const, message: String(e), publiees: 0, restant: 0, refus: [] }));
      if (!r.ok) { refus.push({ commune: "—", message: r.message }); break; }
      total += r.publiees;
      refus.push(...r.refus);
      restant = r.restant;
      setBilan({ publiees: total, restant, refus: [...refus] });
      if (r.publiees === 0 && r.refus.length === 0) break;
    }
    setEnCours(false);
    router.refresh();
  };
  return (
    <div className="vs-msg">
      {bilan ? (
        <>
          <b>{bilan.publiees} récit{bilan.publiees > 1 ? "s" : ""} publié{bilan.publiees > 1 ? "s" : ""}</b>
          {enCours ? ` — ${bilan.restant} en cours…` : bilan.restant ? `, ${bilan.restant} restant${bilan.restant > 1 ? "s" : ""}.` : "."}
          {bilan.refus.length > 0 && (
            <ul className="vs-refus">{bilan.refus.map((r, i) => <li key={i}>{r.commune} : {r.message}</li>)}</ul>
          )}
        </>
      ) : (
        <>
          <b>{nombre} récits relus</b> sont prêts : textes courts, faits valorisants, structurés pour Google.{" "}
          <button type="button" className="kgo" disabled={enCours} onClick={lancer}>
            <span className="ch">›</span> Publier les {nombre} récits
          </button>
        </>
      )}
      {question}
    </div>
  );
}
