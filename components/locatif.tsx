"use client";

// État locatif — sous-onglets Lots · Baux · Locataires · Charges (réplique BO)
// avec bandeau de synthèse par destination.
import { useState, useTransition } from "react";
import type { BienData } from "@/lib/bubble/server";
import { Picto } from "@/components/pictos";
import { euros } from "@/lib/format";
import { LotsEditor } from "@/components/lots-editor";
import {
  addCharge, addLocataire, bailDuLot,
  deleteCharge, updateCharge, updateLocataire,
} from "@/lib/bo/actions";
import { useBaseSaisie } from "@/lib/base-saisie";
import { ChampDate } from "@/components/champ-date";
import { BarreEnregistrer } from "@/components/barre-enregistrer";

import { INDICES_BAIL, TAXES, TYPES_BAIL as TYPES_BAIL_ALL, TYPES_CHARGE } from "@/lib/referentiels";

// Un bail ne peut pas être « Vide » / « n.c. » (ce sont des états de lot).
const TYPES_BAIL = TYPES_BAIL_ALL.filter((t) => t !== "Vide" && t !== "n.c.");
const STATUTS_BAIL = [
  { key: "en_cours", label: "Bail en cours" },
  { key: "impayes", label: "Impayés" },
  { key: "preavis", label: "Préavis déposé" },
  { key: "expulsion", label: "Expulsion en cours" },
] as const;

const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const num = (v: unknown) => (typeof v === "number" ? v : undefined);
const parse = (s: string) => (s === "" ? undefined : parseFloat(s.replace(",", ".")));


/* ---------- Baux ---------- */

/** Une ligne de l'onglet Baux, pendant la saisie. */
type LigneBail = {
  type: string; loyer: string; dg: string; debut: string;
  indice: string; i0: string; i1: string;
  statut: "en_cours" | "impayes" | "preavis" | "expulsion";
  commentaire: string;
};
const VIDE_BAIL: LigneBail = {
  type: "", loyer: "", dg: "", debut: "", indice: "", i0: "", i1: "",
  statut: "en_cours", commentaire: "",
};

/**
 * Le rappel d'un lot, sous son numéro (retours #259, #260).
 *
 * MAV : « il faut qu'on puisse mettre le numéro de lot, mais du coup ça nous
 * montre les informations principales sur le lot — étage, type, surface et
 * loyer — pour que ce soit plus facile » ; et « pour les lots, soit au survol
 * on voit l'étage, le type, la surface et le loyer ». Un numéro seul ne dit
 * pas de quel appartement on parle : il faut rouvrir l'état locatif pour le
 * savoir, et on ne le fait pas.
 */
function RappelLot({ l }: { l: Record<string, unknown> }) {
  const surface = num(l.surface_carrez);
  const loyer = num(l.loyer);
  const bouts = [
    S(l.etage) ? `${S(l.etage)}ᵉ étage` : "",
    S(l.Type_lot) || S(l.Destination),
    surface ? `${Math.round(surface)} m²` : "",
    loyer ? `${euros(loyer)}/mois` : "",
  ].filter(Boolean);
  return (
    <span className="lot-rap" title={bouts.join(" · ")}>
      <b>Lot {S(l.numero) || "?"}</b>
      {bouts.length > 0 && <i>{bouts.join(" · ")}</i>}
    </span>
  );
}

/**
 * L'onglet Baux — une ligne par lot, qu'il ait ou non un bail en base.
 *
 * MAV : « je pense que chaque bail devrait être créé automatiquement ici, au
 * moins la ligne, et du coup pas besoin de sélectionner le lot ». Un lot loué a
 * un bail : demander de le créer, puis de le rattacher à son lot dans une
 * seconde fenêtre, c'est demander deux fois la même chose. L'écran montre donc
 * les lots ; la première saisie fait exister le bail en base.
 *
 * Comme partout ailleurs, la saisie se fait sur la ligne et UNE seule barre
 * enregistre le tout (retours #264/#265).
 */
