# Documentation Technique History Walk

Ce document compile les informations techniques, l'architecture, et les workflows de l'application History Walk.

## 1. Architecture & État du Code

L'application suit une architecture modulaire basée sur les standards ES Modules.

### Structure
*   **Modules** : Code divisé en modules fonctionnels (`src/map.js`, `src/ui.js`, `src/state.js`, etc.).
*   **État Global** : Géré de manière centralisée dans `src/state.js` et exporté, évitant la pollution de l'objet global `window`.
*   **Dépendances** :
    *   `Leaflet` : Moteur de carte (CDN).
    *   `Lucide` : Icônes (ES Module).
    *   `Exif.js` : Lecture des métadonnées photo (CDN).

### Principes Clés
*   **DRY (Don't Repeat Yourself)** : La logique commune (calcul de distance, détection de zone, génération d'icônes) est centralisée dans `src/utils.js` ou des helpers dédiés.
*   **Pas de Globales** : Les variables comme `state` ou `lucide` ne sont plus exposées sur `window` (sauf exceptions pour outils de debug isolés comme `fusion.html`).

---

## 2. Gestion des Circuits (Lifecycle)

### Cycle de Vie
1.  **Brouillon** : Créé en mode sélection. Persisté dans IndexedDB (`circuitDraft_{mapId}`) à chaque modification.
2.  **Officialisation** : Lors de l'export GPX, un ID unique est généré.
3.  **Stockage** : Le circuit finalisé est stocké dans `state.myCircuits` et persisté localement.

### Identifiant HW-ID
L'identifiant `HW-ID` garantit la cohérence entre l'application et les fichiers GPX externes.
*   **Format** : `HW-[Timestamp]` (ex: `HW-1741258963254`).
*   **Stockage GPX** : Intégré dans les métadonnées pour résister aux éditeurs tiers.
    *   Priorité lecture : `<author><name>` > `<keywords>` > `<desc>`.
    *   Format balise : `[HW-ID:HW-...]`.

---

## 3. Logique d'Importation GPX

Le module `src/gpx.js` gère l'importation avec une validation stricte pour protéger les données.

### Algorithme de Validation
1.  **Vérification ID** :
    *   **Match** : Si l'ID du fichier correspond au circuit actif -> **Mise à jour autorisée** (Trace réelle remplace la théorique).
    *   **Mismatch** : Si l'ID diffère -> **Erreur Bloquante** (Protection contre écrasement).
2.  **Absence d'ID (Fichiers externes)** :
    *   **Match Géographique** : Si les points du tracé passent à <60m des POI du circuit -> **Confirmation requise**.
    *   **Aucun Match** : Si aucune corrélation -> **Avertissement Critique**.
3.  **Hors Zone** : Si le tracé est entièrement hors de la bounding box de la carte -> **Import Bloqué**.

---

## 4. Gestion des POI & Zones

### Création
*   **Manuel** : Clic-droit -> "Valider cette position".
*   **Photo** : Import EXIF -> Clustering géographique -> Création ou enrichissement.

### Détection de Zone (`src/utils.js`)
La fonction `getZoneFromCoords` est le point unique de vérité pour l'assignation des zones (Houmt Souk, Midoun, etc.). Elle est utilisée lors de :
*   La création manuelle de POI.
*   L'importation de photos.
*   La fusion de données (évitant ainsi les zones "A définir" par défaut).

---

## 5. Architecture des Fichiers & Décisions Techniques

Cette section explicite les choix architecturaux concernant le stockage et le nommage des fichiers, répondant aux compromis entre contraintes techniques et usage humain.

### 5.1 Nommage des Fichiers GPX (Export vs Stockage)

Il existe une dualité entre le nom de fichier "technique" et le nom "d'usage" :

*   **Le Besoin Utilisateur (Export)** : Lorsqu'un utilisateur télécharge un GPX (pour Wikiloc, Garmin, ou partage), le nom du fichier doit être **lisible et explicite** (ex: `Circuit du phare de Taguermess.gpx`). Un nom technique type `circuit_2024_A_B.gpx` serait obscur pour l'humain qui souhaite retrouver son fichier plus tard.
*   **La Contrainte Technique** : Pour un serveur ou un système de fichiers strict, les espaces et accents sont parfois problématiques.
*   **Notre Solution** :
    *   **À l'export (Client)** : Nous privilégions l'expérience utilisateur. Le navigateur génère le fichier à la volée avec le nom complet lisible.
    *   **Sur le Serveur (Officiel)** : Les fichiers sources (dans `public/circuits/`) gardent aussi des noms lisibles ou semi-lisibles. Bien que nous pourrions utiliser des IDs stricts, conserver un nom parlant facilite la maintenance manuelle par le développeur (on identifie le contenu sans ouvrir le fichier). Le lien technique est assuré par le fichier d'index (voir 5.3) qui mappe un ID logique au nom de fichier réel.

### 5.2 Structure de Stockage (`public/circuits/`)

Tous les circuits officiels sont actuellement stockés dans le répertoire `public/circuits/`.

*   **Question de Performance** : "Avoir 300 fichiers dans un même dossier risque-t-il de ralentir l'application ?"
    *   **Réponse : Non.**
    *   **Explication** : Le client (le navigateur de l'utilisateur) ne liste jamais ce dossier directement. Il ne demande jamais "donne-moi tous les fichiers".
    *   **Mécanisme de Lazy Loading** :
        1.  L'application charge uniquement **l'index léger** (`djerba.json`). Ce fichier pèse quelques kilo-octets et contient la liste des 300 circuits (Titre, ID, Description).
        2.  Le fichier GPX lourd (la trace réelle avec des milliers de points) n'est téléchargé que **si et seulement si** l'utilisateur clique explicitement sur un circuit pour le charger.
    *   **Conclusion** : Que vous ayez 10 ou 1000 circuits stockés, le temps de chargement initial de l'application reste quasi identique.

### 5.3 Convention de Nommage (`djerba.json` vs `djerba.geojson`)

Nous maintenons une symétrie sémantique stricte entre les données de la carte et les circuits associés pour permettre la gestion multi-destinations.

*   **`djerba.geojson` (La Carte)** : Contient les **Lieux** (Points of Interest - POI). C'est la donnée géographique brute du territoire.
*   **`djerba.json` (L'Index des Circuits)** : Contient la liste des **Itinéraires** officiels associés à ce territoire spécifique.
*   **Logique de Scalabilité** : Si demain nous ajoutons une nouvelle destination (ex: `hammamet.geojson`), l'application cherchera automatiquement `hammamet.json` dans le dossier circuits pour charger les itinéraires correspondants. Cela permet d'ajouter des destinations à l'infini sans modifier le code source (`src/`), uniquement en ajoutant des données (`public/`).
