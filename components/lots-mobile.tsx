"use client";

// État locatif sur téléphone.
//
// Le tableau n'est pas le bon objet ici. Une grille sert à comparer des lignes
// entre elles ; en visite, on ne compare rien — on remplit un lot, puis le
// suivant. D'où deux écrans :
//
//   · une liste de cartes, une par lot, lisible sans scroll horizontal ;
//   · le lot en plein écran, champs empilés, claviers numériques, et des
//     flèches « précédent / suivant » pour enchaîner les onze lots de Volant
//     sans jamais remonter à la liste.
//
// La photo se prend sur place : l'appareil s'ouvre depuis l'écran du lot et
// la photo arrive déjà associée au bon lot (elle remonte dans l'écran Photos).
import { useRef, useState, useTransition } from "react";
import type { BienData } from "@/lib/bubble/server";
import { euros } from "@/lib/format";
import { rafraichirFiche, uploadPhoto } from "@/lib/bo/actions";
import {
  DESTINATIONS, ETATS_LOT as ETATS, TYPES_BAIL, TYPES_DPE as DPES, TYPES_LOT,
} from "@/lib/referentiels";

/** La ligne d'édition, telle que la tient `LotsEditor`. */
export type LigneLot = {
  id: string; isNew: boolean; ordre: number; travaux: string;
  batiment: string; etage: string; numero: string;
  Destination: string; Type_lot: string;
  surface_carrez: string; surface_sol: string;
  Type_bail: string; loyer: string; loyer_max: string;
  Etat: string; Type_dpe: string; renov_year: string;
  commentaire: string;
};

type Champ = keyof LigneLot;

const nb = (s: string) => {
  const v = parseFloat((s ?? "").replace(",", "."));
  return Number.isFinite(v) ? v : undefined;
};

/* ------------------------------------------------------------- la liste --- */

export function LotsCartes({
  lignes, b, dirty, onOuvrir, onAjouter,
}: {
  lignes: LigneLot[];
  b: BienData;
  dirty: Set<string>;
  onOuvrir: (id: string) => void;
  onAjouter: () => void;
}) {
  return (
    <div className="lmob">
      {lignes.map((r) => {
        const loyer = nb(r.loyer) ?? 0;
        const photos = b.photos.filter((p) => p.type === "Lot" && p.lotId === r.id).length;
        return (
          <button key={r.id} type="button" className={`lmob-c${dirty.has(r.id) ? " modif" : ""}`} onClick={() => onOuvrir(r.id)}>
            <span className="l1">
              <b>Lot {r.numero || "?"}</b>
              <span className="ty">{r.Type_lot || r.Destination || "—"}</span>
              {r.etage && <span className="etg">{r.etage}</span>}
              <span className={`et${loyer > 0 ? " occ" : " libre"}`}>{loyer > 0 ? "Occupé" : "Libre"}</span>
            </span>
            <span className="l2">
              <span className="v"><i>Carrez</i>{r.surface_carrez ? `${r.surface_carrez} m²` : "—"}</span>
              <span className="v"><i>Loyer HC</i>{loyer > 0 ? `${euros(loyer)}` : "—"}</span>
              <span className="v"><i>DPE</i>{r.Type_dpe && r.Type_dpe !== "n.c." ? r.Type_dpe : "—"}</span>
            </span>
            <span className="l3">
              {r.Etat && r.Etat !== "n.c." && <span className={`ch${r.Etat === "Travaux" ? " rouge" : ""}`}>{r.Etat}</span>}
              {nb(r.travaux) ? <span className="ch">{euros(nb(r.travaux))} de travaux</span> : null}
              {photos > 0 && <span className="ch">{photos} photo{photos > 1 ? "s" : ""}</span>}
              {dirty.has(r.id) && <span className="ch jaune">Non enregistré</span>}
              <span className="chev">›</span>
            </span>
          </button>
        );
      })}
      {lignes.length === 0 && <div className="fempty">Aucun lot — touchez « Ajouter un lot ».</div>}
      <button type="button" className="lmob-add" onClick={onAjouter}>+ Ajouter un lot</button>
    </div>
  );
}

