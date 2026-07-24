---
title: Plagiat-FR - Détecteur IA expérimental
emoji: 🧪
colorFrom: green
colorTo: yellow
sdk: docker
app_port: 7860
pinned: false
license: apache-2.0
---

# Détecteur IA expérimental de Plagiat-FR

Service Python privé d'analyse probabiliste de textes francophones.

Le modèle utilisé est `danibor/oculus-v2.0-multilingual` (Apache-2.0). Le
résultat ne constitue jamais une preuve d'utilisation d'une IA. Le service
peut s'abstenir lorsque le texte est trop court ou que le score est trop
proche de 50 %.

## Configuration

Créer un secret Hugging Face Space :

```text
PLAGIAT_FR_API_KEY=<clé aléatoire longue>
```

Le point `/health` est public. Le point `/detecter` exige cette clé dans
l'en-tête `X-API-Key`.

## Exécution locale

```bash
docker build -t plagiat-fr-detecteur-ia .
docker run --rm -p 7860:7860 \
  -e PLAGIAT_FR_API_KEY=dev-secret \
  plagiat-fr-detecteur-ia
```

## API

```http
POST /detecter
Content-Type: application/json
X-API-Key: ...

{"texte": "Texte français à analyser..."}
```

La réponse contient une probabilité, un niveau, le nombre de segments et les
raisons éventuelles d'abstention.
