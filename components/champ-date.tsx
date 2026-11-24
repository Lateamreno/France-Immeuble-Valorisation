"use client";

/**
 * Une date qui se tape ET qui se choisit (retour #258).
 *
 * MAV : « j'aimerai que je puisse rentrer la date sous forme de xx/xx/xxxx ou
 * avec le calendrier — je veux les deux solutions dans la modale. »
 *
 * Le champ natif `type="date"` a le calendrier mais impose sa saisie au
 * clavier, par cases séparées et dans l'ordre du navigateur : sur un bail de
 * 2011, taper « 01/09/2011 » d'une traite est plus rapide que d'atteindre
 * l'année. On garde donc une vraie case texte, et le calendrier natif à côté,
 * les deux sur la même valeur.
 *
 * La valeur circule en ISO (`aaaa-mm-jj`), qui est ce que la base attend ;
 * seule l'écriture à l'écran est française.
 */

import { useState } from "react";

/** « 2011-09-01 » → « 01/09/2011 ». */
const versFr = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
};

/** « 01/09/2011 » → « 2011-09-01 », et rien tant que la date est incomplète. */
const versIso = (fr: string) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(fr.trim());
  if (!m) return "";
  const [, j, mo, a] = m;
  const d = new Date(`${a}-${mo}-${j}T00:00:00Z`);
  /* Le 31/02 se laisse taper : c'est la date reconstruite qui dit s'il
     existe. Sans ce contrôle, elle deviendrait le 3 mars en silence. */
  if (Number.isNaN(d.getTime()) || d.getUTCDate() !== Number(j)) return "";
  return `${a}-${mo}-${j}`;
};

/** Pose les barres obliques pendant la frappe, sans jamais les imposer. */
const masque = (v: string) => {
  const c = v.replace(/\D/g, "").slice(0, 8);
  if (c.length <= 2) return c;
  if (c.length <= 4) return `${c.slice(0, 2)}/${c.slice(2)}`;
  return `${c.slice(0, 2)}/${c.slice(2, 4)}/${c.slice(4)}`;
};

export function ChampDate({ valeur, onChange, placeholder = "jj/mm/aaaa", classe = "min" }: {
  /** Date ISO `aaaa-mm-jj`, ou chaîne vide. */
  valeur: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  classe?: string;
}) {
  const [texte, setTexte] = useState(() => versFr(valeur));
  /* La valeur peut changer ailleurs (calendrier, annulation d'une saisie) : le
     texte suit, sauf pendant qu'on tape une date encore incomplète. On l'ajuste
     pendant le rendu — c'est ce que React recommande pour une valeur dérivée
     d'une propriété, un effet ferait afficher l'ancien texte le temps d'une
     image. */
  const [vue, setVue] = useState(valeur);
  if (vue !== valeur) {
    setVue(valeur);
    if (versIso(texte) !== valeur) setTexte(versFr(valeur));
  }

  const saisir = (v: string) => {
    const m = masque(v);
    setTexte(m);
    const iso = versIso(m);
    if (iso) onChange(iso);
    else if (m === "") onChange("");
  };

  const complet = texte === "" || !!versIso(texte);

  return (
    <span className="cdate">
      <input
        className={`${classe}${complet ? "" : " ko"}`} value={texte} inputMode="numeric"
        placeholder={placeholder} maxLength={10}
        onChange={(e) => saisir(e.target.value)}
        onBlur={() => { if (texte && !versIso(texte)) setTexte(versFr(valeur)); }}
      />
      {/* Le calendrier natif : son champ est masqué, seul son picto reste. */}
      <label className="cdate-cal" title="Choisir dans le calendrier">
        <svg viewBox="0 0 24 24" aria-hidden>
          <rect x="3.5" y="5" width="17" height="15" rx="2" />
          <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
        </svg>
        <input type="date" value={valeur} onChange={(e) => onChange(e.target.value)} />
      </label>
    </span>
  );
}
