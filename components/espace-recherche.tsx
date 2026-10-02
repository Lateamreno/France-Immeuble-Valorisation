"use client";

/**
 * Les critères de l'acquéreur, qu'il remplit lui-même.
 *
 * MAV : « le client pourra se connecter et remplir sa recherche ». C'est la
 * moitié utile de l'espace côté acquéreur : une recherche à jour vaut mieux
 * que dix relances, et personne ne connaît mieux ses critères que lui.
 *
 * Trois partis pris :
 * - **Tout est facultatif.** Un acquéreur qui ne sait pas encore sa surface
 *   cible doit pouvoir dire sa ville et s'arrêter là. Une case obligatoire
 *   n'obtient pas une réponse, elle obtient un abandon.
 * - **Des fourchettes, pas des nombres exacts.** Personne ne cherche « 412 m² » :
 *   on cherche entre tant et tant, et c'est ce que le matching sait exploiter.
 * - **Une recherche, pas dix.** S'il en a plusieurs, elles s'affichent toutes,
 *   mais on n'en modifie qu'une à la fois — un formulaire par recherche, sans
 *   onglets à comprendre.
 */

import { useState, useTransition } from "react";
import { majRecherche } from "@/lib/bo/espace-client-actions";
import type { RechercheClient } from "@/lib/bo/espace-anon";
import type { Reponse } from "@/lib/bo/espace-modele";

const DESTINATIONS = ["Logement", "Commerce", "Bureau", "Logistique"];

