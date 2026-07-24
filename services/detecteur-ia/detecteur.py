from __future__ import annotations

import math
import re
import statistics
from dataclasses import dataclass
from typing import Protocol

MODELE_PAR_DEFAUT = "danibor/oculus-v2.0-multilingual"
MOTS_MINIMUM = 120
MOTS_PAR_SEGMENT = 300
SEGMENTS_MAXIMUM = 8


class ModeleProbabiliste(Protocol):
    def probabilites(self, textes: list[str]) -> list[float]: ...


def normaliser_texte(texte: str) -> str:
    return re.sub(r"\s+", " ", texte).strip()


def decouper_texte(
    texte: str,
    mots_par_segment: int = MOTS_PAR_SEGMENT,
    segments_maximum: int = SEGMENTS_MAXIMUM,
) -> list[str]:
    mots = normaliser_texte(texte).split(" ")
    if not mots or mots == [""]:
        return []

    segments = [
        " ".join(mots[index : index + mots_par_segment])
        for index in range(0, len(mots), mots_par_segment)
    ]
    if len(segments) <= segments_maximum:
        return segments

    # Échantillonnage régulier : début, milieu et fin restent représentés.
    positions = {
        round(index * (len(segments) - 1) / (segments_maximum - 1))
        for index in range(segments_maximum)
    }
    return [segments[index] for index in sorted(positions)]


def niveau_depuis_score(score: float) -> str:
    if score < 0.35:
        return "faible"
    if score > 0.65:
        return "élevée"
    return "intermédiaire"


@dataclass(frozen=True)
class ResultatDetection:
    probabilite_ia: int | None
    niveau: str
    confiance: int
    segments_analyses: int
    mots_analyses: int
    abstention: bool
    raison: str | None
    modele: str
    experimental: bool = True

    def vers_dict(self) -> dict[str, object]:
        return {
            "probabilite_ia": self.probabilite_ia,
            "niveau": self.niveau,
            "confiance": self.confiance,
            "segments_analyses": self.segments_analyses,
            "mots_analyses": self.mots_analyses,
            "abstention": self.abstention,
            "raison": self.raison,
            "modele": self.modele,
            "experimental": self.experimental,
        }


class ModeleOculus:
    def __init__(self, identifiant: str = MODELE_PAR_DEFAUT) -> None:
        import torch
        import torch.nn as nn
        from transformers import AutoConfig, AutoModel, AutoTokenizer, PreTrainedModel

        class Oculus(PreTrainedModel):
            config_class = AutoConfig

            def __init__(self, config):
                super().__init__(config)
                self.model = AutoModel.from_config(config)
                self.classifier = nn.Linear(config.hidden_size, 1)
                self.init_weights()

            def forward(self, input_ids=None, attention_mask=None, **kwargs):
                sorties = self.model(
                    input_ids=input_ids,
                    attention_mask=attention_mask,
                )
                masque = attention_mask.unsqueeze(-1).expand(sorties[0].size()).float()
                somme = torch.sum(sorties[0] * masque, dim=1)
                diviseur = torch.clamp(masque.sum(dim=1), min=1e-9)
                moyenne = (somme / diviseur).to(self.classifier.weight.dtype)
                return {"logits": self.classifier(moyenne)}

        torch.set_num_threads(2)
        self._torch = torch
        self._tokenizer = AutoTokenizer.from_pretrained(identifiant)
        self._modele = Oculus.from_pretrained(identifiant)
        self._modele.eval()

    def probabilites(self, textes: list[str]) -> list[float]:
        entrees = self._tokenizer(
            textes,
            return_tensors="pt",
            truncation=True,
            max_length=512,
            padding=True,
        )
        with self._torch.inference_mode():
            logits = self._modele(**entrees)["logits"].squeeze(-1)
            scores = self._torch.sigmoid(logits).tolist()
        if isinstance(scores, float):
            return [scores]
        return [float(score) for score in scores]


class DetecteurIA:
    def __init__(
        self,
        modele: ModeleProbabiliste,
        identifiant_modele: str = MODELE_PAR_DEFAUT,
    ) -> None:
        self.modele = modele
        self.identifiant_modele = identifiant_modele

    def analyser(self, texte: str) -> ResultatDetection:
        texte_normalise = normaliser_texte(texte)
        nombre_mots = len(texte_normalise.split()) if texte_normalise else 0
        if nombre_mots < MOTS_MINIMUM:
            return ResultatDetection(
                probabilite_ia=None,
                niveau="indéterminée",
                confiance=0,
                segments_analyses=0,
                mots_analyses=nombre_mots,
                abstention=True,
                raison=(
                    f"Texte trop court : {MOTS_MINIMUM} mots minimum sont requis."
                ),
                modele=self.identifiant_modele,
            )

        segments = decouper_texte(texte_normalise)
        scores = self.modele.probabilites(segments)
        if len(scores) != len(segments) or not scores:
            raise RuntimeError("Le modèle a renvoyé un résultat incomplet.")
        if any(not math.isfinite(score) or score < 0 or score > 1 for score in scores):
            raise RuntimeError("Le modèle a renvoyé une probabilité invalide.")

        score = statistics.fmean(scores)
        dispersion = statistics.pstdev(scores) if len(scores) > 1 else 0.0
        distance = abs(score - 0.5) * 2
        confiance = round(max(0.0, min(1.0, distance * (1 - dispersion))) * 100)
        abstention = 0.40 <= score <= 0.60 or confiance < 25

        return ResultatDetection(
            probabilite_ia=None if abstention else round(score * 100),
            niveau="indéterminée" if abstention else niveau_depuis_score(score),
            confiance=confiance,
            segments_analyses=len(segments),
            mots_analyses=nombre_mots,
            abstention=abstention,
            raison=(
                "Le score est trop proche de 50 % pour produire une indication."
                if abstention
                else None
            ),
            modele=self.identifiant_modele,
        )
