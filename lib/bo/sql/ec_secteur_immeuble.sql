-- ec_secteur_immeuble — le secteur d'un immeuble, vu par son propriétaire.
--
-- Retour de MAV (25/09) sur l'espace propriétaire : « il faut qu'ils aient
-- les données secteur EN PREMIER avec les liens pour vérifier, il faut qu'ils
-- aient aussi le tableau de présentation du prix au m² et du rendement vs
-- secteur en actuel et potentiel pour les aider à choisir. On peut même leur
-- afficher des biens similaires vendus la même année (qu'on a vendus nous) ou
-- des biens à vendre sans mettre les adresses. »
--
-- Ce que rend la fonction, en un seul jsonb :
--
--   secteur      les trois repères de la commune — loyer au m² par mois, prix au
--                m², rendement brut — tels que l'agent les a CONFIRMÉS dans le
--                relevé `bo_prix_secteur` (§ « Prix du secteur » de la fiche),
--                la date de cette vérification, l'année, le code INSEE de la
--                commune et les liens publics pour vérifier. `null` tant que
--                rien n'est confirmé : un repère brut, posé automatiquement
--                depuis DVF ou la carte des loyers et jamais regardé par un
--                agent, ne sort pas d'ici.
--   immeuble     les entrées brutes du tableau Actuel / Potentiel — loyers
--                annuels actuels et potentiels, surface Carrez, surface louée,
--                charges non récupérables, travaux, prix affiché. Le calcul
--                (loyer au m², prix au m², rendement, écart) se fait côté
--                écran avec `rendements()` de lib/bo/rendements.ts, la même
--                fonction que le BO : une seule formule, deux vitrines.
--   comparables  jusqu'à six immeubles confiés à France Immeuble, dans le même
--                département et de même destination principale : vendus par
--                nous cette année ou l'an dernier, ou à vendre. Chacun réduit à
--                la ville, le nombre de lots, la surface, le prix au m², le
--                rendement, l'année et le statut. JAMAIS d'adresse, jamais
--                d'identifiant, jamais de nom (§8.3, §8.4).
--
-- La garde : `ec_mon_immeuble(p_session, p_immeuble)` — qui résout elle-même
-- la session par `ec_compte_de_session` et applique LA règle d'appartenance
-- de l'espace (celle de la page /espace/bien/[id]). On ne la réécrit pas ici :
-- deux règles finiraient par diverger. Sans session ou sans appartenance, la
-- fonction rend `null`, comme les autres `ec_*`.
--
-- Miroir TS : `secteurVendeur()` dans lib/bo/espace-proprietaire.ts refait le
-- même calcul avec la clé de service pour l'aperçu du BO. Si une règle change
-- ici, elle change là-bas.
--
-- À appliquer à la main (l'agent qui a écrit ce fichier n'a pas l'accès à la
-- base). Contexte : projet france-immeuble-bo, schéma public.

-- ---------------------------------------------------------------------------
-- Un nombre lu dans un document Bubble, ou null. Bubble écrit ses nombres en
-- nombres JSON ; une chaîne « 12 500 » saisie à la main ne doit pas faire
-- tomber la fonction, elle vaut simplement « inconnu ».
-- ---------------------------------------------------------------------------
create or replace function public.ec_num(p_doc jsonb, p_cle text)
returns numeric
language sql
immutable
as $$
  select case
    when jsonb_typeof(p_doc -> p_cle) = 'number' then (p_doc ->> p_cle)::numeric
    when jsonb_typeof(p_doc -> p_cle) = 'string'
         and (p_doc ->> p_cle) ~ '^\s*-?[0-9]+([.,][0-9]+)?\s*$'
      then replace(trim(p_doc ->> p_cle), ',', '.')::numeric
    else null
  end
$$;

revoke all on function public.ec_num(jsonb, text) from public;
-- Pas de grant à anon : seule la fonction SECURITY DEFINER ci-dessous s'en sert,
-- et elle tourne sous son propriétaire.

-- ---------------------------------------------------------------------------
-- Un nom de commune ramené à sa forme comparable : minuscules, sans accents,
-- sans espaces ni tirets. « Saint-Ouen-l'Aumône » et « SAINT OUEN L AUMONE »
-- deviennent la même chose.
-- ---------------------------------------------------------------------------
create or replace function public.ec_norm_commune(p_nom text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    translate(lower(coalesce(p_nom, '')),
              'àâäáãåéèêëíìîïóòôöõúùûüçñýÿ',
              'aaaaaaeeeeiiiiooooouuuucnyy'),
    '[^a-z0-9]', '', 'g')
$$;

revoke all on function public.ec_norm_commune(text) from public;

-- ---------------------------------------------------------------------------
-- La fonction elle-même.
-- ---------------------------------------------------------------------------
create or replace function public.ec_secteur_immeuble(p_session text, p_immeuble text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_im        jsonb;
  v_sect      jsonb;
  v_dest      text;
  v_ville     text;
  v_cp        text;
  v_dep       text;
  v_insee     text;
  v_annee     int := extract(year from now())::int;

  -- Le secteur
  v_confirme  boolean := false;
  v_verifie   text;
  v_loyer     numeric;
  v_prix      numeric;
  v_renta     numeric;
  v_secteur   jsonb := null;

  -- L'immeuble
  v_surface   numeric := 0;
  v_surf_occ  numeric := 0;
  v_loyers    numeric;
  v_loyersmax numeric;

  v_compar    jsonb;
begin
  -- 1. La garde : une session valide ET l'immeuble du contact de la session.
  if p_session is null or p_immeuble is null or p_immeuble = '' then
    return null;
  end if;
  if not coalesce(ec_mon_immeuble(p_session, p_immeuble), false) then
    return null;
  end if;

  select i.data into v_im from bo_immeuble i where i.id = p_immeuble;
  if v_im is null then
    return null;
  end if;

  v_dest  := coalesce(v_im ->> 'Destination_principale', '');
  v_ville := coalesce(v_im ->> 'adresse_ville', '');
  v_cp    := coalesce(v_im ->> 'adresse_zipcode', '');
  -- Le département depuis le code postal (trois chiffres outre-mer), à défaut
  -- le champ `adresse_dpt` de la fiche.
  v_dep := nullif(left(v_cp, case when v_cp like '97%' or v_cp like '98%' then 3 else 2 end), '');
  if v_dep is null then
    v_dep := nullif(v_im ->> 'adresse_dpt', '');
  end if;

  -- 2. Les lots : surface Carrez totale et surface louée (loyer > 0), comme
  --    le contexte de rendement de l'écran Prix du BO.
  select
    coalesce(sum(ec_num(l.data, 'surface_carrez')), 0),
    coalesce(sum(case when coalesce(ec_num(l.data, 'loyer'), 0) > 0
                      then ec_num(l.data, 'surface_carrez') end), 0)
  into v_surface, v_surf_occ
  from bo_lot l
  where l.data ->> 'IMMEUBLE' = p_immeuble;

  v_loyers    := coalesce(ec_num(v_im, 'fin_loyers_an'), 0);
  v_loyersmax := coalesce(ec_num(v_im, 'fin_loyers_an_max'), v_loyers);

  -- 3. Le code INSEE de la commune : la carte des loyers d'abord (elle porte
  --    libellé + département), le référentiel des communes ensuite. Sans
  --    lui, les liens tombent sur le département — jamais sur une erreur.
  if v_dep is not null and v_ville <> '' then
    select c.code_insee into v_insee
    from bo_loyers_commune c
    where c.departement = v_dep
      and ec_norm_commune(c.libelle) = ec_norm_commune(v_ville)
    limit 1;
    if v_insee is null then
      select c.insee into v_insee
      from fi_pm_commune c
      where c.dep = v_dep
        and ec_norm_commune(c.nom) = ec_norm_commune(v_ville)
      limit 1;
    end if;
  end if;

  -- 4. Le secteur : le dernier relevé `bo_prix_secteur` de l'immeuble.
  select s.data into v_sect
  from bo_prix_secteur s
  where s.data ->> '0 - IMMEUBLE' = p_immeuble
  order by s.bubble_modified desc nulls last, s.data ->> 'Modified Date' desc nulls last
  limit 1;

  if v_sect is not null then
    -- Confirmé ? Règle de la fiche (retour #391) : chaque destination porte
    -- son drapeau `<préfixe>_check_ok` ; à défaut, le drapeau global
    -- `0 - check_ok` que Bubble posait sur tout le relevé fait foi. À
    -- l'échelle de l'immeuble : le global vrai, OU toutes les destinations
    -- présentes dans les lots (avec une surface) confirmées une à une.
    if (v_sect ->> '0 - check_ok') = 'true' then
      v_confirme := true;
    else
      select count(*) > 0 and bool_and(coalesce((v_sect ->> (d.prefix || '_check_ok')) = 'true', false))
      into v_confirme
      from (
        select distinct
          case l.data ->> 'Destination'
            when 'Logement' then 'hab'
            when 'Commerce' then 'com'
            when 'Bureau'   then 'bur'
            when 'Parking'  then 'parking'
            when 'Cave'     then 'cave'
            else 'autre'
          end as prefix
        from bo_lot l
        where l.data ->> 'IMMEUBLE' = p_immeuble
          and coalesce(ec_num(l.data, 'surface_carrez'), 0) > 0
      ) d;
    end if;

    if v_confirme then
      -- Les globaux pondérés par surface (« 0 - … »), ceux que le tableau du
      -- BO lit ; à défaut, la destination principale.
      v_loyer := ec_num(v_sect, '0 - loyer_mois');
      v_prix  := ec_num(v_sect, '0 - prix');
      v_renta := ec_num(v_sect, '0 - renta _%');
      if v_loyer is null or v_prix is null then
        declare v_pref text := case v_dest
          when 'Logement' then 'hab' when 'Commerce' then 'com' when 'Bureau' then 'bur'
          when 'Parking' then 'parking' when 'Cave' then 'cave' else 'hab' end;
        begin
          v_loyer := coalesce(v_loyer, ec_num(v_sect, v_pref || '_loyer_retenu'));
          v_prix  := coalesce(v_prix,  ec_num(v_sect, v_pref || '_prix_retenu'));
          v_renta := coalesce(v_renta, ec_num(v_sect, v_pref || '_renta_retenu'));
        end;
      end if;
      if v_renta is null and v_loyer > 0 and v_prix > 0 then
        v_renta := round(v_loyer * 12 * 100 / v_prix, 1);
      end if;

      -- La date de vérification : la plus récente des `<préfixe>_check_le`,
      -- sinon la date du relevé.
      select max(v) into v_verifie
      from (values (v_sect ->> 'hab_check_le'), (v_sect ->> 'com_check_le'),
                   (v_sect ->> 'bur_check_le'), (v_sect ->> 'parking_check_le'),
                   (v_sect ->> 'cave_check_le'), (v_sect ->> 'autre_check_le')) t(v)
      where v is not null and v <> '';
      v_verifie := coalesce(v_verifie, nullif(v_sect ->> '0 - date', ''), nullif(v_sect ->> 'Modified Date', ''));

      if v_loyer is not null and v_prix is not null then
        v_secteur := jsonb_build_object(
          'loyerM2',   round(v_loyer, 2),
          'prixM2',    round(v_prix),
          'renta',     case when v_renta is null then null else round(v_renta, 1) end,
          'verifieLe', v_verifie,
          'annee',     case when v_verifie ~ '^[0-9]{4}' then left(v_verifie, 4)::int
                            else null end,
          'ville',     v_ville,
          'insee',     v_insee,
          -- Les liens publics pour vérifier : les mêmes que ceux de la fiche
          -- (vignette « Prix du secteur »). DVF n'accepte aucun paramètre dans
          -- son adresse : on ouvre la carte, le propriétaire y cherche sa
          -- commune. Les notaires, eux, descendent à la commune par son code
          -- INSEE (Paris, Lyon, Marseille : le code est celui de
          -- l'arrondissement).
          'liens', jsonb_build_object(
            'dvf',      'https://app.dvf.etalab.gouv.fr/',
            'loyers',   'https://www.ecologie.gouv.fr/politiques-publiques/carte-loyers',
            'notaires', case
              when v_insee is not null then
                'https://www.immobilier.notaires.fr/fr/prix-immobilier?typeLocalisation='
                || case when v_insee ~ '^(751|6938|132)[0-9]{2}$' then 'ARRONDISSEMENT' else 'COMMUNE' end
                || '&codeInsee=' || v_insee || '&neuf=A'
              when v_dep is not null then
                'https://www.immobilier.notaires.fr/fr/prix-immobilier?typeLocalisation=DEPARTEMENT&codeInsee='
                || v_dep || '&neuf=A'
              else 'https://www.immobilier.notaires.fr/fr/prix-immobilier'
            end
          )
        );
      end if;
    end if;
  end if;

  -- 5. Les comparables : nos immeubles du même département et de même
  --    destination principale, vendus cette année ou l'an dernier, ou en
  --    commercialisation. La date de vente est celle de l'offre passée
  --    « Vendu » (acte, sinon compromis, sinon date de l'offre) ; un immeuble
  --    « 11 - VENDU » sans offre datée se rabat sur sa dernière modification.
  with ventes as (
    select distinct on (x.imm) x.imm,
      coalesce(nullif(o.data ->> 'date_acte', ''), nullif(o.data ->> 'date_compromis', ''),
               nullif(o.data ->> 'date', '')) as quand,
      ec_num(o.data, 'prix_hai') as prix
    from bo_offre o
    cross join lateral jsonb_array_elements_text(
      case when jsonb_typeof(o.data -> 'IMMEUBLEs') = 'array' then o.data -> 'IMMEUBLEs' else '[]'::jsonb end
    ) as x(imm)
    where o.data ->> 'Statut' = 'Vendu'
    order by x.imm, coalesce(nullif(o.data ->> 'date_acte', ''), nullif(o.data ->> 'date_compromis', ''),
                             nullif(o.data ->> 'date', '')) desc nulls last
  ),
  base as (
    select
      i.data ->> 'adresse_ville' as ville,
      ec_num(i.data, 'nb_lots_tot') as nb_lots,
      coalesce(nullif(ec_num(i.data, 'fin_surface_carrez'), 0), ec_num(i.data, 'surface_carrez')) as surface,
      case when (i.data ->> 'Statut') like '11 %' then 'vendu' else 'a_vendre' end as statut,
      case when (i.data ->> 'Statut') like '11 %'
           then coalesce(v.prix, ec_num(i.data, 'prix_hai'))
           else ec_num(i.data, 'prix_hai') end as prix,
      ec_num(i.data, 'fin_renta_ba') as renta,
      case when (i.data ->> 'Statut') like '11 %'
           then left(coalesce(v.quand, nullif(i.data ->> 'Modified Date', ''), i.bubble_modified::text), 4)
           else null end as annee_txt,
      coalesce(v.quand, nullif(i.data ->> 'Modified Date', ''), i.bubble_modified::text) as tri
    from bo_immeuble i
    left join ventes v on v.imm = i.id
    where i.id <> p_immeuble
      and coalesce(i.data ->> 'archived', 'false') <> 'true'
      and v_dest <> ''
      and i.data ->> 'Destination_principale' = v_dest
      and v_dep is not null
      and coalesce(
            nullif(left(coalesce(i.data ->> 'adresse_zipcode', ''),
                        case when coalesce(i.data ->> 'adresse_zipcode', '') like '97%'
                               or coalesce(i.data ->> 'adresse_zipcode', '') like '98%' then 3 else 2 end), ''),
            i.data ->> 'adresse_dpt') = v_dep
      and (i.data ->> 'Statut') ~ '^(5|6|11) '
  ),
  filtre as (
    select b.*,
      row_number() over (partition by b.statut order by b.tri desc nulls last) as rn
    from base b
    where b.prix > 0 and b.surface > 0
      and (b.statut = 'a_vendre'
           or (b.annee_txt ~ '^[0-9]{4}$' and b.annee_txt::int in (v_annee, v_annee - 1)))
  )
  -- Trois de chaque d'abord ; s'il manque d'un côté, l'autre complète jusqu'à six.
  select coalesce(jsonb_agg(jsonb_build_object(
      'ville',  coalesce(f.ville, ''),
      'nbLots', case when f.nb_lots is null then null else f.nb_lots::int end,
      'surface', round(f.surface),
      'prixM2', round(f.prix / f.surface),
      'renta',  case when f.renta is null then null else round(f.renta, 1) end,
      'annee',  case when f.annee_txt ~ '^[0-9]{4}$' then f.annee_txt::int else null end,
      'statut', f.statut
    ) order by (case when f.rn <= 3 then 0 else 1 end), (f.statut = 'vendu') desc, f.tri desc nulls last), '[]'::jsonb)
  into v_compar
  from (
    select * from filtre
    order by (case when rn <= 3 then 0 else 1 end), (statut = 'vendu') desc, tri desc nulls last
    limit 6
  ) f;

  -- 6. Le tout.
  return jsonb_build_object(
    'secteur', v_secteur,
    'immeuble', jsonb_build_object(
      'loyersAn',        round(v_loyers),
      'loyersMaxAn',     round(v_loyersmax),
      'surface',         round(v_surface, 2),
      'surfaceOccupee',  round(v_surf_occ, 2),
      'charges',         round(coalesce(ec_num(v_im, 'fin_charges_non_recup'), 0)),
      'travaux',         round(coalesce(ec_num(v_im, 'fin_travaux'), 0)),
      'prixHai',         case when ec_num(v_im, 'prix_hai') is null then null else round(ec_num(v_im, 'prix_hai')) end,
      'destination',     v_dest
    ),
    'comparables', v_compar
  );
end;
$$;

-- Comme toutes les `ec_*` : personne par défaut, la clé publique seule.
revoke all on function public.ec_secteur_immeuble(text, text) from public;
grant execute on function public.ec_secteur_immeuble(text, text) to anon;
