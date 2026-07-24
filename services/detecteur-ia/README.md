---
title: Plagiat-FR - Détecteur IA
emoji: 🧪
colorFrom: green
colorTo: yellow
sdk: gradio
sdk_version: 5.49.1
app_file: app.py
pinned: false
license: apache-2.0
---

# Détecteur IA de Plagiat-FR

Service Python protégé d'analyse probabiliste de textes francophones.

Le modèle utilisé est `danibor/oculus-v2.0-multilingual` (Apache-2.0). Le
résultat est une estimation probabiliste à interpréter humainement. Le service
peut s'abstenir lorsque le texte est trop court ou que le score est trop
proche de 50 %.

## Configuration

Créer un secret Hugging Face Space :

```text
PLAGIAT_FR_API_KEY=<clé aléatoire longue>
```

La fonction Gradio `detecter` exige cette clé dans son paramètre API masqué.
Aucun texte soumis n'est journalisé par l'application.

## Exécution locale

```bash
pip install -r requirements.txt
PLAGIAT_FR_API_KEY=dev-secret python app.py
```

Le service utilise ZeroGPU lorsqu'il est hébergé dans un Space compatible.
