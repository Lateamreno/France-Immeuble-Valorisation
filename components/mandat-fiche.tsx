"use client";

// Écran mandat — cinq onglets, pleine largeur, dans la fiche immeuble.
//
// Ce n'est plus une modale (retour #100) : le rail de droite reste là, on peut
// aller vérifier l'état locatif ou les photos et revenir sans rien perdre.
// L'écran est monté par la page /bien/[id]/mandat/[mid], exactement comme
// l'estimation en cours.
//
// Les cinq onglets suivent la chaîne réelle : QUI signe (Mandants) → QUOI se
// vend (Objet, servi par l'état locatif) → À COMBIEN (Prix) → À QUELLES
// CONDITIONS (Conditions) → et enfin ON ENVOIE (Envoi), verrouillé tant que
// les pièces obligatoires manquent.
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { getMandat } from "@/lib/bubble/server";
import { dmy, euros, group } from "@/lib/format";
import { CHARGES_HONOS, TYPES_EXCLU } from "@/lib/referentiels";
import { ContactPicker } from "@/components/contact-picker";
import {
  FONCTIONS_MANDANT, descriptifLegal, lireMandants, manques, mandantVide, modeVente,
  nomMandant, piecesMandant, publicationWeb, regimeHonoraires, resoudrePrix, synthese, verrou,
  type ChampPrix, type Mandant, type Mode, type Prix, type Societe,
} from "@/lib/mandat";
import { AdresseInput } from "@/components/adresse-input";
import {
  proprietairesPm, type ProprietairePM, type ResultatProprietaires,
} from "@/lib/bo/proprio-actions";
import {
  cancelMandat, chercherEntreprise, deposerPieceMandat, envoyerMandatSignature, genererMandat,
  majMandants, mandantDepuisContact, mandatInfosRecues, marquerMandatSigne, reserveMandatNumero,
  updateMandat, type EntrepriseTrouvee, type MandatPatch,
} from "@/lib/bo/actions";

type Data = NonNullable<Awaited<ReturnType<typeof getMandat>>>;

