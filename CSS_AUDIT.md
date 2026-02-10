# Audit du fichier `style.css` (Mise à jour V3)

## 1. Introduction
Ce rapport analyse l'anomalie visuelle persistante : pourquoi la même marge de 10px semble "Correcte" sur certains écrans (Menu, Détail Circuit) et "Trop collée" sur d'autres (Mes Circuits, Détail POI), malgré une harmonisation du code.

## 2. Analyse des Causes Possibles

### A. La Densité Visuelle ("Illusion de bord")
La différence principale entre les deux groupes n'est pas le padding technique (qui est bien de 10px partout), mais la nature du contenu :
*   **Groupe "Trop Collé" (Mes Circuits, Détail POI)** : Ce sont des éléments denses (Cartes avec bordures ou ombres, textes longs, plusieurs lignes). Le bord visuel de l'élément (la ligne ou l'ombre) "touche" la limite de 10px, créant une sensation d'étouffement.
*   **Groupe "Correct" (Menu, Détail Circuit)** : Ce sont des listes plus simples, souvent avec des icônes ou des boutons. L'œil se focalise sur l'icône ou le texte, qui est naturellement décalé vers l'intérieur par le padding interne du bouton. Le bord extérieur est moins prégnant.

### B. Le Modèle de Boîte (Box-Sizing)
Une faille structurelle a été identifiée : les conteneurs utilisés pour "Mes Circuits" (`.panel-content`) et "Menu" (`.mobile-list`) n'ont pas de `box-sizing: border-box` explicite.
*   Cela signifie que si leur largeur est calculée dynamiquement (ex: flex-grow ou width 100%), l'ajout du padding de 10px peut théoriquement pousser la largeur totale au-delà de l'écran (Overflow).
*   Bien que les navigateurs mobiles modernes gèrent souvent cela en réduisant l'échelle (scale down), cela peut "grignoter" visuellement les marges.

### C. La Barre de Défilement (Scrollbar)
Même sur mobile (Samsung S25), selon les réglages d'accessibilité ou le navigateur, la barre de défilement peut parfois réserver un espace ou changer la perception du bord droit. Bien que moins probable en mode "overlay", c'est un facteur de variabilité.

---

## 3. Recommandations Pratiques

### Action Immédiate : Sécuriser et Aérer
Pour résoudre définitivement le sentiment de "trop collé" et prévenir tout problème de débordement :

1.  **Verrouiller le Modèle de Boîte** : Ajouter `box-sizing: border-box;` à la classe `.mobile-standard-padding`. Cela garantit que le padding est toujours calculé *vers l'intérieur*, jamais en débordement.
2.  **Standardiser à 14px** : Passer de 10px à **14px**.
    *   10px est techniquement une "marge interne" (gap), souvent trop faible pour une marge d'écran.
    *   14px ou 16px est le standard ergonomique (Apple/Material Design) qui laisse respirer les cartes denses ("Mes Circuits") sans nuire aux listes simples ("Menu").

### Pourquoi 14px ?
C'est le point d'équilibre. Cela donnera l'air que réclame "Mes Circuits" tout en restant très proche du "Correct" actuel du Menu (la différence de 4px sera perçue comme un gain de confort, pas un vide).

---

## 4. Conclusion
L'anomalie est une combinaison de **gestion des boîtes CSS** (manque de `border-box`) et de **perception visuelle** liée à la densité des cartes. La solution robuste est technique (`border-box`) et esthétique (14px).
