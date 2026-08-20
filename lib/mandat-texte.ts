// Rédaction du mandat — le texte, article par article, servi par le BO.
//
// Point de départ : le mandat de vente simple n° 2097, douze articles, celui
// que France Immeuble fait signer aujourd'hui. Il est court et lisible, et
// c'est délibéré : un vendeur d'immeuble de rapport signe d'autant plus vite
// qu'il ne se sent pas ligoté. On n'a donc rien alourdi. Quatre modifications
// seulement, toutes justifiées dans l'analyse remise à MAV :
//
//   • art. 4.5  — droit de rétractation de 14 jours + bordereau détachable.
//     La signature Docusign est une vente à distance (art. L221-18 code conso).
//     Sans l'information ET le bordereau, le délai ne court pas : le mandant
//     peut se rétracter des mois plus tard, honoraires perdus sur une vente
//     pourtant aboutie. C'est le seul point qui protège vraiment l'agence.
//   • art. 7    — la clause pénale forfaitaire est remplacée par la clause
//     « acquéreur présenté » : un juge réduit ou écarte la première, et
//     applique la seconde. Elle se lit aussi mieux côté client.
//   • art. 4.3  — la subrogation du préempteur est CONSERVÉE (elle protège les
//     honoraires face à une commune qui préempte), mais assortie d'une réserve
//     expresse pour le locataire préempteur, à qui le prix doit être notifié
//     net vendeur non majoré. Cette réserve ne s'écrit que quand un locataire
//     peut réellement préempter — découpe, ou immeuble mono-locataire — pas
//     sur les ventes en bloc multi-locataires, qui restent charge acquéreur.
//   • art. 6.4  — publication en ligne à deux branches, « oui » par défaut,
//     retirable d'un bouton dans le BO.
//
// Et un ajout qui ne coûte rien : l'encadré « Ce que vous gardez », en tête,
// qui répond avant la première ligne à la question que le vendeur se pose.

import { dmy, group } from "./format";
import {
  adresseImmeuble, modeVente, nomMandant, publicationWeb, regimeHonoraires, synthese,
  type Mandant,
} from "./mandat";
import { MENTIONS, SOCIETE } from "./bo/textes-cible";

export type Bloc =
  | { t: "p"; texte: string }
  | { t: "liste"; items: string[] }
  | { t: "sous"; titre: string; blocs: Bloc[] };

export type Article = { n: number; titre: string; blocs: Bloc[] };

export type MandatRedige = {
  titre: string;
  numero?: string;
  garanties: string[];
  articles: Article[];
  signataires: { role: string; nom: string; mention: string }[];
  bordereau: { titre: string; lignes: string[] };
  /** Ce qui manquait au moment de la rédaction, en clair dans le document. */
  trous: string[];
};

const p = (texte: string): Bloc => ({ t: "p", texte });

/** France Immeuble, telle qu'elle se présente dans ses actes. */
const MANDATAIRE = {
  nom: "FRANCE IMMEUBLE",
  forme: "S.A.S. au capital de 100 000 €",
  siege: "66 avenue des Champs-Élysées – 75008 Paris",
  siret: "835 369 562 00011",
  rcs: "RCS Paris",
  carte: "CPI 7501 2018 000 026 004, délivrée par la CCI Paris Île-de-France",
  garantie: "Galian, à hauteur de 120 000 €",
  rcp: "MMA Entreprises n° 120137405",
  president: "Marc-Antoine VOCI",
};

/** Le médiateur de la consommation — mention obligatoire (art. L612-1). */
const MEDIATEUR = {
  nom: "Médiation Franchise-Consommateurs",
  adresse: "29 boulevard de Courcelles, 75008 Paris",
  site: "www.mediation-franchise-consommateurs.org",
};

export type EntreeMandat = {
  m: Record<string, unknown>;
  im: Record<string, unknown> | null;
  lots: Record<string, unknown>[];
  mandants: Mandant[];
  /** L'agent qui rédige : second signataire avec le président. */
  agent?: { nom: string; email?: string };
};

