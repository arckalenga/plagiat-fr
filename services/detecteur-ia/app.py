from __future__ import annotations

import hmac
import os
from functools import lru_cache

from fastapi import Depends, FastAPI, Header, HTTPException, status
from pydantic import BaseModel, Field

from detecteur import DetecteurIA, MODELE_PAR_DEFAUT, ModeleOculus

app = FastAPI(
    title="Détecteur IA expérimental Plagiat-FR",
    version="0.1.0",
    docs_url=None,
    redoc_url=None,
)


class RequeteDetection(BaseModel):
    texte: str = Field(min_length=100, max_length=60_000)


@lru_cache(maxsize=1)
def obtenir_detecteur() -> DetecteurIA:
    return DetecteurIA(ModeleOculus(MODELE_PAR_DEFAUT))


def verifier_cle(x_api_key: str | None = Header(default=None)) -> None:
    cle_attendue = os.environ.get("PLAGIAT_FR_API_KEY")
    if not cle_attendue:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Le service n’est pas encore configuré.",
        )
    if not x_api_key or not hmac.compare_digest(x_api_key, cle_attendue):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Clé d’accès invalide.",
        )


@app.get("/")
def accueil() -> dict[str, str]:
    return {
        "service": "Détecteur IA expérimental Plagiat-FR",
        "avertissement": "Le résultat est probabiliste et ne constitue pas une preuve.",
    }


@app.get("/health")
def sante() -> dict[str, str]:
    return {"statut": "disponible", "modele": MODELE_PAR_DEFAUT}


@app.post("/detecter", dependencies=[Depends(verifier_cle)])
def detecter(requete: RequeteDetection) -> dict[str, object]:
    try:
        return obtenir_detecteur().analyser(requete.texte).vers_dict()
    except HTTPException:
        raise
    except Exception as erreur:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Le modèle est momentanément indisponible.",
        ) from erreur
