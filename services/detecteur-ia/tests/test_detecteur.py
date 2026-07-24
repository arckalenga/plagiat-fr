import unittest

from detecteur import DetecteurIA, decouper_texte


class FauxModele:
    def __init__(self, score: float):
        self.score = score

    def probabilites(self, textes: list[str]) -> list[float]:
        return [self.score] * len(textes)


class DetecteurIATest(unittest.TestCase):
    def texte(self, mots: int = 180) -> str:
        return " ".join(f"mot{index}" for index in range(mots))

    def test_refuse_un_texte_trop_court(self):
        resultat = DetecteurIA(FauxModele(0.9)).analyser(self.texte(30))
        self.assertTrue(resultat.abstention)
        self.assertIsNone(resultat.probabilite_ia)

    def test_signale_une_probabilite_elevee(self):
        resultat = DetecteurIA(FauxModele(0.92)).analyser(self.texte())
        self.assertFalse(resultat.abstention)
        self.assertEqual(resultat.probabilite_ia, 92)
        self.assertEqual(resultat.niveau, "élevée")

    def test_abstention_autour_de_cinquante_pourcent(self):
        resultat = DetecteurIA(FauxModele(0.52)).analyser(self.texte())
        self.assertTrue(resultat.abstention)
        self.assertEqual(resultat.niveau, "indéterminée")

    def test_echantillonne_un_long_document(self):
        segments = decouper_texte(self.texte(5_000))
        self.assertEqual(len(segments), 8)
        self.assertTrue(segments[0].startswith("mot0 "))
        self.assertIn("mot4999", segments[-1])


if __name__ == "__main__":
    unittest.main()
