"use client";

/**
 * Les pages d'un bien vendu par lot (étape 1 du cadrage du 20/11/26,
 * CLAUDE.md §7.11) : la puce « nature du bien » du rail, puis « Bail et
 * locataire », « Copropriété » et « Emplacement commercial ».
 *
 * Ce que l'état locatif porte déjà (loyer, type de bail, date d'entrée, dépôt,
 * indice, nom du locataire) n'est pas ressaisi ici : la page le relit et
 * renvoie à l'état locatif pour le corriger. Elle n'ajoute que ce qui manque à
 * un investisseur — les clauses du bail, la société qui exploite, les repères.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BienData } from "@/lib/bubble/server";
import { societeDuSiren, updateLotCopro } from "@/lib/bo/actions";
import {
  QUALITES_EMPLACEMENT, QUI_PAIE, bailLocalDe, chargesAnnuelles, coproDe, emplacementCommerceDe,
  enCopropriete, estBailCommercial, etatLocatifDuLot, locataireLocalDe, reperesBail, tantiemesVendus, tonTauxEffort,
  type BailLocal, type Copro, type EmplacementCommerce, type LocataireLocal, type LotCopro, type TravauxVotes,
} from "@/lib/bo/lot-copro";
import { INDICES_BAIL } from "@/lib/referentiels";
import { useBaseSaisie } from "@/lib/base-saisie";
import { BarreEnregistrer } from "@/components/barre-enregistrer";
import { Modale } from "@/components/modale";
import { Champ } from "@/components/champ";

/* ------------------------------------------------------------- outils --- */

const N = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const S = (v: unknown) => (typeof v === "string" ? v : "");
const nb = (v: string) => {
  const x = Number(v.replace(/\s/g, "").replace(",", "."));
  return v.trim() && Number.isFinite(x) ? x : undefined;
};
const eur = (n?: number) => (n === undefined ? "" : `${Math.round(n).toLocaleString("fr-FR")} €`);
const jjmmaaaa = (iso?: string) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
const pct = (n?: number, d = 1) => (n === undefined ? "" : `${n.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: 2 })} %`);

/** Retire les cases vides : une ligne effacée ne doit pas rester à « » en base. */
function nettoyer<T extends Record<string, unknown>>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null || v === "" || (typeof v === "number" && !Number.isFinite(v))) continue;
    out[k] = v;
  }
  return out as T;
}

const depuisEtatLocatif = (b: BienData) => etatLocatifDuLot(b);

function Titre({ children, droite }: { children: React.ReactNode; droite?: React.ReactNode }) {
  return <h3 className="lc-t"><span>{children}</span>{droite}</h3>;
}

function Texte({ libelle, valeur, onChange, aide, lignes }: {
  libelle: string; valeur?: string; onChange: (v: string) => void; aide?: string; lignes?: number;
}) {
  return (
    <Champ libelle={libelle} aide={aide}>
      {lignes
        ? <textarea className="min" rows={lignes} value={valeur ?? ""} onChange={(e) => onChange(e.target.value)} />
        : <input className="min" value={valeur ?? ""} onChange={(e) => onChange(e.target.value)} />}
    </Champ>
  );
}

/** Une case de montant. La saisie reste du texte tant qu'on tape (#625) ; un
 *  retour arrière de la page (Annuler) la remet d'accord avec la valeur. */
function SaisieNombre({ valeur, onChange, className = "min", ...reste }: {
  valeur?: number; onChange: (v: number | undefined) => void; className?: string;
  placeholder?: string; "aria-label"?: string;
}) {
  const [brut, setBrut] = useState(valeur === undefined ? "" : String(valeur));
  const [dernier, setDernier] = useState(valeur);
  if (valeur !== dernier) {
    setDernier(valeur);
    if (nb(brut) !== valeur) setBrut(valeur === undefined ? "" : String(valeur));
  }
  return (
    <input className={className} inputMode="decimal" value={brut} {...reste}
      onChange={(e) => { setBrut(e.target.value); onChange(nb(e.target.value)); }} />
  );
}

function Nombre({ libelle, valeur, onChange, aide, suffixe }: {
  libelle: string; valeur?: number; onChange: (v: number | undefined) => void; aide?: string; suffixe?: string;
}) {
  return (
    <Champ libelle={libelle} aide={aide}>
      <span className="lc-nb">
        <SaisieNombre valeur={valeur} onChange={onChange} />
        {suffixe && <i>{suffixe}</i>}
      </span>
    </Champ>
  );
}