const S = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const N = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
/** Le numéro de registre est stocké en nombre — le lire comme texte le perdait. */
const numeroRegistre = (v: unknown) =>
  typeof v === "number" ? String(v) : typeof v === "string" && v.trim() ? v.trim() : undefined;
const A_COMPLETER = "……………………";

/** Le type de mandat, en toutes lettres, et ce qu'il implique. */
function exclusivite(m: Record<string, unknown>) {
  const t = S(m.Type_exclu) ?? "Simple";
  const jours = N(m["durée_exclu_jours"]);
  if (t === "Exclusif") {
    return {
      label: "exclusif",
      titre: "MANDAT EXCLUSIF DE VENTE",
      clause:
        "Le présent mandat est exclusif : pendant toute sa durée, le mandant s'interdit de confier la vente du bien à un autre professionnel et de le vendre lui-même directement.",
    };
  }
  if (t === "Semi-exclusif") {
    return {
      label: "semi-exclusif",
      titre: "MANDAT SEMI-EXCLUSIF DE VENTE",
      clause:
        `Le présent mandat est semi-exclusif : pendant toute sa durée, le mandant s'interdit de confier la vente du bien à un autre professionnel, mais conserve le droit de le vendre lui-même, directement et sans intermédiaire, à un acquéreur qu'il aurait trouvé par ses propres moyens. Dans ce cas, aucun honoraire n'est dû` +
        (jours ? `, sous réserve du délai de présentation de ${jours} jours prévu à l'article 4.4.` : "."),
    };
  }
  return {
    label: "simple",
    titre: "MANDAT SIMPLE DE VENTE",
    clause:
      "Le présent mandat est simple : le mandant conserve le droit de confier la vente du bien à d'autres professionnels et de le vendre lui-même directement. Il s'engage seulement à informer le mandataire de la vente dès sa réalisation.",
  };
}

