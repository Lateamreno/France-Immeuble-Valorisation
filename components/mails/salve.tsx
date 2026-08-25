"use client";

/* Salve d'e-mails (retour #108).
 *
 * Trois temps, dans cet ordre, parce que c'est l'ordre dans lequel on pense :
 *   1. QUI — propriétaires, acquéreurs ou partenaires ;
 *   2. LESQUELS — les mêmes sous-filtres que les recherches ;
 *   3. QUOI — le texte, avec ses champs de fusion.
 *
 * Le compteur de destinataires est vivant : il change à chaque filtre, avant
 * que quoi que ce soit ne parte. Et rien ne part sans un dernier écran qui
 * montre la liste nominative — la doctrine maison est que l'app prépare et
 * qu'un humain envoie.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  CIBLES, FILTRES_VIDES, resumerCiblage, retenu,
  type Candidat, type Cible, type Exclusions, type Filtres,
} from "@/lib/mails/audience";
import { civiliteDe, valeursDe, type RefPrenoms } from "@/lib/mails/fusion";
import type { MessageType } from "@/lib/mails/serveur";
import { ZoneRedaction } from "@/components/mails/editeur";
import { chargerVivier, lancerSalve, preparerSalve, routeDeSalve } from "@/lib/bo/mails-actions";

type Vivier = {
  candidats: Candidat[];
  refPrenoms: RefPrenoms;
  facettes: { lieux: string[]; destinations: string[]; statuts: string[]; profils: string[] };
};

const NOTES = ["A", "B", "C", "D"];

export function FenetreSalve({ agent, modeles, onClose }: {
  agent: { id: string; nom: string; email?: string; telephone?: string };
  modeles: MessageType[];
  onClose: () => void;
}) {
  const [etape, setEtape] = useState<1 | 2 | 3>(1);
  const [vivier, setVivier] = useState<Vivier | null>(null);
  const [chargement, setChargement] = useState(true);
  /* Plusieurs cibles à la fois (retour #121) : on écrit souvent la même chose
     aux propriétaires et aux acquéreurs, et refaire deux salves n'a pas de
     sens. */
  const [cibles, setCibles] = useState<Cible[]>(["acquereurs"]);
  const [f, setF] = useState<Filtres>(FILTRES_VIDES);
  const [objet, setObjet] = useState("");
  const [corps, setCorps] = useState("");
  const [libelle, setLibelle] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<{ envoyes: number; echecs: number } | null>(null);
  const [pending, start] = useTransition();
  /* Par où la salve va partir. On le dit AVANT d'envoyer : la question « est-ce
     que ça va saturer ma boîte ? » doit avoir sa réponse à l'écran. */
  const [route, setRoute] = useState<{ relais: boolean; expediteur: string; plafondBoitePerso: number } | null>(null);
  const [assume, setAssume] = useState(false);

  /* Le vivier est lourd (contacts + immeubles + recherches) : on ne le charge
     qu'à l'ouverture de cette fenêtre, pas à chaque affichage de l'écran. */
  useEffect(() => {
    let vivant = true;
    chargerVivier()
      .then((v) => { if (vivant) { setVivier(v as Vivier); setChargement(false); } })
      .catch((e) => { if (vivant) { setErreur(String(e)); setChargement(false); } });
    routeDeSalve().then((r) => { if (vivant) setRoute(r); }).catch(() => undefined);
    return () => { vivant = false; };
  }, []);

  const destinataires = useMemo(() => {
    if (!vivier) return [];
    const gardes = vivier.candidats.filter((c) => retenu(c, cibles, f));
    if (!f.exclureSansCivilite) return gardes;
    return gardes.filter((c) => civiliteDe(c, vivier.refPrenoms).valeur);
  }, [vivier, cibles, f]);

  /* Combien n'auront pas de civilité : c'est la question que MAV a posée, on y
     répond avant l'envoi et pas après. */
  const sansCivilite = useMemo(() => {
    if (!vivier) return 0;
    return destinataires.filter((c) => !civiliteDe(c, vivier.refPrenoms).valeur).length;
  }, [destinataires, vivier]);

  const deduites = useMemo(() => {
    if (!vivier) return 0;
    return destinataires.filter((c) => civiliteDe(c, vivier.refPrenoms).origine === "prenom").length;
  }, [destinataires, vivier]);

  /* L'aperçu se fait sur un vrai destinataire de la sélection : un aperçu sur
     un contact inventé ne prouve rien. Même fonction que l'envoi, donc ce
     qu'on lit à l'écran est exactement ce qui partira. */
  const apercuValeurs = useMemo(() => {
    const premier = destinataires[0];
    if (!premier || !vivier) return undefined;
    return valeursDe(premier, vivier.refPrenoms,
      { nom: agent.nom, email: agent.email, telephone: agent.telephone });
  }, [destinataires, vivier, agent]);

  const maj = (p: Partial<Filtres>) => setF({ ...f, ...p });
  const bascule = (cle: "profils" | "notes" | "lieux" | "destinations" | "statuts", v: string) =>
    maj({ [cle]: f[cle].includes(v) ? f[cle].filter((x) => x !== v) : [...f[cle], v] } as Partial<Filtres>);

  /* Une facette a trois états : neutre, incluse, exclue. Un clic sur la puce
     inclut, un clic sur son « ⊘ » exclut — et les deux s'annulent (#121). */
  const basculeExclu = (cle: keyof Omit<Exclusions, "contacts">, v: string) => {
    const l = f.exclure[cle];
    maj({
      exclure: { ...f.exclure, [cle]: l.includes(v) ? l.filter((x) => x !== v) : [...l, v] },
      /* Exclure une valeur qu'on incluait n'a pas de sens : on la retire de
         l'inclusion au passage, sinon le résumé se contredit. */
      ...(l.includes(v) ? {} : { [cle]: f[cle].filter((x) => x !== v) }),
    } as Partial<Filtres>);
  };
  const retirerContact = (id: string) =>
    maj({ exclure: { ...f.exclure, contacts: [...f.exclure.contacts, id] } });
  const rendreContacts = () => maj({ exclure: { ...f.exclure, contacts: [] } });

  const basculeCible = (k: Cible) =>
    setCibles(cibles.includes(k) ? cibles.filter((x) => x !== k) : [...cibles, k]);

  const envoyer = () =>
    start(async () => {
      setErreur(null);
      try {
        if (!vivier) throw new Error("Vivier non chargé.");
        const id = await preparerSalve({
          libelle: libelle || objet, cibles, filtres: f, objet, corps,
          destinataires: destinataires.map((c) => ({ contactId: c.contactId, email: c.email, nom: c.nom })),
          agentId: agent.id,
        });
        const r = await lancerSalve(id, destinataires, vivier.refPrenoms, {
          nom: agent.nom, email: agent.email, telephone: agent.telephone,
        }, agent.id, assume);
        setResultat(r);
      } catch (e) {
        setErreur(e instanceof Error ? e.message : String(e));
      }
    });

  return (
    <div className="modal-ov" onClick={onClose}>
      <div className="modal salve-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <b>Envoyer une salve</b>
          <span className="sv-fil">
            {([[1, "Qui"], [2, "Lesquels"], [3, "Quoi"]] as const).map(([n, l]) => (
              <button key={n} type="button" className={etape === n ? "on" : undefined}
                onClick={() => setEtape(n)}>{n}. {l}</button>
            ))}
          </span>
          <button type="button" onClick={onClose}>✕</button>
        </div>

        <div className="modal-b">
          {chargement && <div className="fempty">Chargement du fichier…</div>}

          {!chargement && etape === 1 && (
            <>
              <p className="sv-aide">
                Plusieurs types à la fois, c&apos;est permis : cochez-en autant que le
                message en concerne.
              </p>
              <div className="sv-cibles">
                {CIBLES.map((c) => (
                  <button key={c.cle} type="button" className={`sv-cible${cibles.includes(c.cle) ? " on" : ""}`}
                    aria-pressed={cibles.includes(c.cle)}
                    onClick={() => basculeCible(c.cle)}>
                    <span className="sv-coche">{cibles.includes(c.cle) ? "✓" : ""}</span>
                    <b>{c.label}</b>
                    <i>{c.aide}</i>
                    <span className="sv-n">
                      {vivier ? vivier.candidats.filter((x) => retenu(x, [c.cle], FILTRES_VIDES)).length : 0} contacts
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {!chargement && etape === 2 && vivier && (
            <div className="sv-filtres">
              <p className="sv-aide">
                Un clic sur une puce l&apos;<b>inclut</b> ; le <span className="sv-ex-ex">⊘</span> à
                sa droite l&apos;<b>exclut</b>. Une exclusion l&apos;emporte toujours sur le reste.
              </p>

              <Bloc titre="Profil">
                {vivier.facettes.profils.map((p) => (
                  <Puce key={p} on={f.profils.includes(p)} exclu={f.exclure.profils.includes(p)}
                    onClick={() => bascule("profils", p)}
                    onExclure={() => basculeExclu("profils", p)}>{p}</Puce>
                ))}
              </Bloc>

              <Bloc titre="Note acquéreur">
                {NOTES.map((n) => (
                  <Puce key={n} on={f.notes.includes(n)} exclu={f.exclure.notes.includes(n)}
                    onClick={() => bascule("notes", n)}
                    onExclure={() => basculeExclu("notes", n)}>{n}</Puce>
                ))}
              </Bloc>

              <Bloc titre="Destination">
                {vivier.facettes.destinations.map((d) => (
                  <Puce key={d} on={f.destinations.includes(d)} exclu={f.exclure.destinations.includes(d)}
                    onClick={() => bascule("destinations", d)}
                    onExclure={() => basculeExclu("destinations", d)}>{d}</Puce>
                ))}
              </Bloc>

              {cibles.includes("proprietaires") && (
                <Bloc titre="Statut de l'immeuble">
                  {vivier.facettes.statuts.map((s) => (
                    <Puce key={s} on={f.statuts.includes(s)} exclu={f.exclure.statuts.includes(s)}
                      onClick={() => bascule("statuts", s)}
                      onExclure={() => basculeExclu("statuts", s)}>{s}</Puce>
                  ))}
                </Bloc>
              )}

              <Bloc titre="Localisation">
                <Lieux
                  choisis={f.lieux} exclus={f.exclure.lieux} tous={vivier.facettes.lieux}
                  onBascule={(v) => bascule("lieux", v)}
                  onExclure={(v) => basculeExclu("lieux", v)}
                />
              </Bloc>

              <Bloc titre="Fourchettes">
                <Fourchette label="Prix" unite="€" min={f.prixMin} max={f.prixMax}
                  set={(min, max) => maj({ prixMin: min, prixMax: max })} />
                <Fourchette label="Rendement" unite="%" min={f.rentaMin} max={f.rentaMax}
                  set={(min, max) => maj({ rentaMin: min, rentaMax: max })} />
                <Fourchette label="Surface" unite="m²" min={f.surfaceMin} max={f.surfaceMax}
                  set={(min, max) => maj({ surfaceMin: min, surfaceMax: max })} />
              </Bloc>

              <Bloc titre="Précautions">
                <label className="sv-case">
                  <input type="checkbox" checked={f.respecterDesabo}
                    onChange={() => maj({ respecterDesabo: !f.respecterDesabo })} />
                  Écarter ceux qui ont refusé les e-mails
                </label>
                <label className="sv-case">
                  <input type="checkbox" checked={f.exclureSansCivilite}
                    onChange={() => maj({ exclureSansCivilite: !f.exclureSansCivilite })} />
                  Écarter ceux dont on ignore la civilité
                </label>
              </Bloc>

              {/* Ce que la salve écarte, rassemblé au même endroit : sinon
                  l'exclusion se perd dans les puces (retour #121). */}
              <Bloc titre="Exclusions" large>
                <RecapExclusions
                  x={f.exclure}
                  onRetirer={(cle, v) => basculeExclu(cle, v)}
                  onRendreContacts={rendreContacts}
                />
              </Bloc>

              {/* Les destinataires, nominatifs : c'est là qu'on retire à la
                  main celui qu'aucun filtre ne saurait décrire. */}
              <Bloc titre={`Destinataires (${destinataires.length})`} large>
                <ListeDestinataires liste={destinataires} onRetirer={retirerContact} />
              </Bloc>
            </div>
          )}

          {!chargement && etape === 3 && (
            <>
              <label className="mred-l">
                <span>Nom de la salve</span>
                <input value={libelle} onChange={(e) => setLibelle(e.target.value)}
                  placeholder="Ex. « Nouveautés 93 — investisseurs A et B »" />
              </label>
              {modeles.length > 0 && (
                <label className="mred-l court" style={{ marginTop: 8 }}>
                  <span>Message type</span>
                  <select defaultValue="" onChange={(e) => {
                    const m = modeles.find((x) => x.id === e.target.value);
                    if (m) { setObjet(m.objet); setCorps(m.corps); }
                  }}>
                    <option value="">— Partir de zéro —</option>
                    {modeles.map((m) => <option key={m.id} value={m.id}>{m.libelle}</option>)}
                  </select>
                </label>
              )}
              <ZoneRedaction objet={objet} corps={corps} setObjet={setObjet} setCorps={setCorps}
                valeursApercu={apercuValeurs} nomApercu={destinataires[0]?.nom} />

              {/* Par où ça part : la réponse est due avant d'appuyer, pas après. */}
              {route && (route.relais ? (
                <div className="sv-route">
                  <b>Départ par la route d&apos;envoi en masse</b>
                  <span>
                    Expéditeur : <b>{route.expediteur}</b> · les réponses reviennent à{" "}
                    <b>{agent.email ?? "vous"}</b>. Rien n&apos;est ajouté à vos « Envoyés » — le
                    détail reste dans « Salves envoyées ».
                  </span>
                </div>
              ) : (
                <div className="dif-avis" style={{ marginTop: 12 }}>
                  <b>Route d&apos;envoi en masse non configurée.</b>
                  Une salve ne devrait pas partir de votre boîte personnelle : elle sature vos
                  « Envoyés », se fait couper par le plafond du fournisseur, et une plainte
                  abîmerait la réputation de l&apos;adresse dont vous vous servez tous les jours.
                  <label className="sv-case" style={{ marginTop: 8 }}>
                    <input type="checkbox" checked={assume} onChange={() => setAssume(!assume)} />
                    Envoyer quand même depuis ma boîte ({route.plafondBoitePerso} destinataires au maximum)
                  </label>
                </div>
              ))}
            </>
          )}

          {erreur && <div className="dif-avis" style={{ marginTop: 10 }}>{erreur}</div>}
          {resultat && (
            <div className="mred-ok">
              {resultat.envoyes} message{resultat.envoyes > 1 ? "s" : ""} envoyé{resultat.envoyes > 1 ? "s" : ""}
              {resultat.echecs > 0 ? ` · ${resultat.echecs} échec${resultat.echecs > 1 ? "s" : ""}` : ""}.
            </div>
          )}
        </div>

        <div className="modal-f sv-pied">
          <span className="sv-compteur">
            <b>{destinataires.length}</b> destinataire{destinataires.length > 1 ? "s" : ""}
            <i>{resumerCiblage(cibles, f)}</i>
          </span>
          {sansCivilite > 0 && (
            <span className="sv-avert" title="Ils recevront « Bonjour » sans civilité">
              ⚠ {sansCivilite} sans civilité
            </span>
          )}
          {deduites > 0 && (
            <span className="sv-deduit" title="Civilité déduite du prénom, jamais écrite en base">
              {deduites} déduite{deduites > 1 ? "s" : ""} du prénom
            </span>
          )}
          <span style={{ flex: 1 }} />
          {etape < 3 ? (
            <button type="button" className="savebar-go"
              disabled={etape === 1 && cibles.length === 0}
              onClick={() => setEtape(etape === 1 ? 2 : 3)}>
              <span className="ch">›</span> Suivant
            </button>
          ) : (
            <button type="button" className="savebar-go"
              disabled={pending || !!resultat || destinataires.length === 0 || !objet.trim() || !corps.trim()
                /* Sans relais, il faut avoir dit oui, et rester sous le plafond. */
                || (route ? !route.relais && (!assume || destinataires.length > route.plafondBoitePerso) : false)}
              onClick={envoyer}>
              <span className="ch">›</span>
              {pending ? "Envoi en cours…" : `Envoyer à ${destinataires.length} contact${destinataires.length > 1 ? "s" : ""}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Bloc({ titre, large, children }: {
  titre: string;
  /** Prend toute la largeur de la grille (exclusions, destinataires). */
  large?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={`sv-bloc${large ? " large" : ""}`}>
      <h3>{titre}</h3>
      <div>{children}</div>
    </section>
  );
}

/**
 * Une facette à trois états : neutre, incluse, exclue (retour #121).
 *
 * Le corps de la puce inclut ; le petit « ⊘ » exclut. Deux gestes distincts
 * pour deux intentions opposées — un troisième clic sur la même puce aurait
 * été indevinable.
 */
function Puce({ on, exclu, onClick, onExclure, children }: {
  on: boolean;
  exclu?: boolean;
  onClick: () => void;
  onExclure?: () => void;
  children: React.ReactNode;
}) {
  const cls = `sv-puce${exclu ? " exclue" : on ? " on" : ""}`;
  if (!onExclure) {
    return <button type="button" className={cls} onClick={onClick}>{children}</button>;
  }
  return (
    <span className={`sv-puce-duo${exclu ? " exclue" : on ? " on" : ""}`}>
      <button type="button" className={cls} onClick={onClick} disabled={exclu}>{children}</button>
      <button
        type="button" className={`sv-ex${exclu ? " on" : ""}`} onClick={onExclure}
        title={exclu ? "Ne plus exclure" : "Exclure de la salve"}
        aria-label={exclu ? "Ne plus exclure" : "Exclure de la salve"}
      >⊘</button>
    </span>
  );
}

/** Ce que la salve écarte, en une ligne par exclusion. */
function RecapExclusions({ x, onRetirer, onRendreContacts }: {
  x: Exclusions;
  onRetirer: (cle: keyof Omit<Exclusions, "contacts">, v: string) => void;
  onRendreContacts: () => void;
}) {
  const groupes: { cle: keyof Omit<Exclusions, "contacts">; label: string }[] = [
    { cle: "profils", label: "Profils" },
    { cle: "notes", label: "Notes" },
    { cle: "lieux", label: "Lieux" },
    { cle: "destinations", label: "Destinations" },
    { cle: "statuts", label: "Statuts" },
  ];
  const vide = groupes.every((g) => x[g.cle].length === 0) && x.contacts.length === 0;
  if (vide) return <p className="sv-vide">Rien n&apos;est exclu pour l&apos;instant.</p>;
  return (
    <div className="sv-exs">
      {groupes.filter((g) => x[g.cle].length > 0).map((g) => (
        <div key={g.cle} className="sv-exs-l">
          <span>{g.label}</span>
          {x[g.cle].map((v) => (
            <button key={v} type="button" className="sv-puce exclue"
              onClick={() => onRetirer(g.cle, v)} title="Ne plus exclure">{v} ✕</button>
          ))}
        </div>
      ))}
      {x.contacts.length > 0 && (
        <div className="sv-exs-l">
          <span>Retirés à la main</span>
          <button type="button" className="sv-puce exclue" onClick={onRendreContacts}>
            {x.contacts.length} contact{x.contacts.length > 1 ? "s" : ""} — tout remettre ✕
          </button>
        </div>
      )}
    </div>
  );
}

/** La liste nominative des destinataires, avec une croix par ligne. */
function ListeDestinataires({ liste, onRetirer }: {
  liste: Candidat[];
  onRetirer: (id: string) => void;
}) {
  const [tout, setTout] = useState(false);
  if (liste.length === 0) return <p className="sv-vide">Aucun destinataire avec ces critères.</p>;
  const vus = tout ? liste : liste.slice(0, 30);
  return (
    <div className="sv-dest">
      {vus.map((c) => (
        <div key={c.contactId} className="sv-dest-l">
          <b>{c.nom}</b>
          <i>{c.email}</i>
          {c.note && <em className={`note n${c.note}`}>{c.note}</em>}
          <span style={{ flex: 1 }} />
          <button type="button" onClick={() => onRetirer(c.contactId)}
            title="Retirer ce contact de la salve">✕</button>
        </div>
      ))}
      {!tout && liste.length > vus.length && (
        <button type="button" className="sv-plus" onClick={() => setTout(true)}>
          Voir les {liste.length - vus.length} autres
        </button>
      )}
    </div>
  );
}

/** Les lieux se cherchent : il y en a des centaines, une liste à plat serait
 *  inutilisable. Même principe que le filtre de l'écran Recherches. */
function Lieux({ choisis, exclus, tous, onBascule, onExclure }: {
  choisis: string[]; exclus: string[]; tous: string[];
  onBascule: (v: string) => void;
  onExclure: (v: string) => void;
}) {
  const [q, setQ] = useState("");
  const trouves = q.trim()
    ? tous.filter((l) => l.toLowerCase().startsWith(q.trim().toLowerCase())).slice(0, 24)
    : [];
  return (
    <div className="sv-lieux">
      <input value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="Une ville ou un département (75, 93…)" />
      {trouves.length > 0 && (
        <div className="sv-lieux-l">
          {trouves.map((l) => (
            <Puce key={l} on={choisis.includes(l)} exclu={exclus.includes(l)}
              onClick={() => onBascule(l)} onExclure={() => onExclure(l)}>{l}</Puce>
          ))}
        </div>
      )}
      {(choisis.length > 0 || exclus.length > 0) && (
        <div className="sv-lieux-choisis">
          {choisis.map((l) => (
            <button key={l} type="button" className="sv-puce on" onClick={() => onBascule(l)}>{l} ✕</button>
          ))}
          {exclus.map((l) => (
            <button key={l} type="button" className="sv-puce exclue" onClick={() => onExclure(l)}
              title="Ne plus exclure">{l} ✕</button>
          ))}
        </div>
      )}
    </div>
  );
}

function Fourchette({ label, unite, min, max, set }: {
  label: string; unite: string; min?: number; max?: number;
  set: (min?: number, max?: number) => void;
}) {
  const n = (v: string) => (v.trim() ? Number(v.replace(/[^\d.]/g, "")) : undefined);
  return (
    <div className="sv-fourchette">
      <span>{label}</span>
      <input type="text" inputMode="numeric" placeholder="min" value={min ?? ""}
        onChange={(e) => set(n(e.target.value), max)} />
      <em>à</em>
      <input type="text" inputMode="numeric" placeholder="max" value={max ?? ""}
        onChange={(e) => set(min, n(e.target.value))} />
      <i>{unite}</i>
    </div>
  );
}