/** Le jour de la révision annuelle, saisi « jj/mm », gardé « mm-jj ». */
function JourDuMois({ valeur, onChange }: { valeur?: string; onChange: (v: string | undefined) => void }) {
  const enClair = (v?: string) => (v && /^\d{2}-\d{2}$/.test(v) ? `${v.slice(3)}/${v.slice(0, 2)}` : "");
  const lire = (t: string) => {
    const m = t.trim().match(/^(\d{1,2})\D(\d{1,2})$/);
    if (!m) return undefined;
    const [j, mo] = [Number(m[1]), Number(m[2])];
    return j >= 1 && j <= 31 && mo >= 1 && mo <= 12 ? `${String(mo).padStart(2, "0")}-${String(j).padStart(2, "0")}` : undefined;
  };
  const [brut, setBrut] = useState(enClair(valeur));
  const [dernier, setDernier] = useState(valeur);
  if (valeur !== dernier) {
    setDernier(valeur);
    if (lire(brut) !== valeur) setBrut(enClair(valeur));
  }
  return <input className="min" placeholder="jj/mm" value={brut} onChange={(e) => { setBrut(e.target.value); onChange(lire(e.target.value)); }} />;
}

function Jour({ libelle, valeur, onChange, aide }: { libelle: string; valeur?: string; onChange: (v: string) => void; aide?: string }) {
  return (
    <Champ libelle={libelle} aide={aide}>
      <input className="min" type="date" value={valeur ?? ""} onChange={(e) => onChange(e.target.value)} />
    </Champ>
  );
}

