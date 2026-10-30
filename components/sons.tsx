"use client";

/* Les sons du BO (MAV, 30/10) : une machine à sous quand un formulaire
 * arrive, un tintement discret pour un e-mail.
 *
 * Le BO regarde chaque minute ce qui est arrivé depuis (lib/bo/notifications-
 * actions.ts) ; un formulaire du site est connu dès sa réception, un e-mail à
 * la relève suivante. Les sons sont fabriqués par le navigateur (Web Audio) :
 * aucun fichier à charger, aucun droit à céder.
 *
 * Un navigateur ne joue aucun son avant le premier clic ou la première touche
 * sur la page : le son est donc « armé » à la première interaction. Le bouton
 * du bas du menu coupe et rétablit les sons, poste par poste.
 */

import { useEffect, useRef, useSyncExternalStore } from "react";
import { nouveautes } from "@/lib/bo/notifications-actions";

const CLE = "fi_sons";
const PERIODE = 60_000;

/* L'interrupteur, partagé entre le composant qui sonne et le bouton du menu. */
const abonnes = new Set<() => void>();
const lireActif = () => { try { return localStorage.getItem(CLE) !== "off"; } catch { return true; } };
const abonner = (f: () => void) => { abonnes.add(f); return () => { abonnes.delete(f); }; };
function poserActif(v: boolean) {
  try { localStorage.setItem(CLE, v ? "on" : "off"); } catch { /* navigation privée */ }
  abonnes.forEach((f) => f());
}

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!C) return null;
  ctx ??= new C();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Une note : une onde, une attaque brève, une extinction. */
function note(a: BaseAudioContext, t: number, freq: number, duree: number, volume: number, type: OscillatorType = "sine") {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(volume, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + duree + 0.05);
}

/** Un bruit bref et filtré : le tiroir et le mécanisme de la caisse. */
function bruit(a: BaseAudioContext, t: number, duree: number, volume: number, frequence: number) {
  const n = Math.floor(a.sampleRate * duree);
  const tampon = a.createBuffer(1, n, a.sampleRate);
  const d = tampon.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = a.createBufferSource();
  s.buffer = tampon;
  const f = a.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = frequence;
  f.Q.value = 1.2;
  const g = a.createGain();
  g.gain.value = volume;
  s.connect(f).connect(g).connect(a.destination);
  s.start(t);
}

/**
 * La machine à sous (MAV, 30/10 : « beaucoup plus machine à sous, et qui dure
 * un tout petit peu plus longtemps ») : les rouleaux qui tournent et
 * ralentissent, trois arrêts, la mélodie du gain, puis la pluie de pièces.
 * Deux secondes et demie environ. Le hasard des pièces est tiré d'avance : le
 * son est le même à chaque formulaire.
 */
export function jouerMachineASous(a: BaseAudioContext, t0: number) {
  // Les rouleaux : des clics serrés qui s'espacent.
  let t = t0;
  for (let i = 0; i < 14; i++) {
    bruit(a, t, 0.018, 0.45, 3000 - i * 70);
    note(a, t, 900 + (i % 3) * 120, 0.03, 0.07, "square");
    t += 0.03 + i * 0.004;
  }
  // Trois arrêts de rouleau.
  for (let i = 0; i < 3; i++) {
    bruit(a, t + i * 0.11, 0.05, 0.7, 1400);
    note(a, t + i * 0.11, 523.25, 0.12, 0.1, "square");
  }
  t += 0.38;
  // La mélodie du gain : un arpège qui monte, en carré, façon borne d'arcade.
  const gain = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568];
  gain.forEach((f, i) => note(a, t + i * 0.075, f, 0.16, 0.12, "square"));
  t += gain.length * 0.075;
  note(a, t, 2093, 0.55, 0.11, "square");
  note(a, t, 1046.5, 0.55, 0.08, "triangle");
  // La pluie de pièces.
  const pieces = [0.02, 0.07, 0.11, 0.16, 0.19, 0.24, 0.28, 0.33, 0.37, 0.43, 0.47, 0.54, 0.6, 0.68];
  const hauteurs = [3951, 4699, 3520, 5274, 4186, 3729, 4978, 4435, 3951, 5588, 4186, 4699, 3520, 5274];
  pieces.forEach((d, i) => note(a, t + 0.08 + d, hauteurs[i], 0.22, 0.09 - i * 0.004));
}

export function sonCaisse() {
  const a = audio();
  if (!a) return;
  jouerMachineASous(a, a.currentTime + 0.02);
}

/** Un tintement discret : deux notes douces, à bas volume. */
export function sonEmail() {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + 0.02;
  note(a, t, 880, 0.35, 0.07);
  note(a, t + 0.12, 1318.5, 0.45, 0.06);
}

/** Le guetteur, monté une fois dans le gabarit des pages. */
export function Sons() {
  const depuis = useRef(new Date().toISOString());
  useEffect(() => {
    /* Le premier geste sur la page débloque le son pour toute la session. */
    const armer = () => { audio(); };
    window.addEventListener("pointerdown", armer, { once: true });
    window.addEventListener("keydown", armer, { once: true });
    let vivant = true;
    const regarder = async () => {
      const r = await nouveautes(depuis.current).catch(() => null);
      if (!vivant || !r) return;
      depuis.current = r.maintenant;
      if (!lireActif()) return;
      if (r.formulaires > 0) sonCaisse();
      else if (r.emails > 0) sonEmail();
    };
    const t = setInterval(() => { void regarder(); }, PERIODE);
    return () => {
      vivant = false;
      clearInterval(t);
      window.removeEventListener("pointerdown", armer);
      window.removeEventListener("keydown", armer);
    };
  }, []);
  return null;
}

/** « Sons activés / coupés », dans le bas du menu. */
export function BoutonSons() {
  const actif = useSyncExternalStore(abonner, lireActif, () => true);
  return (
    <button type="button" className="rail-son" aria-pressed={actif}
      title={actif ? "Couper les sons des formulaires et des e-mails" : "Rétablir les sons"}
      onClick={() => { const v = !actif; poserActif(v); if (v) sonEmail(); }}>
      {actif ? "Sons activés" : "Sons coupés"}
    </button>
  );
}
