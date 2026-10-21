"use client";

// Les ventes publiées sur le site — l'écran de validation (contrat §4).
//
// À gauche les faits, pré-remplis depuis le dossier et corrigeables ; à droite
// le texte, proposé par le gabarit ou par Claude, que MAV relit. Rien ne part
// sur le site sans l'un des trois gestes : « Valider et publier », « Publier
// sans récit », « Ne pas publier ».
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { dmy, euros } from "@/lib/format";
import { compterMots, controleAnonymat, nombreDeFaits, ticsDeStyle, type FaitsVente, type Recit } from "@/lib/ventes";
import {
  enregistrerBrouillon, nePasPublier, proposerGabarit, proposerReecriture, publierSansRecit, validerEtPublier,
  type VenteOuverte,
} from "@/lib/bo/ventes-site";
import { useQuestion } from "@/components/modale";
import { Pastille } from "@/components/pastille";
import { agentCourantSlug } from "@/lib/bo/agent-courant";

type Cle = keyof FaitsVente;
type Champ = { cle: Cle; label: string; genre: "texte" | "nombre" | "choix"; options?: string[]; aide?: string };

const CHAMPS: { groupe: string; note?: string; champs: Champ[] }[] = [
  {
    groupe: "Le bien",
    champs: [
      { cle: "arrondissement", label: "Arrondissement", genre: "texte", aide: "Paris, Lyon, Marseille seulement" },
      { cle: "rue", label: "Rue, sans numéro", genre: "texte", aide: "Affichée à part, jamais dans le texte" },
      { cle: "type", label: "Type", genre: "choix", options: ["Immeuble de rapport", "Immeuble mixte", "Immeuble de bureaux", "Murs commerciaux", "Local d'activité"] },
      { cle: "lots", label: "Lots", genre: "nombre" },
      { cle: "composition", label: "Composition", genre: "texte" },
      { cle: "surface", label: "Surface (m²)", genre: "nombre", aide: "Hors caves et parkings" },
      { cle: "epoque", label: "Époque", genre: "texte" },
      { cle: "dpe", label: "DPE", genre: "choix", options: ["A", "B", "C", "D", "E", "F", "G"] },
    ],
  },
  {
    groupe: "Les loyers",
    champs: [
      { cle: "occupation", label: "Occupation (% de la surface)", genre: "nombre" },
      { cle: "rendement", label: "Rendement brut à l'acte (%)", genre: "nombre" },
      { cle: "loyer_potentiel", label: "Loyer potentiel (€/an)", genre: "nombre", aide: "Tout loué, hors charges" },
    ],
  },
  {
    groupe: "La vente",
    champs: [
      { cle: "profil_vendeur", label: "Vendeur", genre: "choix", options: ["Particulier", "Indivision", "Société", "Institutionnel"] },
      { cle: "profil_acquereur", label: "Acquéreur", genre: "choix", options: ["Investisseur", "Marchand de biens", "Patrimonial", "Promoteur"] },
      { cle: "mode_commercialisation", label: "Commercialisation", genre: "choix", options: ["off_market", "diffusion", "mixte"] },
      { cle: "delai_semaines", label: "Mandat → compromis (semaines)", genre: "nombre" },
      { cle: "acquereurs_sollicites", label: "Acquéreurs sollicités", genre: "nombre" },
      { cle: "visites", label: "Visites", genre: "nombre" },
      { cle: "offres", label: "Offres reçues", genre: "nombre" },
      { cle: "delai_offre_jours", label: "1er envoi → offre retenue (jours)", genre: "nombre" },
      { cle: "ecart_estimation", label: "Prix / estimation (%)", genre: "nombre", aide: "Masqué sur le site tant que vous ne l'avez pas validé" },
    ],
  },
  {
    groupe: "Repères de la commune",
    note: "Servent au texte, ne s'affichent pas en colonne.",
    champs: [
      { cle: "prix_m2", label: "Prix au m² de l'acte", genre: "nombre" },
      { cle: "prix_m2_commune", label: "Prix moyen au m² (commune)", genre: "nombre" },
      { cle: "loyer_m2_commune", label: "Loyer moyen au m² (commune)", genre: "nombre" },
      { cle: "rendement_commune", label: "Rendement moyen (commune, %)", genre: "nombre" },
    ],
  },
];

const MODES: Record<string, string> = { off_market: "Off-market", diffusion: "Annonces", mixte: "Off-market puis annonces" };