function Choix({ libelle, valeur, options, onChange }: { libelle: string; valeur?: string; options: readonly string[]; onChange: (v: string) => void }) {
  return (
    <Champ libelle={libelle}>
      <select className="min" value={valeur ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="" />
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </Champ>
  );
}

/* ------------------------------------- la copropriété, dans le rail --- */

/**
 * La puce du rail : immeuble entier, ou bien en copropriété. Un clic la
 * corrige. Ce que le bien contient ne se demande pas ici : il se lit dans
 * l'état locatif (MAV, 20/11).
 */
export function PuceCopro({ b }: { b: BienData }) {
  const router = useRouter();
  const id = String(b.im._id);
  const [ouverte, setOuverte] = useState(false);
  const [copro, setCopro] = useState(enCopropriete(b.im));
  const [pending, start] = useTransition();
  return (
    <>
      <button type="button" className="lc-puce" title="Immeuble entier ou bien en copropriété ?"
        onClick={() => { setCopro(enCopropriete(b.im)); setOuverte(true); }}>
        {enCopropriete(b.im) ? "Bien en copropriété" : "Immeuble entier"}
      </button>
      {ouverte && (
        <Modale titre={<b>Que vend-on ?</b>} onFermer={() => setOuverte(false)} largeur={520}
          pied={<>
            <span style={{ flex: 1 }} />
            <button type="button" className="fadd" onClick={() => setOuverte(false)}>Annuler</button>
            <button type="button" className="kgo" disabled={pending}
              onClick={() => start(async () => {
                await updateLotCopro(id, { en_copropriete: copro });
                setOuverte(false);
                router.refresh();
              })}>{pending ? "Enregistrement…" : "Enregistrer"}</button>
          </>}>
          <div className="nat-choix">
            <div className="seg">
              <button type="button" className={!copro ? "on" : undefined} onClick={() => setCopro(false)}>Un immeuble entier</button>
              <button type="button" className={copro ? "on" : undefined} onClick={() => setCopro(true)}>Un bien en copropriété</button>
            </div>
            <p className="mhint">
              Un bien en copropriété ouvre les pages « Bail et locataire » et « Copropriété » de la fiche, et les ajoute au dossier.
              Ce que le bien contient (commerce, bureaux, logement, cave, parking) se saisit dans l&apos;état locatif.
            </p>
          </div>
        </Modale>
      )}
    </>
  );
}

/* ------------------------------------------------- Bail et locataire --- */

export function BailLocataireSection({ b, versLocatif }: { b: BienData; versLocatif: () => void }) {
  const router = useRouter();
  const id = String(b.im._id);
  const [bail, setBail] = useState<BailLocal>(() => bailLocalDe(b.im));
  const [loc, setLoc] = useState<LocataireLocal>(() => locataireLocalDe(b.im));
  const courant = { bail: nettoyer(bail), loc: nettoyer(loc) };
  const { modifie, avant, poser } = useBaseSaisie(courant);
  const [pending, start] = useTransition();
  const [recherche, startRecherche] = useTransition();
  const [message, setMessage] = useState<{ ton: "ok" | "ko"; texte: string } | null>(null);
  const majBail = <K extends keyof BailLocal>(k: K, v: BailLocal[K]) => setBail((p) => ({ ...p, [k]: v }));
  const majLoc = <K extends keyof LocataireLocal>(k: K, v: LocataireLocal[K]) => setLoc((p) => ({ ...p, [k]: v }));

  const el = depuisEtatLocatif(b);
  /* Le jour ne compte que pour les durées : pris une fois à l'ouverture. */
  const [aujourdHui] = useState(() => new Date());
  const commercial = estBailCommercial(el.typeBail);
  const r = reperesBail({
    loyerAnnuel: el.loyerAnnuel, prixHai: N(b.im.prix_hai), surface: el.surface,
    effet: commercial || bail.fin ? el.effet : undefined, bail, locataire: loc, aujourdHui,
  });
  const loue = !!el.loyerAnnuel;

  const preremplir = () => startRecherche(async () => {
    setMessage(null);
    const rep = await societeDuSiren(loc.siren ?? "");
    if (!rep.ok) { setMessage({ ton: "ko", texte: rep.erreur }); return; }
    const s = rep.societe;
    setLoc((p) => ({
      ...p, siren: s.siren,
      societe: s.societe ?? p.societe, creee_le: s.creee_le ?? p.creee_le, dirigeant: s.dirigeant ?? p.dirigeant,
      etablissements: s.etablissements ?? p.etablissements,
      /* Sans comptes publiés, on ne touche pas aux chiffres déjà saisis. */
      ...(s.ca !== undefined ? { ca: s.ca, ca_annee: s.ca_annee, resultat: s.resultat } : null),
      source_le: new Date().toISOString().slice(0, 10),
    }));
    setMessage({
      ton: "ok",
      texte: s.ca !== undefined
        ? `Société retrouvée, comptes ${s.ca_annee} publiés. Relisez, puis enregistrez.`
        : "Société retrouvée. Elle ne publie pas ses comptes : le chiffre d'affaires reste à saisir. Relisez, puis enregistrez.",
    });
  });

  const enregistrer = () => start(async () => {
    await updateLotCopro(id, { bail_local: courant.bail, locataire_local: courant.loc });
    poser(courant);
    router.refresh();
  });
  const annuler = () => { const a = avant(); setBail(a.bail); setLoc(a.loc); setMessage(null); };

  const ton = tonTauxEffort(r.tauxEffort);
  return (
    <div className="lc">
      <div className="lc-bloc">
        <Titre droite={<button type="button" className="fadd" onClick={versLocatif}>Modifier dans l&apos;état locatif</button>}>
          Ce que l&apos;outil en tire
        </Titre>
        {!loue && (
          <p className="lc-vide">
            Aucun loyer à l&apos;état locatif : le local est vendu libre. Les repères du bail apparaîtront dès qu&apos;un loyer y sera saisi.
          </p>
        )}
        <div className="lc-tuiles">
          {r.rendement !== undefined && <div className="lc-tuile"><b>{pct(r.rendement, 2)}</b><span>rendement brut<br />{eur(el.loyerAnnuel)} ÷ {eur(N(b.im.prix_hai))}</span></div>}
          {r.tauxEffort !== undefined && <div className={`lc-tuile ${ton}`}><b>{pct(r.tauxEffort)}</b><span>taux d&apos;effort<br />loyer ÷ chiffre d&apos;affaires ({r.tauxEffortSource})</span></div>}
          {r.dureeFerme && <div className="lc-tuile"><b>{r.dureeFerme}</b><span>durée ferme restante<br />jusqu&apos;au {jjmmaaaa(r.prochaineEcheance)}</span></div>}
          {r.loyerM2 !== undefined && <div className="lc-tuile"><b>{r.loyerM2.toLocaleString("fr-FR")} €/m²</b><span>loyer annuel<br />sur {el.surface} m²{el.annexes ? ` (+ ${el.annexes} m² d'annexes)` : ""}</span></div>}
          {!loue && r.prixM2 !== undefined && <div className="lc-tuile"><b>{r.prixM2.toLocaleString("fr-FR")} €/m²</b><span>prix honoraires inclus<br />sur {el.surface} m²</span></div>}
          {loue && r.prochaineRevision && <div className="lc-tuile"><b>{jjmmaaaa(r.prochaineRevision)}</b><span>prochaine révision{el.indice ? <><br />indice {el.indice}</> : null}</span></div>}
        </div>
        {r.echeances.length > 0 && r.avancement !== undefined && (
          <div className="lc-frise" role="img"
            aria-label={`Bail du ${jjmmaaaa(el.effet)} : ${r.echeances.map((e) => `${e.libelle} le ${jjmmaaaa(e.date)}`).join(", ")}`}>
            <div className="lc-rail" /><div className="lc-fait" style={{ width: `${r.avancement * 100}%` }} />
            <div className="lc-rep deb" style={{ left: 0 }}><b>Effet</b><span>{jjmmaaaa(el.effet)}</span></div>
            {r.echeances.map((e, i) => {
              const dernier = i === r.echeances.length - 1;
              return (
                <div key={e.date} className={`lc-rep${dernier ? " fin" : ""}`}
                  style={{ left: dernier ? "calc(100% - 2px)" : `${((i + 1) / r.echeances.length) * 100}%` }}>
                  <b>{e.libelle}</b><span>{jjmmaaaa(e.date)}</span>
                </div>
              );
            })}
            {r.avancement < 1 && <div className="lc-auj" style={{ left: `${r.avancement * 100}%` }}><b>aujourd&apos;hui</b></div>}
          </div>
        )}
        {commercial && r.prochaineEcheance && r.congeAvant && (
          <p className="lc-alerte">
            Le locataire peut donner congé pour le {jjmmaaaa(r.prochaineEcheance)} en prévenant six mois avant,
            soit au plus tard le {jjmmaaaa(r.congeAvant)}. À dire à l&apos;acquéreur.
          </p>
        )}
      </div>

      <div className="lc-duo">
        <div className="lc-bloc">
          <Titre>Le bail</Titre>
          <dl className="lc-lu">
            <div><dt>Type</dt><dd>{el.typeBail ? (commercial ? "Commercial 3/6/9" : el.typeBail) : <i>non saisi</i>}</dd></div>
            <div><dt>Date d&apos;effet</dt><dd>{jjmmaaaa(el.effet) || <i>non saisie</i>}</dd></div>
            <div><dt>Loyer annuel HT HC</dt><dd>{el.loyerAnnuel ? <><b>{eur(el.loyerAnnuel)}</b>{el.loyerInitial ? ` · initial ${eur(el.loyerInitial * 12)}` : ""}</> : <i>aucun</i>}</dd></div>
            <div><dt>Dépôt de garantie</dt><dd>{el.depot ? eur(el.depot) : <i>non saisi</i>}</dd></div>
            <div><dt>Indice</dt><dd>{el.indice ?? <i>non saisi</i>}</dd></div>
          </dl>
          <p className="mhint">Ces cinq lignes viennent de l&apos;état locatif. Le reste se saisit ici.</p>
          <div className="lc-grille">
            <Jour libelle="Signé le" valeur={bail.signe_le} onChange={(v) => majBail("signe_le", v)} />
            <Jour libelle="Fin du bail" valeur={bail.fin} onChange={(v) => majBail("fin", v)} aide="Vide : neuf ans après la date d'effet" />
            <Champ libelle="Révision chaque" aide={`Indice : ${el.indice ?? INDICES_BAIL.join(", ")} (état locatif)`}>
              <JourDuMois valeur={bail.revision} onChange={(v) => majBail("revision", v)} />
            </Champ>
            <Texte libelle="Destination" valeur={bail.destination} onChange={(v) => majBail("destination", v)} aide="L'activité permise par le bail" />
            <Choix libelle="Taxe foncière" valeur={bail.taxe_fonciere} options={QUI_PAIE} onChange={(v) => majBail("taxe_fonciere", v)} />
            <Choix libelle="Charges de copropriété" valeur={bail.charges_copro} options={QUI_PAIE} onChange={(v) => majBail("charges_copro", v)} />
            <Choix libelle="Gros travaux" valeur={bail.gros_travaux} options={QUI_PAIE} onChange={(v) => majBail("gros_travaux", v)} />
            <Texte libelle="Autre garantie" valeur={bail.garantie} onChange={(v) => majBail("garantie", v)} aide="Caution, garantie bancaire…" />
            <Texte libelle="Cession, sous-location" valeur={bail.cession} onChange={(v) => majBail("cession", v)} />
            <Texte libelle="Impayés, procédure" valeur={bail.impayes} onChange={(v) => majBail("impayes", v)} aide="« Aucun » s'imprime dans le dossier" />
          </div>
          <label className="lc-case">
            <input type="checkbox" checked={bail.tva === true} onChange={(e) => majBail("tva", e.target.checked || undefined)} />
            Loyer soumis à la TVA
          </label>
          <label className="lc-case">
            <input type="checkbox" checked={bail.droit_preference === true} onChange={(e) => majBail("droit_preference", e.target.checked || undefined)} />
            Le locataire a un droit de préférence sur la vente
            <i>à faire confirmer par le notaire ; le dossier le dit à l&apos;acquéreur</i>
          </label>
        </div>

        <div className="lc-bloc">
          <Titre>Le locataire</Titre>
          <div className="lc-siren">
            <Champ libelle="SIREN">
              <input className="min" inputMode="numeric" value={loc.siren ?? ""} onChange={(e) => majLoc("siren", e.target.value)} placeholder="9 chiffres" />
            </Champ>
            <button type="button" className="fadd" disabled={recherche || (loc.siren ?? "").replace(/\D/g, "").length !== 9} onClick={preremplir}>
              {recherche ? "Recherche…" : "Préremplir depuis le SIREN"}
            </button>
          </div>
          {message && <p className={`lc-msg ${message.ton}`} role="status">{message.texte}</p>}
          {el.nomLocataire && <p className="mhint">À l&apos;état locatif : {el.nomLocataire}.</p>}
          <div className="lc-grille">
            <Texte libelle="Enseigne" valeur={loc.enseigne} onChange={(v) => majLoc("enseigne", v)} />
            <Texte libelle="Activité" valeur={loc.activite} onChange={(v) => majLoc("activite", v)} />
            <Texte libelle="Société" valeur={loc.societe} onChange={(v) => majLoc("societe", v)} />
            <Jour libelle="Créée le" valeur={loc.creee_le} onChange={(v) => majLoc("creee_le", v)} />
            <Texte libelle="Dirigeant" valeur={loc.dirigeant} onChange={(v) => majLoc("dirigeant", v)} aide="Ne sort jamais du BO" />
            <Nombre libelle="Établissements" valeur={loc.etablissements} onChange={(v) => majLoc("etablissements", v)} />
            <Jour libelle="Entré dans les lieux" valeur={loc.entree} onChange={(v) => majLoc("entree", v)} aide="Vide : la date d'effet du bail" />
            <span />
            <Nombre libelle="Chiffre d'affaires publié" valeur={loc.ca} onChange={(v) => majLoc("ca", v)} suffixe="€" />
            <Nombre libelle="Exercice" valeur={loc.ca_annee} onChange={(v) => majLoc("ca_annee", v)} />
            <Nombre libelle="Résultat publié" valeur={loc.resultat} onChange={(v) => majLoc("resultat", v)} suffixe="€" />
            <span />
            <Nombre libelle="Chiffre d'affaires déclaré" valeur={loc.ca_declare} onChange={(v) => majLoc("ca_declare", v)} suffixe="€" aide="Ce qu'on vous a dit, gardé à part des comptes" />
            <Nombre libelle="Année" valeur={loc.ca_declare_annee} onChange={(v) => majLoc("ca_declare_annee", v)} />
          </div>
          {loc.source_le && <p className="mhint">Registre des entreprises consulté le {jjmmaaaa(loc.source_le)}.</p>}
          <Texte libelle="Note interne" valeur={loc.note_interne} onChange={(v) => majLoc("note_interne", v)} lignes={2} aide="Ne sort jamais du BO" />
        </div>
      </div>
      <BarreEnregistrer modifie={modifie} pending={pending} onEnregistrer={enregistrer} onAnnuler={annuler} />
    </div>
  );
}

/* ------------------------------------------------------- Copropriété --- */

export function CoproSection({ b }: { b: BienData }) {
  const router = useRouter();
  const id = String(b.im._id);
  const [c, setC] = useState<Copro>(() => coproDe(b.im));
  const travaux = c.travaux ?? [];
  /* Les lots de copropriété se saisissent ici, à part de l'état locatif : un
     seul bail peut couvrir deux lots aux tantièmes différents (MAV, 20/11). */
  const lots = c.lots ?? [];
  const courant = nettoyer({
    ...c,
    travaux: travaux.map((t) => nettoyer(t)).filter((t) => (t.libelle ?? "").trim()),
    lots: lots.map((l) => nettoyer(l)).filter((l) => Object.keys(l).length > 0),
  }) as Copro;
  if (courant.travaux && courant.travaux.length === 0) delete courant.travaux;
  if (courant.lots && courant.lots.length === 0) delete courant.lots;
  const majLot = (i: number, patch: Partial<LotCopro>) =>
    setC((p) => ({ ...p, lots: (p.lots ?? []).map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const vendus = tantiemesVendus(c);
  const { modifie, avant, poser } = useBaseSaisie(courant);
  const [pending, start] = useTransition();
  const maj = <K extends keyof Copro>(k: K, v: Copro[K]) => setC((p) => ({ ...p, [k]: v }));
  const majTravaux = (i: number, patch: Partial<TravauxVotes>) =>
    setC((p) => ({ ...p, travaux: (p.travaux ?? []).map((t, j) => (j === i ? { ...t, ...patch } : t)) }));
  const annee = chargesAnnuelles(c);
  const quote = vendus && c.tantiemes_base && c.tantiemes_base > 0 ? vendus / c.tantiemes_base : undefined;

  const enregistrer = () => start(async () => {
    await updateLotCopro(id, { copro: courant });
    poser(courant);
    router.refresh();
  });
  return (
    <div className="lc">
      <div className="lc-duo">
        <div className="lc-bloc">
          <Titre>La copropriété</Titre>
          <div className="lc-grille">
            <Nombre libelle="Nombre de lots" valeur={c.lots_total} onChange={(v) => maj("lots_total", v)} />
            <Nombre libelle="dont lots principaux" valeur={c.lots_principaux} onChange={(v) => maj("lots_principaux", v)} />
            <Texte libelle="Syndic" valeur={c.syndic} onChange={(v) => maj("syndic", v)} />
            <Texte libelle="Immatriculation" valeur={c.immatriculation} onChange={(v) => maj("immatriculation", v)} aide="Registre des copropriétés" />
            <Texte libelle="Règlement" valeur={c.reglement} onChange={(v) => maj("reglement", v)} aide="Date, modificatifs" />
            <Texte libelle="Procédure en cours" valeur={c.procedure} onChange={(v) => maj("procedure", v)} aide="« Aucune » s'imprime dans le dossier" />
            <Texte libelle="Chauffage, eau" valeur={c.chauffage} onChange={(v) => maj("chauffage", v)} aide="Collectifs ou individuels" />
            <span />
            <Nombre libelle="Fonds de travaux" valeur={c.fonds_travaux} onChange={(v) => maj("fonds_travaux", v)} suffixe="€" />
            <Jour libelle="Arrêté au" valeur={c.fonds_travaux_au} onChange={(v) => maj("fonds_travaux_au", v)} />
          </div>
        </div>
        <div className="lc-bloc">
          <Titre>Les lots de copropriété vendus</Titre>
          <table className="lc-tab lots">
            <thead><tr><th>N° de lot</th><th>Désignation</th><th>Tantièmes</th><th /></tr></thead>
            <tbody>
              {lots.map((l, i) => (
                <tr key={i}>
                  <td><input className="min" aria-label="Numéro de lot" value={l.numero ?? ""} onChange={(e) => majLot(i, { numero: e.target.value })} /></td>
                  <td><input className="min" aria-label="Désignation" placeholder="Local, réserve, cave, parking…" value={l.designation ?? ""} onChange={(e) => majLot(i, { designation: e.target.value })} /></td>
                  <td><SaisieNombre className="min n" aria-label="Tantièmes" valeur={l.tantiemes} onChange={(v) => majLot(i, { tantiemes: v })} /></td>
                  <td>
                    <button type="button" className="lc-x" title="Retirer ce lot" aria-label="Retirer ce lot"
                      onClick={() => setC((p) => ({ ...p, lots: (p.lots ?? []).filter((_, j) => j !== i) }))}>✕</button>
                  </td>
                </tr>
              ))}
              {lots.length === 0 && <tr><td colSpan={4} className="lc-rien">Aucun lot saisi.</td></tr>}
            </tbody>
          </table>
          <button type="button" className="fadd" onClick={() => setC((p) => ({ ...p, lots: [...(p.lots ?? []), {}] }))}>+ Ajouter un lot de copropriété</button>
          <p className="mhint">
            Les lots du règlement de copropriété, pas les lignes de l&apos;état locatif : un seul bail peut couvrir deux lots aux tantièmes différents.
          </p>
          <div className="lc-grille">
            <Champ libelle="Tantièmes vendus">
              <span className="lc-total">{vendus !== undefined ? vendus.toLocaleString("fr-FR") : "—"}</span>
            </Champ>
            <Nombre libelle="sur" valeur={c.tantiemes_base} onChange={(v) => maj("tantiemes_base", v)} aide={quote !== undefined ? `Soit ${pct(quote * 100)} de l'immeuble` : "1 000, 10 000…"} />
            <Nombre libelle="Charges par trimestre" valeur={c.charges_trimestre} onChange={(v) => maj("charges_trimestre", v)} suffixe="€"
              aide={annee !== undefined ? `Soit ${eur(annee)} par an` : undefined} />
            <Nombre libelle="dont récupérables, par an" valeur={c.charges_recuperables} onChange={(v) => maj("charges_recuperables", v)} suffixe="€" />
            <Nombre libelle="Fonds de travaux, part du lot" valeur={c.fonds_travaux_lot} onChange={(v) => maj("fonds_travaux_lot", v)} suffixe="€ / an" />
            <span />
            {/* La taxe foncière se saisit dans les charges de l'état locatif,
                que la fabrication du dossier réclame déjà : pas deux fois. */}
          </div>
          <Texte libelle="Usage permis par le règlement" valeur={c.usage} onChange={(v) => maj("usage", v)} lignes={2} />
        </div>
      </div>

      <div className="lc-bloc">
        <Titre droite={<span className="lc-ag"><Jour libelle="Dernière assemblée" valeur={c.ag_date} onChange={(v) => maj("ag_date", v)} /></span>}>
          Assemblée et travaux
        </Titre>
        <div className="lc-tab-w">
          <table className="lc-tab">
            <thead><tr><th>Travaux votés</th><th>Montant</th><th>Part du lot</th><th>Appels de fonds</th><th>À la charge de</th><th /></tr></thead>
            <tbody>
              {travaux.map((t, i) => (
                <tr key={i}>
                  <td><input className="min" aria-label="Travaux votés" value={t.libelle ?? ""} onChange={(e) => majTravaux(i, { libelle: e.target.value })} /></td>
                  <td><SaisieNombre className="min n" aria-label="Montant" valeur={t.montant} onChange={(v) => majTravaux(i, { montant: v })} /></td>
                  <td>
                    <SaisieNombre className="min n" aria-label="Part du lot" valeur={t.part}
                      placeholder={quote !== undefined && t.montant ? String(Math.round(t.montant * quote)) : undefined}
                      onChange={(v) => majTravaux(i, { part: v })} />
                  </td>
                  <td><input className="min" aria-label="Appels de fonds" value={t.appels ?? ""} onChange={(e) => majTravaux(i, { appels: e.target.value })} /></td>
                  <td>
                    <select className="min" aria-label="À la charge de" value={t.charge ?? ""} onChange={(e) => majTravaux(i, { charge: e.target.value })}>
                      <option value="" /><option>Vendeur</option><option>Acquéreur</option><option>Soldé</option>
                    </select>
                  </td>
                  <td>
                    <button type="button" className="lc-x" title="Retirer cette ligne" aria-label="Retirer cette ligne"
                      onClick={() => setC((p) => ({ ...p, travaux: (p.travaux ?? []).filter((_, j) => j !== i) }))}>✕</button>
                  </td>
                </tr>
              ))}
              {travaux.length === 0 && <tr><td colSpan={6} className="lc-rien">Aucuns travaux votés saisis.</td></tr>}
            </tbody>
          </table>
        </div>
        <button type="button" className="fadd" onClick={() => setC((p) => ({ ...p, travaux: [...(p.travaux ?? []), { libelle: "" }] }))}>+ Ajouter des travaux votés</button>
        <div className="lc-grille une">
          <Texte libelle="Résumé pour le dossier" valeur={c.resume} onChange={(v) => maj("resume", v)} lignes={2} aide="Trois lignes au plus : ce qu'un acquéreur doit retenir de la dernière assemblée" />
          <Texte libelle="À prévoir" valeur={c.a_prevoir} onChange={(v) => maj("a_prevoir", v)} lignes={2} aide="Travaux évoqués ou inscrits au plan pluriannuel, pas encore votés" />
        </div>
      </div>
      <BarreEnregistrer modifie={modifie} pending={pending} onEnregistrer={enregistrer}
        onAnnuler={() => setC(avant())} />
    </div>
  );
}

/* ------------------------------------------- Emplacement commercial --- */

export function EmplacementCommerceSection({ b }: { b: BienData }) {
  const router = useRouter();
  const id = String(b.im._id);
  const [e, setE] = useState<EmplacementCommerce>(() => emplacementCommerceDe(b.im));
  const courant = nettoyer(e);
  const { modifie, avant, poser } = useBaseSaisie(courant);
  const [pending, start] = useTransition();
  const maj = <K extends keyof EmplacementCommerce>(k: K, v: EmplacementCommerce[K]) => setE((p) => ({ ...p, [k]: v }));
  return (
    <div className="lc">
      <div className="lc-duo">
        <div className="lc-bloc">
          <Titre>L&apos;emplacement</Titre>
          <Champ libelle="Qualité de l'emplacement" aide="N° 1 : l'axe le plus passant du quartier. N° 1 bis : une rue adjacente. N° 2 : à l'écart du flux.">
            <div className="nat-puces">
              {QUALITES_EMPLACEMENT.map((q) => (
                <button key={q} type="button" className={`nat-puce${e.qualite === q ? " on" : ""}`}
                  onClick={() => maj("qualite", e.qualite === q ? undefined : q)}>{q}</button>
              ))}
            </div>
          </Champ>
          <div className="lc-grille une">
            <Texte libelle="La rue" valeur={e.rue} onChange={(v) => maj("rue", v)} aide="Commerçante, sens unique, trottoir large…" />
            <Texte libelle="Vitrine" valeur={e.vitrine} onChange={(v) => maj("vitrine", v)} aide="Linéaire, angle de rue" />
            <Texte libelle="Terrasse" valeur={e.terrasse} onChange={(v) => maj("terrasse", v)} />
            <Texte libelle="Livraisons" valeur={e.livraisons} onChange={(v) => maj("livraisons", v)} />
            <Texte libelle="Stationnement" valeur={e.stationnement} onChange={(v) => maj("stationnement", v)} />
          </div>
        </div>
        <div className="lc-bloc">
          <Titre>Autour</Titre>
          <div className="lc-grille une">
            <Texte libelle="Transports" valeur={e.transports} onChange={(v) => maj("transports", v)} />
            <Texte libelle="Commerces voisins" valeur={e.voisins} onChange={(v) => maj("voisins", v)} />
            <Texte libelle="Concurrents directs" valeur={e.concurrents} onChange={(v) => maj("concurrents", v)} aide="Ne s'imprime pas dans le dossier" />
            <Texte libelle="Locomotives" valeur={e.locomotives} onChange={(v) => maj("locomotives", v)} aide="Ce qui amène du monde : marché, cinéma, gare…" />
            <Texte libelle="Projets du quartier" valeur={e.projets} onChange={(v) => maj("projets", v)} />
          </div>
        </div>
      </div>
      <BarreEnregistrer modifie={modifie} pending={pending}
        onEnregistrer={() => start(async () => { await updateLotCopro(id, { emp_commerce: courant }); poser(courant); router.refresh(); })}
        onAnnuler={() => setE(avant())} />
    </div>
  );
}
