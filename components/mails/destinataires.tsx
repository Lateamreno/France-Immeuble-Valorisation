"use client";

/* Le champ « À » de la fenêtre de rédaction (retour #127).
 *
 * MAV : « il faut que je puisse rentrer une adresse e-mail mais aussi chercher
 * un contact qu'on connaît déjà, et quand je mets une adresse qu'il ne connaît
 * pas il devrait me demander si je veux l'ajouter comme contact. »
 *
 * Les trois gestes, donc :
 *   · taper une adresse, comme dans n'importe quelle messagerie ;
 *   · taper un nom et choisir dans le fichier ;
 *   · et, pour toute adresse inconnue, se voir proposer la fiche — c'est le
 *     moment où on la crée, pas trois semaines plus tard quand on la cherche.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { chercherContacts, createContact, type ContactTrouve } from "@/lib/bo/actions";

const EMAIL = /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/;

const adressesDe = (v: string) =>
  v.split(/[,;]/).map((x) => x.trim()).filter(Boolean);

/** « jean.dupont » → « Jean Dupont » : un nom provisoire vaut mieux que rien. */
const nomProbable = (email: string) =>
  (email.split("@")[0] ?? "")
    .split(/[._-]+/).filter(Boolean)
    .map((m) => m[0]?.toUpperCase() + m.slice(1))
    .join(" ") || email;

export function ChampDestinataires({ valeur, onChange, agentId, onDestinataire }: {
  valeur: string;
  onChange: (v: string) => void;
  agentId: string;
  /** La fiche du premier destinataire, pour que l'aperçu montre le vrai
   *  destinataire plutôt qu'un exemple inventé (retour #131). */
  onDestinataire?: (c: ContactTrouve | null) => void;
}) {
  /* Ce qui est en train d'être tapé, à droite de la dernière virgule. */
  const [trouves, setTrouves] = useState<ContactTrouve[]>([]);
  const [ouvert, setOuvert] = useState(false);
  const [inconnues, setInconnues] = useState<string[]>([]);
  const [creees, setCreees] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const zone = useRef<HTMLDivElement>(null);

  const morceau = valeur.slice(valeur.lastIndexOf(",") + 1).trim();

  /* Recherche au fil de la frappe, avec un temps mort : une requête par
     caractère sur 42 000 fiches ne servirait personne. */
  useEffect(() => {
    const q = morceau;
    /* Une adresse complète n'a pas besoin d'être cherchée, et deux lettres ne
       veulent rien dire sur 42 000 fiches. */
    if (q.length < 2 || EMAIL.test(q)) {
      const vide = setTimeout(() => setTrouves([]), 0);
      return () => clearTimeout(vide);
    }
    const t = setTimeout(() => {
      chercherContacts(q)
        .then((r) => { setTrouves(r.filter((c) => c.email)); setOuvert(true); })
        .catch(() => setTrouves([]));
    }, 250);
    return () => clearTimeout(t);
  }, [morceau]);

  /* Fermer la liste quand on clique ailleurs. */
  useEffect(() => {
    const dehors = (e: MouseEvent) => {
      if (zone.current && !zone.current.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener("mousedown", dehors);
    return () => document.removeEventListener("mousedown", dehors);
  }, []);

  const choisir = (c: ContactTrouve) => {
    const debut = valeur.slice(0, valeur.lastIndexOf(",") + 1);
    onChange(`${debut}${debut ? " " : ""}${c.email}, `);
    setOuvert(false);
    setTrouves([]);
    /* Premier destinataire : c'est lui que l'aperçu doit montrer. */
    if (!debut.trim()) onDestinataire?.(c);
  };

  /** Sur sortie du champ : quelles adresses ne sont dans aucune fiche ? */
  const verifier = () =>
    start(async () => {
      const liste = adressesDe(valeur).filter((x) => EMAIL.test(x));
      if (!liste.length) { setInconnues([]); return; }
      const manquantes: string[] = [];
      let premier: ContactTrouve | null = null;
      for (const [i, email] of liste.slice(0, 10).entries()) {
        if (creees.includes(email)) continue;
        const r = await chercherContacts(email).catch(() => []);
        const fiche = r.find((c) => (c.email ?? "").toLowerCase() === email.toLowerCase());
        if (i === 0) premier = fiche ?? null;
        if (!fiche) manquantes.push(email);
      }
      setInconnues(manquantes);
      /* L'aperçu se cale sur la fiche du premier destinataire — ou repart sur
         l'exemple si l'adresse n'est dans aucune fiche. */
      onDestinataire?.(premier);
    });

  const creer = (email: string) =>
    start(async () => {
      try {
        await createContact({ nom: nomProbable(email), email, agentId });
        setCreees((c) => [...c, email]);
        setInconnues((l) => l.filter((x) => x !== email));
      } catch {
        /* Rien de cassé : le message part quand même, la fiche attendra. */
      }
    });

  return (
    <div className="mdest" ref={zone}>
      <label className="mred-l">
        <span>À</span>
        <input
          value={valeur}
          onChange={(e) => onChange(e.target.value)}
          onBlur={verifier}
          onFocus={() => { if (trouves.length) setOuvert(true); }}
          placeholder="Un nom du fichier, ou une adresse e-mail"
        />
      </label>

      {ouvert && trouves.length > 0 && (
        <div className="mdest-liste">
          <div className="mdest-titre">Contacts pour « {morceau} »</div>
          {trouves.map((c) => (
            <button key={c.id} type="button" className="mdest-it" onClick={() => choisir(c)}>
              <b>{c.nom}</b>
              <span>{c.email}{c.type ? ` · ${c.type}` : ""}</span>
            </button>
          ))}
        </div>
      )}

      {inconnues.length > 0 && (
        <div className="mdest-neuf">
          {inconnues.map((email) => (
            <span key={email}>
              <i>{email}</i> n&apos;est dans aucune fiche.
              <button type="button" disabled={pending} onClick={() => creer(email)}>
                Créer le contact
              </button>
            </span>
          ))}
        </div>
      )}
      {creees.length > 0 && (
        <div className="mdest-ok">
          {creees.length} contact{creees.length > 1 ? "s" : ""} créé{creees.length > 1 ? "s" : ""}.
        </div>
      )}
    </div>
  );
}
