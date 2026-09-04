"use client";

/* Le corps d'un message, rendu lisible.
 *
 * MAV : « les liens sont toujours en plein donc pas cliquables et donc super
 * moche, ça empêche la lecture ». C'est la version texte d'un message HTML :
 * les messageries y recopient chaque lien en entier, traceurs compris, et on
 * se retrouve avec quinze lignes de charabia au milieu d'une phrase.
 *
 * Deux traitements, selon ce que le message contient :
 *
 *  · s'il y a du HTML, on l'affiche — c'est la version faite pour être lue,
 *    et les liens y sont des liens. Mais du HTML reçu par e-mail est du code
 *    venu de l'extérieur : il est donc rendu dans un cadre isolé (`iframe`
 *    `sandbox`), sans script, sans accès à la page, sans formulaire. Le pire
 *    qu'il puisse faire, c'est être laid ;
 *
 *  · sinon, on rend le texte lisible : les adresses deviennent des liens
 *    cliquables, affichés par leur domaine plutôt que par leurs deux cents
 *    caractères de traceur.
 */

import { useMemo } from "react";

const LIEN = /(https?:\/\/[^\s<>"')\]]+)/g;

/** Ce qu'on montre d'un lien : son domaine, et de quoi le reconnaître. */
function etiquette(url: string) {
  try {
    const u = new URL(url);
    const chemin = u.pathname.replace(/\/$/, "");
    const court = chemin.length > 24 ? `${chemin.slice(0, 24)}…` : chemin;
    return `${u.hostname.replace(/^www\./, "")}${court}`;
  } catch {
    return url.length > 48 ? `${url.slice(0, 48)}…` : url;
  }
}

export function CorpsMessage({ texte, html }: { texte: string; html?: string }) {
  /* Le HTML reçu part dans un cadre isolé, avec une base qui ouvre les liens
     dans un nouvel onglet — sinon un lien remplacerait le back-office. */
  const page = useMemo(() => {
    if (!html) return null;
    return `<!doctype html><html><head><meta charset="utf-8">`
      + `<base target="_blank">`
      + `<style>`
      + `html,body{margin:0;padding:14px 16px;font:14px/1.55 -apple-system,Segoe UI,Roboto,sans-serif;color:#2c2c2c;word-break:break-word}`
      + `img{max-width:100%;height:auto}`
      + `table{max-width:100%}`
      + `a{color:#8a6d1f}`
      + `</style></head><body>${html}</body></html>`;
  }, [html]);

  if (page) {
    return (
      <iframe
        className="gm-html"
        title="Message"
        /* Ni script, ni accès à la page qui l'entoure. Les liens peuvent
           ouvrir un onglet, et rien d'autre. */
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        srcDoc={page}
      />
    );
  }

  return (
    <pre className="gm-corps">
      {texte.split(LIEN).map((bout, i) => (
        i % 2 === 1
          ? (
            <a key={i} href={bout} target="_blank" rel="noreferrer noopener" title={bout}>
              {etiquette(bout)}
            </a>
          )
          : <span key={i}>{bout}</span>
      ))}
    </pre>
  );
}
