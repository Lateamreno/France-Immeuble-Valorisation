"use client";

/* La vitrine de l'agence sur Plein Bail.
 *
 * Un seul appel remplit /vendeur/france-immeuble, la page qui figure au bas de
 * chacune de nos annonces. Elle ne se pousse pas toute seule : c'est du texte
 * public signé France Immeuble, donc ça se relit avant de partir. D'où l'écran
 * plutôt qu'une tâche de fond. */

import { useState, useTransition } from "react";
import { publierVitrine, verifierLogo } from "@/lib/bo/diffusion";
import { LIMITES, type VitrineSaisie } from "@/lib/vitrine";

type Etat =
  | { sorte: "logo"; ok: boolean; message: string }
  | { sorte: "envoi"; ok: boolean; message: string; url?: string; champs?: string[] };

export function Vitrine({ initial, configuree }: { initial: VitrineSaisie; configuree: boolean }) {
  const [v, setV] = useState(initial);
  const [etat, setEtat] = useState<Etat | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [pending, start] = useTransition();

  const maj = (k: keyof VitrineSaisie) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setV((x) => ({ ...x, [k]: e.target.value }));

  const verifier = () =>
    start(async () => {
      const r = await verifierLogo(v.logo_url);
      setEtat({
        sorte: "logo",
        ok: r.ok,
        message: r.ok
          ? `Logo joignable — ${r.type}, ${Math.round(r.octets / 1024)} Ko.`
          : r.message,
      });
    });

  const publier = () =>
    start(async () => {
      if (!confirm("Publier la vitrine sur la page publique France Immeuble ?")) return;
      const r = await publierVitrine(v);
      setEtat(
        r.ok
          ? { sorte: "envoi", ok: true, message: `Vitrine publiée${r.logo ? ` — logo ${r.logo}` : ""}.`, url: r.url, champs: r.champs }
          : { sorte: "envoi", ok: false, message: r.message ?? "Échec." },
      );
    });

  const compteur = (valeur: string, max: number) => (
    <span className={`vit-cpt${valeur.length > max ? " vit-trop" : ""}`}>
      {valeur.length} / {max}
    </span>
  );

  return (
    <section className="vit">
      <header className="vit-tete" onClick={() => setOuvert((o) => !o)}>
        <h2>Vitrine de l&apos;agence</h2>
        <span className="vit-sous">
          La page publique <code>/vendeur/france-immeuble</code>, affichée au bas de chacune de nos annonces
        </span>
        <span className="vit-chevron">{ouvert ? "▾" : "▸"}</span>
      </header>

      {ouvert && (
        <div className="vit-corps">
          <p className="vit-note">
            Aucun flux du marché ne transporte un logo ni un texte de présentation : Poliris, Ubiflow et
            Apimo décrivent un bien, pas une enseigne. C&apos;est donc au back-office de les pousser — une
            fois, puis à chaque fois qu&apos;ils changent. Seuls les champs envoyés sont écrits.
          </p>

          <label className="vit-l">
            <span>
              Slogan {compteur(v.slogan, LIMITES.slogan)}
            </span>
            <input value={v.slogan} onChange={maj("slogan")} />
          </label>

          <label className="vit-l">
            <span>
              Présentation {compteur(v.presentation, LIMITES.presentation)}
            </span>
            <textarea rows={16} value={v.presentation} onChange={maj("presentation")} />
          </label>

          <div className="vit-duo">
            <label className="vit-l">
              <span>Site web</span>
              <input value={v.site_web} onChange={maj("site_web")} />
            </label>
            <label className="vit-l">
              <span>
                Zone d&apos;intervention {compteur(v.zone_intervention, LIMITES.zone)}
              </span>
              <input value={v.zone_intervention} onChange={maj("zone_intervention")} />
            </label>
          </div>

          <label className="vit-l">
            <span>Logo</span>
            <input value={v.logo_url} onChange={maj("logo_url")} />
          </label>
          <div className="vit-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={v.logo_url} alt="Logo France Immeuble" />
          </div>

          <div className="vit-actions">
            <button type="button" className="vit-b2" disabled={pending} onClick={verifier}>
              Vérifier le logo
            </button>
            <button type="button" className="vit-b" disabled={pending || !configuree} onClick={publier}>
              Publier la vitrine
            </button>
            {!configuree && (
              <span className="vit-note">
                Pont non configuré : renseignez PLEIN_BAIL_URL et PLEIN_BAIL_JETON pour envoyer.
              </span>
            )}
          </div>

          {etat && (
            <div className={`vit-msg${etat.ok ? " vit-ok" : " vit-ko"}`}>
              {etat.message}
              {etat.sorte === "envoi" && etat.url && (
                <>
                  {" "}
                  <a href={etat.url} target="_blank" rel="noreferrer">
                    Voir la page
                  </a>
                </>
              )}
              {etat.sorte === "envoi" && etat.champs?.length ? (
                <div className="vit-champs">Champs écrits : {etat.champs.join(", ")}</div>
              ) : null}
            </div>
          )}

          <p className="vit-note">
            Le logo est copié chez Plein Bail, jamais lié — une URL qui change d&apos;hébergeur ne casse
            donc pas la page. En revanche, un logo injoignable au moment de l&apos;appel est ignoré en
            silence : d&apos;où le bouton de vérification, qui le dit avant l&apos;envoi plutôt qu&apos;après.
          </p>
        </div>
      )}
    </section>
  );
}
