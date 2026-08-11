// Mapping agents utilisable côté client (le mapping serveur vit dans
// lib/bubble/server.ts — garder les deux synchronisés).
export const AGENT_IDS_CLIENT: Record<string, { id: string; name: string; initials: string }> = {
  "marc-antoine": { id: "1565404488771x470475486480623740", name: "Marc-Antoine", initials: "MAV" },
  romain: { id: "1774279722391x446415073281754000", name: "Romain", initials: "RV" },
  guillaume: { id: "1677062113544x976734254041606900", name: "Guillaume", initials: "G" },
  francois: { id: "1565404520377x697816437227848800", name: "François", initials: "F" },
  sophie: { id: "1630466502391x893427918358294500", name: "Sophie", initials: "S" },
};