export function redigerMandat(e: EntreeMandat): MandatRedige {
  const { m, im, lots, mandants, agent } = e;
  const trous: string[] = [];
  const req = <T>(v: T | undefined, quoi: string): T | string => {
    if (v === undefined || v === null || v === "") {
      trous.push(quoi);
      return A_COMPLETER;
    }
    return v;
  };

  const ex = exclusivite(m);
  const s = synthese(lots);
  const adresse = im ? adresseImmeuble(im) : (req(undefined, "adresse de l'immeuble") as string);
  const nv = N(m.prix_nv);
  const honos = N(m.honos_ttc);
  const hai = N(m.prix_hai) ?? (nv && honos ? nv + honos : undefined);
  const taux = N(m.honos_taux);
  const duree = N(m["durée_tot_month"]) ?? 12;
  const irrevoc = N(m["durée_irrevoc_days"]) ?? 14;
  const effet = S(m.date_effet);
  const fin = S(m.date_fin);
  /* La charge des honoraires suit la doctrine maison (voir regimeHonoraires) :
     charge acquéreur en bloc multi-locataires — l'immense majorité des mandats
     — et charge vendeur seulement quand un locataire peut préempter, c'est-à-
     dire à la découpe ou sur un immeuble mono-locataire. */
  const regime = regimeHonoraires(lots, modeVente(m), S(m.Charge_hono));
  const preemptable = regime.clauseLocataire;
  const chargeVendeur = regime.charge === "Vendeur";

  /* ---- Article 1 — Les parties ---- */
  const a1: Bloc[] = [
    {
      t: "sous",
      titre: "Le mandataire",
      blocs: [
        p(
          `${MANDATAIRE.nom}, ${MANDATAIRE.forme}, dont le siège social est situé ${MANDATAIRE.siege}, immatriculée sous le SIRET ${MANDATAIRE.siret} (${MANDATAIRE.rcs}), représentée par son président ${MANDATAIRE.president}.`,
        ),
        p(
          `Titulaire de la carte professionnelle « Transactions sur immeubles et fonds de commerce » sans maniement de fonds n° ${MANDATAIRE.carte}. Garantie financière : ${MANDATAIRE.garantie}. Responsabilité civile professionnelle : ${MANDATAIRE.rcp}.`,
        ),
        p("Ci-après « le mandataire »."),
      ],
    },
    {
      t: "sous",
      titre: mandants.length > 1 ? "Les mandants" : "Le mandant",
      blocs:
        mandants.length === 0
          ? [p(req(undefined, "identité du mandant") as string)]
          : mandants.map((x) => p(identiteMandant(x, req))),
    },
    {
      t: "sous",
      titre: "Le médiateur de la consommation",
      blocs: [p(`${MEDIATEUR.nom}, ${MEDIATEUR.adresse} — ${MEDIATEUR.site}.`)],
    },
  ];

  /* ---- Article 2 — Résumé ---- */
  const a2: Bloc[] = [
    {
      t: "liste",
      items: [
        `Nature du mandat : mandat de vente ${ex.label}.`,
        `Bien : immeuble sis ${adresse}${s.lots ? `, comportant ${s.lots} lot${s.lots > 1 ? "s" : ""}` : ""}.`,
        `Prix de présentation : ${hai ? `${group(hai)} €` : (req(undefined, "prix") as string)}${
          honos ? ` dont ${group(honos)} € d'honoraires` : ""
        }${honos ? ` à la charge ${chargeVendeur ? "du vendeur" : "de l'acquéreur"}` : ""}.`,
        `Prix net revenant au mandant : ${nv ? `${group(nv)} €` : (req(undefined, "prix net vendeur") as string)}.`,
        `Durée : ${duree} mois à compter du ${effet ? dmy(effet) : (req(undefined, "date de prise d'effet") as string)}${
          fin ? `, soit jusqu'au ${dmy(fin)}` : ""
        }.`,
        `Numéro d'inscription au registre des mandats : ${numeroRegistre(m.numero) ?? (req(undefined, "numéro de mandat") as string)}.`,
      ],
    },
  ];

  /* ---- Article 3 — Désignation ---- */
  const a3: Bloc[] = [
    p(S(m.description) ?? (req(undefined, "descriptif du bien") as string)),
  ];
  const refCad = S(m.ref_cadastre);
  const terrain = N(m.surface_terrain);
  const bati = N(m.surface_bati);
  if (refCad || terrain || bati) {
    a3.push({
      t: "liste",
      items: [
        refCad ? `Références cadastrales : ${refCad}.` : undefined,
        terrain ? `Surface du terrain : ${group(terrain)} m².` : undefined,
        bati ? `Surface bâtie : ${group(bati)} m².` : undefined,
      ].filter(Boolean) as string[],
    });
  }
  a3.push(
    p(
      "Le mandant déclare être propriétaire du bien désigné ci-dessus et avoir la pleine capacité d'en disposer. Il déclare qu'aucune procédure de saisie, d'expropriation ou de préemption n'est en cours à la date des présentes.",
    ),
  );

  /* ---- Article 4 — Conditions et honoraires ---- */
  const a4: Bloc[] = [
    {
      t: "sous",
      titre: "4.1 Prix de présentation",
      blocs: [
        p(
          `Le bien est présenté à la vente au prix de ${hai ? `${group(hai)} €` : A_COMPLETER}, honoraires de négociation inclus. Le prix net revenant au mandant est de ${nv ? `${group(nv)} €` : A_COMPLETER}.`,
        ),
        p(
          "Le mandant peut à tout moment demander la modification du prix de présentation, par simple écrit adressé au mandataire. Cette modification prend effet dès l'accord des parties, sans qu'il soit nécessaire de signer un nouveau mandat.",
        ),
      ],
    },
    {
      t: "sous",
      titre: "4.2 Honoraires",
      blocs: [
        p(
          `Les honoraires du mandataire sont fixés à ${honos ? `${group(honos)} € TTC` : A_COMPLETER}${
            taux ? `, soit ${String(taux).replace(".", ",")} % du prix net vendeur` : ""
          }. Ils sont à la charge ${chargeVendeur ? "du vendeur" : "de l'acquéreur"}.`,
        ),
        p(
          "Conformément à l'article 6 de la loi du 2 janvier 1970, aucun honoraire ni aucune somme d'aucune sorte n'est dû au mandataire avant que la vente ait été effectivement conclue et constatée par acte authentique. Si la vente ne se réalise pas, le mandant ne doit rien.",
        ),
      ],
    },
  ];
  /* 4.3 — la subrogation du préempteur. Elle figure dans tous les mandats FI
     et elle est utile : elle évite que la commune qui préempte fasse tomber
     les honoraires. Mais telle qu'elle est rédigée aujourd'hui, elle vaut
     aussi face au LOCATAIRE préempteur — et là elle est contra legem : le prix
     notifié au locataire doit être le net vendeur non majoré. D'où deux
     alinéas au lieu d'un : la subrogation pour les préempteurs publics, et une
     réserve expresse pour le locataire. Le second alinéa n'est écrit que
     lorsqu'un locataire peut effectivement préempter — inutile d'alourdir un
     mandat de vente en bloc multi-locataires. */
  a4.push({
    t: "sous",
    titre: "4.3 Exercice d'un droit de préemption",
    blocs: [
      p(
        "En cas d'exercice d'un droit de préemption par une personne publique ou par tout titulaire autre que le locataire du bien, le préempteur est subrogé dans tous les droits et obligations de l'acquéreur, si bien que la rémunération incombant éventuellement à l'acquéreur reste due dans les mêmes conditions et à la charge du préempteur.",
      ),
      ...(preemptable
        ? [
            p(
              "Par exception, lorsque le droit de préemption appartient au locataire du bien, les honoraires du mandataire sont à la charge du mandant et le prix notifié au locataire est le prix net revenant au mandant, non majoré des honoraires. Le mandant et le mandataire s'interdisent toute stipulation contraire.",
            ),
            p(
              modeVente(m) === "decoupe"
                ? "Le présent mandat portant sur une vente à la découpe, chaque locataire est susceptible d'exercer un tel droit sur le lot qu'il occupe : les honoraires sont en conséquence à la charge du mandant pour l'ensemble des lots."
                : "Le bien étant occupé par un locataire unique, susceptible d'exercer un tel droit sur l'ensemble vendu, les honoraires sont en conséquence à la charge du mandant.",
            ),
          ]
        : []),
    ],
  });
  a4.push({
    t: "sous",
    titre: "4.4 Durée",
    blocs: [
      p(
        `Le présent mandat est consenti pour une durée de ${duree} mois à compter du ${
          effet ? dmy(effet) : A_COMPLETER
        }${fin ? `, soit jusqu'au ${dmy(fin)}` : ""}.`,
      ),
      p(
        `Passé un délai irrévocable de ${irrevoc} jours suivant sa prise d'effet, le mandant peut y mettre fin à tout moment, par lettre recommandée avec accusé de réception ou par courrier électronique, sans avoir à motiver sa décision et sans indemnité. La résiliation prend effet quinze jours après sa réception.`,
      ),
      p(
        "Le mandat ne comporte aucune clause de reconduction tacite : à son terme, il prend fin de plein droit, sans démarche du mandant.",
      ),
    ],
  });
  a4.push({
    t: "sous",
    titre: "4.5 Droit de rétractation",
    blocs: [
      p(
        "Lorsque le présent mandat est signé à distance ou hors de l'établissement du mandataire, le mandant dispose d'un délai de quatorze (14) jours à compter de sa signature pour se rétracter, sans avoir à motiver sa décision ni à supporter de frais, conformément aux articles L221-18 et suivants du code de la consommation.",
      ),
      p(
        "Il exerce ce droit au moyen du bordereau de rétractation joint aux présentes, ou par toute déclaration dénuée d'ambiguïté adressée au mandataire. Le mandataire ne commence aucune démarche de commercialisation avant l'expiration de ce délai, sauf demande expresse et écrite du mandant.",
      ),
    ],
  });

  /* ---- Article 5 — Obligations du mandant ---- */
  const a5: Bloc[] = [
    p("Le mandant s'engage à :"),
    {
      t: "liste",
      items: [
        "remettre au mandataire le titre de propriété, les diagnostics techniques obligatoires et, le cas échéant, les baux, quittances et états locatifs du bien ;",
        "permettre la visite du bien dans des conditions raisonnables, en accord avec les occupants lorsqu'il y en a ;",
        "informer le mandataire de tout élément susceptible de modifier la consistance, la situation locative ou la valeur du bien ;",
        "informer le mandataire de la vente du bien dès sa réalisation, quelle qu'en soit la voie.",
      ],
    },
    p(
      "Le mandant déclare que les informations communiquées au mandataire, notamment l'état locatif et le montant des loyers, sont exactes à la date des présentes.",
    ),
  ];
  a5.push(p(ex.clause));

  /* ---- Article 6 — Obligations et pouvoirs du mandataire ---- */
  const a6: Bloc[] = [
    {
      t: "sous",
      titre: "6.1 Diligences",
      blocs: [
        p(
          "Le mandataire s'engage à rechercher un acquéreur, à faire visiter le bien, à rendre compte de ses diligences au mandant à première demande, et à lui transmettre sans délai toute offre reçue, quel qu'en soit le montant.",
        ),
      ],
    },
    {
      t: "sous",
      titre: "6.2 Pouvoirs",
      blocs: [
        p(
          "Le mandataire est autorisé à recevoir toute offre d'achat et à la transmettre au mandant. Il n'a pas le pouvoir d'engager le mandant : seul le mandant décide d'accepter ou de refuser une offre, sans avoir à motiver son refus.",
        ),
        p(
          "Le mandataire ne reçoit aucun fonds. Toute somme versée par un acquéreur l'est entre les mains du notaire chargé de la vente.",
        ),
      ],
    },
    {
      t: "sous",
      titre: "6.3 Confidentialité",
      blocs: [
        p(
          "Le mandataire s'engage à ne communiquer aucune donnée nominative relative aux occupants du bien. Les baux transmis à un candidat acquéreur sont préalablement caviardés de toute donnée personnelle.",
        ),
      ],
    },
    {
      t: "sous",
      titre: "6.4 Publicité et publication en ligne",
      blocs: [
        p(
          publicationWeb(m)
            ? "Le mandant autorise le mandataire à diffuser une annonce relative au bien sur son site internet, sur les portails immobiliers et auprès de son fichier d'acquéreurs. Cette annonce ne comporte ni l'identité du mandant, ni celle des occupants, ni l'adresse précise du bien sauf accord exprès du mandant."
            : "Le mandant ne souhaite pas que le bien fasse l'objet d'une publication en ligne. Le mandataire s'interdit en conséquence toute diffusion sur son site internet et sur les portails immobiliers : la commercialisation est menée exclusivement auprès de son fichier d'acquéreurs, de manière confidentielle.",
        ),
        p(
          "Le mandant peut revenir sur ce choix à tout moment, par simple écrit adressé au mandataire, sans que cela affecte la validité du mandat.",
        ),
      ],
    },
    {
      t: "sous",
      titre: "6.5 Délégation",
      blocs: [
        p(
          "Le mandataire peut se substituer un autre professionnel titulaire de la carte professionnelle pour la présentation du bien, sous sa propre responsabilité et sans honoraires supplémentaires pour le mandant.",
        ),
      ],
    },
  ];

  /* ---- Article 7 — Acquéreur présenté (remplace la clause pénale) ---- */
  const a7: Bloc[] = [
    p(
      "Est réputé présenté par le mandataire tout acquéreur auquel le bien a été proposé par ses soins, dont l'identité a été portée à la connaissance du mandant, ou qui a visité le bien en sa présence.",
    ),
    p(
      "Si la vente est conclue avec un acquéreur ainsi présenté, pendant la durée du mandat ou dans les douze (12) mois qui suivent son expiration, les honoraires prévus à l'article 4.2 sont dus au mandataire, quelle que soit la voie par laquelle la vente s'est réalisée.",
    ),
    p(
      "La présentation se prouve par tout moyen, notamment par le bon de visite signé par l'acquéreur ou par la transmission écrite de son identité au mandant.",
    ),
    p(
      "En dehors de ce cas, aucune indemnité, aucune pénalité ni aucun dédommagement n'est dû par le mandant au mandataire, quelles que soient les diligences accomplies.",
    ),
  ];

  /* ---- Article 8 — Informations des parties ---- */
  const a8: Bloc[] = [
    p(
      "Le mandant est informé que le mandataire est soumis aux obligations de la loi du 2 janvier 1970 et du décret du 20 juillet 1972, ainsi qu'aux obligations de vigilance en matière de lutte contre le blanchiment (art. L561-2 du code monétaire et financier). À ce titre, le mandataire recueille une copie des pièces d'identité des parties.",
    ),
    p(
      "Le mandant est informé que la vente d'un immeuble peut entraîner l'imposition d'une plus-value et, selon la fréquence et l'intention des opérations, une requalification en activité de marchand de biens. Le mandataire n'apporte aucun conseil fiscal : le mandant est invité à consulter son notaire ou son conseil.",
    ),
    p(
      "Le mandataire déclare n'avoir aucun intérêt personnel dans l'acquisition du bien, ni directement, ni par personne interposée.",
    ),
  ];

  /* ---- Article 9 — Élection de domicile ---- */
  const a9: Bloc[] = [
    p(
      `Pour l'exécution des présentes, les parties élisent domicile : le mandataire à son siège social, ${MANDATAIRE.siege} ; le mandant à l'adresse indiquée à l'article 1.`,
    ),
    p(
      "Les échanges relatifs au présent mandat, y compris la transmission des offres, peuvent valablement intervenir par courrier électronique aux adresses indiquées par les parties.",
    ),
  ];

  /* ---- Article 10 — Données personnelles ---- */
  const a10: Bloc[] = [
    p(
      "Les données personnelles recueillies dans le cadre du présent mandat sont traitées par France Immeuble, responsable de traitement, aux seules fins d'exécuter le mandat et de satisfaire à ses obligations légales. Elles sont conservées dix ans à compter de la fin du mandat, durée de la prescription applicable.",
    ),
    p(
      `Le mandant dispose d'un droit d'accès, de rectification, d'effacement, de limitation et d'opposition, qu'il exerce à l'adresse ${SOCIETE.email} ou par courrier au siège social. Il peut introduire une réclamation auprès de la CNIL.`,
    ),
  ];

  /* ---- Article 11 — Médiation ---- */
  const a11: Bloc[] = [
    p(
      `En cas de litige, le mandant consommateur peut recourir gratuitement au médiateur de la consommation dont relève le mandataire : ${MEDIATEUR.nom}, ${MEDIATEUR.adresse} — ${MEDIATEUR.site}, après avoir adressé une réclamation écrite au mandataire.`,
    ),
  ];

  /* ---- Article 12 — Poursuite du mandat ---- */
  const a12: Bloc[] = [
    p(
      "En cas de rétractation d'un acquéreur dans le délai légal de dix jours, ou de défaillance d'une condition suspensive, le mandat se poursuit de plein droit jusqu'à son terme, sans qu'il soit nécessaire de le renouveler.",
    ),
    p(
      "Si la vente échoue après signature de l'avant-contrat pour une cause étrangère au mandant, le mandat est prorogé de la durée écoulée entre la signature de l'avant-contrat et la constatation de l'échec.",
    ),
  ];

  const articles: Article[] = [
    { n: 1, titre: "Les parties", blocs: a1 },
    { n: 2, titre: "Résumé du mandat", blocs: a2 },
    { n: 3, titre: "Désignation du bien", blocs: a3 },
    { n: 4, titre: "Conditions et honoraires", blocs: a4 },
    { n: 5, titre: "Obligations du mandant", blocs: a5 },
    { n: 6, titre: "Obligations et pouvoirs du mandataire", blocs: a6 },
    { n: 7, titre: "Acquéreur présenté par le mandataire", blocs: a7 },
    { n: 8, titre: "Informations des parties", blocs: a8 },
    { n: 9, titre: "Élection de domicile", blocs: a9 },
    { n: 10, titre: "Données personnelles", blocs: a10 },
    { n: 11, titre: "Médiation de la consommation", blocs: a11 },
    { n: 12, titre: "Poursuite du mandat", blocs: a12 },
  ];

  /* ---- L'encadré de tête : ce que le vendeur veut savoir avant de lire ---- */
  const garanties = [
    "Si le bien n'est pas vendu, vous ne devez rien : aucun honoraire, aucun frais, aucune pénalité.",
    `Vous pouvez vous rétracter dans les 14 jours de la signature, sans motif${
      irrevoc ? `, puis résilier librement passé le délai irrévocable de ${irrevoc} jours` : ""
    }.`,
    "Le mandat ne se renouvelle pas tout seul : il prend fin à son terme, sans démarche de votre part.",
    "Vous restez seul maître du prix et du choix de l'acquéreur : aucune offre ne vous engage.",
  ];

  /* ---- Signataires : le président et l'agent rédacteur ---- */
  const signataires = [
    ...mandants.map((x) => ({
      role: mandants.length > 1 ? "Le mandant" : "Le mandant",
      nom: nomMandant(x),
      mention: "Lu et approuvé, bon pour mandat",
    })),
    {
      role: "Le mandataire",
      nom: `${MANDATAIRE.president}, président de ${MANDATAIRE.nom}`,
      mention: "Lu et approuvé",
    },
  ];
  if (agent?.nom && agent.nom !== MANDATAIRE.president) {
    signataires.push({
      role: "L'agent rédacteur",
      nom: agent.nom,
      mention: `Pour ${MANDATAIRE.nom}`,
    });
  }

  const bordereau = {
    titre: "Bordereau de rétractation",
    lignes: [
      "À compléter et à renvoyer uniquement si vous souhaitez vous rétracter du présent mandat, dans les 14 jours de sa signature.",
      `À l'attention de ${MANDATAIRE.nom}, ${MANDATAIRE.siege} — ${SOCIETE.email}`,
      `Je soussigné(e) ${mandants.map(nomMandant).join(", ") || A_COMPLETER}, notifie par la présente ma rétractation du mandat de vente n° ${numeroRegistre(m.numero) ?? A_COMPLETER} signé le ${effet ? dmy(effet) : A_COMPLETER}, portant sur le bien sis ${adresse}.`,
      "Date : ……………………                                 Signature : ……………………",
    ],
  };

  return {
    titre: ex.titre,
    numero: numeroRegistre(m.numero),
    garanties,
    articles,
    signataires,
    bordereau,
    trous: [...new Set(trous)],
  };
}