/* ------------------------------------------------------- le lot en grand --- */

export function LotPleinEcran({
  lignes, index, b, dirty, onChange, onFermer, onNaviguer, onEnregistrer, enregistrement,
}: {
  lignes: LigneLot[];
  index: number;
  b: BienData;
  dirty: Set<string>;
  onChange: (id: string, champ: Champ, valeur: string) => void;
  onFermer: () => void;
  onNaviguer: (delta: number) => void;
  onEnregistrer: () => void;
  enregistrement: boolean;
}) {
  const r = lignes[index];
  const [photoEnCours, setPhotoEnCours] = useState(false);
  const [photoKo, setPhotoKo] = useState<string | null>(null);
  const appareil = useRef<HTMLInputElement>(null);
  const [, start] = useTransition();
  if (!r) return null;

  const maj = (champ: Champ) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    onChange(r.id, champ, e.target.value);

  const photos = b.photos.filter((p) => p.type === "Lot" && p.lotId === r.id);
  const typologies = [...new Set([r.Type_lot, ...TYPES_LOT, ...b.typologies.map(String)])].filter(Boolean);

  const prendrePhoto = (fichiers: FileList | null) => {
    const f = fichiers?.[0];
    if (!f) return;
    setPhotoKo(null);
    setPhotoEnCours(true);
    start(async () => {
      try {
        const fd = new FormData();
        fd.set("file", f);
        await uploadPhoto(String(b.im._id), "Lot", r.id, fd, b.photos.length, true);
        await rafraichirFiche(String(b.im._id));
      } catch (e) {
        setPhotoKo(e instanceof Error ? e.message : String(e));
      }
      setPhotoEnCours(false);
      if (appareil.current) appareil.current.value = "";
    });
  };

  return (
    <div className="lfs">
      <div className="lfs-h">
        <button type="button" className="lfs-x" onClick={onFermer} aria-label="Fermer">✕</button>
        <div className="t">
          Lot {r.numero || "?"}
          <i>{index + 1} sur {lignes.length}</i>
        </div>
        {dirty.has(r.id) && <span className="lfs-modif">Non enregistré</span>}
      </div>

      <div className="lfs-b">
        <div className="lfs-sec">Repère</div>
        <div className="lfs-l3">
          <Champ3 label="Bâtiment" valeur={r.batiment} onChange={maj("batiment")} />
          <Champ3 label="Étage" valeur={r.etage} onChange={maj("etage")} />
          <Champ3 label="N°" valeur={r.numero} onChange={maj("numero")} clavier="numeric" />
        </div>

        <div className="lfs-sec">Destination</div>
        <div className="lfs-seg">
          {DESTINATIONS.map((d) => (
            <button
              key={d} type="button" className={r.Destination === d ? "on" : undefined}
              onClick={() => { onChange(r.id, "Destination", d); onChange(r.id, "Type_lot", ""); }}
            >{d}</button>
          ))}
        </div>

        <Ligne label="Typologie">
          <select className="lfs-in" value={r.Type_lot} onChange={maj("Type_lot")}>
            <option value="">—</option>
            {typologies.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Ligne>

        <div className="lfs-sec">Surfaces</div>
        <div className="lfs-l2">
          <Champ2 label="Carrez" suffixe="m²" valeur={r.surface_carrez} onChange={maj("surface_carrez")} />
          <Champ2 label="Au sol" suffixe="m²" valeur={r.surface_sol} onChange={maj("surface_sol")} />
        </div>

        <div className="lfs-sec">Location</div>
        <Ligne label="Type de bail">
          <select className={`lfs-in${r.Type_bail === "Vide" ? " rouge" : ""}`} value={r.Type_bail} onChange={maj("Type_bail")}>
            <option value="">—</option>
            {[...new Set([r.Type_bail, ...TYPES_BAIL])].filter(Boolean).map((o) => <option key={o}>{o}</option>)}
          </select>
        </Ligne>
        <div className="lfs-l2">
          <Champ2 label="Loyer HC actuel" suffixe="€" valeur={r.loyer} onChange={maj("loyer")} />
          <Champ2 label="Loyer HC potentiel" suffixe="€" valeur={r.loyer_max} onChange={maj("loyer_max")} />
        </div>

        <div className="lfs-sec">État</div>
        <div className="lfs-l2">
          <Ligne label="État du lot">
            <select className={`lfs-in${r.Etat === "Travaux" ? " rouge" : ""}`} value={r.Etat} onChange={maj("Etat")}>
              <option value="">—</option>
              {[...new Set([r.Etat, ...ETATS])].filter(Boolean).map((o) => <option key={o}>{o}</option>)}
            </select>
          </Ligne>
          <Champ2 label="Travaux" suffixe="€" valeur={r.travaux} onChange={maj("travaux")} />
        </div>
        <div className="lfs-l2">
          <Ligne label="DPE">
            <select className="lfs-in" value={r.Type_dpe} onChange={maj("Type_dpe")}>
              <option value="">—</option>
              {[...new Set([r.Type_dpe, ...DPES])].filter(Boolean).map((o) => <option key={o}>{o}</option>)}
            </select>
          </Ligne>
          <Champ2 label="Année rénovation" valeur={r.renov_year} onChange={maj("renov_year")} clavier="numeric" />
        </div>

        <div className="lfs-sec">Photos du lot</div>
        <div className="lfs-ph">
          {photos.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <a key={p.id} href={p.urlPleine ?? p.url} target="_blank" rel="noreferrer"><img src={p.url} alt="" /></a>
          ))}
          {r.isNew ? (
            <span className="lfs-ph-att">Enregistrez le lot avant d&apos;y ajouter une photo.</span>
          ) : (
            <button type="button" className="lfs-ph-add" disabled={photoEnCours} onClick={() => appareil.current?.click()}>
              {photoEnCours ? "Envoi…" : "Prendre une photo"}
            </button>
          )}
          <input
            ref={appareil} type="file" accept="image/*" capture="environment" hidden
            onChange={(e) => prendrePhoto(e.target.files)}
          />
        </div>
        {photoKo && <div className="warnbox" style={{ color: "var(--red)", borderColor: "var(--red)" }}>{photoKo}</div>}

        <div className="lfs-sec">Commentaire</div>
        <textarea className="lfs-in lfs-ta" rows={3} value={r.commentaire} onChange={maj("commentaire")} />
      </div>

      {/* Barre collée en bas : naviguer d'un lot à l'autre sans remonter, et
          le bouton vert à droite comme partout ailleurs dans le BO. */}
      <div className="lfs-f">
        <button type="button" className="lfs-nav" disabled={index === 0} onClick={() => onNaviguer(-1)} aria-label="Lot précédent">‹</button>
        <button type="button" className="lfs-nav" disabled={index >= lignes.length - 1} onClick={() => onNaviguer(1)} aria-label="Lot suivant">›</button>
        <span style={{ flex: 1 }} />
        {/* Même bouton vert que la barre d'enregistrement du reste du site
            (règle générale, pas un habillage d'écran). */}
        <button
          type="button" className="savebar-go" disabled={enregistrement || dirty.size === 0}
          onClick={onEnregistrer}
        >
          {enregistrement ? "Enregistrement…" : `Enregistrer${dirty.size > 1 ? ` (${dirty.size})` : ""}`}
        </button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- champs --- */

function Ligne({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="lfs-ch">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Champ2({
  label, valeur, onChange, suffixe, clavier = "decimal",
}: {
  label: string; valeur: string; suffixe?: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  clavier?: "decimal" | "numeric" | "text";
}) {
  return (
    <label className="lfs-ch">
      <span>{label}</span>
      <span className="lfs-num">
        {/* `inputMode` sort le clavier numérique du téléphone : taper une
            surface avec un clavier alphabétique est le meilleur moyen de ne
            jamais se servir de l'écran. */}
        <input className="lfs-in" value={valeur} onChange={onChange} inputMode={clavier} />
        {suffixe && <i>{suffixe}</i>}
      </span>
    </label>
  );
}

function Champ3(p: Parameters<typeof Champ2>[0]) {
  return <Champ2 {...p} clavier={p.clavier ?? "text"} />;
}
