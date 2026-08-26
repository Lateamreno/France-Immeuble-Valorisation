"use client";

// Écran Photos (retour #95).
//
// Ce que MAV a demandé, dans l'ordre :
//   · déposer plein de photos d'un coup, HEIC compris, redimensionnées pour
//     le web (et converties en JPEG — voir lib/bo/images.ts) ;
//   · dire d'un clic si la photo part dans le dossier de vente ;
//   · glisser-déposer pour ranger ;
//   · une modale pour associer la photo à un lot, à la façade, aux parties
//     communes, au cadastre ou à la carte — les photos d'un lot remontent
//     ensuite dans l'état locatif ;
//   · une photo principale affichée en grand, avec son propre bouton tant
//     qu'elle n'est pas choisie ;
//   · une corbeille sur chaque photo, avec confirmation.
import { useMemo, useRef, useState, useTransition } from "react";
import type { BienData } from "@/lib/bubble/server";
import {
  associerPhoto, basculerDiffusionPhoto, definirPhotoPrincipale, deletePhoto,
  ordonnerPhotos, rafraichirFiche, uploadPhoto,
} from "@/lib/bo/actions";

type Photo = BienData["photos"][number];

/** Les rattachements possibles. La valeur est celle stockée par le BO. */
export const TYPES_PHOTO = [
  { valeur: "Extérieur", label: "Façade / extérieur" },
  { valeur: "Parties communes", label: "Parties communes" },
  { valeur: "Lot", label: "Un lot" },
] as const;

/**
 * Les captures qui ne sont pas des photos du bien (retour #179).
 *
 * Une capture de cadastre ou de carte est une pièce de travail : elle est
 * prise dans l'onglet Emplacement, elle s'affiche là-bas, et elle n'a rien à
 * faire dans la galerie ni dans le dossier de vente. Elle reste enregistrée —
 * on ne perd rien — mais elle sort de la grille.
 */
export const HORS_GALERIE = new Set(["Cadastre", "Carte"]);

const LIBELLE: Record<string, string> = {
  Principale: "Principale",
  Extérieur: "Façade",
  "Parties communes": "Communes",
  Lot: "Lot",
  Cadastre: "Cadastre",
  Carte: "Carte",
};

const COTE_CLIENT = 2400;

/**
 * Réduit l'image dans le navigateur avant l'envoi : une rafale de 30 photos
 * d'iPhone fait 150 Mo bruts, quelques mégaoctets une fois redimensionnée.
 * Un HEIC que le navigateur ne sait pas décoder (tout sauf Safari) part tel
 * quel : le serveur s'en charge.
 */
async function reduire(f: File): Promise<File> {
  if (!/^image\//.test(f.type) && !/\.(jpe?g|png|webp|heic|heif|avif|gif)$/i.test(f.name)) return f;
  try {
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, COTE_CLIENT / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    const ctx = c.getContext("2d");
    if (!ctx) return f;
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.85));
    if (!blob) return f;
    return new File([blob], f.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return f;
  }
}

/* ---------------------------------------------------------------- écran --- */

