"use client";

/**
 * La fenêtre « Nouveau contact » — UNE seule, quel que soit le bouton d'où
 * l'on part (MAV, 16/11 : « il faudrait que le popup soit le même que pour la
 * création de contact de base, de telle sorte que tout soit bien enregistré
 * même quand on crée un contact depuis un autre bouton »).
 *
 * Elle sert la barre de création du bas et le sélecteur de contact (création
 * de recherche, apporteur, suivi, mandat, société…). Avant, le sélecteur avait
 * son propre petit formulaire, sans e-mail obligatoire, sans projet ni « suivi
 * par » : le contact naissait incomplet et sans commercial.
 */
import { useState, useTransition } from "react";
import { agentsConnus, useAgentCourant } from "@/lib/bo/agent-courant";
import type { Agent } from "@/lib/bubble/server";
import { contactParEmail, createContact, type ContactTrouve } from "@/lib/bo/actions";
import { DoublonContact } from "@/components/doublon-contact";
import { FenetreAjout, ICA, Ligne, Resume } from "@/components/ajout-rapide";

export function FenetreNouveauContact({ agents: fournis, initial, onFermer, onCree }: {
  /** Les agents ; à défaut, ceux que la barre du bas a fait connaître au poste. */
  agents?: Agent[];
  /** Ce qu'on avait tapé dans la recherche (« Jean Dupont »). */
  initial?: { prenom?: string; nom?: string; email?: string };
  onFermer: () => void;
  /** Le contact créé — ou celui qui existait déjà sous cette adresse. */
  onCree: (c: ContactTrouve) => void;
}) {
  const [agents] = useState<Agent[]>(() => fournis ?? (agentsConnus() as Agent[]));
  const [pending, start] = useTransition();
  const [civ, setCiv] = useState("Monsieur");
  const [prenom, setPrenom] = useState(initial?.prenom ?? "");
  const [nom, setNom] = useState(initial?.nom ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [portable, setPortable] = useState("");
  /* Retour #569 : une étude de notaire se joint au fixe. */
  const [fixe, setFixe] = useState("");
  const [acheteur, setAcheteur] = useState(false);
  const [vendeur, setVendeur] = useState(false);
  /* Par défaut la personne connectée, pas le premier de la liste (#67). */
  const { slug: agent, choisir: setAgent } = useAgentCourant(agents);
  /** Le contact déjà en base qui porte l'adresse saisie (retour #248). */
  const [doublon, setDoublon] = useState<ContactTrouve | null>(null);
  const [err, setErr] = useState<string | null>(null);

  /* Un contact sans adresse e-mail ne sert à rien : ni estimation, ni
     proposition, ni relance. Elle est donc exigée dès la création (#69). */
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const complet = !!nom.trim() && emailOk;
  const nomAgent = agents.find((a) => a.slug === agent)?.name;

  const creer = () => start(async () => {
    setErr(null);
    try {
      /* Retour #248 : l'adresse est-elle déjà connue ? On demande avant
         d'écrire — un doublon créé se rattrape mal, les mails entrants s'y
         accrochent aussitôt. */
      const dejaLa = await contactParEmail(email).catch(() => null);
      if (dejaLa) { setDoublon(dejaLa); return; }
      const id = await createContact({
        "Civilité": civ, "prénom": prenom.trim() || undefined, nom: nom.trim(),
        email: email.trim() || undefined, portable: portable.trim() || undefined,
        fixe: fixe.trim() || undefined,
        acheteur, vendeur,
        agentId: agents.find((a) => a.slug === agent)?.id,
      });
      onCree({
        id,
        nom: `${prenom.trim()} ${nom.trim()}`.trim(),
        email: email.trim() || undefined,
        tel: portable.trim() || fixe.trim() || undefined,
        civilite: civ || undefined,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "La création a échoué.");
    }
  });

  return (
    <FenetreAjout
      icone={ICA.personne} titre="Nouveau contact" onFermer={onFermer}
      pied={
        <>
          <span style={{ flex: 1 }} />
          <button className="fadd" type="button" onClick={onFermer}>Annuler</button>
          <button
            className={`kgo${complet ? " btn-pret" : ""}`} type="button"
            disabled={pending || !complet}
            style={pending || !complet ? { opacity: 0.5 } : undefined}
            title={complet ? undefined : "Le nom et une adresse e-mail valide sont nécessaires"}
            onClick={creer}
          ><span className="ch">›</span> Créer le contact</button>
        </>
      }
    >
      {doublon && (
        <div className="aj-lc" style={{ paddingTop: 12, paddingLeft: 18 }}>
          <DoublonContact existant={doublon} onReprendre={() => onCree(doublon)} onChanger={() => setDoublon(null)} />
        </div>
      )}
      {err && <div className="warnbox" style={{ margin: "10px 18px 0", color: "var(--red)", borderColor: "var(--red)" }}>{err}</div>}
      <Ligne icone={ICA.personne} titre="Identité" manque={!nom.trim() && "Indiquez le nom du contact"}>
        <div className="mrow" style={{ alignItems: "center", flexWrap: "nowrap" }}>
          <select className="min" style={{ width: 120, flex: "none" }} value={civ} onChange={(e) => setCiv(e.target.value)} aria-label="Civilité">
            <option>Monsieur</option><option>Madame</option>
          </select>
          <input className="min" placeholder="Prénom" value={prenom} autoFocus onChange={(e) => setPrenom(e.target.value)} />
          <input className={`min${!nom.trim() ? " requis" : ""}`}
            placeholder="NOM" value={nom} onChange={(e) => setNom(e.target.value)} />
        </div>
      </Ligne>
      <Ligne icone={ICA.enveloppe} titre="Coordonnées"
        manque={!emailOk && (email.trim() ? "Cette adresse e-mail n'est pas valide" : "Indiquez une adresse e-mail")}>
        <div className="aj-deux">
          <input className={`min${email.trim() && !emailOk ? " ko" : ""}${!email.trim() ? " requis" : ""}`}
            placeholder="E-mail (obligatoire)" value={email}
            onChange={(e) => { setDoublon(null); setEmail(e.target.value); }} />
          <input className="min" placeholder="Portable" value={portable} inputMode="tel" onChange={(e) => setPortable(e.target.value)} />
        </div>
        <div className="aj-deux" style={{ marginTop: 6 }}>
          <input className="min" placeholder="Fixe" value={fixe} inputMode="tel" onChange={(e) => setFixe(e.target.value)} />
          <span />
        </div>
      </Ligne>
      <Ligne icone={ICA.cible} titre="Projet"
        resume={!acheteur && !vendeur ? <Resume vide>Non précisé</Resume> : undefined}>
        <div className="mrow">
          <button type="button" className={`mopt${acheteur ? " on" : ""}`} onClick={() => setAcheteur(!acheteur)}>Acheter</button>
          <button type="button" className={`mopt${vendeur ? " on" : ""}`} onClick={() => setVendeur(!vendeur)}>Vendre</button>
        </div>
      </Ligne>
      {agents.length > 0 && (
        <Ligne icone={ICA.agent} titre="Suivi par" repliable ouverte={false}
          resume={nomAgent ? <Resume>{nomAgent}</Resume> : undefined}>
          <div className="mrow">
            {agents.map((a) => (
              <button key={a.slug} type="button" className={`mopt${agent === a.slug ? " on" : ""}`} onClick={() => setAgent(a.slug)}>{a.name}</button>
            ))}
          </div>
        </Ligne>
      )}
    </FenetreAjout>
  );
}