export function EcranVente({ vente }: { vente: VenteOuverte }) {
  const router = useRouter();
  const [faits, setFaits] = useState<FaitsVente>(vente.faits);
  const [texte, setTexte] = useState<Recit>(vente.texte);
  const [apercu, setApercu] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const { confirmer, question } = useQuestion();

  const nb = nombreDeFaits(faits);
  const mots = compterMots(texte.recit);
  const textes = [texte.titre, texte.chapo, texte.recit, faits.composition ?? ""];
  const alertes = useMemo(() => controleAnonymat(textes, vente.interdits, faits.rue), [texte, faits, vente.interdits]); // eslint-disable-line react-hooks/exhaustive-deps
  const tics = useMemo(() => ticsDeStyle([texte.titre, texte.chapo, texte.recit]), [texte]);
  const agent = () => agentCourantSlug() ?? undefined;

  const poser = (cle: Cle, v: string, genre: Champ["genre"]) =>
    setFaits((f) => ({ ...f, [cle]: v.trim() === "" ? null : genre === "nombre" ? Number(v.replace(",", ".")) : v }));

  const agir = (fn: () => Promise<{ ok: boolean; message?: string; url?: string }>, succes: string) =>
    start(async () => {
      setMsg(null);
      type R = { ok: boolean; message?: string; url?: string };
      const r: R = await fn().catch((e): R => ({ ok: false, message: e instanceof Error ? e.message : String(e) }));
      setMsg(r.ok ? { ok: true, t: succes + (r.url ? `\n${r.url}` : "") } : { ok: false, t: r.message ?? "Échec." });
      if (r.ok) router.refresh();
    });

  const reecrire = () =>
    start(async () => {
      setMsg({ ok: true, t: "Claude réécrit le texte à partir des faits de l'écran, une à deux minutes…" });
      const r = await proposerReecriture(faits, texte);
      if (!r.ok) return setMsg({ ok: false, t: r.message });
      setTexte(r.texte);
      setMsg({ ok: true, t: `Nouveau texte proposé, ${r.mots} mots. Relisez-le : il n'est pas enregistré.` });
    });

  const gabarit = () =>
    start(async () => {
      setTexte(await proposerGabarit(vente.id, faits));
      setMsg({ ok: true, t: "Texte du gabarit recalculé depuis les faits. Il n'est pas enregistré." });
    });

  const publier = async () => {
    const ok = await confirmer(
      `Publier cette vente sur le site, avec son récit ?\n\n` +
        `La page sera visible et indexée par les moteurs de recherche. Vous pourrez la corriger ensuite, elle se remplace à la même adresse.`,
      { oui: "Valider et publier" },
    );
    if (ok) agir(() => validerEtPublier(vente.id, faits, texte, agent()), "Vente publiée avec son récit.");
  };

  const sansRecit = async () => {
    const ok = await confirmer(
      "Publier la fiche sans récit ?\n\nLes faits et la photo partent ; le site ne la fait pas indexer tant qu'elle n'a pas de récit.",
      { oui: "Publier sans récit" },
    );
    if (ok) agir(() => publierSansRecit(vente.id, faits, agent()), "Vente publiée sans récit.");
  };

  const ecarter = async () => {
    const ok = await confirmer("Ne pas publier cette vente ?\n\nElle sort de la file ; rien ne part sur le site.", { oui: "Ne pas publier", danger: true });
    if (ok) agir(async () => { await nePasPublier(vente.id, agent()); return { ok: true }; }, "Vente écartée.");
  };

  const lieu = faits.arrondissement ? `${faits.commune} ${faits.arrondissement.replace(" arrondissement", "")}` : faits.commune;
  const pastille =
    vente.etat === "avec_recit" ? <Pastille ton="vert">Récit en ligne</Pastille>
      : vente.etat === "sans_recit" ? <Pastille ton="orange">En ligne sans récit</Pastille>
      : vente.etat === "inconnu" ? <Pastille ton="gris">État sur le site inconnu</Pastille>
      : <Pastille ton="gris">Pas encore publiée</Pastille>;

  return (
    <div className="wrap vs">
      <div className="vs-h">
        <Link href="/ventes-site" className="vs-retour">← Biens vendus</Link>
        <div className="vs-t">
          <h1>{lieu} ({faits.dept})</h1>
          {pastille}
          {vente.brouillon && <Pastille ton="bleu">Brouillon enregistré</Pastille>}
        </div>
        <div className="vs-s">
          Vendu {euros(faits.prix)} · acte du {dmy(faits.date)}
          {vente.url && <> · <a href={vente.url} target="_blank" rel="noreferrer">Voir la page</a></>}
          {vente.immeubleId && <> · <Link href={`/bien/${vente.immeubleId}`}>Fiche du bien</Link></>}
        </div>
      </div>

      <div className="vs-grille">
        <section className="vs-faits">
          <div className="vs-st">
            Les faits <span className={nb >= 6 ? "ok" : "ko"}>{nb} sur 13</span>
          </div>
          <p className="vs-note">
            Pré-remplis depuis le dossier. Un champ vidé ne part pas au site et le texte n&apos;en parle pas.
            {nb < 6 && " Moins de six faits : pas de récit possible, seulement « Publier sans récit »."}
          </p>
          {CHAMPS.map((g) => (
            <fieldset key={g.groupe} className="vs-g">
              <legend>{g.groupe}</legend>
              {g.note && <p className="vs-note">{g.note}</p>}
              {g.champs.map((c) => {
                const v = faits[c.cle];
                return (
                  <label key={c.cle} className="vs-c">
                    <span>{c.label}</span>
                    {c.genre === "choix" ? (
                      <select value={v === null || v === undefined ? "" : String(v)} onChange={(e) => poser(c.cle, e.target.value, "choix")}>
                        <option value="">—</option>
                        {c.options!.map((o) => <option key={o} value={o}>{MODES[o] ?? o}</option>)}
                      </select>
                    ) : (
                      <input
                        type="text"
                        inputMode={c.genre === "nombre" ? "decimal" : undefined}
                        value={v === null || v === undefined ? "" : String(v)}
                        title={c.aide}
                        placeholder={c.aide}
                        onChange={(e) => poser(c.cle, e.target.value, c.genre)}
                      />
                    )}
                  </label>
                );
              })}
            </fieldset>
          ))}
        </section>

        <section className="vs-texte">
          <div className="vs-st">
            Le texte
            <span className="vs-onglets">
              <button type="button" className={!apercu ? "on" : ""} onClick={() => setApercu(false)}>Texte</button>
              <button type="button" className={apercu ? "on" : ""} onClick={() => setApercu(true)}>Aperçu</button>
            </span>
          </div>

          {apercu ? (
            <article className="vs-apercu">
              <h2>{texte.titre}</h2>
              <p className="chapo">{texte.chapo}</p>
              {texte.recit.split(/\n{2,}/).map((p, i) =>
                p.startsWith("## ") ? <h3 key={i}>{p.slice(3)}</h3> : <p key={i}>{p}</p>,
              )}
            </article>
          ) : (
            <>
              <label className="vs-c large">
                <span>Titre <i className={texte.titre.length > 90 ? "ko" : ""}>{texte.titre.length}/90</i></span>
                <input type="text" value={texte.titre} onChange={(e) => setTexte({ ...texte, titre: e.target.value })} />
              </label>
              <label className="vs-c large">
                <span>Chapô <i className={texte.chapo.length > 170 ? "ko" : ""}>{texte.chapo.length}/170</i></span>
                <textarea rows={2} value={texte.chapo} onChange={(e) => setTexte({ ...texte, chapo: e.target.value })} />
              </label>
              <label className="vs-c large">
                <span>
                  Récit <i className={mots < 350 || mots > 650 ? "att" : ""}>{mots} mots, visé 350 à 650</i>
                </span>
                <textarea rows={22} value={texte.recit} onChange={(e) => setTexte({ ...texte, recit: e.target.value })} />
              </label>
              <div className="vs-seo">
                <label className="vs-c large">
                  <span>Titre pour Google <i className={texte.seo_title.length > 70 ? "ko" : ""}>{texte.seo_title.length}/70</i></span>
                  <input type="text" value={texte.seo_title} onChange={(e) => setTexte({ ...texte, seo_title: e.target.value })} />
                </label>
                <label className="vs-c large">
                  <span>Description pour Google <i className={texte.seo_desc.length > 170 ? "ko" : ""}>{texte.seo_desc.length}/170</i></span>
                  <textarea rows={2} value={texte.seo_desc} onChange={(e) => setTexte({ ...texte, seo_desc: e.target.value })} />
                </label>
              </div>
            </>
          )}

          <div className={`vs-controle${alertes.length ? " ko" : " ok"}`}>
            <b>{alertes.length ? "Publication bloquée" : "Contrôle d'anonymat : rien à signaler"}</b>
            {alertes.map((a) => <span key={a.cle}>{a.texte}</span>)}
          </div>
          {tics.length > 0 && (
            <div className="vs-controle att">
              <b>À reprendre (ne bloque pas)</b>
              {tics.map((a) => <span key={a.cle}>{a.texte}</span>)}
            </div>
          )}
        </section>
      </div>

      <div className="vs-actions">
        <button className="fadd" type="button" disabled={pending} onClick={() => agir(() => enregistrerBrouillon(vente.id, faits, texte, agent()), "Brouillon enregistré. Rien n'est parti sur le site.")}>
          Enregistrer le brouillon
        </button>
        <button className="fadd" type="button" disabled={pending || !vente.reecriture} title={vente.reecriture ? undefined : "ANTHROPIC_API_KEY absente"} onClick={reecrire}>
          Proposer une réécriture
        </button>
        <button className="fadd" type="button" disabled={pending} onClick={gabarit}>Régénérer le gabarit</button>
        <span className="vs-esp" />
        <button className="fadd danger" type="button" disabled={pending} onClick={ecarter}>Ne pas publier</button>
        <button className="fadd" type="button" disabled={pending || !vente.configuree} onClick={sansRecit}>Publier sans récit</button>
        <button className="kgo green" type="button" disabled={pending || !vente.configuree || alertes.length > 0 || nb < 6} onClick={publier}>
          Valider et publier
        </button>
      </div>
      {!vente.configuree && <div className="vs-msg ko">Le site n&apos;est pas branché ici : la publication est fermée.</div>}
      {msg && <div className={`vs-msg${msg.ok ? "" : " ko"}`}>{msg.t}</div>}

      {vente.journal.length > 0 && (
        <div className="vs-journal">
          {vente.journal.slice(-6).reverse().map((j, i) => (
            <div key={i}>{dmy(j.le)} · {j.geste}{j.agent ? ` · ${j.agent}` : ""}</div>
          ))}
        </div>
      )}
      {question}
    </div>
  );
}