/** Le paragraphe d'identité d'un mandant, physique ou morale. */
function identiteMandant(x: Mandant, req: <T>(v: T | undefined, quoi: string) => T | string): string {
  if (x.personne === "morale") {
    const s = x.societe ?? {};
    const bouts = [
      `${req(s.nom, "raison sociale du mandant")}`,
      s.capital ? `au capital de ${group(s.capital)} €` : undefined,
      s.siege ? `dont le siège social est situé ${s.siege}` : `dont le siège social est situé ${req(undefined, "siège social du mandant")}`,
      s.siren ? `immatriculée sous le SIREN ${s.siren}` : undefined,
      s.rcs ? `(${s.rcs})` : undefined,
    ].filter(Boolean);
    const rep = [x.qualite, x.prenom, x.nom].filter(Boolean).join(" ");
    const fonction = x.fonction ? ` en qualité de ${x.fonction}` : "";
    return `${bouts.join(", ")}${rep ? `, représentée par ${rep}${fonction}` : ""}.`;
  }
  const bouts = [
    [x.qualite, x.prenom, x.nom].filter(Boolean).join(" ") || (req(undefined, "nom du mandant") as string),
    x.dateNaissance ? `né(e) le ${dmy(x.dateNaissance)}` : undefined,
    x.lieuNaissance ? `à ${x.lieuNaissance}` : undefined,
    `demeurant ${x.adresse ?? (req(undefined, `adresse de ${nomMandant(x)}`) as string)}`,
    x.fonction ? `agissant en qualité de ${x.fonction}` : undefined,
  ].filter(Boolean);
  return `${bouts.join(", ")}.`;
}

/** Mentions de pied de page, identiques à celles du dossier d'estimation. */
export const PIED_MANDAT = MENTIONS;