export function PhotosEcran({ b }: { b: BienData }) {
  const immeubleId = String(b.im._id);
  const [filtre, setFiltre] = useState<string>("");
  /** Ordre local : le glisser-déposer doit réagir avant l'aller-retour serveur. */
  const [ordre, setOrdre] = useState<string[] | null>(null);
  const [glisse, setGlisse] = useState<string | null>(null);
  const [survol, setSurvol] = useState(false);
  const [envoi, setEnvoi] = useState<{ fait: number; total: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [associe, setAssocie] = useState<Photo | null>(null);
  const [supprime, setSupprime] = useState<Photo | null>(null);
  const [zoom, setZoom] = useState<Photo | null>(null);
  const [, start] = useTransition();
  const inputMulti = useRef<HTMLInputElement>(null);
  const inputPrinc = useRef<HTMLInputElement>(null);

  const toutes = useMemo(() => {
    if (!ordre) return b.photos;
    const par = new Map(b.photos.map((p) => [p.id, p]));
    const rangees = ordre.map((id) => par.get(id)).filter(Boolean) as Photo[];
    // Une photo arrivée entre-temps ne doit pas disparaître de la grille.
    return [...rangees, ...b.photos.filter((p) => !ordre.includes(p.id))];
  }, [b.photos, ordre]);

  const principale = toutes.find((p) => p.type === "Principale");
  /* #179 — « je ne veux pas que les photos de la carte ou du cadastre
     apparaissent ici, je veux que ce soit simplement les photos de
     l'immeuble ». Ces captures sont des pièces de travail : elles vivent dans
     l'onglet Emplacement, où elles ont été prises, et n'ont rien à faire dans
     la galerie du bien ni dans le dossier de vente. */
  const secondaires = toutes.filter((p) => p.type !== "Principale" && !HORS_GALERIE.has(p.type ?? ""));
  const visibles = filtre ? secondaires.filter((p) => p.type === filtre) : secondaires;
  const compte = (t: string) => secondaires.filter((p) => p.type === t).length;

  const lotLabel = (id?: string) => {
    const l = b.lots.find((x) => String(x._id) === id);
    return l ? `Lot ${String(l.numero ?? "?")}` : "Lot";
  };

  /* --- Import --- */
  const importer = (fichiers: FileList | File[] | null, type: string) => {
    const liste = Array.from(fichiers ?? []).filter((f) => f.size > 0);
    if (liste.length === 0) return;
    setErr(null);
    setEnvoi({ fait: 0, total: liste.length });
    start(async () => {
      const rate: string[] = [];
      const avertis: string[] = [];
      let rang = toutes.length;
      for (let i = 0; i < liste.length; i++) {
        try {
          const fd = new FormData();
          fd.set("file", await reduire(liste[i]));
          // Une seule photo principale : les suivantes rejoignent la façade.
          // `true` = pas de revalidation par fichier : on rafraîchit une fois
          // la rafale terminée (sinon trente photos = trente rendus).
          const r = await uploadPhoto(immeubleId, i === 0 ? type : type === "Principale" ? "" : type, null, fd, rang++, true);
          if (!r.ok) rate.push(r.message);
          else if (r.avertissement) avertis.push(`${liste[i].name} — ${r.avertissement}`);
        } catch (e) {
          /* Il reste les pannes que l'action ne peut pas rattraper : coupure
             réseau, requête trop grosse pour la plateforme. */
          rate.push(`${liste[i].name} — ${e instanceof Error ? e.message : String(e)}`);
        }
        setEnvoi({ fait: i + 1, total: liste.length });
      }
      await rafraichirFiche(immeubleId);
      setEnvoi(null);
      setOrdre(null);
      const messages = [
        ...(rate.length ? [`${rate.length} photo(s) refusée(s) :\n${rate.join("\n")}`] : []),
        ...(avertis.length ? [avertis.join("\n")] : []),
      ];
      if (messages.length) setErr(messages.join("\n\n"));
      if (inputMulti.current) inputMulti.current.value = "";
      if (inputPrinc.current) inputPrinc.current.value = "";
    });
  };

  /* --- Glisser-déposer de rangement --- */
  const deposerSur = (cibleId: string) => {
    if (!glisse || glisse === cibleId) return setGlisse(null);
    const ids = toutes.map((p) => p.id);
    const de = ids.indexOf(glisse);
    const vers = ids.indexOf(cibleId);
    if (de < 0 || vers < 0) return setGlisse(null);
    ids.splice(vers, 0, ids.splice(de, 1)[0]);
    setGlisse(null);
    setOrdre(ids);
    start(() => ordonnerPhotos(immeubleId, ids));
  };

  return (
    <div
      className={`gph-wrap${survol ? " drop" : ""}`}
      /* #181 — le cadre de dépôt ne surgit QUE pour des fichiers venus du
         bureau. Ranger les photos à la souris déclenchait aussi le survol,
         et un grand cadre s'ouvrait au mauvais moment. */
      onDragOver={(e) => {
        if (glisse || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setSurvol(true);
      }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setSurvol(false); }}
      onDrop={(e) => {
        if (!e.dataTransfer.files?.length) return;
        e.preventDefault();
        setSurvol(false);
        importer(e.dataTransfer.files, principale ? "" : "Principale");
      }}
    >
      {/* ---- Photo principale ---- */}
      <div className="fsub">Photo principale</div>
      {principale ? (
        <div className="gph-main">
          {principale.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={principale.urlPleine ?? principale.url} alt="Photo principale" onClick={() => setZoom(principale)} />
          )}
          <div className="gph-main-act">
            <button type="button" className="fadd" onClick={() => inputPrinc.current?.click()}>Remplacer</button>
            <button type="button" className="xdel" title="Supprimer" onClick={() => setSupprime(principale)}>✕</button>
          </div>
        </div>
      ) : (
        <button type="button" className="gph-vide" onClick={() => inputPrinc.current?.click()}>
          <svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2.5" /><path d="M8 7l1.5-3h5L16 7" /><circle cx="12" cy="13" r="3.4" /></svg>
          <b>Ajouter la photo principale</b>
          <i>C&apos;est elle qui s&apos;affiche sur la liste des immeubles et en couverture du dossier de vente.</i>
        </button>
      )}
      <input
        ref={inputPrinc} type="file" accept="image/*,.heic,.heif" hidden
        onChange={(e) => importer(e.target.files, "Principale")}
      />

      {/* ---- Barre d'import + filtres ---- */}
      <div className="gph-bar">
        <button type="button" className="fadd" onClick={() => inputMulti.current?.click()}>+ Ajouter des photos</button>
        <input
          ref={inputMulti} type="file" accept="image/*,.heic,.heif" multiple hidden
          /* #180 — plus de catégorie par défaut : « j'ai fait un ajout de
             masse et il m'a indiqué que c'était de la façade, ce qui n'est
             pas forcément le cas ». Sans réponse, on n'invente pas. */
          onChange={(e) => importer(e.target.files, "")}
        />
        {/* #181 — « limite il faudrait qu'il y ait H24 une petite section
            dans laquelle je peux drag and drop des photos si je veux ». La
            voici : toujours là, discrète, et elle accepte le dépôt. */}
        <label
          className={`gph-zone${survol ? " on" : ""}`}
          onDragOver={(e) => { if (!glisse && e.dataTransfer.types.includes("Files")) { e.preventDefault(); setSurvol(true); } }}
          onDragLeave={() => setSurvol(false)}
          onDrop={(e) => {
            if (glisse || !e.dataTransfer.files?.length) return;
            e.preventDefault();
            e.stopPropagation();
            setSurvol(false);
            importer(e.dataTransfer.files, principale ? "" : "Principale");
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden><path d="M12 16V4M8 8l4-4 4 4" /><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></svg>
          Déposez vos photos ici — HEIC accepté, tout est converti et redimensionné.
        </label>
        <span style={{ flex: 1 }} />
        {envoi && <span className="gph-prog">Envoi {envoi.fait}/{envoi.total}…</span>}
      </div>

      <div className="gph-filtres">
        <button type="button" className={`mopt${filtre === "" ? " on" : ""}`} onClick={() => setFiltre("")}>
          Toutes <b>{secondaires.length}</b>
        </button>
        {TYPES_PHOTO.map((t) => (
          <button
            key={t.valeur} type="button"
            className={`mopt${filtre === t.valeur ? " on" : ""}`}
            onClick={() => setFiltre(filtre === t.valeur ? "" : t.valeur)}
          >
            {t.label} <b>{compte(t.valeur)}</b>
          </button>
        ))}
      </div>

      {err && (
        <div className="warnbox" style={{ color: "var(--red)", borderColor: "var(--red)", whiteSpace: "pre-line" }}>
          {err}
          <button type="button" className="xdel" style={{ float: "right" }} onClick={() => setErr(null)}>✕</button>
        </div>
      )}

      {/* ---- Grille ---- */}
      <div className="gph-grid">
        {visibles.map((p) => (
          <figure
            key={p.id}
            className={`gph${glisse === p.id ? " glisse" : ""}`}
            draggable
            onDragStart={(e) => { setGlisse(p.id); e.dataTransfer.effectAllowed = "move"; }}
            onDragEnd={() => setGlisse(null)}
            onDragOver={(e) => { if (glisse) e.preventDefault(); }}
            onDrop={(e) => { if (glisse) { e.preventDefault(); e.stopPropagation(); deposerSur(p.id); } }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {p.url && <img src={p.url} alt="" onClick={() => setZoom(p)} />}
            <span className="gph-type">{p.type === "Lot" ? lotLabel(p.lotId) : LIBELLE[p.type ?? ""] ?? "À classer"}</span>
            <button type="button" className="gph-x" title="Supprimer la photo" onClick={() => setSupprime(p)}>✕</button>
            <figcaption>
              <button
                type="button"
                className={`gph-doss${p.dossier ? " on" : ""}`}
                title={p.dossier ? "Retirer du dossier de vente" : "Mettre dans le dossier de vente"}
                onClick={() => start(() => basculerDiffusionPhoto(immeubleId, p.id, "show_in_doss", !p.dossier))}
              >
                {p.dossier ? "✓ Dossier" : "Dossier"}
              </button>
              <button type="button" className="gph-a" onClick={() => setAssocie(p)}>Associer</button>
              <button
                type="button" className="gph-a" title="Faire de cette photo la principale"
                onClick={() => start(() => definirPhotoPrincipale(immeubleId, p.id))}
              >★</button>
            </figcaption>
          </figure>
        ))}
      </div>
      {visibles.length === 0 && (
        <div className="fempty">
          {secondaires.length === 0 ? "Aucune photo — glissez vos fichiers ici." : "Aucune photo pour ce filtre."}
        </div>
      )}

      {associe && <ModaleAssocier b={b} photo={associe} onClose={() => setAssocie(null)} />}
      {supprime && (
        <ModaleSupprimer
          photo={supprime}
          onClose={() => setSupprime(null)}
          onOk={() => { const id = supprime.id; setSupprime(null); start(() => deletePhoto(immeubleId, id)); }}
        />
      )}
      {zoom && (
        <div className="modal-ov" onClick={() => setZoom(null)}>
          <div className="gph-zoom" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="xdel" onClick={() => setZoom(null)}>✕</button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={zoom.urlPleine ?? zoom.url} alt="" />
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- modales --- */

function ModaleAssocier({ b, photo, onClose }: { b: BienData; photo: Photo; onClose: () => void }) {
  const immeubleId = String(b.im._id);
  const [type, setType] = useState(photo.type && photo.type !== "Principale" ? photo.type : "");
  const [lotId, setLotId] = useState(photo.lotId ?? "");
  const [pending, start] = useTransition();
  const complet = !!type && (type !== "Lot" || !!lotId);

  return (
    <div className="modal-ov">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">Associer la photo<button type="button" onClick={onClose}>✕</button></div>
        <div className="modal-b">
          <span className="mlab">Cette photo montre…</span>
          <div className="mrow" style={{ flexWrap: "wrap" }}>
            {TYPES_PHOTO.map((t) => (
              <button key={t.valeur} type="button" className={`mopt${type === t.valeur ? " on" : ""}`} onClick={() => setType(t.valeur)}>
                {t.label}
              </button>
            ))}
          </div>
          {type === "Lot" && (
            <>
              <span className="mlab">Lot concerné</span>
              <select className={`min${lotId ? "" : " vide"}`} value={lotId} onChange={(e) => setLotId(e.target.value)}>
                <option value="">Sélectionnez un lot…</option>
                {b.lots.map((l) => (
                  <option key={String(l._id)} value={String(l._id)}>
                    Lot {String(l.numero ?? "?")} · {String(l.Type_lot ?? l.Destination ?? "")}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 11.5, color: "var(--gray-lt)", marginTop: 6 }}>
                La photo remontera dans l&apos;état locatif, sur la ligne du lot.
              </div>
            </>
          )}
        </div>
        <div className="modal-f">
          <button
            className="kgo" type="button" disabled={!complet || pending}
            style={!complet || pending ? { opacity: 0.5 } : undefined}
            onClick={() => start(async () => {
              await associerPhoto(immeubleId, photo.id, type, type === "Lot" ? lotId : null);
              onClose();
            })}
          >
            <span className="ch">›</span> {pending ? "Enregistrement…" : "Associer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModaleSupprimer({ photo, onClose, onOk }: { photo: Photo; onClose: () => void; onOk: () => void }) {
  return (
    <div className="modal-ov">
      <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">Supprimer la photo<button type="button" onClick={onClose}>✕</button></div>
        <div className="modal-b">
          {photo.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo.url} alt="" style={{ width: "100%", borderRadius: 4, marginBottom: 10 }} />
          )}
          <div style={{ fontSize: 13 }}>
            Cette photo sera retirée de la fiche et du dossier de vente. Elle reste récupérable dans la corbeille.
          </div>
        </div>
        <div className="modal-f">
          <button type="button" className="fadd" onClick={onClose}>Annuler</button>
          <button type="button" className="kgo danger" onClick={onOk}><span className="ch">›</span> Supprimer</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------ vignettes d'un lot (#95) --- */

/** Les photos d'un lot, telles qu'elles apparaissent dans l'état locatif. */
export function PhotosDuLot({ b, lotId }: { b: BienData; lotId: string }) {
  const [ouvert, setOuvert] = useState(false);
  const photos = b.photos.filter((p) => p.type === "Lot" && p.lotId === lotId);
  if (photos.length === 0) return <span className="phc phc-0">0</span>;
  return (
    <>
      <button type="button" className="phc on" onClick={() => setOuvert(true)} title="Voir les photos du lot">
        <svg viewBox="0 0 24 24"><path d="M3 7h4l1.5-2h7L17 7h4v13H3z" /><circle cx="12" cy="13" r="3.4" /></svg>
        {photos.length}
      </button>
      {ouvert && (
        <div className="modal-ov" onClick={() => setOuvert(false)}>
          <div className="modal" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">Photos du lot<button type="button" onClick={() => setOuvert(false)}>✕</button></div>
            <div className="modal-b">
              <div className="gph-grid">
                {photos.map((p) => (
                  <figure key={p.id} className="gph">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {p.url && <a href={p.urlPleine ?? p.url} target="_blank" rel="noreferrer"><img src={p.url} alt="" /></a>}
                  </figure>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
