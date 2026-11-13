"use client";

/* Choisir ou créer une société (retour #489).
 *
 * Deux sources, la nôtre d'abord : les sociétés déjà en fiche dans le BO, avec
 * leurs associés ; puis l'annuaire public des entreprises (DINUM), qui donne
 * raison sociale, SIREN, forme et siège. Choisir une société de l'annuaire la
 * crée dans le BO ; choisir une société du BO la rend telle quelle. Dans les
 * deux cas, l'associé passé en propriété (le contact d'où l'on vient) y est
 * rattaché avec sa fonction. */
import { useEffect, useState, useTransition } from "react";
import { Modale } from "@/components/modale";
import { chercherEntreprise, type EntrepriseTrouvee } from "@/lib/bo/actions";
import {
  chercherSocietes, creerOuCompleterSociete, type SocieteTrouvee,
} from "@/lib/bo/societes-actions";
import { FONCTIONS_ASSOCIE, type Associe } from "@/lib/societes";

export function SocietePicker({ titre, associe, demanderFonction, onAnnuler, onValider }: {
  titre: string;
  /** Le contact à rattacher à la société retenue, avec sa fonction. */
  associe?: Associe;
  /** Proposer de saisir la fonction de l'associé avant de valider. */
  demanderFonction?: boolean;
  onAnnuler: () => void;
  onValider: (societeId: string, nom: string) => void;
}) {
  const [q, setQ] = useState("");
  const [bo, setBo] = useState<SocieteTrouvee[]>([]);
  const [annuaire, setAnnuaire] = useState<EntrepriseTrouvee[]>([]);
  const [cherche, setCherche] = useState(false);
  const [choix, setChoix] = useState<{ bo?: SocieteTrouvee; ext?: EntrepriseTrouvee; neuve?: true } | null>(null);
  const [neuve, setNeuve] = useState({ nom: "", siren: "", rcs: "", capital: "", siege: "" });
  const [fonction, setFonction] = useState(associe?.fonction ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const t = q.trim();
    const timer = setTimeout(() => {
      if (t.length < 2) { setBo([]); setAnnuaire([]); return; }
      setCherche(true);
      Promise.all([
        chercherSocietes(t).catch(() => [] as SocieteTrouvee[]),
        t.length >= 3 ? chercherEntreprise(t).catch(() => [] as EntrepriseTrouvee[]) : Promise.resolve([] as EntrepriseTrouvee[]),
      ])
        .then(([k, r]) => {
          const deja = new Set(k.map((x) => (x.siren ?? "").replace(/\D/g, "")).filter(Boolean));
          setBo(k);
          setAnnuaire(r.filter((e) => !deja.has(e.siren.replace(/\D/g, ""))));
        })
        .finally(() => setCherche(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const libelle = choix?.bo?.nom ?? choix?.ext?.nom ?? (choix?.neuve ? neuve.nom.trim() : "");
  const valider = () =>
    start(async () => {
      setErr(null);
      try {
        const a: Associe | undefined = associe ? { contactId: associe.contactId, fonction: fonction.trim() || undefined } : undefined;
        if (choix?.bo) {
          const id = a ? await creerOuCompleterSociete({ nom: choix.bo.nom, siren: choix.bo.siren }, a) : choix.bo.id;
          onValider(id, choix.bo.nom);
          return;
        }
        if (choix?.ext) {
          const e = choix.ext;
          const id = await creerOuCompleterSociete({ nom: e.nom, siren: e.siren, siege: e.siege, forme: e.forme, rcs: e.rcs }, a);
          onValider(id, e.nom);
          return;
        }
        if (choix?.neuve) {
          if (!neuve.nom.trim()) { setErr("La raison sociale est obligatoire."); return; }
          const capital = neuve.capital ? Number(neuve.capital.replace(/[^\d.]/g, "")) : undefined;
          const id = await creerOuCompleterSociete({
            nom: neuve.nom.trim().toUpperCase(), siren: neuve.siren.trim() || undefined,
            rcs: neuve.rcs.trim() || undefined, capital: Number.isFinite(capital) ? capital : undefined,
            siege: neuve.siege.trim() || undefined,
          }, a);
          onValider(id, neuve.nom.trim().toUpperCase());
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    });

  return (
    <Modale
      titre={titre}
      onFermer={onAnnuler}
      largeur={620}
      pied={
        <>
          <button className="fadd" type="button" onClick={onAnnuler}>Annuler</button>
          <span style={{ flex: 1 }} />
          <button className="kgo" type="button" disabled={pending || !libelle} onClick={valider}>
            <span className="ch">›</span> {choix?.neuve ? "Créer la société" : "Retenir cette société"}
          </button>
        </>
      }
    >
      <div className="socp">
        {!choix?.neuve && (
          <label className="mdt-soc-q">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m21 21-4-4" /></svg>
            <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setChoix(null); }}
              placeholder="Raison sociale ou SIREN" />
            {cherche && <i>…</i>}
          </label>
        )}

        {!choix?.neuve && (bo.length > 0 || annuaire.length > 0) && (
          <div className="socp-l">
            {bo.length > 0 && <span className="src haut">Déjà dans le BO</span>}
            {bo.map((s) => (
              <button key={s.id} type="button" className={choix?.bo?.id === s.id ? "on" : undefined}
                onClick={() => setChoix({ bo: s })}>
                <b>{s.nom}</b>
                <span>
                  {[s.siren && `SIREN ${s.siren}`, s.siege,
                    s.associesNommes.length
                      ? s.associesNommes.map((a) => `${a.nom}${a.fonction ? ` (${a.fonction.toLowerCase()})` : ""}`).join(", ")
                      : "aucun associé rattaché"].filter(Boolean).join(" · ")}
                </span>
              </button>
            ))}
            {annuaire.length > 0 && <span className="src haut">Annuaire des entreprises</span>}
            {annuaire.map((e) => (
              <button key={e.siren} type="button" className={choix?.ext?.siren === e.siren ? "on" : undefined}
                onClick={() => setChoix({ ext: e })}>
                <b>{e.nom}</b>
                <span>{[e.forme, `SIREN ${e.siren}`, e.siege].filter(Boolean).join(" · ")}</span>
              </button>
            ))}
          </div>
        )}
        {!choix?.neuve && q.trim().length >= 2 && !cherche && bo.length === 0 && annuaire.length === 0 && (
          <div className="mdt-soc-v">Aucune société trouvée sous ce nom.</div>
        )}

        {choix?.neuve ? (
          <div className="socp-neuve">
            <label><span>Raison sociale</span><input autoFocus value={neuve.nom} onChange={(e) => setNeuve({ ...neuve, nom: e.target.value })} /></label>
            <div className="duo">
              <label><span>SIREN</span><input value={neuve.siren} onChange={(e) => setNeuve({ ...neuve, siren: e.target.value })} /></label>
              <label><span>RCS</span><input value={neuve.rcs} onChange={(e) => setNeuve({ ...neuve, rcs: e.target.value })} placeholder="Ville du greffe" /></label>
            </div>
            <div className="duo">
              <label><span>Capital social (€)</span><input value={neuve.capital} inputMode="decimal" onChange={(e) => setNeuve({ ...neuve, capital: e.target.value })} /></label>
              <label><span>Siège social</span><input value={neuve.siege} onChange={(e) => setNeuve({ ...neuve, siege: e.target.value })} /></label>
            </div>
            <button type="button" className="mdt-lien" onClick={() => setChoix(null)}>← Rechercher plutôt une société existante</button>
          </div>
        ) : (
          <button type="button" className="mdt-lien" style={{ marginTop: 10 }}
            onClick={() => { setChoix({ neuve: true }); setNeuve((n) => ({ ...n, nom: n.nom || q.trim() })); }}>
            + Créer une société qui n&apos;est ni dans le BO ni dans l&apos;annuaire
          </button>
        )}

        {associe && demanderFonction !== false && libelle && (
          <label className="socp-fonction">
            <span>Fonction du contact dans {libelle}</span>
            <input list="socp-fonctions" value={fonction} onChange={(e) => setFonction(e.target.value)}
              placeholder="Gérant, Président, Associé, Actionnaire…" />
            <datalist id="socp-fonctions">
              {FONCTIONS_ASSOCIE.map((f) => <option key={f} value={f} />)}
            </datalist>
          </label>
        )}
        {err && <div className="cfx-err">{err}</div>}
      </div>
    </Modale>
  );
}
