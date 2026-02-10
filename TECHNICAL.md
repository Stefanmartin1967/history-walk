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

Tous les circuits officiels sont actuellement stockés dans le répertoire `public/circuits/` et organisés en sous-dossiers par carte.

*   **Structure** :
    *   `public/circuits/djerba/` : Contient les GPX pour Djerba.
    *   `public/circuits/djerba.json` : Index généré automatiquement.
*   **Automatisation (GitHub Actions)** :
    *   Lorsqu'un fichier GPX est ajouté dans un sous-dossier, une Action GitHub (`update-circuits.yml`) se déclenche.
    *   Elle génère/met à jour le fichier JSON correspondant (`djerba.json`).
    *   Si le fichier GPX n'a pas d'`HW-ID` interne, l'action en génère un et **l'inscrit dans le fichier GPX** pour assurer un lien permanent même en cas de renommage.

### 5.3 Convention de Nommage (`djerba.json` vs `djerba.geojson`)

Nous maintenons une symétrie sémantique stricte entre les données de la carte et les circuits associés pour permettre la gestion multi-destinations.

*   **`djerba.geojson` (La Carte)** : Contient les **Lieux** (Points of Interest - POI). C'est la donnée géographique brute du territoire.
*   **`djerba.json` (L'Index des Circuits)** : Contient la liste des **Itinéraires** officiels associés à ce territoire spécifique.
*   **Logique de Scalabilité** : Si demain nous ajoutons une nouvelle destination (ex: `hammamet.geojson`), l'application cherchera automatiquement `hammamet.json` dans le dossier circuits pour charger les itinéraires correspondants. Cela permet d'ajouter des destinations à l'infini sans modifier le code source (`src/`), uniquement en ajoutant des données (`public/`).

---

## 6. Stratégie de Données & Sauvegardes

L'architecture repose sur une distinction stricte entre les données statiques (officielles) et les données dynamiques (utilisateur), suivant une philosophie "Clean Slate".

### 6.1 Types de Données
*   **Données Officielles (Static)** : Carte de base (`[mapId].geojson`) et Circuits Officiels (`[mapId].json`). Chargées depuis le serveur, jamais incluses dans les sauvegardes pour éviter la redondance.
*   **Données Utilisateur (Dynamic)** : Statut de visite, notes, lieux personnalisés, circuits créés, et photos. Stockées dans le navigateur (IndexedDB).

### 6.2 Formats de Sauvegarde
*   **Sauvegarde Mobile (`.txt`)** : Format léger (JSON minifié). Inclut préférences, visites, et circuits perso. **Exclut** les photos. Idéal pour le transfert rapide.
*   **Sauvegarde PC (`.json`)** : Format complet. Inclut tout le contenu mobile + les photos encodées en Base64. Utilisé pour l'archivage long terme.

### 6.3 Stockage des Photos (IndexedDB)
*   **Local Only** : Les photos sont stockées dans le store `poiUserData` de la base IndexedDB du navigateur.
*   **Optimisation** : Avant stockage, les images sont automatiquement compressées (JPEG 70%, max 1024px) pour économiser l'espace disque.

---

## 7. Outils & Maintenance

### 7.1 Mode Administrateur ("God Mode")
Un mode caché destiné au développeur pour débloquer des fonctions avancées (export GeoJSON maître, nettoyage).
*   **Activation (Desktop)** : Séquence clavier **`G` -> `O` -> `D`** sur la fenêtre principale.

### 7.2 Console de Fusion (`tools/fusion.html`)
Outil dédié à la maintenance du fichier GeoJSON maître.
*   **Usage** : Permet de fusionner les données collectées sur le terrain (via une sauvegarde Mobile) avec le fichier source du projet.
*   **Fonction** : Analyse les différences, détecte les nouveaux lieux, et met à jour les coordonnées GPS ou les notes.

### 7.3 Module Scout (`tools/scout.html`)
Outil de repérage pour l'initialisation de nouvelles destinations.
*   **Usage** : Interroge l'API Overpass (OpenStreetMap) pour générer un squelette GeoJSON de POIs (Mosquées, Forts, Musées, etc.) autour d'un point donné.
