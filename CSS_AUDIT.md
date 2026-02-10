# Audit du fichier `style.css` (Mise à jour V2)

## 1. Introduction
Ce rapport fait suite à l'analyse précédente et se concentre sur l'anomalie persistante des marges mobiles : pourquoi la même règle de 10px donne-t-elle un résultat visuel différent ("Correct" vs "Trop collé") selon les écrans ?

## 2. Le Mystère de la Différence Visuelle ("Règle Parasite")

### Le Constat
Malgré l'application stricte de la classe `.mobile-standard-padding` (10px) partout :
*   **Menu** & **Détail Circuit** : Rendu "Correct".
*   **Mes Circuits** & **Détail POI** : Rendu "Trop collé".

### L'Explication Technique : L'Hypothèse de l'Ascenseur (Scrollbar)
Après analyse structurelle, la différence ne vient pas d'une règle CSS cachée, mais très probablement de la présence d'une **barre de défilement (scrollbar)**.

1.  **Le Groupe "Trop Collé" (Mes Circuits, Détail POI)** :
    *   Ces écrans ont beaucoup de contenu vertical.
    *   Ils déclenchent l'apparition d'une barre de défilement verticale.
    *   Sur certains navigateurs/OS (notamment Windows ou mode test PC), la barre de défilement prend de la place (environ 15px-17px) à l'intérieur du conteneur.
    *   **Résultat** : Votre marge de 10px à droite est "mangée" ou repoussée par la barre de défilement, donnant l'impression que le contenu est collé au bord (ou à la barre).

2.  **Le Groupe "Correct" (Menu, Détail Circuit)** :
    *   Ces écrans ont souvent moins de contenu (Menu) ou une liste plus courte.
    *   Pas de barre de défilement (ou barre inactive).
    *   **Résultat** : La marge de 10px s'affiche pleinement.

### Preuve Structurelle
Les structures HTML sont désormais harmonisées (nettoyage du `padding: 8px` global effectué).
*   **Menu** : Conteneur (0px) -> Liste (10px).
*   **Mes Circuits** : Conteneur (0px) -> Wrapper (10px) -> Liste.
La seule variable changeante est la hauteur du contenu et donc l'activation du scroll.

---

## 3. Recommandations pour la V3

### Option A : Augmenter la Marge Standard (Recommandé)
Pour compenser l'effet visuel de la barre de défilement tout en gardant une esthétique agréable sur les écrans courts, nous devrions augmenter la marge standard.
*   Passer de **10px** à **14px** ou **16px**.
*   16px est un standard ergonomique mobile (Apple/Google guidelines) qui offre une zone de sécurité suffisante même avec une barre de défilement.

### Option B : Gutter Scrollbar (Plus technique)
Utiliser la propriété CSS moderne `scrollbar-gutter: stable;` pour réserver l'espace de la barre de défilement même quand elle n'est pas là. Cela alignerait "Menu" sur "Mes Circuits" (tout le monde aurait l'air un peu plus serré à droite), mais cela ne résout pas le sentiment de "Trop collé".

### Conclusion
La "règle parasite" est le comportement natif du navigateur face au débordement vertical. La solution la plus robuste est d'adopter une marge latérale plus généreuse (**14px** ou **16px**) qui absorbera visuellement cet écart.

---

## 4. Bilan de Santé Général (Rappel V1)
Le fichier `style.css` est maintenant plus propre sur la gestion mobile (suppression des `!important` bloquants, des marges négatives et du padding global perturbateur). La base est saine pour appliquer ce dernier ajustement de valeur.
