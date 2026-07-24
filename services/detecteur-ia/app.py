import hmac
import os
import traceback

import gradio as gr
import spaces

from detecteur import DetecteurIA, MODELE_HEURISTIQUE, ModeleHeuristiqueFrancais


detecteur: DetecteurIA | None = None


@spaces.GPU(duration=1)
def verifier_acceleration_zero() -> bool:
    """Conserve la compatibilité du Space ZeroGPU sans y exécuter l'analyse."""
    return True


def detecter_texte(texte: str, cle_api: str) -> dict:
    global detecteur
    cle_attendue = os.getenv("PLAGIAT_FR_API_KEY", "")
    if not cle_attendue:
        raise gr.Error("Le service n’est pas configuré.")
    if not hmac.compare_digest(cle_api or "", cle_attendue):
        raise gr.Error("Accès refusé.")
    try:
        if detecteur is None:
            detecteur = DetecteurIA(
                ModeleHeuristiqueFrancais(),
                identifiant_modele=MODELE_HEURISTIQUE,
            )
        return detecteur.analyser(texte).vers_dict()
    except Exception as erreur:
        print(traceback.format_exc(), flush=True)
        return {
            "erreur": type(erreur).__name__,
            "detail": str(erreur)[:300],
        }


with gr.Blocks(title="Détecteur IA Plagiat-FR") as demo:
    gr.Markdown(
        """
        # Détecteur IA Plagiat-FR

        Ce service est réservé à l’application Plagiat-FR. Son résultat est
        probabiliste et doit être interprété humainement.
        """
    )
    texte = gr.Textbox(visible=False)
    cle_api = gr.Textbox(visible=False, type="password")
    resultat = gr.JSON(visible=False)
    bouton = gr.Button("Service réservé", interactive=False)
    bouton.click(
        fn=detecter_texte,
        inputs=[texte, cle_api],
        outputs=resultat,
        api_name="detecter",
        api_description="Analyse de rédaction IA réservée à Plagiat-FR.",
    )


if __name__ == "__main__":
    demo.launch(ssr_mode=False)
