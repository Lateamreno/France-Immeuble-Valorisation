// Une archive ZIP fabriquée dans le navigateur, sans dépendance (#607, MAV
// 09/11 : « je ne peux pas tout télécharger en ZIP »).
//
// Méthode « stockée » (pas de compression) : les pièces jointes sont déjà des
// PDF ou des images compressés, recompresser ne gagnerait presque rien et
// coûterait du temps. Format ZIP classique (pas de ZIP64) : jusqu'à 4 Go,
// largement assez pour les pièces d'un e-mail. Les noms sont en UTF-8
// (bit 11), pour que les accents passent sur Windows comme sur Mac.

let TABLE: Uint32Array | null = null;
function crc32(d: Uint8Array): number {
  if (!TABLE) {
    TABLE = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABLE[i] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < d.length; i++) c = TABLE[(c ^ d[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Deux fichiers ne peuvent pas porter le même nom dans l'archive : « a.pdf », « a (2).pdf ». */
function nomsUniques(noms: string[]): string[] {
  const vus = new Map<string, number>();
  return noms.map((brut) => {
    const nom = (brut || "piece").replace(/[\\/:*?"<>|]+/g, "_").trim() || "piece";
    const n = (vus.get(nom.toLowerCase()) ?? 0) + 1;
    vus.set(nom.toLowerCase(), n);
    if (n === 1) return nom;
    const point = nom.lastIndexOf(".");
    return point > 0 ? `${nom.slice(0, point)} (${n})${nom.slice(point)}` : `${nom} (${n})`;
  });
}

export function fabriquerZip(fichiers: { nom: string; octets: Uint8Array }[]): Blob {
  const enc = new TextEncoder();
  const noms = nomsUniques(fichiers.map((f) => f.nom));
  const morceaux: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let decalage = 0;
  const maintenant = new Date();
  const heure = ((maintenant.getHours() << 11) | (maintenant.getMinutes() << 5) | (maintenant.getSeconds() >> 1)) & 0xffff;
  const jour = (((maintenant.getFullYear() - 1980) << 9) | ((maintenant.getMonth() + 1) << 5) | maintenant.getDate()) & 0xffff;

  fichiers.forEach((f, i) => {
    const nom = enc.encode(noms[i]);
    const crc = crc32(f.octets);
    const taille = f.octets.length;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true);
    local.setUint16(10, heure, true);
    local.setUint16(12, jour, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, taille, true);
    local.setUint32(22, taille, true);
    local.setUint16(26, nom.length, true);
    local.setUint16(28, 0, true);
    morceaux.push(new Uint8Array(local.buffer), nom, f.octets);

    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, heure, true);
    c.setUint16(14, jour, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, taille, true);
    c.setUint32(24, taille, true);
    c.setUint16(28, nom.length, true);
    c.setUint32(42, decalage, true);
    central.push(new Uint8Array(c.buffer), nom);
    decalage += 30 + nom.length + taille;
  });

  const tailleCentral = central.reduce((t, m) => t + m.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, fichiers.length, true);
  fin.setUint16(10, fichiers.length, true);
  fin.setUint32(12, tailleCentral, true);
  fin.setUint32(16, decalage, true);
  return new Blob([...morceaux, ...central, new Uint8Array(fin.buffer)] as BlobPart[], { type: "application/zip" });
}
