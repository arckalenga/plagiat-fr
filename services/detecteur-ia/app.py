import hmac
import os

import gradio as gr
import spaces

from detecteur import DetecteurIA


detecteur = DetecteurIA()


@spaces.GPU(duration=120)
def detecter_texte(texte: str, cle_api: str) -> dict:
    cle_attendue = os.getenv("PLAGIAT_FR_API_KEY", "")
    if not cle_attendue:
        raise gr.Error("Le service n’est pas configuré.")
    if not hmac.compare_digest(cle_api or "", cle_attendue):
        raise gr.Error("Accès refusé.")
    return detecteur.detecter(texte).vers_dict()


with gr.Blocks(title="Détecteur IA Plagiat-FR") as demo:
    gr.Markdown(
        """
        # Détecteur IA Plagiat-FR

        Ce service est réservé à l’application Plagiat-FR. Son résultat est
        probabiliste, expérimental et ne constitue jamais une preuve.
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
        api_description="Analyse expérimentale réservée à Plagiat-FR.",
    )


if __name__ == "__main__":
    demo.launch()
