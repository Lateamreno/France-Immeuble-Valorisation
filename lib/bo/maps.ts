/* Le lien Google Maps d'un bien (retours #472, #477, #483, #484).
 *
 * Un seul endroit pour le fabriquer : le picto du rail, le cadre Emplacement
 * de la fiche et celui de l'estimation ouvrent le même lien.
 *
 * Il part de l'ADRESSE, pas de l'identifiant de lieu enregistré par le BO
 * Bubble (`maps_url` = `…/place/?q=place_id:Ej…`). Ces identifiants « Ej… »
 * décrivent une adresse composée ; Google Maps ne les résout pas toujours et
 * ouvre alors la carte nue, sans épingle — c'est exactement ce que MAV voyait
 * (#477 : « le lien mène juste vers Google Maps et pas vers l'adresse »). La
 * recherche sur l'adresse en clair, elle, pose l'épingle à coup sûr.
 */
export function lienMaps(adresse: string, geo?: { lat?: number; lng?: number } | null): string {
  const q = adresse.replace(/\s+/g, " ").trim();
  if (q) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  if (typeof geo?.lat === "number" && typeof geo?.lng === "number") {
    return `https://www.google.com/maps/search/?api=1&query=${geo.lat},${geo.lng}`;
  }
  return "https://www.google.com/maps";
}
