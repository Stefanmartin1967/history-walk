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
