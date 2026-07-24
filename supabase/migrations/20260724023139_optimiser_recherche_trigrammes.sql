create index if not exists bibliotheque_passages_trgm_gist_idx
on public.bibliotheque_passages
using gist (contenu_normalise public.gist_trgm_ops(siglen=256));

create or replace function public.comparer_analyse_interne(p_analyse_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_originalite integer;
  v_sources jsonb;
  v_passages integer;
begin
  if not exists (
    select 1
    from public.analyses a
    where a.id=p_analyse_id
      and (a.utilisateur_id=(select auth.uid()) or public.est_administrateur())
  ) then
    raise exception 'Analyse inaccessible';
  end if;

  if not exists (select 1 from public.bibliotheque_passages) then
    raise exception 'La bibliothèque de référence est vide';
  end if;

  with meilleurs as (
    select
      ap.id,
      ap.contenu,
      char_length(ap.contenu) as poids,
      m.score,
      m.document_id,
      m.extrait
    from public.analyse_passages ap
    cross join lateral (
      select
        bp.document_id,
        bp.contenu as extrait,
        public.similarity(bp.contenu_normalise,ap.contenu_normalise) as score
      from public.bibliotheque_passages bp
      order by bp.contenu_normalise operator(public.<->) ap.contenu_normalise
      limit 1
    ) m
    where ap.analyse_id=p_analyse_id
  )
  select
    greatest(
      0,
      least(
        100,
        100-round(100*coalesce(sum(poids*score)/nullif(sum(poids),0),0))
      )
    )::integer,
    count(*)::integer
  into v_originalite,v_passages
  from meilleurs;

  if v_passages = 0 then
    raise exception 'Le document ne contient aucun passage exploitable';
  end if;

  with meilleurs as (
    select m.document_id,m.extrait,m.score
    from public.analyse_passages ap
    cross join lateral (
      select
        bp.document_id,
        bp.contenu as extrait,
        public.similarity(bp.contenu_normalise,ap.contenu_normalise) as score
      from public.bibliotheque_passages bp
      order by bp.contenu_normalise operator(public.<->) ap.contenu_normalise
      limit 1
    ) m
    where ap.analyse_id=p_analyse_id
      and m.score >= 0.35
  ),
  par_document as (
    select
      d.id,
      d.titre,
      d.auteur,
      max(m.score) as score,
      (array_agg(left(m.extrait,500) order by m.score desc))[1] as extrait
    from meilleurs m
    join public.bibliotheque_documents d on d.id=m.document_id
    group by d.id,d.titre,d.auteur
    order by max(m.score) desc
    limit 10
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'document_id',id,
        'titre',titre,
        'auteur',auteur,
        'similarite',round(score*100),
        'extrait',extrait
      )
      order by score desc
    ),
    '[]'::jsonb
  )
  into v_sources
  from par_document;

  update public.analyses
  set statut='terminee',
      score_originalite=v_originalite,
      score_ia=null,
      resume_ia='La détection de rédaction assistée par IA n’est pas activée.',
      sources=v_sources,
      erreur=null,
      terminee_le=now()
  where id=p_analyse_id;

  insert into public.journal_audit(
    acteur_id,
    action,
    ressource,
    ressource_id,
    details
  )
  values (
    (select auth.uid()),
    'analyse_interne_terminee',
    'analyse',
    p_analyse_id::text,
    jsonb_build_object('originalite',v_originalite,'passages',v_passages)
  );

  return jsonb_build_object(
    'score_originalite',v_originalite,
    'sources',v_sources,
    'passages',v_passages
  );
end $$;

revoke all on function public.comparer_analyse_interne(uuid) from public,anon;
grant execute on function public.comparer_analyse_interne(uuid) to authenticated;
