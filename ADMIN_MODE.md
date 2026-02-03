# Mode Administrateur ("God Mode")

Le "God Mode" est un mode caché destiné au développeur et aux mainteneurs de l'application. Il débloque des fonctionnalités avancées de gestion de données.

## 1. Activation

### Desktop (PC)
Pour activer le mode administrateur, tapez la séquence suivante sur votre clavier (focus sur la fenêtre principale) :
**`G` -> `O` -> `D`**

Une notification confirmera l'activation ou la désactivation du mode.

## 2. Fonctionnalités

Une fois le mode activé :

### Export Master GeoJSON
Un bouton d'export apparaît (ou devient accessible via raccourci/menu).
*   **But** : Générer un fichier `.geojson` complet et propre de l'état actuel des données (`state.loadedFeatures`).
*   **Usage** : Permet de sauvegarder le travail de maintenance (nettoyage, ajouts, corrections) pour mettre à jour le fichier source du projet (`djerba.geojson`, etc.).
*   **Format** : Le fichier généré respecte la structure officielle attendue par l'application.