const nombre = (s: string) => {
  const n = parseFloat(s.replace(/[^\d.,-]/g, "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
const chiffres = (s: string) => {
  const c = s.replace(/\D/g, "").slice(0, 12);
  return c ? Number(c).toLocaleString("fr-FR") : "";
};

const VIDE: RechercheClient = {
  id: "", villes: [], dpts: [], destinations: [],
  surfaceMin: null, surfaceMax: null, prixMin: null, prixMax: null,
  renta: null, commentaire: "", enPause: false,
};

export function FormRecherche({ recherches }: { recherches: RechercheClient[] }) {
  const [ouvert, setOuvert] = useState(recherches.length === 0);
  const liste = recherches.length > 0 ? recherches : [VIDE];

  return (
    <section className="ep-bloc">
      <h2>{recherches.length > 1 ? "Vos recherches" : "Votre recherche"}</h2>
      <p className="ep-intro">
        Dites-nous ce que vous cherchez : nous vous enverrons ce qui correspond, et
        rien d&apos;autre. Tout est facultatif — même une ville seule nous aide.
      </p>
      {!ouvert && recherches.length > 0 ? (
        <>
          <ul className="ep-rech">
            {recherches.map((r) => <Resume key={r.id} r={r} />)}
          </ul>
          <button className="ep-lien-b" type="button" onClick={() => setOuvert(true)}>
            Modifier mes critères
          </button>
        </>
      ) : (
        liste.map((r) => <Champs key={r.id || "neuve"} r={r} />)
      )}
    </section>
  );
}

function Resume({ r }: { r: RechercheClient }) {
  const lieux = r.villes.length ? r.villes.join(", ")
    : r.dpts.length ? r.dpts.join(", ") : "France entière";
  const f = (min: number | null, max: number | null, u: string) => {
    if (min == null && max == null) return null;
    const n = (v: number) => v.toLocaleString("fr-FR");
    if (min != null && max != null) return `de ${n(min)} à ${n(max)} ${u}`;
    return min != null ? `à partir de ${n(min)} ${u}` : `jusqu'à ${n(max!)} ${u}`;
  };
  return (
    <li className={r.enPause ? "pause" : ""}>
      <b>{lieux}</b>
      {r.destinations.length > 0 && <i>{r.destinations.join(" · ")}</i>}
      <div className="ep-crit">
        {f(r.surfaceMin, r.surfaceMax, "m²") && <span>Surface {f(r.surfaceMin, r.surfaceMax, "m²")}</span>}
        {f(r.prixMin, r.prixMax, "€") && <span>Budget {f(r.prixMin, r.prixMax, "€")}</span>}
        {r.renta != null && <span>Rendement {r.renta.toLocaleString("fr-FR")} % minimum</span>}
      </div>
      {r.commentaire && <p className="ep-mot">{r.commentaire}</p>}
      {r.enPause && <span className="ep-badge gris">Recherche en pause</span>}
    </li>
  );
}

function Champs({ r }: { r: RechercheClient }) {
  const [pending, start] = useTransition();
  const [villes, setVilles] = useState(r.villes.join(", "));
  const [dest, setDest] = useState<string[]>([...r.destinations]);
  const [sMin, setSMin] = useState(r.surfaceMin != null ? String(r.surfaceMin) : "");
  const [sMax, setSMax] = useState(r.surfaceMax != null ? String(r.surfaceMax) : "");
  const [pMin, setPMin] = useState(r.prixMin != null ? r.prixMin.toLocaleString("fr-FR") : "");
  const [pMax, setPMax] = useState(r.prixMax != null ? r.prixMax.toLocaleString("fr-FR") : "");
  const [renta, setRenta] = useState(r.renta != null ? String(r.renta) : "");
  const [mot, setMot] = useState(r.commentaire);
  const [avis, setAvis] = useState<Reponse | null>(null);

  const bascule = (d: string) =>
    setDest((v) => (v.includes(d) ? v.filter((x) => x !== d) : [...v, d]));

  return (
    <div className="ep-form">
      <label className="ep-lab" htmlFor={`r-villes-${r.id}`}>Où cherchez-vous ?</label>
      <input id={`r-villes-${r.id}`} className="ep-champ" value={villes}
        onChange={(e) => { setVilles(e.target.value); setAvis(null); }}
        placeholder="Lille, Roubaix, Tourcoing — ou laissez vide pour la France entière" />

      <span className="ep-lab">Quel type de bien ?</span>
      <div className="ep-puces">
        {DESTINATIONS.map((d) => (
          <button key={d} type="button" className={dest.includes(d) ? "on" : ""}
            onClick={() => { bascule(d); setAvis(null); }}>{d}</button>
        ))}
      </div>

      <div className="ep-duo">
        <div>
          <label className="ep-lab" htmlFor={`r-smin-${r.id}`}>Surface, de</label>
          <div className="ep-unite">
            <input id={`r-smin-${r.id}`} className="ep-champ" inputMode="numeric" value={sMin}
              onChange={(e) => setSMin(e.target.value.replace(/\D/g, ""))} placeholder="—" />
            <span>m²</span>
          </div>
        </div>
        <div>
          <label className="ep-lab" htmlFor={`r-smax-${r.id}`}>à</label>
          <div className="ep-unite">
            <input id={`r-smax-${r.id}`} className="ep-champ" inputMode="numeric" value={sMax}
              onChange={(e) => setSMax(e.target.value.replace(/\D/g, ""))} placeholder="—" />
            <span>m²</span>
          </div>
        </div>
      </div>

      <div className="ep-duo">
        <div>
          <label className="ep-lab" htmlFor={`r-pmin-${r.id}`}>Budget, de</label>
          <div className="ep-unite">
            <input id={`r-pmin-${r.id}`} className="ep-champ" inputMode="numeric" value={pMin}
              onChange={(e) => setPMin(chiffres(e.target.value))} placeholder="—" />
            <span>€</span>
          </div>
        </div>
        <div>
          <label className="ep-lab" htmlFor={`r-pmax-${r.id}`}>à</label>
          <div className="ep-unite">
            <input id={`r-pmax-${r.id}`} className="ep-champ" inputMode="numeric" value={pMax}
              onChange={(e) => setPMax(chiffres(e.target.value))} placeholder="—" />
            <span>€</span>
          </div>
        </div>
      </div>

      <label className="ep-lab" htmlFor={`r-renta-${r.id}`}>Rendement brut minimum</label>
      <div className="ep-unite court">
        <input id={`r-renta-${r.id}`} className="ep-champ" inputMode="decimal" value={renta}
          onChange={(e) => setRenta(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="—" />
        <span>%</span>
      </div>

      <label className="ep-lab" htmlFor={`r-mot-${r.id}`}>Autre chose à nous dire ?</label>
      <textarea id={`r-mot-${r.id}`} className="ep-zone" rows={3} value={mot}
        onChange={(e) => setMot(e.target.value)}
        placeholder="Ce que vous évitez, votre horizon, votre mode de financement…" />

      <div className="ep-actions">
        <button className="ep-go" type="button" disabled={pending}
          onClick={() => start(async () => {
            setAvis(await majRecherche(r.id || null, {
              villes: villes.split(",").map((v) => v.trim()).filter(Boolean),
              Destinations: dest,
              surface_min: nombre(sMin), surface_max: nombre(sMax),
              prix_min: nombre(pMin), prix_max: nombre(pMax),
              renta: nombre(renta),
              commentaire: mot.trim(),
            }));
          })}>
          {pending ? "…" : r.id ? "Mettre à jour mes critères" : "Enregistrer ma recherche"}
        </button>
        {avis && <span className={`ep-avis${avis.ok ? " ok" : " ko"}`}>{avis.message}</span>}
      </div>
    </div>
  );
}
