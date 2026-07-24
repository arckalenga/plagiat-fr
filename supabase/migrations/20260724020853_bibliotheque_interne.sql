create extension if not exists pg_trgm;

create table public.bibliotheque_documents (
  id uuid primary key default gen_random_uuid(),
  titre text not null check (char_length(titre) between 2 and 300),
  auteur text,
  annee smallint check (annee is null or annee between 1400 and 2200),
  type_document text not null check (type_document in ('livre','memoire','these','article','rapport','autre')),
  chemin_stockage text not null unique,
  type_mime text not null check (type_mime in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  taille_octets bigint not null check (taille_octets > 0 and taille_octets <= 52428800),
  statut text not null default 'indexation' check (statut in ('indexation','indexe','erreur')),
  nombre_passages integer not null default 0 check (nombre_passages >= 0),
  cree_par uuid not null references public.profils(id) on delete restrict,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);

create table public.bibliotheque_passages (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.bibliotheque_documents(id) on delete cascade,
  numero integer not null check (numero >= 0),
  contenu text not null check (char_length(contenu) between 80 and 5000),
  contenu_normalise text not null,
  unique (document_id, numero)
);

create table public.analyse_passages (
  id bigint generated always as identity primary key,
  analyse_id uuid not null references public.analyses(id) on delete cascade,
  numero integer not null check (numero >= 0),
  contenu text not null check (char_length(contenu) between 80 and 5000),
  contenu_normalise text not null,
  unique (analyse_id, numero)
);

create index bibliotheque_documents_date_idx on public.bibliotheque_documents(cree_le desc);
create index bibliotheque_passages_document_idx on public.bibliotheque_passages(document_id);
create index bibliotheque_passages_trgm_idx on public.bibliotheque_passages using gin(contenu_normalise gin_trgm_ops);
create index analyse_passages_analyse_idx on public.analyse_passages(analyse_id);

alter table public.bibliotheque_documents enable row level security;
alter table public.bibliotheque_passages enable row level security;
alter table public.analyse_passages enable row level security;

create policy "bibliothèque administrateur lecture" on public.bibliotheque_documents
  for select to authenticated using (public.est_administrateur());
create policy "bibliothèque administrateur ajout" on public.bibliotheque_documents
  for insert to authenticated with check (public.est_administrateur() and cree_par=(select auth.uid()));
create policy "bibliothèque administrateur modification" on public.bibliotheque_documents
  for update to authenticated using (public.est_administrateur()) with check (public.est_administrateur());
create policy "bibliothèque administrateur suppression" on public.bibliotheque_documents
  for delete to authenticated using (public.est_administrateur());
create policy "passages bibliothèque administrateur" on public.bibliotheque_passages
  for select to authenticated using (public.est_administrateur());
create policy "passages analyse propriétaire" on public.analyse_passages
  for select to authenticated using (
    exists (
      select 1 from public.analyses a
      where a.id=analyse_id and (a.utilisateur_id=(select auth.uid()) or public.est_administrateur())
    )
  );

create or replace function public.indexer_document_reference(
  p_document_id uuid,
  p_passages jsonb
) returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_nombre integer;
begin
  if not public.est_administrateur() then
    raise exception 'Accès administrateur requis';
  end if;
  if jsonb_typeof(p_passages) <> 'array' or jsonb_array_length(p_passages) = 0 then
    raise exception 'Aucun passage exploitable';
  end if;

  delete from public.bibliotheque_passages where document_id=p_document_id;
  insert into public.bibliotheque_passages(document_id,numero,contenu,contenu_normalise)
  select p_document_id, x.numero, x.contenu, x.contenu_normalise
  from jsonb_to_recordset(p_passages) as x(numero integer, contenu text, contenu_normalise text)
  where char_length(x.contenu) between 80 and 5000
    and char_length(x.contenu_normalise) >= 60;

  get diagnostics v_nombre = row_count;
  if v_nombre = 0 then raise exception 'Aucun passage exploitable'; end if;

  update public.bibliotheque_documents
  set statut='indexe', nombre_passages=v_nombre, modifie_le=now()
  where id=p_document_id;

  insert into public.journal_audit(acteur_id,action,ressource,ressource_id,details)
  values ((select auth.uid()),'document_reference_indexe','bibliotheque_document',p_document_id::text,jsonb_build_object('passages',v_nombre));
  return v_nombre;
end $$;

create or replace function public.indexer_analyse_interne(
  p_analyse_id uuid,
  p_passages jsonb
) returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_nombre integer;
begin
  if not exists (
    select 1 from public.analyses a
    where a.id=p_analyse_id and (a.utilisateur_id=(select auth.uid()) or public.est_administrateur())
  ) then raise exception 'Analyse inaccessible'; end if;
  if jsonb_typeof(p_passages) <> 'array' or jsonb_array_length(p_passages) = 0 then
    raise exception 'Aucun passage exploitable';
  end if;

  delete from public.analyse_passages where analyse_id=p_analyse_id;
  insert into public.analyse_passages(analyse_id,numero,contenu,contenu_normalise)
  select p_analyse_id, x.numero, x.contenu, x.contenu_normalise
  from jsonb_to_recordset(p_passages) as x(numero integer, contenu text, contenu_normalise text)
  where char_length(x.contenu) between 80 and 5000
    and char_length(x.contenu_normalise) >= 60;
  get diagnostics v_nombre = row_count;
  if v_nombre = 0 then raise exception 'Aucun passage exploitable'; end if;
  return v_nombre;
end $$;

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
    select 1 from public.analyses a
    where a.id=p_analyse_id and (a.utilisateur_id=(select auth.uid()) or public.est_administrateur())
  ) then raise exception 'Analyse inaccessible'; end if;
  if not exists (select 1 from public.bibliotheque_passages) then
    raise exception 'La bibliothèque de référence est vide';
  end if;

  perform set_config('pg_trgm.similarity_threshold','0.28',true);

  with meilleurs as (
    select
      ap.id,
      ap.contenu,
      char_length(ap.contenu) as poids,
      coalesce(m.score,0) as score,
      m.document_id,
      m.extrait
    from public.analyse_passages ap
    left join lateral (
      select
        bp.document_id,
        bp.contenu as extrait,
        public.similarity(bp.contenu_normalise,ap.contenu_normalise) as score
      from public.bibliotheque_passages bp
      where bp.contenu_normalise operator(public.%) ap.contenu_normalise
      order by bp.contenu_normalise operator(public.<->) ap.contenu_normalise
      limit 1
    ) m on true
    where ap.analyse_id=p_analyse_id
  )
  select
    greatest(0,least(100,100-round(100*coalesce(sum(poids*score)/nullif(sum(poids),0),0))))::integer,
    count(*)::integer
  into v_originalite,v_passages
  from meilleurs;

  if v_passages = 0 then raise exception 'Le document ne contient aucun passage exploitable'; end if;

  with meilleurs as (
    select
      ap.contenu,
      m.document_id,
      m.extrait,
      m.score
    from public.analyse_passages ap
    join lateral (
      select
        bp.document_id,
        bp.contenu as extrait,
        public.similarity(bp.contenu_normalise,ap.contenu_normalise) as score
      from public.bibliotheque_passages bp
      where bp.contenu_normalise operator(public.%) ap.contenu_normalise
      order by bp.contenu_normalise operator(public.<->) ap.contenu_normalise
      limit 1
    ) m on true
    where ap.analyse_id=p_analyse_id and m.score >= 0.35
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
  select coalesce(jsonb_agg(jsonb_build_object(
    'document_id',id,
    'titre',titre,
    'auteur',auteur,
    'similarite',round(score*100),
    'extrait',extrait
  ) order by score desc),'[]'::jsonb)
  into v_sources
  from par_document;

  update public.analyses
  set
    statut='terminee',
    score_originalite=v_originalite,
    score_ia=null,
    resume_ia='La détection de rédaction assistée par IA n’est pas activée.',
    sources=v_sources,
    erreur=null,
    terminee_le=now()
  where id=p_analyse_id;

  insert into public.journal_audit(acteur_id,action,ressource,ressource_id,details)
  values ((select auth.uid()),'analyse_interne_terminee','analyse',p_analyse_id::text,jsonb_build_object('originalite',v_originalite,'passages',v_passages));

  return jsonb_build_object('score_originalite',v_originalite,'sources',v_sources,'passages',v_passages);
end $$;

revoke all on function public.indexer_document_reference(uuid,jsonb) from public,anon;
revoke all on function public.indexer_analyse_interne(uuid,jsonb) from public,anon;
revoke all on function public.comparer_analyse_interne(uuid) from public,anon;
grant execute on function public.indexer_document_reference(uuid,jsonb) to authenticated;
grant execute on function public.indexer_analyse_interne(uuid,jsonb) to authenticated;
grant execute on function public.comparer_analyse_interne(uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'bibliotheque',
  'bibliotheque',
  false,
  52428800,
  array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict(id) do update
set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy "bibliothèque stockage lecture administrateur" on storage.objects
  for select to authenticated using (bucket_id='bibliotheque' and public.est_administrateur());
create policy "bibliothèque stockage ajout administrateur" on storage.objects
  for insert to authenticated with check (bucket_id='bibliotheque' and public.est_administrateur());
create policy "bibliothèque stockage suppression administrateur" on storage.objects
  for delete to authenticated using (bucket_id='bibliotheque' and public.est_administrateur());

grant select,insert,update,delete on public.bibliotheque_documents to authenticated;
grant select on public.bibliotheque_passages,public.analyse_passages to authenticated;
