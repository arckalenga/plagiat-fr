create index if not exists bibliotheque_documents_createur_idx
  on public.bibliotheque_documents(cree_par);
create index if not exists journal_audit_acteur_idx
  on public.journal_audit(acteur_id);