function BauxTab({ b }: { b: BienData }) {
  const immeubleId = String(b.im._id);
  const [pending, start] = useTransition();

  /* Les lots réellement occupés d'abord : c'est là qu'il y a un bail. Un lot
     vide garde sa ligne — un bail peut se préparer avant l'entrée. */
  const lots = [...b.lots].sort((x, y) => (num(x.ordre) ?? 0) - (num(y.ordre) ?? 0));
  const bailDe = (lotId: string) =>
    b.baux.find((x) => Array.isArray(x.LOTs) && (x.LOTs as string[]).includes(lotId));

  const depart = () =>
    Object.fromEntries(lots.map((l) => {
      const bl = bailDe(String(l._id));
      return [String(l._id), {
        type: S(bl?.Type_bail) || S(l.Type_bail),
        loyer: S(num(bl?.loyer_init) ?? num(l.loyer)),
        dg: S(num(bl?.depot_garantie)),
        debut: typeof bl?.date_start === "string" ? (bl.date_start as string).slice(0, 10) : "",
        indice: S(bl?.indice_type),
        i0: S(num(bl?.indice_init)),
        i1: S(num(bl?.indice_actuel)),
        statut: bl?.expulsion === true ? "expulsion"
          : bl?.impayes === true ? "impayes"
          : bl?.preavis === true ? "preavis" : "en_cours",
        commentaire: S(bl?.commentaire),
      } as LigneBail];
    }));

  const [saisie, setSaisie] = useState<Record<string, LigneBail>>(depart);
  const maj = (id: string, v: Partial<LigneBail>) =>
    setSaisie((s) => ({ ...s, [id]: { ...s[id], ...v } }));

  const { avant: enBase, modifie, poser } = useBaseSaisie(saisie);

  const enregistrer = () =>
    start(async () => {
      const avant = enBase();
      for (const l of lots) {
        const id = String(l._id);
        const v = saisie[id];
        const a = avant[id];
        if (!v || (a && JSON.stringify(a) === JSON.stringify(v))) continue;
        await bailDuLot(immeubleId, id, {
          Type_bail: v.type || null,
          loyer_init: v.loyer.trim() === "" ? null : parse(v.loyer),
          depot_garantie: v.dg.trim() === "" ? null : parse(v.dg),
          date_start: v.debut || null,
          indice_type: v.indice || null,
          indice_init: v.i0.trim() === "" ? null : parse(v.i0),
          indice_actuel: v.i1.trim() === "" ? null : parse(v.i1),
          statut: v.statut,
          commentaire: v.commentaire || null,
        });
      }
      poser(saisie);
    });

  const annuler = () => setSaisie(enBase());

  const n = (f: string) => b.baux.filter((x) => x[f] === true).length;

  return (
    <>
      <div className="lband2">
        <span className="dst">{n("activ")} actifs · {n("impayes")} impayés · {n("expulsion")} expulsions · {n("preavis")} préavis</span>
        <span className="sp" style={{ flex: 1 }} />
      </div>
      {lots.length === 0 ? (
        <div className="fempty">Aucun lot saisi — les baux se rattachent aux lots.</div>
      ) : (
        <div className="ltable-wrap" style={pending ? { opacity: 0.6 } : undefined}>
          <table className="ltable bx">
            <thead>
              <tr>
                <th>Lot</th><th>Type</th><th>Loyer initial</th><th>Dépôt de garantie</th>
                <th>Entrée</th><th>Indice</th><th>Valeur signature</th><th>Valeur actuelle</th>
                <th>Loyer révisé</th><th>Statut</th><th>Commentaire</th>
              </tr>
            </thead>
            <tbody>
              {lots.map((l) => {
                const id = String(l._id);
                const v = saisie[id] ?? VIDE_BAIL;
                const li = parse(v.loyer), i0 = parse(v.i0), i1 = parse(v.i1);
                const revise = li && i0 && i1 && i0 > 0 ? Math.round((li * i1) / i0) : undefined;
                return (
                  <tr key={id}>
                    <td><RappelLot l={l} /></td>
                    <td>
                      <select className="lcell" value={v.type} onChange={(e) => maj(id, { type: e.target.value })}>
                        <option value="" />
                        {[...new Set([v.type, ...TYPES_BAIL])].filter(Boolean).map((t) => <option key={t}>{t}</option>)}
                      </select>
                    </td>
                    <td className="na"><input className="lcell num" value={v.loyer} onChange={(e) => maj(id, { loyer: e.target.value })} /><i>€</i></td>
                    <td className="na"><input className="lcell num" value={v.dg} onChange={(e) => maj(id, { dg: e.target.value })} /><i>€</i></td>
                    <td><ChampDate classe="lcell" valeur={v.debut} onChange={(d) => maj(id, { debut: d })} /></td>
                    <td>
                      <select className="lcell" value={v.indice} onChange={(e) => maj(id, { indice: e.target.value })}>
                        <option value="" />
                        {INDICES_BAIL.map((i) => <option key={i}>{i}</option>)}
                      </select>
                    </td>
                    <td className="na"><input className="lcell num" value={v.i0} onChange={(e) => maj(id, { i0: e.target.value })} /></td>
                    <td className="na"><input className="lcell num" value={v.i1} onChange={(e) => maj(id, { i1: e.target.value })} /></td>
                    {/* Déduit des trois précédents : le laisser saisir, c'est
                        laisser entrer une incohérence. */}
                    <td className="na">{revise !== undefined ? euros(revise) : <span className="nc">—</span>}</td>
                    <td>
                      <select className="lcell" value={v.statut}
                        onChange={(e) => maj(id, { statut: e.target.value as LigneBail["statut"] })}>
                        {STATUTS_BAIL.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                    </td>
                    <td><input className="lcell" value={v.commentaire} onChange={(e) => maj(id, { commentaire: e.target.value })} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <BarreEnregistrer modifie={modifie} pending={pending} onEnregistrer={enregistrer} onAnnuler={annuler} />
    </>
  );
}

/* ---------- Locataires ---------- */

/** Une ligne de l'onglet Locataires, pendant la saisie. */
type LigneLoc = {
  pm: boolean; civ: string; prenom: string; nom: string;
  phone: string; email: string; commentaire: string;
};
const VIDE_LOC: LigneLoc = {
  pm: false, civ: "", prenom: "", nom: "", phone: "", email: "", commentaire: "",
};

/**
 * L'onglet Locataires — une ligne par lot, modifiable sur place (retour #259).
 *
 * MAV : « quand on crée un locataire, il faut qu'on puisse modifier ici
 * directement dans le tableau, avec le bouton enregistrer ou annuler — la
 * barre collée en bas qu'il y a partout. » Et : « je pense que chaque
 * locataire devrait être créé automatiquement ici, au moins la ligne. »
 *
 * Le locataire créé depuis l'état locatif n'a qu'un nom, saisi d'un bloc
 * (retour #258) : c'est ici qu'on le répartit entre prénom et nom, et qu'on
 * ajoute le téléphone et l'e-mail. Tant que ces deux-là sont vides, le
 * locataire reste une ligne de l'immeuble et ne devient pas un contact —
 * « quand on remplit les infos e-mail, téléphone, etc., ça les crée en contact
 * après, mais tant que ces infos sont pas remplies alors c'est pas besoin ».
 */
function LocatairesTab({ b }: { b: BienData }) {
  const immeubleId = String(b.im._id);
  const [pending, start] = useTransition();

  const lots = [...b.lots].sort((x, y) => (num(x.ordre) ?? 0) - (num(y.ordre) ?? 0));
  const locDe = (lotId: string) =>
    b.locataires.find((x) => Array.isArray(x.LOTs) && (x.LOTs as string[]).includes(lotId));

  const depart = () =>
    Object.fromEntries(lots.map((l) => {
      const lc = locDe(String(l._id));
      return [String(l._id), {
        pm: lc?.pm === true,
        civ: S(lc?.["pp_civilité"]),
        prenom: S(lc?.["pp_prénom"]),
        nom: lc?.pm === true ? S(lc?.pm_nom) : S(lc?.pp_nom),
        phone: S(lc?.phone),
        email: S(lc?.email),
        commentaire: S(lc?.commentaire),
      } as LigneLoc];
    }));

  const [saisie, setSaisie] = useState<Record<string, LigneLoc>>(depart);
  const maj = (id: string, v: Partial<LigneLoc>) =>
    setSaisie((s) => ({ ...s, [id]: { ...s[id], ...v } }));

  const { avant: enBase, modifie, poser } = useBaseSaisie(saisie);

  const enregistrer = () =>
    start(async () => {
      const avant = enBase();
      for (const l of lots) {
        const id = String(l._id);
        const v = saisie[id];
        const a = avant[id];
        if (!v || (a && JSON.stringify(a) === JSON.stringify(v))) continue;
        const lc = locDe(id);
        const patch = {
          pm: v.pm,
          pm_nom: v.pm ? (v.nom || null) : null,
          pp_civilite: v.pm ? null : (v.civ || null),
          pp_prenom: v.pm ? null : (v.prenom || null),
          pp_nom: v.pm ? null : (v.nom || null),
          phone: v.phone || null,
          email: v.email || null,
          commentaire: v.commentaire || null,
        };
        if (lc) await updateLocataire(immeubleId, String(lc._id), patch);
        else if (v.nom.trim()) {
          await addLocataire(immeubleId, {
            pm: v.pm,
            pm_nom: v.pm ? v.nom : undefined,
            pp_civilite: v.pm ? undefined : v.civ || undefined,
            pp_prenom: v.pm ? undefined : v.prenom || undefined,
            pp_nom: v.pm ? undefined : v.nom,
            phone: v.phone || undefined,
            email: v.email || undefined,
            lotIds: [id],
            commentaire: v.commentaire || undefined,
          });
        }
      }
      poser(saisie);
    });

  const annuler = () => setSaisie(enBase());

  const pp = b.locataires.filter((l) => l.pm !== true).length;
  const pm = b.locataires.length - pp;

  return (
    <>
      <div className="lband2">
        <span className="dst">{pp} personne{pp > 1 ? "s" : ""} physique{pp > 1 ? "s" : ""} · {pm} personne{pm > 1 ? "s" : ""} morale{pm > 1 ? "s" : ""}</span>
        <span className="sp" style={{ flex: 1 }} />
      </div>
      {lots.length === 0 ? (
        <div className="fempty">Aucun lot saisi — les locataires se rattachent aux lots.</div>
      ) : (
        <div className="ltable-wrap" style={pending ? { opacity: 0.6 } : undefined}>
          <table className="ltable bx">
            <thead>
              <tr>
                <th>Lot</th><th>Type</th><th>Civilité</th><th>Prénom</th><th>Nom</th>
                <th>Téléphone</th><th>E-mail</th><th>Commentaire</th>
              </tr>
            </thead>
            <tbody>
              {lots.map((l) => {
                const id = String(l._id);
                const v = saisie[id] ?? VIDE_LOC;
                return (
                  <tr key={id}>
                    <td><RappelLot l={l} /></td>
                    <td>
                      <select className="lcell" value={v.pm ? "morale" : "physique"}
                        onChange={(e) => maj(id, { pm: e.target.value === "morale" })}>
                        <option value="physique">Personne physique</option>
                        <option value="morale">Personne morale</option>
                      </select>
                    </td>
                    <td>
                      {/* Une société n'a pas de civilité : la case se tait
                          plutôt que d'attendre une réponse qui n'existe pas. */}
                      {v.pm ? <span className="nc">—</span> : (
                        <select className="lcell" value={v.civ} onChange={(e) => maj(id, { civ: e.target.value })}>
                          <option value="" /><option>M.</option><option>Mme</option>
                        </select>
                      )}
                    </td>
                    <td>
                      {v.pm ? <span className="nc">—</span> : (
                        <input className="lcell" value={v.prenom} onChange={(e) => maj(id, { prenom: e.target.value })} />
                      )}
                    </td>
                    <td><input className="lcell" value={v.nom} placeholder={v.pm ? "Raison sociale" : "NOM"}
                      onChange={(e) => maj(id, { nom: e.target.value })} /></td>
                    <td><input className="lcell" value={v.phone} onChange={(e) => maj(id, { phone: e.target.value })} /></td>
                    <td><input className="lcell" value={v.email} onChange={(e) => maj(id, { email: e.target.value })} /></td>
                    <td><input className="lcell" value={v.commentaire} onChange={(e) => maj(id, { commentaire: e.target.value })} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ fontSize: 11.5, color: "var(--gray-lt)", marginTop: 8 }}>
        RGPD : les noms des locataires restent internes au BO, jamais exposés côté public.
      </div>
      <BarreEnregistrer modifie={modifie} pending={pending} onEnregistrer={enregistrer} onAnnuler={annuler} />
    </>
  );
}

/* ---------- Charges ---------- */

/* La taxe foncière figure sur tous les immeubles : plutôt que d'obliger à la
   créer, sa ligne est toujours là, vide, et se remplit à la volée (#89). */
const LIGNE_TF = "Taxe Foncière";

/**
 * Le pictogramme de chaque nature de charge (retour #257).
 *
 * MAV : « trouve un picto qui correspond à chaque charge que tu as
 * pré-indiquée, car là c'est le même picto entre taxe foncière et eau ». Une
 * colonne où tout se ressemble ne se lit pas : on relit le libellé à chaque
 * ligne, et le picto ne sert plus à rien.
 */
const IC_CHARGE: Record<string, React.ReactNode> = {
  "Taxe Foncière": <><path d="M4 10.5 12 4l8 6.5" /><path d="M6 10v10h12V10" /><path d="M12 12.5v5M10.3 13.6h3M10.3 16.2h3" /></>,
  "Taxe Bureau": <><rect x="4" y="3.5" width="16" height="17" rx="1.5" /><path d="M8 7.5h2.5M13.5 7.5H16M8 11h2.5M13.5 11H16M10 20v-4.5h4V20" /></>,
  "Cotisation Foncière des Entreprises": <><rect x="3" y="7.5" width="18" height="12" rx="2" /><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3 12.5h18" /></>,
  CRL: <><path d="M6 3.5h8L18 8v12.5H6z" /><path d="M13.5 3.6V8H18M9 12h6M9 15.5h6M9 19h3.5" /></>,
  Poubelles: <><path d="M5 7h14M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" /><path d="M10 10.5v6M14 10.5v6" /></>,
  Ménage: <><path d="M12 3v9" /><path d="M7.5 12h9l1.5 8.5h-12z" /><path d="M10 12v8.5M14 12v8.5" /></>,
  Internet: <><path d="M2.6 9.2a14 14 0 0 1 18.8 0M5.8 12.6a9.4 9.4 0 0 1 12.4 0M9 16a4.8 4.8 0 0 1 6 0" /><circle cx="12" cy="19.4" r="1.1" /></>,
  Gaz: <><path d="M12 3s5 4.6 5 9.4a5 5 0 0 1-10 0C7 9.6 9.5 7.6 12 3z" /><path d="M12 20a2.6 2.6 0 0 1-2.6-2.6c0-1.7 2.6-3.6 2.6-3.6s2.6 1.9 2.6 3.6A2.6 2.6 0 0 1 12 20z" /></>,
  Fuel: <><path d="M5 8.5h9V20H5z" /><path d="M5 8.5 8 5h9l-3 3.5" /><path d="M17 11h2.5v6a1.8 1.8 0 0 1-3.6 0V8" /></>,
  Entretien: <><path d="M14.5 3.6a4.6 4.6 0 0 0 5.6 6.1L21 9l-9.7 9.7a2.4 2.4 0 0 1-3.4-3.4L17.6 5.6z" /><circle cx="6.4" cy="17.6" r="1" /></>,
  Electricité: <><path d="M13.4 2.5 5 13.6h6L10.6 21.5 19 10.4h-6z" /></>,
  Eau: <><path d="M12 3.2c3.4 4 5.6 6.8 5.6 9.6a5.6 5.6 0 1 1-11.2 0c0-2.8 2.2-5.6 5.6-9.6z" /><path d="M9.4 13.6a2.6 2.6 0 0 0 2.6 2.6" /></>,
  Assurance: <><path d="M12 3.2 19.5 6v6.2c0 4.2-3 7.2-7.5 8.6-4.5-1.4-7.5-4.4-7.5-8.6V6z" /><path d="m8.8 12.2 2.3 2.3 4.1-4.6" /></>,
  Ascenseur: <><rect x="4.5" y="3.5" width="15" height="17" rx="1.5" /><path d="M12 3.5v17" /><path d="m8.2 10.5 1.6-2 1.6 2M8.2 13.5l1.6 2 1.6-2" /></>,
  Autre: <><circle cx="12" cy="12" r="9" /><path d="M8.6 12h.01M12 12h.01M15.4 12h.01" /></>,
};

const pictoCharge = (type: string) => IC_CHARGE[type] ?? IC_CHARGE.Autre;

/** Ligne de charge du BO : libellé, détail, montant non récupérable. */
function LigneCharge({
  type, titre, detail, montant, onOuvrir, onSupprimer,
}: {
  /** Nature, pour le pictogramme (retour #257). */
  type: string;
  titre: React.ReactNode; detail?: React.ReactNode; montant?: React.ReactNode;
  /** Ouvre la fenêtre de modification ; absent = ligne non modifiable. */
  onOuvrir?: () => void;
  /** Absent = ligne standard, non supprimable (cadenas). */
  onSupprimer?: () => void;
}) {
  return (
    <div className="chg">
      <span className="chg-ic"><svg viewBox="0 0 24 24">{pictoCharge(type)}</svg></span>
      <span className="chg-c">
        {/* Le titre ouvre la fenêtre (retour #257) : les montants se saisissent
            sur la ligne, tout le reste — nature, commentaire — s'y règle. */}
        {onOuvrir
          ? <button type="button" className="chg-t" onClick={onOuvrir} title="Modifier cette charge">{titre}</button>
          : <b>{titre}</b>}
        {detail && <i>{detail}</i>}
      </span>
      <span className="chg-v">{montant}</span>
      {onSupprimer ? (
        <button className="chg-x" type="button" title="Supprimer la charge" onClick={onSupprimer}>
          <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6" /></svg>
        </button>
      ) : (
        <span className="chg-lock" title="Ligne permanente : elle ne se supprime pas">
          <svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
        </span>
      )}
    </div>
  );
}

/** Les deux montants d'une charge, saisis sur la ligne (retour #257). */
function SaisieMontants({
  total, recup, onTotal, onRecup,
}: {
  total: string; recup: string;
  onTotal: (v: string) => void; onRecup: (v: string) => void;
}) {
  return (
    <span className="chg-saisie">
      <input className={`min${total ? "" : " requis"}`} placeholder="Total" value={total}
        onChange={(e) => onTotal(e.target.value)} /> €/an
      <span className="tiret">−</span>
      <input className="min" placeholder="Récupérable" value={recup}
        onChange={(e) => onRecup(e.target.value)} /> €/an récupérables
    </span>
  );
}

/**
 * La fenêtre d'une charge — la même pour la créer et pour la modifier
 * (retour #257).
 *
 * MAV : « une fois qu'une charge est créée je veux qu'on puisse cliquer dessus
 * pour la modifier ou ajouter un commentaire — donc on retrouve la même modale
 * que la création, déjà remplie ». Deux fenêtres pour un même objet finissent
 * toujours par diverger ; c'est la même, elle sait juste si elle a un
 * antécédent.
 */
function ModaleCharge({ b, charge, onFermer }: {
  b: BienData;
  /** Absent = création. */
  charge?: Record<string, unknown>;
  onFermer: () => void;
}) {
  const immeubleId = String(b.im._id);
  const [pending, start] = useTransition();
  const [type, setType] = useState(S(charge?.Type_charge) || "Taxe Foncière");
  const [autre, setAutre] = useState(S(charge?.type_autre));
  const [totalAn, setTotalAn] = useState(S(num(charge?.total_an)));
  const [recup, setRecup] = useState(S(num(charge?.recup_an)));
  const [comment, setComment] = useState(S(charge?.commentaire));
  const t = parse(totalAn), r = parse(recup);
  const nonRecup = t !== undefined ? t - (r ?? 0) : undefined;

  const submit = () =>
    start(async () => {
      const montants = {
        total_an: totalAn.trim() === "" ? null : t,
        recup_an: recup.trim() === "" ? null : r,
        non_recup_an: nonRecup ?? null,
      };
      if (charge) {
        await updateCharge(immeubleId, String(charge._id), {
          Type_charge: type,
          type_autre: type === "Autre" ? (autre || null) : null,
          ...montants,
          commentaire: comment || null,
        });
      } else {
        await addCharge(immeubleId, {
          Type_charge: type,
          type_autre: type === "Autre" ? autre || undefined : undefined,
          total_an: t, recup_an: r, non_recup_an: nonRecup,
          commentaire: comment || undefined,
        });
      }
      onFermer();
    });

  return (
    <div className="modal-ov" onClick={onFermer}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          {charge ? "Modifier la charge" : "Nouvelle charge"}
          <button type="button" onClick={onFermer}>✕</button>
        </div>
        <div className="modal-b">
          <span className="mlab">Type de charge</span>
          <div className="mrow">
            {TYPES_CHARGE.map((tc) => (
              <button key={tc} type="button" className={`mopt${type === tc ? " on" : ""}`} onClick={() => setType(tc)}>{tc}</button>
            ))}
          </div>
          {type === "Autre" && (
            <input className="min" style={{ marginTop: 6 }} placeholder="Précisez le type" value={autre} onChange={(e) => setAutre(e.target.value)} />
          )}
          {/* Retour #256 : chaque case dit ce qu'elle attend, et porte son
              unité. « Total €/an » en gris dans la case disparaissait dès la
              première frappe — on ne savait plus laquelle était laquelle. */}
          <span className="mlab">Montants</span>
          <div className="chg-mnt">
            <label>
              <span>Montant total</span>
              <span className="u">
                <input value={totalAn} inputMode="decimal" onChange={(e) => setTotalAn(e.target.value)} />
                <i>€/an</i>
              </span>
            </label>
            <label>
              <span>Montant récupérable</span>
              <span className="u">
                <input value={recup} inputMode="decimal" onChange={(e) => setRecup(e.target.value)} />
                <i>€/an</i>
              </span>
            </label>
            {/* Une charge entièrement récupérable pèse zéro sur le vendeur :
                il faut l'écrire. `euros` ne rend rien en dessous de 1 €, d'où
                le « /an » orphelin d'avant (retour #256). */}
            {nonRecup !== undefined && (
              <span className="chg-nr">non récupérable<b>{euros(nonRecup) ?? "0 €"}/an</b></span>
            )}
          </div>
          <span className="mlab">Commentaire</span>
          <textarea className="min" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>
        <div className="modal-f">
          <button className="kgo" type="button" disabled={pending} style={pending ? { opacity: 0.5 } : undefined} onClick={submit}>
            <span className="ch">›</span> {charge ? "Enregistrer la charge" : "Créer la charge"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Une ligne de l'onglet Charges : sa nature, sa charge en base si elle existe. */
type LigneCharges = { cle: string; charge?: Record<string, unknown>; type: string };
type MontantsCharge = { total: string; recup: string };

/**
 * Une ligne de charge avec ses deux montants saisissables.
 *
 * Déclarée ICI, au niveau du module, et pas dans le corps de `ChargesTab` :
 * un composant défini pendant le rendu est une NOUVELLE fonction à chaque
 * rendu, donc React démonte et remonte l'ancien à chaque frappe. Vérifié au
 * navigateur avant de la sortir : taper « 1234 » laissait « 1 » dans la case
 * et le curseur nulle part.
 */
function LigneChargeSaisie({
  charge, type, valeur, onValeur, onOuvrir, onSupprimer,
}: {
  charge?: Record<string, unknown>; type: string;
  valeur: MontantsCharge; onValeur: (v: MontantsCharge) => void;
  onOuvrir?: () => void; onSupprimer?: () => void;
}) {
  const t = parse(valeur.total), r = parse(valeur.recup);
  const nr = t !== undefined ? t - (r ?? 0) : undefined;
  return (
    <LigneCharge
      type={type}
      titre={`${type}${charge?.type_autre ? ` — ${String(charge.type_autre)}` : ""}`}
      detail={
        <>
          <SaisieMontants
            total={valeur.total} recup={valeur.recup}
            onTotal={(x) => onValeur({ ...valeur, total: x })}
            onRecup={(x) => onValeur({ ...valeur, recup: x })}
          />
          {charge?.commentaire ? <span className="chg-com">{String(charge.commentaire)}</span> : null}
        </>
      }
      montant={nr !== undefined ? <>{euros(nr) ?? "0 €"}<i>/an</i></> : <span className="nc">n.c.</span>}
      onOuvrir={onOuvrir}
      onSupprimer={onSupprimer}
    />
  );
}

/**
 * L'onglet Charges.
 *
 * Les deux montants de chaque ligne se saisissent sur la ligne, comme la taxe
 * foncière (retour #257) — et l'onglet n'a qu'UNE barre d'enregistrement, qui
 * les envoie tous. Une barre par ligne se serait superposée aux autres au même
 * endroit de l'écran : c'est le défaut qui a coûté les retours #264 et #265
 * sur les composants.
 */
function ChargesTab({ b }: { b: BienData }) {
  const immeubleId = String(b.im._id);
  const [pending, start] = useTransition();
  const [ouverte, setOuverte] = useState<Record<string, unknown> | null>(null);
  const [creation, setCreation] = useState(false);

  const taxes = b.charges.filter((c) => TAXES.has(String(c.Type_charge ?? "")) && String(c.Type_charge ?? "") !== LIGNE_TF);
  const autres = b.charges.filter((c) => !TAXES.has(String(c.Type_charge ?? "")));
  const tf = b.charges.find((c) => String(c.Type_charge ?? "") === LIGNE_TF);

  /* La taxe foncière figure sur tous les immeubles : sa ligne est là même
     sans charge en base (#89), sous une clé qui dit qu'elle reste à créer. */
  const lignes = [
    { cle: tf ? String(tf._id) : "tf", charge: tf, type: LIGNE_TF },
    ...taxes.map((c) => ({ cle: String(c._id), charge: c, type: String(c.Type_charge ?? "") })),
    ...autres.map((c) => ({ cle: String(c._id), charge: c, type: String(c.Type_charge ?? "") })),
  ];

  type Montants = MontantsCharge;
  const depart = () =>
    Object.fromEntries(lignes.map(({ cle, charge }) => [
      cle, { total: S(num(charge?.total_an)), recup: S(num(charge?.recup_an)) } as Montants,
    ]));
  const [saisie, setSaisie] = useState<Record<string, Montants>>(depart);
  const maj = (cle: string, v: Montants) => setSaisie((m) => ({ ...m, [cle]: v }));

  const { avant: enBase, modifie, poser } = useBaseSaisie(saisie);

  const enregistrer = () =>
    start(async () => {
      const avant = enBase();
      for (const { cle, charge, type } of lignes) {
        const v = saisie[cle];
        const a = avant[cle];
        if (!v || (a && a.total === v.total && a.recup === v.recup)) continue;
        const t = parse(v.total), r = parse(v.recup);
        const nr = t !== undefined ? t - (r ?? 0) : undefined;
        if (charge) {
          await updateCharge(immeubleId, String(charge._id), {
            total_an: v.total.trim() === "" ? null : t,
            recup_an: v.recup.trim() === "" ? null : r,
            non_recup_an: nr ?? null,
          });
        } else if (t !== undefined || r !== undefined) {
          await addCharge(immeubleId, { Type_charge: type, total_an: t, recup_an: r, non_recup_an: nr });
        }
      }
      poser(saisie);
    });

  const annuler = () => setSaisie(enBase());

  const total = b.charges.reduce((s, c) => s + (num(c.total_an) ?? 0), 0);
  const nonRecup = b.charges.reduce((s, c) => s + (num(c.non_recup_an) ?? 0), 0);

  const rendreLigne = ({ cle, charge, type }: LigneCharges) => (
    <LigneChargeSaisie
      key={cle} charge={charge} type={type}
      valeur={saisie[cle] ?? { total: "", recup: "" }}
      onValeur={(v) => maj(cle, v)}
      onOuvrir={charge ? () => setOuverte(charge) : undefined}
      onSupprimer={charge && type !== LIGNE_TF ? () => {
        if (!confirm("Supprimer cette charge ? (récupérable dans la corbeille)")) return;
        start(() => deleteCharge(immeubleId, String(charge._id)));
      } : undefined}
    />
  );

  return (
    <div style={pending ? { opacity: 0.6 } : undefined}>
      <div className="blor">
        <div className="blor-t">
          <svg viewBox="0 0 24 24"><rect x="2.5" y="5.5" width="19" height="13" rx="2" /><path d="M2.5 10h19M6 14.5h4" /></svg>
          Charges
        </div>
        <div className="blor-chips">
          <span className={`fchip${total ? "" : " off"}`}>
            <b>{euros(b.im.fin_charges_total) ?? euros(total) ?? "0 €"}</b> /an
          </span>
          <span className={`fchip${nonRecup ? "" : " off"}`}>
            dont <b>{euros(b.im.fin_charges_non_recup) ?? euros(nonRecup) ?? "0 €"}</b> non récupérables
          </span>
        </div>
      </div>
      <div className="blor-add">
        <button className="fadd" type="button" onClick={() => setCreation(true)}>+ Ajouter une charge</button>
      </div>

      <div className="fsub">Taxes et impôts</div>
      {lignes.filter((l) => TAXES.has(l.type)).map(rendreLigne)}

      <div className="fsub" style={{ marginTop: 16 }}>Charges</div>
      {autres.length === 0
        ? <div className="fempty">Aucune charge saisie.</div>
        : lignes.filter((l) => !TAXES.has(l.type)).map(rendreLigne)}

      <BarreEnregistrer modifie={modifie} pending={pending} onEnregistrer={enregistrer} onAnnuler={annuler} />

      {creation && <ModaleCharge b={b} onFermer={() => setCreation(false)} />}
      {ouverte && <ModaleCharge b={b} charge={ouverte} onFermer={() => setOuverte(null)} />}
    </div>
  );
}

/* ---------- Conteneur à sous-onglets ---------- */

export const ONGLETS_LOCATIF = [
  { key: "lots", label: "Lots" },
  { key: "baux", label: "Baux" },
  { key: "locataires", label: "Locataires" },
  { key: "charges", label: "Charges" },
] as const;

export function LocatifTabs({ b, tab: pilote, onTab }: {
  b: BienData;
  /** Onglet piloté depuis le rail (retour #12) ; sinon état interne. */
  tab?: string;
  onTab?: (t: string) => void;
}) {
  const [interne, setInterne] = useState("lots");
  const tab = pilote ?? interne;
  const setTab = (t: string) => { setInterne(t); onTab?.(t); };
  const tabs = [
    { key: "lots", label: "Lots", n: b.lots.length },
    { key: "baux", label: "Baux", n: b.baux.length },
    { key: "locataires", label: "Locataires", n: b.locataires.length },
    { key: "charges", label: "Charges", n: b.charges.length },
  ] as const;
  return (
    <>
      <div className="ftabs">
        {tabs.map((t) => (
          <button key={t.key} type="button" className={`ftab${tab === t.key ? " on" : ""}`} onClick={() => setTab(t.key)}>
            <Picto nom={t.key} className="ftab-ic" />{t.label}{t.n > 0 ? <span className="n">{t.n}</span> : null}
          </button>
        ))}
      </div>
      {tab === "lots" && <LotsEditor key={`${String(b.im.app_modified ?? "")}-${b.lots.length}`} b={b} />}
      {tab === "baux" && <BauxTab b={b} />}
      {tab === "locataires" && <LocatairesTab b={b} />}
      {tab === "charges" && <ChargesTab b={b} />}
    </>
  );
}
