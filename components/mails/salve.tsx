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
  type Candidat, type Cible, type Filtres,
} from "@/lib/mails/audience";
import { civiliteDe, valeursDe, type RefPrenoms } from "@/lib/mails/fusion";
import type { MessageType } from "@/lib/mails/serveur";
import { ZoneRedaction } from "@/components/mails/editeur";
import { chargerVivier, lancerSalve, preparerSalve } from "@/lib/bo/mails-actions";

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
  const [cible, setCible] = useState<Cible>("acquereurs");
  const [f, setF] = useState<Filtres>(FILTRES_VIDES);
  const [objet, setObjet] = useState("");
  const [corps, setCorps] = useState("");
  const [libelle, setLibelle] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<{ envoyes: number; echecs: number } | null>(null);
  const [pending, start] = useTransition();

  /* Le vivier est lourd (contacts + immeubles + recherches) : on ne le charge
     qu'à l'ouverture de cette fenêtre, pas à chaque affichage de l'écran. */
  useEffect(() => {
    let vivant = true;
    chargerVivier()
      .then((v) => { if (vivant) { setVivier(v as Vivier); setChargement(false); } })
      .catch((e) => { if (vivant) { setErreur(String(e)); setChargement(false); } });
    return () => { vivant = false; };
  }, []);

  const destinataires = useMemo(() => {
    if (!vivier) return [];
    const gardes = vivier.candidats.filter((c) => retenu(c, cible, f));
    if (!f.exclureSansCivilite) return gardes;
    return gardes.filter((c) => civiliteDe(c, vivier.refPrenoms).valeur);
  }, [vivier, cible, f]);

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

  const envoyer = () =>
    start(async () => {
      setErreur(null);
      try {
        if (!vivier) throw new Error("Vivier non chargé.");
        const id = await preparerSalve({
          libelle: libelle || objet, cible, filtres: f, objet, corps,
          destinataires: destinataires.map((c) => ({ contactId: c.contactId, email: c.email, nom: c.nom })),
          agentId: agent.id,
        });
        const r = await lancerSalve(id, destinataires, vivier.refPrenoms, {
          nom: agent.nom, email: agent.email, telephone: agent.telephone,
        });
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
            <div className="sv-cibles">
              {CIBLES.map((c) => (
                <button key={c.cle} type="button" className={`sv-cible${cible === c.cle ? " on" : ""}`}
                  onClick={() => { setCible(c.cle); setEtape(2); }}>
                  <b>{c.label}</b>
                  <i>{c.aide}</i>
                  <span>{vivier ? vivier.candidats.filter((x) => retenu(x, c.cle, FILTRES_VIDES)).length : 0} contacts</span>
                </button>
              ))}
            </div>
          )}

          {!chargement && etape === 2 && vivier && (
            <div className="sv-filtres">
              <Bloc titre="Profil">
                {vivier.facettes.profils.map((p) => (
                  <Puce key={p} on={f.profils.includes(p)} onClick={() => bascule("profils", p)}>{p}</Puce>
                ))}
              </Bloc>

              <Bloc titre="Note acquéreur">
                {NOTES.map((n) => (
                  <Puce key={n} on={f.notes.includes(n)} onClick={() => bascule("notes", n)}>{n}</Puce>
                ))}
              </Bloc>

              <Bloc titre="Destination">
                {vivier.facettes.destinations.map((d) => (
                  <Puce key={d} on={f.destinations.includes(d)} onClick={() => bascule("destinations", d)}>{d}</Puce>
                ))}
              </Bloc>

              {cible === "proprietaires" && (
                <Bloc titre="Statut de l'immeuble">
                  {vivier.facettes.statuts.map((s) => (
                    <Puce key={s} on={f.statuts.includes(s)} onClick={() => bascule("statuts", s)}>{s}</Puce>
                  ))}
                </Bloc>
              )}

              <Bloc titre="Localisation">
                <Lieux choisis={f.lieux} tous={vivier.facettes.lieux} onBascule={(v) => bascule("lieux", v)} />
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
            <i>{resumerCiblage(cible, f)}</i>
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
            <button type="button" className="savebar-go" onClick={() => setEtape(etape === 1 ? 2 : 3)}>
              <span className="ch">›</span> Suivant
            </button>
          ) : (
            <button type="button" className="savebar-go"
              disabled={pending || !!resultat || destinataires.length === 0 || !objet.trim() || !corps.trim()}
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

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="sv-bloc">
      <h3>{titre}</h3>
      <div>{children}</div>
    </section>
  );
}

function Puce({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={`sv-puce${on ? " on" : ""}`} onClick={onClick}>{children}</button>
  );
}

/** Les lieux se cherchent : il y en a des centaines, une liste à plat serait
 *  inutilisable. Même principe que le filtre de l'écran Recherches. */
function Lieux({ choisis, tous, onBascule }: {
  choisis: string[]; tous: string[]; onBascule: (v: string) => void;
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
            <Puce key={l} on={choisis.includes(l)} onClick={() => onBascule(l)}>{l}</Puce>
          ))}
        </div>
      )}
      {choisis.length > 0 && (
        <div className="sv-lieux-choisis">
          {choisis.map((l) => (
            <button key={l} type="button" className="sv-puce on" onClick={() => onBascule(l)}>{l} ✕</button>
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
