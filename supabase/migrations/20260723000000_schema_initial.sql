create extension if not exists pgcrypto;
create type public.role_utilisateur as enum ('utilisateur','administrateur');
create type public.statut_compte as enum ('en_attente','approuve','refuse','expire');
create type public.statut_analyse as enum ('en_attente','traitement','terminee','erreur');

create table public.profils (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nom_complet text not null,
  role public.role_utilisateur not null default 'utilisateur',
  statut public.statut_compte not null default 'en_attente',
  approuve_le timestamptz,
  valide_jusqu_au timestamptz,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);
create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  utilisateur_id uuid not null references public.profils(id) on delete cascade,
  nom_fichier text not null check (char_length(nom_fichier) between 1 and 255),
  chemin_stockage text not null unique,
  type_mime text not null check (type_mime in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  taille_octets bigint not null check (taille_octets > 0 and taille_octets <= 20971520),
  statut public.statut_analyse not null default 'en_attente',
  score_originalite smallint check (score_originalite between 0 and 100),
  score_ia smallint check (score_ia between 0 and 100),
  resume_ia text,
  sources jsonb not null default '[]'::jsonb,
  erreur text,
  cree_le timestamptz not null default now(),
  terminee_le timestamptz
);
create index analyses_utilisateur_date_idx on public.analyses(utilisateur_id, cree_le desc);
create table public.journal_audit (
  id bigint generated always as identity primary key,
  acteur_id uuid references auth.users(id) on delete set null,
  action text not null,
  ressource text not null,
  ressource_id text,
  details jsonb not null default '{}'::jsonb,
  adresse_ip inet,
  cree_le timestamptz not null default now()
);
create index journal_audit_date_idx on public.journal_audit(cree_le desc);

alter table public.profils enable row level security;
alter table public.analyses enable row level security;
alter table public.journal_audit enable row level security;

create or replace function public.est_administrateur() returns boolean language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.profils p where p.id=(select auth.uid()) and p.role='administrateur' and p.statut='approuve' and p.valide_jusqu_au>now())
$$;
create policy "profil personnel lisible" on public.profils for select to authenticated using ((select auth.uid())=id or public.est_administrateur());
create policy "profils administrables" on public.profils for update to authenticated using (public.est_administrateur()) with check (public.est_administrateur());
create policy "analyses personnelles lisibles" on public.analyses for select to authenticated using ((select auth.uid())=utilisateur_id or public.est_administrateur());
create policy "analyses personnelles insérables" on public.analyses for insert to authenticated with check ((select auth.uid())=utilisateur_id and exists(select 1 from public.profils p where p.id=(select auth.uid()) and p.statut='approuve' and p.valide_jusqu_au>now()));
create policy "analyses personnelles supprimables" on public.analyses for delete to authenticated using ((select auth.uid())=utilisateur_id or public.est_administrateur());
create policy "audit administrateur uniquement" on public.journal_audit for select to authenticated using (public.est_administrateur());

create or replace function public.creer_profil() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.profils(id,email,nom_complet) values(new.id,new.email,coalesce(new.raw_user_meta_data->>'nom_complet','Utilisateur')); return new; end $$;
revoke all on function public.creer_profil() from public, anon, authenticated;
create trigger apres_creation_utilisateur after insert on auth.users for each row execute function public.creer_profil();

create or replace function public.administrer_compte(p_utilisateur_id uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$
declare v_statut public.statut_compte; v_audit text;
begin
 if not public.est_administrateur() then raise exception 'Accès administrateur requis'; end if;
 if p_action in ('approuver','renouveler') then v_statut:='approuve'; v_audit:=case when p_action='approuver' then 'compte_approuve' else 'compte_renouvele' end;
 elsif p_action='refuser' then v_statut:='refuse'; v_audit:='compte_refuse';
 else raise exception 'Action non autorisée'; end if;
 update public.profils set statut=v_statut,approuve_le=case when p_action='approuver' then now() else approuve_le end,valide_jusqu_au=case when p_action in('approuver','renouveler') then now()+interval '1 year' else null end,modifie_le=now() where id=p_utilisateur_id and role<>'administrateur';
 insert into public.journal_audit(acteur_id,action,ressource,ressource_id) values((select auth.uid()),v_audit,'profil',p_utilisateur_id::text);
end $$;
revoke all on function public.administrer_compte(uuid,text) from public, anon;
grant execute on function public.administrer_compte(uuid,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('documents','documents',false,20971520,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy "documents privés lecture" on storage.objects for select to authenticated using (bucket_id='documents' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "documents privés ajout" on storage.objects for insert to authenticated with check (bucket_id='documents' and (storage.foldername(name))[1]=(select auth.uid())::text and exists(select 1 from public.profils p where p.id=(select auth.uid()) and p.statut='approuve' and p.valide_jusqu_au>now()));
create policy "documents privés suppression" on storage.objects for delete to authenticated using (bucket_id='documents' and ((storage.foldername(name))[1]=(select auth.uid())::text or public.est_administrateur()));

grant select on public.profils,public.analyses to authenticated;
grant insert,delete on public.analyses to authenticated;
grant select on public.journal_audit to authenticated;
grant usage on schema public to authenticated;
alter publication supabase_realtime add table public.analyses;
