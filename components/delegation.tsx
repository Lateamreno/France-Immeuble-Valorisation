"use client";

/**
 * Délégations de mandat (MAV, 10/11) : « dans l'onglet mandat on puisse
 * ajouter les délégations et que ça compte donc comme un mandat. On indique
 * juste la date de signature, les honos et le pourcentage de partage d'honos
 * puis on ajoute le mandat en PDF. »
 *
 * Un bouton à côté de « + Ajouter un mandat », une fenêtre de quatre cases.
 * La même fenêtre corrige une délégation déjà enregistrée (le PDF n'est alors
 * redemandé que pour le remplacer).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modale } from "@/components/modale";
import { Champ } from "@/components/champ";
import { ajouterDelegation, modifierDelegation } from "@/lib/bo/actions";
import { euros } from "@/lib/format";

type Doc = Record<string, unknown>;

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() ? Number(v) : NaN);

/** La part de France Immeuble, en euros : honoraires × partage. */
export function partFi(m: Doc): number | undefined {
  const h = num(m.honos_ttc), p = num(m.partage_honos_pct);
  return Number.isFinite(h) && Number.isFinite(p) ? Math.round((h * p) / 100) : undefined;
}

export const estDelegation = (m: Doc) => m.delegation === true || String(m.Type ?? "") === "Délégation";

function FenetreDelegation({ immeubleId, m, onFermer }: { immeubleId: string; m?: Doc; onFermer: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [date, setDate] = useState(() => (typeof m?.date_signature === "string" ? m.date_signature.slice(0, 10) : new Date().toISOString().slice(0, 10)));
  const [honos, setHonos] = useState(() => (Number.isFinite(num(m?.honos_ttc)) ? String(num(m?.honos_ttc)) : ""));
  const [partage, setPartage] = useState(() => (Number.isFinite(num(m?.partage_honos_pct)) ? String(num(m?.partage_honos_pct)) : "50"));
  const [fichier, setFichier] = useState<File | null>(null);

  const h = Number(honos.replace(/\s/g, "").replace(",", "."));
  const p = Number(partage.replace(",", "."));
  const part = h > 0 && p > 0 ? Math.round((h * p) / 100) : undefined;

  const enregistrer = () => {
    setErreur(null);
    const fd = new FormData();
    fd.set("date", date);
    fd.set("honos", honos);
    fd.set("partage", partage);
    if (fichier) fd.set("file", fichier);
    start(async () => {
      const r = m
        ? await modifierDelegation(String(m._id), immeubleId, fd)
        : await ajouterDelegation(immeubleId, fd);
      if (!r.ok) { setErreur(r.message); return; }
      router.refresh();
      onFermer();
    });
  };

  return (
    <Modale
      titre={m ? `Délégation de mandat${m.numero ? ` n° ${String(m.numero)}` : ""}` : "Ajouter une délégation de mandat"}
      onFermer={onFermer}
      largeur={520}
      pied={(
        <>
          <button type="button" className="fbtn" onClick={onFermer}>Annuler</button>
          <button type="button" className="kgo" disabled={pending || (!m && !fichier)} onClick={enregistrer}>
            <span className="ch">›</span> {pending ? "Enregistrement…" : m ? "Enregistrer" : "Ajouter la délégation"}
          </button>
        </>
      )}
    >
      <div className="dlg-grille">
        <Champ libelle="Date de signature" obligatoire>
          <input className="mi" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Champ>
        <Champ libelle="Honoraires TTC" obligatoire aide="Les honoraires de l'opération, en euros.">
          <input className="mi" inputMode="decimal" value={honos} placeholder="ex. 30 000" onChange={(e) => setHonos(e.target.value)} />
        </Champ>
        <Champ libelle="Partage des honoraires" obligatoire aide={part !== undefined ? `Soit ${euros(part)} pour France Immeuble.` : "La part qui revient à France Immeuble, en %."}>
          <input className="mi" inputMode="decimal" value={partage} onChange={(e) => setPartage(e.target.value)} />
        </Champ>
        <Champ libelle={m ? "Remplacer le PDF de la délégation" : "La délégation signée (PDF)"} obligatoire={!m} large>
          <input type="file" accept="application/pdf" onChange={(e) => setFichier(e.target.files?.[0] ?? null)} />
        </Champ>
      </div>
      <p className="dlg-note">
        {m
          ? "Le numéro au registre ne change pas."
          : "La délégation compte comme un mandat signé : elle prend le prochain numéro du registre des mandats, définitivement."}
      </p>
      {erreur && <div className="dif-simu">{erreur}</div>}
    </Modale>
  );
}

/** Le bouton de l'onglet Mandats. */
export function AjouterDelegation({ immeubleId }: { immeubleId: string }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <button className="fbtn" type="button" onClick={() => setOuvert(true)}>+ Ajouter une délégation</button>
      {ouvert && <FenetreDelegation immeubleId={immeubleId} onFermer={() => setOuvert(false)} />}
    </>
  );
}

/** « Modifier » sur la ligne d'une délégation. */
export function ModifierDelegation({ immeubleId, m }: { immeubleId: string; m: Doc }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <button className="fbtn" type="button" onClick={() => setOuvert(true)}>Modifier</button>
      {ouvert && <FenetreDelegation immeubleId={immeubleId} m={m} onFermer={() => setOuvert(false)} />}
    </>
  );
}
