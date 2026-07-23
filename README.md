# Plagiat-FR

Application française de détection de similitudes et d’aide à l’évaluation de textes assistés par IA.

## Démarrage

1. Copier `.env.example` vers `.env` et renseigner l’URL et la clé publiable Supabase.
2. Appliquer la migration du dossier `supabase/migrations`.
3. Déployer les fonctions `analyser-document` et `generer-rapport`.
4. Configurer les secrets `ANALYSIS_API_URL` et `ANALYSIS_API_KEY`.
5. Promouvoir le premier compte administrateur directement en base, puis ne gérer les accès que depuis le tableau d’administration.
6. Lancer `pnpm dev`.

Le moteur de détection est volontairement un connecteur serveur : aucun score factice n’est affiché. Le fournisseur retenu doit accepter une URL signée éphémère et retourner `originality_score`, `ai_score`, `ai_summary` et `sources`.