const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const num = (v: unknown) => (typeof v === "number" ? v : undefined);
const parse = (s: string) => {
  const n = parseFloat(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
};
const dateInput = (v: unknown) => (typeof v === "string" ? v.slice(0, 10) : "");

const TABS = ["Mandants", "Objet", "Prix", "Conditions", "Envoi"] as const;
type Tab = (typeof TABS)[number];

export function MandatFiche({ d }: { d: Data }) {
  const { m, im, lots, agent } = d;
  const mandatId = String(m._id);
  const immeubleId = im ? String(im._id) : "";
  const [tab, setTab] = useState<Tab>("Mandants");
  const [pending, start] = useTransition();

  const statut = S(m.Statut);
  const numero = S(m.numero);
  const motifVerrou = verrou(m);
  const locked = motifVerrou !== null;
  const mandants = useMemo(() => lireMandants(m), [m]);
  const trous = useMemo(() => manques(m, mandants, im), [m, mandants, im]);
  const trousPar = (t: Tab) => trous.filter((x) => x.onglet === t).length;

  const act = (fn: () => Promise<unknown>) => start(async () => { await fn(); });

  return (
    <div className="mdt">
      {/* --- Bandeau d'identité, repris du BO : type, numéro, honos, dates --- */}
      <div className="mdt-head">
        <div className="mdt-id">
          <span className="t">
            {S(m.Type) || "Vente"} {S(m.Type_exclu)}
            {num(m["durée_exclu_jours"]) && S(m.Type_exclu) === "Semi-exclusif"
              ? ` (${m["durée_exclu_jours"]} j)`
              : ""}
          </span>
          <span className={numero ? "n on" : "n"}>{numero ? `# ${numero}` : "Pas de numéro"}</span>
          {euros(m.honos_ttc) && <span className="h">◈ {euros(m.honos_ttc)}</span>}
        </div>
        <div className="mdt-meta">
          <span className={`badge-${statut === "En cours" || statut === "Vendu" ? "g" : ["Annulé", "Expiré"].includes(statut) ? "r" : "o"}`}>
            {statut || "Attente infos"}
          </span>
          <span className="dts">{dmy(m.date_effet) ?? "…"} → {dmy(m.date_fin) ?? "…"}</span>
          {mandants.length > 0 && (
            <span className="mdt-tag">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20c.7-4 3.6-5.6 6.5-5.6s5.8 1.6 6.5 5.6" /></svg>
              {mandants.map(nomMandant).join(" · ")}
            </span>
          )}
          {im && (
            <span className="mdt-tag">
              <svg viewBox="0 0 24 24"><path d="M5 2h11v19h3v2H4v-2h1z" /></svg>
              {S(im.adresse_ville)} — {[S(im.adresse_numero_rue), S(im.adresse_rue)].filter(Boolean).join(" ")}
            </span>
          )}
        </div>
        <div className="mdt-act">
          {!numero && <ReserveBtn mandatId={mandatId} immeubleId={immeubleId} />}
          {statut === "Attente infos" && (
            <button className="mdt-go" type="button" disabled={pending}
              onClick={() => act(() => mandatInfosRecues(mandatId, immeubleId))}>
              <span className="ch">›</span> Infos mandat reçues
            </button>
          )}
          {!["Annulé", "Vendu"].includes(statut) && <CancelBtn mandatId={mandatId} immeubleId={immeubleId} />}
        </div>
      </div>

      {motifVerrou && (
        <div className="mdt-lock">
          {motifVerrou}
          {S(m.pdf_signed) && <a href={S(m.pdf_signed)} target="_blank" rel="noreferrer">Ouvrir l&apos;exemplaire signé</a>}
        </div>
      )}
      {numero && !locked && (
        <div className="mdt-note">
          Numéro <b>{numero}</b> inscrit au registre — il ne peut plus être modifié, ni le mandat supprimé.
        </div>
      )}

      <div className="mdt-tabs">
        {TABS.map((t) => {
          const n = trousPar(t);
          return (
            <button key={t} type="button" className={`mdt-tab${tab === t ? " on" : ""}`} onClick={() => setTab(t)}>
              {t === "Envoi" && trous.length > 0 ? <span className="lk">🔒</span> : n > 0 ? <span className="wn">⚠</span> : <span className="okv">✓</span>}
              {t}
            </button>
          );
        })}
      </div>

      <div className="mdt-body">
        {tab === "Mandants" && (
          <OngletMandants
            mandatId={mandatId} immeubleId={immeubleId} mandants={mandants} locked={locked}
            adresseImmeuble={im
              ? [S(im.adresse_numero_rue), S(im.adresse_rue), S(im.adresse_zipcode), S(im.adresse_ville)]
                .filter(Boolean).join(" ")
              : undefined}
          />
        )}
        {tab === "Objet" && (
          <OngletObjet m={m} im={im} lots={lots} mandatId={mandatId} immeubleId={immeubleId} locked={locked} />
        )}
        {tab === "Prix" && <OngletPrix m={m} lots={lots} mandatId={mandatId} immeubleId={immeubleId} locked={locked} />}
        {tab === "Conditions" && <OngletConditions m={m} mandatId={mandatId} immeubleId={immeubleId} locked={locked} />}
        {tab === "Envoi" && (
          <OngletEnvoi m={m} mandants={mandants} trous={trous} agent={agent}
            mandatId={mandatId} immeubleId={immeubleId} onAller={setTab} />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- Barre bas */

function SaveBar({ onSave, disabled, note }: { onSave: () => void; disabled: boolean; note?: string }) {
  return (
    <div className="mdt-save">
      {note && <span className="nt">{note}</span>}
      <span style={{ flex: 1 }} />
      <button className="mdt-go" type="button" disabled={disabled} onClick={onSave}>
        <span className="ch">›</span> Enregistrer
      </button>
    </div>
  );
}

/* ------------------------------------------------- Onglet 1 · Mandants */

function OngletMandants({
  mandatId, immeubleId, mandants: init, locked, adresseImmeuble,
}: {
  mandatId: string; immeubleId: string; mandants: Mandant[]; locked: boolean;
  /** L'adresse de l'immeuble : c'est par elle qu'on retrouve le propriétaire. */
  adresseImmeuble?: string;
}) {
  const [rows, setRows] = useState<Mandant[]>(init.length ? init : [mandantVide(0)]);
  const [pending, start] = useTransition();

  const maj = (uid: string, patch: Partial<Mandant>) =>
    setRows((r) => r.map((x) => (x.uid === uid ? { ...x, ...patch } : x)));
  const supprimer = (uid: string) => setRows((r) => r.filter((x) => x.uid !== uid));

  const save = () => start(() => majMandants(mandatId, immeubleId, rows));

  return (
    <>
      <Titre
        titre={rows.length > 1 ? "Les mandants" : "Le mandant"}
        aide="Le mandant est un contact de la base : le sélectionner évite de ressaisir son état civil, et les pièces déposées ici enrichissent sa fiche pour les affaires suivantes."
      />

      {!locked && adresseImmeuble && (
        <QuiPossede
          adresse={adresseImmeuble}
          onRetenir={(p) => {
            /* On remplit la PREMIÈRE ligne encore vide de société, sinon on en
               ajoute une : deux propriétaires = deux mandants. */
            setRows((r) => {
              const i = r.findIndex((x) => !x.societe?.nom && !x.contactId);
              const garni = (m: Mandant): Mandant => ({
                ...m,
                personne: "morale",
                societe: { ...m.societe, nom: p.denomination, siren: p.siren ?? m.societe?.siren },
                fonction: m.fonction ?? (p.droit.toLowerCase().startsWith("propriétaire") ? undefined : p.droit),
              });
              if (i >= 0) return r.map((m, j) => (j === i ? garni(m) : m));
              return [...r, garni(mandantVide(r.length))];
            });
          }}
        />
      )}

      <div className="mdt-mandants">
        {rows.map((x, i) => (
          <CarteMandant
            key={x.uid} x={x} rang={i + 1} seul={rows.length === 1} locked={locked}
            mandatId={mandatId} immeubleId={immeubleId}
            onMaj={(p) => maj(x.uid, p)} onSupprimer={() => supprimer(x.uid)}
          />
        ))}
      </div>

      {!locked && (
        <button type="button" className="mdt-add" onClick={() => setRows((r) => [...r, mandantVide(r.length)])}>
          <svg viewBox="0 0 24 24"><circle cx="10" cy="8" r="3.4" /><path d="M3.5 20c.7-4 3.2-5.6 6.5-5.6M17 12v6M14 15h6" /></svg>
          Ajouter un mandant
        </button>
      )}

      {!locked && <SaveBar onSave={save} disabled={pending} note={`${rows.length} mandant${rows.length > 1 ? "s" : ""} · indivision, usufruit et sociétés : autant de lignes que nécessaire`} />}
    </>
  );
}

function CarteMandant({
  x, rang, seul, locked, mandatId, immeubleId, onMaj, onSupprimer,
}: {
  x: Mandant; rang: number; seul: boolean; locked: boolean;
  mandatId: string; immeubleId: string;
  onMaj: (p: Partial<Mandant>) => void; onSupprimer: () => void;
}) {
  const [picker, setPicker] = useState(false);
  const [, start] = useTransition();
  const morale = x.personne === "morale";

  return (
    <div className="mdt-md">
      <div className="mdt-md-h">
        <span className="r">{seul ? "Mandant" : `Mandant ${rang}`}</span>
        <div className="seg">
          {(["physique", "morale"] as const).map((p) => (
            <button key={p} type="button" className={x.personne === p ? "on" : undefined}
              disabled={locked} onClick={() => onMaj({ personne: p })}>
              Personne {p}
            </button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        {!locked && !seul && (
          <button type="button" className="xdel" title="Retirer ce mandant" onClick={onSupprimer}>✕</button>
        )}
      </div>

      {/* Le contact : la carte d'identité de la ligne. */}
      <div className="mdt-md-ct">
        <span className="ic">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20c.7-4 3.6-5.6 6.5-5.6s5.8 1.6 6.5 5.6" /></svg>
        </span>
        <span className={x.contactId ? "nm on" : "nm"}>
          {x.contactId ? [x.prenom, x.nom].filter(Boolean).join(" ") || "Contact sélectionné" : "Aucun contact rattaché"}
        </span>
        {!locked && (
          <button type="button" className="mdt-lien" onClick={() => setPicker(true)}>
            {x.contactId ? "Changer" : "Sélectionner ou créer"}
          </button>
        )}
        {x.contactId && (
          <Link className="mdt-lien" href={`/contact/${x.contactId}`}>Ouvrir la fiche</Link>
        )}
      </div>

      {picker && (
        <ContactPicker
          titre={morale ? "Sélectionner le représentant" : "Sélectionner le mandant"}
          libelleValider="Rattacher au mandat"
          valeurActuelle={[x.prenom, x.nom].filter(Boolean).join(" ") || undefined}
          onAnnuler={() => setPicker(false)}
          onValider={(c) => {
            const [p, ...r] = (c.nom ?? "").split(" ");
            onMaj({ contactId: c.id, prenom: p, nom: r.join(" ") || undefined, email: c.email });
            setPicker(false);
            /* Le contact sait déjà tout : civilité, naissance, adresse, société.
               On recopie, sans écraser ce qui a été saisi à la main sur cette
               ligne (retour #133). */
            start(async () => {
              const f = await mandantDepuisContact(c.id).catch(() => null);
              if (!f) return;
              const p2: Partial<Mandant> = {};
              if (!x.qualite && f.civilite) p2.qualite = f.civilite;
              if (f.prenom) p2.prenom = f.prenom;
              if (f.nom) p2.nom = f.nom;
              if (f.email) p2.email = f.email;
              if (!x.dateNaissance && f.dateNaissance) p2.dateNaissance = f.dateNaissance;
              if (!x.lieuNaissance && f.lieuNaissance) p2.lieuNaissance = f.lieuNaissance;
              if (!x.adresse && f.adresse) p2.adresse = f.adresse;
              if (!x.fonction && f.fonction) p2.fonction = f.fonction;
              const s = f.societe ?? {};
              const soc: Societe = { ...x.societe };
              let aSociete = false;
              for (const k of ["nom", "siren", "rcs", "siege"] as const) {
                if (!soc[k] && s[k]) { soc[k] = s[k]; aSociete = true; }
              }
              if (soc.capital === undefined && s.capital !== undefined) { soc.capital = s.capital; aSociete = true; }
              if (aSociete) p2.societe = soc;
              /* La fiche porte une société et rien n'a encore été choisi : le
                 mandant est vraisemblablement une personne morale. */
              if (aSociete && soc.nom && x.personne === "physique" && !x.societe?.nom) p2.personne = "morale";
              onMaj(p2);
            });
          }}
        />
      )}

      {/* Toutes les cases sur une grille — plus d'escalier (retour #101). */}
      <div className="mdt-grid">
        <Champ label="Civilité">
          <select className="mi" value={x.qualite ?? ""} disabled={locked}
            onChange={(e) => onMaj({ qualite: e.target.value || undefined })}>
            <option value="">—</option><option>M.</option><option>Mme</option>
          </select>
        </Champ>
        <Champ label="Prénom">
          <input className="mi" value={x.prenom ?? ""} disabled={locked}
            onChange={(e) => onMaj({ prenom: e.target.value || undefined })} />
        </Champ>
        <Champ label="Nom">
          <input className="mi maj" value={x.nom ?? ""} disabled={locked}
            onChange={(e) => onMaj({ nom: e.target.value || undefined })} />
        </Champ>
        <Champ label="Qualité au mandat">
          {/* Champ libre avec suggestions : le BO contient « Gérant dûment
              habilité », « Gérant - Associé »… qu'une liste fermée perdrait. */}
          <input className="mi" list="mdt-fonctions" value={x.fonction ?? ""} disabled={locked}
            placeholder={morale ? "Gérant, Président…" : "Propriétaire, Indivisaire…"}
            onChange={(e) => onMaj({ fonction: e.target.value || undefined })} />
          <datalist id="mdt-fonctions">
            {FONCTIONS_MANDANT.map((f) => <option key={f} value={f} />)}
          </datalist>
        </Champ>
        <Champ label="Né(e) le">
          <input className="mi" type="date" value={(x.dateNaissance ?? "").slice(0, 10)} disabled={locked}
            onChange={(e) => onMaj({ dateNaissance: e.target.value || undefined })} />
        </Champ>
        <Champ label="Lieu de naissance">
          <input className="mi" value={x.lieuNaissance ?? ""} disabled={locked}
            onChange={(e) => onMaj({ lieuNaissance: e.target.value || undefined })} />
        </Champ>
        <Champ label="Adresse" large>
          {/* Adresse géolocalisée : on tape les premières lettres, la Base
              Adresse Nationale complète (retour #134). */}
          <AdresseInput classe="mi" valeur={x.adresse ?? ""} disabled={locked}
            placeholder="N°, rue, code postal, ville"
            onSaisie={(v) => onMaj({ adresse: v || undefined })}
            onChoisir={(a) => onMaj({ adresse: a.label })} />
        </Champ>
      </div>

      {morale && (
        <>
          <div className="mdt-sub">La société</div>
          {!locked && (
            <ChercheSociete
              onChoisir={(e) => onMaj({
                societe: {
                  ...x.societe,
                  nom: e.nom,
                  siren: e.siren,
                  siege: e.siege ?? x.societe?.siege,
                },
              })}
            />
          )}
          <div className="mdt-grid">
            <Champ label="Raison sociale" large>
              <input className="mi maj" value={x.societe?.nom ?? ""} disabled={locked}
                onChange={(e) => onMaj({ societe: { ...x.societe, nom: e.target.value || undefined } })} />
            </Champ>
            <Champ label="SIREN">
              <input className="mi" value={x.societe?.siren ?? ""} disabled={locked} inputMode="numeric"
                onChange={(e) => onMaj({ societe: { ...x.societe, siren: e.target.value || undefined } })} />
            </Champ>
            <Champ label="RCS">
              <input className="mi" value={x.societe?.rcs ?? ""} disabled={locked}
                onChange={(e) => onMaj({ societe: { ...x.societe, rcs: e.target.value || undefined } })} />
            </Champ>
            <Champ label="Capital (€)">
              <input className="mi" value={x.societe?.capital ?? ""} disabled={locked} inputMode="numeric"
                onChange={(e) => onMaj({ societe: { ...x.societe, capital: parse(e.target.value) } })} />
            </Champ>
            <Champ label="Siège social" large>
              {/* Même champ que l'adresse du mandant (retour #136). */}
              <AdresseInput classe="mi" valeur={x.societe?.siege ?? ""} disabled={locked}
                placeholder="N°, rue, code postal, ville"
                onSaisie={(v) => onMaj({ societe: { ...x.societe, siege: v || undefined } })}
                onChoisir={(a) => onMaj({ societe: { ...x.societe, siege: a.label } })} />
            </Champ>
          </div>
        </>
      )}

      <div className="mdt-sub">Pièces justificatives</div>
      <div className="mdt-pieces">
        {piecesMandant(x).map((p) => (
          <Piece
            key={p.cle} label={p.label} url={p.url} locked={locked}
            mandatId={mandatId} immeubleId={immeubleId} cle={p.cle} contactId={x.contactId}
            onDepose={(url) => onMaj({ [p.cle]: url } as Partial<Mandant>)}
          />
        ))}
      </div>
      {!x.contactId && (
        <div className="mdt-hint">
          Rattachez un contact avant de déposer les pièces : sans lui, elles restent sur ce mandat
          au lieu d&apos;enrichir la fiche du client.
        </div>
      )}
    </div>
  );
}

/**
 * « Qui possède cet immeuble ? » (retour #135)
 *
 * Quand le propriétaire est une personne morale, la DGFiP le publie : le
 * fichier des locaux des personnes morales donne, adresse par adresse, la
 * société détentrice, son SIREN et la nature de son droit. On part de
 * l'adresse de l'immeuble — elle est déjà dans la fiche — et on propose ce
 * qu'on trouve.
 *
 * Les personnes physiques n'y sont pas : un immeuble détenu par un particulier
 * ou une indivision familiale ne rend rien, et c'est normal. On le dit plutôt
 * que de laisser croire à une panne.
 */
function QuiPossede({ adresse, onRetenir }: {
  adresse: string;
  onRetenir: (p: ProprietairePM) => void;
}) {
  const [res, setRes] = useState<ResultatProprietaires | null>(null);
  const [pending, start] = useTransition();
  const [pris, setPris] = useState<string[]>([]);

  const chercher = () =>
    start(async () => {
      setPris([]);
      setRes(await proprietairesPm(adresse).catch(() => ({ ok: false as const, erreur: "Recherche impossible." })));
    });

  return (
    <div className="mdt-qp">
      <div className="mdt-qp-h">
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M3 10.5 12 4l9 6.5" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" />
        </svg>
        <span>
          <b>Qui possède cet immeuble ?</b>
          <i>{adresse}</i>
        </span>
        <button type="button" className="fadd" disabled={pending} onClick={chercher}>
          {pending ? "Recherche…" : res ? "Relancer" : "Chercher le propriétaire"}
        </button>
      </div>

      {res && !res.ok && <div className="mdt-qp-v">{res.erreur}</div>}
      {res?.ok && res.liste.length === 0 && (
        <div className="mdt-qp-v">
          Aucune personne morale à cette adresse. Le fichier public ne recense que les sociétés :
          le propriétaire est donc très probablement un particulier ou une indivision.
        </div>
      )}
      {res?.ok && res.liste.length > 0 && (
        <div className="mdt-qp-l">
          {res.liste.map((p) => {
            const cle = `${p.siren ?? p.denomination}|${p.droit}`;
            return (
              <div key={cle} className="mdt-qp-it">
                <b>{p.denomination}</b>
                <span>
                  {[p.forme, p.siren ? `SIREN ${p.siren}` : "SIREN non publié", p.droit,
                    p.parcelle ? `parcelle ${p.parcelle}` : "", p.annee ? `fichier ${p.annee}` : ""]
                    .filter(Boolean).join(" · ")}
                </span>
                <button type="button" className="fadd" disabled={pris.includes(cle)}
                  onClick={() => { onRetenir(p); setPris((v) => [...v, cle]); }}>
                  {pris.includes(cle) ? "✓ Repris" : "Le mettre en mandant"}
                </button>
              </div>
            );
          })}
          <span className="src">
            Fichier des locaux des personnes morales (DGFiP, open data) — les particuliers en sont
            exclus, et un propriétaire a pu vendre depuis le millésime indiqué.
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Recherche de la société dans l'annuaire des entreprises (retour #135).
 *
 * MAV demandait à retrouver le propriétaire d'un immeuble par son adresse :
 * ça, l'open data ne le donne pas — le fichier des propriétaires est fiscal et
 * fermé. Ce qui est ouvert, c'est l'entreprise : on tape le nom ou le SIREN et
 * la raison sociale, le SIREN et le siège se remplissent seuls. Restent le
 * capital et le RCS, qui viennent du registre du commerce.
 */
function ChercheSociete({ onChoisir }: { onChoisir: (e: EntrepriseTrouvee) => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<EntrepriseTrouvee[]>([]);
  const [cherche, setCherche] = useState(false);
  const [vide, setVide] = useState(false);

  useEffect(() => {
    const t = q.trim();
    const timer = setTimeout(() => {
      if (t.length < 3) { setRes([]); setVide(false); setCherche(false); return; }
      setCherche(true);
      chercherEntreprise(t)
        .then((r) => { setRes(r); setVide(r.length === 0); })
        .catch(() => setRes([]))
        .finally(() => setCherche(false));
    }, t.length < 3 ? 0 : 350);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <div className="mdt-soc">
      <label className="mdt-soc-q">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m21 21-4-4" /></svg>
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher la société — raison sociale ou SIREN" />
        {cherche && <i>…</i>}
      </label>
      {res.length > 0 && (
        <div className="mdt-soc-l">
          {res.map((e) => (
            <button key={e.siren} type="button"
              onClick={() => { onChoisir(e); setQ(""); setRes([]); }}>
              <b>{e.nom}</b>
              <span>{[e.forme, `SIREN ${e.siren}`, e.siege].filter(Boolean).join(" · ")}</span>
            </button>
          ))}
          <span className="src">Annuaire des entreprises — données publiques INSEE / INPI</span>
        </div>
      )}
      {vide && q.trim().length >= 3 && !cherche && (
        <div className="mdt-soc-v">Aucune société trouvée — la saisie reste possible ci-dessous.</div>
      )}
    </div>
  );
}

function Champ({ label, children, large }: { label: string; children: React.ReactNode; large?: boolean }) {
  return (
    <label className={`mdt-ch${large ? " lg" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function Piece({
  label, url, locked, mandatId, immeubleId, cle, contactId, onDepose,
}: {
  label: string; url?: string; locked: boolean; mandatId: string; immeubleId: string;
  cle: "cni" | "kbis" | "titre"; contactId?: string; onDepose: (url: string) => void;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const choisir = (f: File | undefined) => {
    if (!f) return;
    start(async () => {
      setErr(null);
      const fd = new FormData();
      fd.set("file", f);
      const r = await deposerPieceMandat(mandatId, immeubleId, cle, contactId, fd);
      if (r.ok) onDepose(r.url);
      else setErr(r.message);
    });
  };

  return (
    <div className={`mdt-pc${url ? " ok" : ""}`}>
      <span className="ic">
        {url ? (
          <svg viewBox="0 0 24 24"><path d="m5 13 4 4L19 7" /></svg>
        ) : (
          <svg viewBox="0 0 24 24"><path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7z" /><path d="M14 3v4h4" /></svg>
        )}
      </span>
      <span className="l">{label}</span>
      {url ? (
        <a className="mdt-lien" href={url} target="_blank" rel="noreferrer">Ouvrir</a>
      ) : (
        <span className="mq">manquante</span>
      )}
      {!locked && (
        <label className="mdt-up">
          {pending ? "Envoi…" : url ? "Remplacer" : "Déposer"}
          <input type="file" accept="image/*,application/pdf" disabled={pending}
            onChange={(e) => choisir(e.target.files?.[0])} />
        </label>
      )}
      {err && <span className="er">{err}</span>}
    </div>
  );
}

/* ---------------------------------------------------- Onglet 2 · Objet */

function OngletObjet({
  m, im, lots, mandatId, immeubleId, locked,
}: {
  m: Record<string, unknown>; im: Record<string, unknown> | null; lots: Record<string, unknown>[];
  mandatId: string; immeubleId: string; locked: boolean;
}) {
  const [pending, start] = useTransition();
  const s = useMemo(() => synthese(lots), [lots]);
  const [cad, setCad] = useState(S(m.ref_cadastre));
  const [terrain, setTerrain] = useState(S(num(m.surface_terrain)));
  const auto = useMemo(
    () => descriptifLegal(im ?? {}, lots, cad || undefined, parse(terrain)),
    [im, lots, cad, terrain],
  );
  const dejaEcrit = S(m.description);
  const [libre, setLibre] = useState(!!dejaEcrit && dejaEcrit !== auto);
  const [desc, setDesc] = useState(dejaEcrit || auto);
  const texte = libre ? desc : auto;

  const save = () =>
    start(() =>
      updateMandat(mandatId, immeubleId, {
        ref_cadastre: cad || undefined,
        surface_terrain: parse(terrain),
        // La surface bâtie et l'occupation ne se saisissent plus : elles sont
        // la somme des lots. Les recopier à la main, c'est signer un mandat
        // qui contredit l'état locatif (retours #102 et #103).
        surface_bati: s.surface || undefined,
        occuped_yn: s.occupation !== "libre",
        description: texte,
      }),
    );

  const badge =
    s.occupation === "libre" ? { t: "Vendu libre", c: "v" }
      : s.occupation === "occupe" ? { t: "Vendu occupé", c: "o" }
      : { t: "Partiellement occupé", c: "m" };

  return (
    <>
      <Titre
        titre="L'objet du mandat"
        aide="Occupation, surfaces et répartition des lots viennent de l'état locatif : ils ne se saisissent pas ici. Modifiez le tableau des lots et cet écran suit."
      />

      {/* --- La carte du bien : ce que le mandat va décrire --- */}
      <div className="mdt-bien">
        <div className="mdt-bien-h">
          <div className="ad">
            <b>{im ? [S(im.adresse_numero_rue), S(im.adresse_rue)].filter(Boolean).join(" ") : "Aucun immeuble rattaché"}</b>
            <span>{im ? `${S(im.adresse_zipcode)} ${S(im.adresse_ville)}` : "—"}</span>
          </div>
          <span className={`mdt-occ ${badge.c}`}>{badge.t}</span>
          {immeubleId && <Link className="mdt-lien" href={`/bien/${immeubleId}`}>Voir l&apos;état locatif</Link>}
        </div>
        <div className="mdt-stats">
          <Stat k="Lots" v={String(s.lots)} />
          <Stat k="Occupés" v={String(s.occupes)} d={s.libres ? `${s.libres} libre${s.libres > 1 ? "s" : ""}` : undefined} />
          <Stat k="Surface" v={s.surface ? `${group(s.surface)} m²` : "—"} d="Carrez cumulé" />
          <Stat k="Loyers" v={s.loyerMensuel ? `${group(s.loyerMensuel)} €` : "—"} d="par mois HC" />
          <Stat k="Baux" v={s.baux.length ? s.baux.join(", ") : "—"} />
        </div>
        {s.parDestination.length > 0 && (
          <div className="mdt-dest">
            {s.parDestination.map((x) => (
              <span key={x.destination} className="pill">
                <b>{x.nb}</b> {x.destination}{x.surface ? ` · ${group(x.surface)} m²` : ""}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="mdt-sub">Ce qui reste à saisir</div>
      <div className="mdt-grid">
        <Champ label="Références cadastrales">
          <input className="mi" value={cad} disabled={locked} placeholder="ex. AB 0123"
            onChange={(e) => setCad(e.target.value)} />
        </Champ>
        <Champ label="Surface du terrain (m²)">
          <input className="mi" value={terrain} disabled={locked} inputMode="numeric"
            onChange={(e) => setTerrain(e.target.value)} />
        </Champ>
        <Champ label="Surface bâtie (m²)">
          <input className="mi gris" value={s.surface ? group(s.surface) : ""} readOnly title="Somme des lots" />
        </Champ>
        <Champ label="Occupation">
          <input className="mi gris" value={badge.t} readOnly title="Déduite des baux de l'état locatif" />
        </Champ>
      </div>

      <div className="mdt-sub">Titre de propriété</div>
      <div className="mdt-pieces">
        <Piece
          label="Titre de propriété" url={S(m.justif_propriete) || undefined} locked={locked}
          mandatId={mandatId} immeubleId={immeubleId} cle="titre" onDepose={() => undefined}
        />
      </div>

      <div className="mdt-sub">
        Descriptif porté au mandat
        <label className="mdt-tgl">
          <input type="checkbox" checked={libre} disabled={locked}
            onChange={(e) => { setLibre(e.target.checked); if (e.target.checked) setDesc(texte); }} />
          Rédiger à la main
        </label>
      </div>
      {libre ? (
        <>
          <textarea className="mi ta" rows={10} value={desc} disabled={locked}
            onChange={(e) => setDesc(e.target.value)} />
          {desc !== auto && !locked && (
            <button type="button" className="mdt-lien" style={{ marginTop: 8 }} onClick={() => setDesc(auto)}>
              Reprendre le texte rédigé depuis l&apos;état locatif
            </button>
          )}
        </>
      ) : (
        <div className="mdt-auto">
          {auto.split("\n\n").map((par, i) => <p key={i}>{par}</p>)}
          <span className="tag">Rédigé automatiquement depuis l&apos;état locatif</span>
        </div>
      )}

      {!locked && <SaveBar onSave={save} disabled={pending} />}
    </>
  );
}

function Stat({ k, v, d }: { k: string; v: string; d?: string }) {
  return (
    <div className="mdt-st">
      <span className="k">{k}</span>
      <b>{v}</b>
      {d && <span className="d">{d}</span>}
    </div>
  );
}

/* ----------------------------------------------------- Onglet 3 · Prix */

function OngletPrix({
  m, lots, mandatId, immeubleId, locked,
}: {
  m: Record<string, unknown>; lots: Record<string, unknown>[];
  mandatId: string; immeubleId: string; locked: boolean;
}) {
  const [pending, start] = useTransition();
  const [p, setP] = useState<Prix>({
    nv: num(m.prix_nv), hai: num(m.prix_hai), taux: num(m.honos_taux), honos: num(m.honos_ttc),
  });
  /* Les deux dernières cases touchées pilotent les deux autres (retour #104). */
  const [pilotes, setPilotes] = useState<ChampPrix[]>(["nv", "taux"]);
  const [charge, setCharge] = useState(S(m.Charge_hono) || "Acheteur");
  const [mode, setMode] = useState<Mode>(modeVente(m));
  const s = useMemo(() => synthese(lots), [lots]);
  const regime = useMemo(() => regimeHonoraires(lots, mode, charge), [lots, mode, charge]);

  const saisir = (cle: ChampPrix) => (v: string) => {
    const suite = [...pilotes.filter((c) => c !== cle), cle];
    setPilotes(suite);
    setP(resoudrePrix({ ...p, [cle]: parse(v) }, suite));
  };

  const save = () =>
    start(() =>
      updateMandat(mandatId, immeubleId, {
        prix_nv: p.nv, prix_hai: p.hai, honos_taux: p.taux, honos_ttc: p.honos,
        Charge_hono: regime.charge,
        vente_mode: mode,
      } as MandatPatch),
    );

  const deux = [...pilotes].reverse().filter((c, i, t) => t.indexOf(c) === i).slice(0, 2);
  const pilote = (c: ChampPrix) => deux.includes(c);
  const rendement = p.hai && s.loyerMensuel ? ((s.loyerMensuel * 12) / p.hai) * 100 : undefined;

  return (
    <>
      <Titre
        titre="Le prix et les honoraires"
        aide="Quatre cases, deux suffisent : saisissez-en deux, les deux autres se calculent. La dernière case touchée reste toujours celle que vous venez d'écrire."
      />

      <div className="mdt-prix">
        <CasePrix label="Net vendeur" unite="€" v={p.nv} pilote={pilote("nv")} locked={locked} onChange={saisir("nv")} />
        <span className="op">+</span>
        <CasePrix label="Honoraires" unite="€" v={p.honos} pilote={pilote("honos")} locked={locked} onChange={saisir("honos")} />
        <span className="op">=</span>
        <CasePrix label="Prix HAI" unite="€" v={p.hai} pilote={pilote("hai")} locked={locked} onChange={saisir("hai")} fort />
        <span className="op sep">soit</span>
        <CasePrix label="Taux" unite="%" v={p.taux} pilote={pilote("taux")} locked={locked} onChange={saisir("taux")} decimal />
      </div>

      {/* La nature de la vente commande la charge des honoraires : c'est le
          droit de préemption du locataire qui décide, pas l'occupation. */}
      <div className="mdt-sub">Nature de la vente</div>
      <div className="seg lg">
        {([["bloc", "Vente en bloc"], ["decoupe", "Vente à la découpe"]] as const).map(([v, l]) => (
          <button key={v} type="button" className={mode === v ? "on" : undefined}
            disabled={locked} onClick={() => setMode(v)}>{l}</button>
        ))}
      </div>

      <div className="mdt-sub">Charge des honoraires</div>
      <div className="seg lg">
        {CHARGES_HONOS.map((c) => (
          <button key={c} type="button" className={regime.charge === c ? "on" : undefined}
            disabled={locked || regime.impose !== null} onClick={() => setCharge(c)}>
            Charge {c.toLowerCase()}
          </button>
        ))}
      </div>
      <div className={regime.impose ? "mdt-doctrine" : "mdt-doctrine libre"}>
        {regime.impose ? (
          <>
            <b>Charge vendeur imposée.</b> {regime.motif}{" "}
            L&apos;article 4.3 du mandat porte la réserve correspondante : la subrogation du préempteur
            reste acquise face à une commune, mais elle est expressément écartée face au locataire.
          </>
        ) : (
          <>
            <b>Charge libre.</b> {regime.motif}
          </>
        )}
      </div>

      {rendement !== undefined && (
        <div className="mdt-rend">
          Au prix HAI de <b>{euros(p.hai)}</b>, avec {euros(s.loyerMensuel * 12)}{" "}
          de loyers annuels, le rendement affiché à l&apos;acquéreur sera de{" "}
          <b>{rendement.toFixed(2).replace(".", ",")} %</b>.
        </div>
      )}

      {!locked && <SaveBar onSave={save} disabled={pending} />}
    </>
  );
}

function CasePrix({
  label, unite, v, pilote, locked, onChange, fort, decimal,
}: {
  label: string; unite: string; v?: number; pilote: boolean; locked: boolean;
  onChange: (s: string) => void; fort?: boolean; decimal?: boolean;
}) {
  const [brut, setBrut] = useState<string | null>(null);
  const affiche = brut ?? (v === undefined ? "" : decimal ? String(v).replace(".", ",") : group(v));
  return (
    <label className={`mdt-cp${pilote ? " pilote" : ""}${fort ? " fort" : ""}`}>
      <span className="l">{label}{pilote && <i title="Case saisie : elle pilote les autres">saisi</i>}</span>
      <span className="in">
        <input
          value={affiche} disabled={locked} inputMode="decimal"
          onChange={(e) => { setBrut(e.target.value); onChange(e.target.value); }}
          onBlur={() => setBrut(null)}
        />
        <i>{unite}</i>
      </span>
    </label>
  );
}

/* ----------------------------------------------- Onglet 4 · Conditions */

function OngletConditions({
  m, mandatId, immeubleId, locked,
}: { m: Record<string, unknown>; mandatId: string; immeubleId: string; locked: boolean }) {
  const [pending, start] = useTransition();
  const [debut, setDebut] = useState(dateInput(m.date_effet));
  const [duree, setDuree] = useState(S(num(m["durée_tot_month"]) ?? 12));
  const [exclu, setExclu] = useState(S(m.Type_exclu) || "Simple");
  const [dExclu, setDExclu] = useState(S(num(m["durée_exclu_jours"]) ?? 14));
  const [irrevoc, setIrrevoc] = useState(S(num(m["durée_irrevoc_days"]) ?? 14));
  const [web, setWeb] = useState(publicationWeb(m));

  const fin = (() => {
    const d0 = parse(duree);
    if (!debut || !d0) return undefined;
    const d = new Date(debut);
    d.setMonth(d.getMonth() + d0);
    return d;
  })();

  const save = () =>
    start(() =>
      updateMandat(mandatId, immeubleId, {
        date_effet: debut ? new Date(debut).toISOString() : undefined,
        "durée_tot_month": parse(duree),
        Type_exclu: exclu,
        "durée_exclu_jours": exclu === "Semi-exclusif" ? parse(dExclu) : undefined,
        "durée_irrevoc_days": parse(irrevoc),
        publication_web_yn: web,
      }),
    );

  return (
    <>
      <Titre
        titre="Les conditions"
        aide="Type de mandat, durées, et ce que le client accepte qu'on fasse du bien. Ces choix changent le texte du mandat généré."
      />

      <div className="mdt-sub">Type de mandat</div>
      <div className="mdt-types">
        {TYPES_EXCLU.map((t) => (
          <button key={t} type="button" className={`mdt-ty${exclu === t ? " on" : ""}`}
            disabled={locked} onClick={() => setExclu(t)}>
            <b>{t}</b>
            <span>
              {t === "Simple"
                ? "Le client peut confier le bien à d'autres et vendre lui-même. Le plus facile à faire signer."
                : t === "Semi-exclusif"
                ? "Nous seuls parmi les professionnels ; le client garde le droit de vendre lui-même sans honoraires."
                : "Nous seuls, y compris face à une vente directe du client."}
            </span>
          </button>
        ))}
      </div>

      <div className="mdt-sub">Durées</div>
      <div className="mdt-grid">
        <Champ label="Prise d'effet">
          <input className="mi" type="date" value={debut} disabled={locked} onChange={(e) => setDebut(e.target.value)} />
        </Champ>
        <Champ label="Durée totale (mois)">
          <input className="mi" value={duree} disabled={locked} inputMode="numeric" onChange={(e) => setDuree(e.target.value)} />
        </Champ>
        <Champ label="Irrévocabilité (jours)">
          <input className="mi" value={irrevoc} disabled={locked} inputMode="numeric" onChange={(e) => setIrrevoc(e.target.value)} />
        </Champ>
        {exclu === "Semi-exclusif" && (
          <Champ label="Délai de présentation (jours)">
            <input className="mi" value={dExclu} disabled={locked} inputMode="numeric" onChange={(e) => setDExclu(e.target.value)} />
          </Champ>
        )}
        <Champ label="Fin du mandat">
          <input className="mi gris" readOnly value={fin ? fin.toLocaleDateString("fr-FR") : "—"} />
        </Champ>
      </div>

      <div className="mdt-sub">Publication en ligne</div>
      <button type="button" className={`mdt-web${web ? " on" : ""}`} disabled={locked} onClick={() => setWeb((v) => !v)}>
        <span className="sw"><i /></span>
        <span className="tx">
          <b>{web ? "Le bien sera diffusé en ligne" : "Diffusion en ligne retirée"}</b>
          <span>
            {web
              ? "Site France Immeuble, portails et fichier acquéreurs. L'annonce ne porte ni l'identité du mandant, ni celle des occupants."
              : "Commercialisation confidentielle : fichier acquéreurs uniquement, aucune annonce publiée. L'article 6.4 du mandat le stipule noir sur blanc."}
          </span>
        </span>
      </button>

      {!locked && <SaveBar onSave={save} disabled={pending} note="Ces réglages réécrivent les articles 4 et 6 du mandat" />}
    </>
  );
}

/* ---------------------------------------------------- Onglet 5 · Envoi */

function OngletEnvoi({
  m, mandants, trous, agent, mandatId, immeubleId, onAller,
}: {
  m: Record<string, unknown>;
  mandants: Mandant[];
  trous: { cle: string; label: string; onglet: string }[];
  agent: { name: string } | null;
  mandatId: string; immeubleId: string;
  onAller: (t: Tab) => void;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [pdf, setPdf] = useState(S(m.pdf_mandat) || "");
  const [dateSig, setDateSig] = useState(dateInput(m.date_signature) || new Date().toISOString().slice(0, 10));
  const pret = trous.length === 0;
  const envoye = S(m.date_last_envoi);
  const signe = !!S(m.date_signature);
  const destinataires = mandants.map((x) => x.email).filter(Boolean) as string[];

  const generer = () =>
    start(async () => {
      setMsg(null);
      const r = await genererMandat(immeubleId, mandatId);
      if (r.ok) { setPdf(r.url); setMsg(`Mandat généré (${r.ko} Ko).`); }
      else setMsg(`Échec : ${r.message}`);
    });

  return (
    <>
      <Titre
        titre="Envoi et signature"
        aide="La dernière étape : on génère le mandat depuis les données saisies, on le relit, on l'envoie à signer, puis on classe l'exemplaire signé."
      />

      {/* --- Étape 0 : le contrôle des pièces --- */}
      <div className={`mdt-etape${pret ? " ok" : " ko"}`}>
        <span className="n">1</span>
        <div className="c">
          <b>{pret ? "Dossier complet" : `${trous.length} élément${trous.length > 1 ? "s" : ""} manquant${trous.length > 1 ? "s" : ""}`}</b>
          {pret ? (
            <span>Toutes les pièces obligatoires sont au dossier et les données de rédaction sont saisies.</span>
          ) : (
            <>
              <span>Le mandat ne peut pas être généré tant que ces éléments manquent :</span>
              <ul className="mdt-trous">
                {trous.map((t) => (
                  <li key={t.cle}>
                    {t.label}
                    <button type="button" onClick={() => onAller(t.onglet as Tab)}>→ {t.onglet}</button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {/* --- Étape 1 : génération --- */}
      <div className={`mdt-etape${pdf ? " ok" : pret ? "" : " off"}`}>
        <span className="n">2</span>
        <div className="c">
          <b>Générer le mandat</b>
          <span>
            Le document est rédigé à partir de tout ce qui précède : parties, désignation depuis l&apos;état
            locatif, prix, durées, publication en ligne. {S(m.numero) ? `Il portera le numéro ${S(m.numero)}.` : "Attribuez un numéro de registre avant l'envoi."}
          </span>
          <div className="mdt-btns">
            <Link className="mdt-btn" href={`/bien/${immeubleId}/mandat/${mandatId}/imprimer`} target="_blank">
              Prévisualiser
            </Link>
            <button className="mdt-go" type="button" disabled={!pret || pending} onClick={generer}>
              <span className="ch">›</span> {pending ? "Génération…" : pdf ? "Regénérer le PDF" : "Générer le PDF"}
            </button>
            {pdf && <a className="mdt-btn" href={pdf} target="_blank" rel="noreferrer">Télécharger</a>}
          </div>
          {msg && <span className={msg.startsWith("Échec") ? "er" : "okmsg"}>{msg}</span>}
        </div>
      </div>

      {/* --- Étape 2 : signature --- */}
      <div className={`mdt-etape${envoye ? " ok" : pdf ? "" : " off"}`}>
        <span className="n">3</span>
        <div className="c">
          <b>Envoyer à la signature</b>
          <span>
            Signataires : {mandants.length > 1 ? "les mandants" : "le mandant"} ({mandants.map(nomMandant).join(", ") || "à renseigner"}),
            Marc-Antoine VOCI en qualité de président{agent?.name && agent.name !== "Marc-Antoine VOCI" ? `, et ${agent.name} pour la rédaction` : ""}.
          </span>
          {destinataires.length === 0 && (
            <span className="er">Aucune adresse e-mail sur les mandants — renseignez-les depuis leur fiche contact.</span>
          )}
          <div className="mdt-btns">
            <button className="mdt-go" type="button" disabled={!pdf || pending}
              onClick={() => start(async () => { await envoyerMandatSignature(mandatId, immeubleId, destinataires); setMsg("Envoi journalisé."); })}>
              <span className="ch">›</span> Envoyer par Docusign
            </button>
          </div>
          {envoye && <span className="okmsg">Dernier envoi le {dmy(m.date_last_envoi)}{destinataires.length ? ` à ${destinataires.join(", ")}` : ""}.</span>}
          <span className="mdt-hint">
            Le connecteur Docusign n&apos;est pas encore ouvert sur cet environnement : l&apos;app prépare le dossier
            et journalise l&apos;envoi, la mise à la signature se fait depuis Docusign. Le retour de signature se
            constate ci-dessous.
          </span>
        </div>
      </div>

      {/* --- Étape 3 : retour de signature --- */}
      <div className={`mdt-etape${signe ? " ok" : envoye ? "" : " off"}`}>
        <span className="n">4</span>
        <div className="c">
          <b>Retour de signature</b>
          {signe ? (
            <span>
              Mandat signé le {dmy(m.date_signature)}. Il est verrouillé : le numéro {S(m.numero)} est
              définitivement inscrit au registre.
            </span>
          ) : (
            <>
              <span>Dès l&apos;exemplaire signé reçu, déposez-le ici : le mandat passe « En cours » et se verrouille.</span>
              <div className="mdt-btns">
                <label className="mdt-ch">
                  <span>Date de signature</span>
                  <input className="mi" type="date" value={dateSig} onChange={(e) => setDateSig(e.target.value)} />
                </label>
                <label className="mdt-up gros">
                  Déposer l&apos;exemplaire signé
                  <input type="file" accept="application/pdf,image/*" disabled={pending}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const fd = new FormData();
                      fd.set("file", f);
                      start(async () => {
                        const r = await marquerMandatSigne(mandatId, immeubleId, new Date(dateSig).toISOString(), fd);
                        if (!r.ok) setMsg(`Échec : ${r.message}`);
                      });
                    }} />
                </label>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------- Communs */

function Titre({ titre, aide }: { titre: string; aide: string }) {
  return (
    <div className="mdt-titre">
      <h2>{titre}</h2>
      <p>{aide}</p>
    </div>
  );
}

function ReserveBtn({ mandatId, immeubleId }: { mandatId: string; immeubleId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <button className="mdt-go" type="button" onClick={() => setOpen(true)}>
        <span className="ch">›</span> Attribuer un numéro
      </button>
      {open && (
        <div className="modal-ov">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">Réserver un numéro<button type="button" onClick={() => setOpen(false)}>✕</button></div>
            <div className="modal-b" style={{ fontSize: 13, lineHeight: 1.6 }}>
              Une fois le numéro réservé, il ne sera <b>plus possible de supprimer le mandat</b> ni de
              modifier le numéro. Le prochain numéro du registre est attribué automatiquement — séquence
              sans trou, registre loi Hoguet.
            </div>
            <div className="modal-f">
              <button className="kgo" type="button" disabled={pending}
                onClick={() => start(async () => { await reserveMandatNumero(mandatId, immeubleId); setOpen(false); })}>
                <span className="ch">›</span> Réserver le numéro
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function CancelBtn({ mandatId, immeubleId }: { mandatId: string; immeubleId: string }) {
  const [open, setOpen] = useState(false);
  const [motif, setMotif] = useState("");
  const [pending, start] = useTransition();
  return (
    <>
      <button className="mdt-x" type="button" onClick={() => setOpen(true)}>✕ Annuler le mandat</button>
      {open && (
        <div className="modal-ov">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">Annuler le mandat<button type="button" onClick={() => setOpen(false)}>✕</button></div>
            <div className="modal-b">
              <span className="mlab">Motif de l&apos;annulation</span>
              <input className="min" value={motif} onChange={(e) => setMotif(e.target.value)}
                placeholder="ex. Vendeur ne souhaite plus vendre" />
            </div>
            <div className="modal-f">
              <button className="kgo" type="button" disabled={pending || !motif.trim()}
                style={pending || !motif.trim() ? { opacity: 0.5 } : undefined}
                onClick={() => start(async () => { await cancelMandat(mandatId, immeubleId, motif); setOpen(false); })}>
                <span className="ch">›</span> Confirmer l&apos;annulation
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
