# Workflow des Circuits & POI

Ce document détaille le fonctionnement technique de la gestion des circuits, de l'importation GPX, et de la création de POI.

## 1. Workflow des Circuits

### Création et Exportation
Lorsqu'un circuit est créé dans l'interface, il reçoit un identifiant unique lors de son premier export (Sauvegarde).
- **ID Local** : Généré sous la forme `HW-${Date.now()}`.
- **Persistance** : Cet ID est inscrit directement dans le fichier GPX généré, au sein de la balise `<metadata><link><text>`.
  - Format : `[HW-ID:HW-123456789]`
  - Cela permet de conserver l'identité du circuit même si le fichier est ouvert et réenregistré par un outil tiers (comme GPX Studio), tant que les métadonnées sont préservées.

### Importation (`src/gpx.js`)

Le processus d'importation (`processImportedGpx`) analyse le fichier pour décider s'il s'agit d'une **Mise à jour** ou d'une **Création**.

#### A. Avec un ID Identique
*Scénario : Vous réimportez un circuit que vous aviez déjà exporté (et potentiellement modifié ailleurs).*
1. Le système détecte le `[HW-ID:...]` dans les métadonnées.
2. Il compare cet ID avec celui du circuit actuellement ouvert (si applicable).
3. **Résultat** : Si les IDs correspondent, l'import est autorisé immédiatement comme une **Mise à jour**. La trace réelle (`realTrack`) du circuit local est remplacée par celle du fichier GPX.

#### B. Avec un ID Différent
*Scénario : Vous essayez d'importer le "Circuit A" alors que vous éditez le "Circuit B".*
1. Le système détecte un ID, mais il ne correspond pas.
2. **Action** : Une alerte "Erreur d'identification" s'affiche pour protéger vos données. L'import est bloqué pour éviter d'écraser le mauvais circuit.

#### C. Sans ID (Fichier externe / Inconnu)
*Scénario : Import d'une trace Wikiloc ou d'un GPX sans signature History Walk.*
Le système lance une **Analyse Heuristique** :
1. Il compare les points du GPX avec les POI du circuit actif.
2. **Avec POI dans la trace** (Correspondance géographique) :
   - Si des points du GPX passent à moins de ~60m (`0.0006` degrés) des POI du circuit, le système détecte une "intention probable".
   - **Action** : Une confirmation s'affiche : "Ce fichier n'a pas d'ID certifié, mais X étapes correspondent...". Si validé, la trace est importée.
3. **Sans POI dans la trace** (Aucune correspondance) :
   - Le système ne trouve aucun lien logique.
   - **Action** : Une alerte rouge (Confirmation) s'affiche : "Ce fichier ne contient ni ID certifié, ni étapes communes... Êtes-vous SÛR ?".

#### D. Hors Zone
Avant toute logique d'ID, le système vérifie les coordonnées géographiques.
1. Il calcule la "Bounding Box" (zone rectangulaire) de la carte actuelle.
2. Si tous les points du GPX sont en dehors de cette zone (avec une marge de tolérance de ~11km), l'import est **bloqué**.
3. **Message** : "Ce fichier contient une trace située HORS DE LA ZONE actuelle".

### Le Bouton "Valider" (Rouge / Force Import)
Si vous validez l'action malgré les avertissements (Cas C - Sans POI / Sans ID) :
- Le système **force l'import**.
- Si un circuit était actif, sa trace est écrasée par celle du fichier.
- Si aucun circuit n'était actif, un **Nouveau Circuit** est créé ("Trace Importée") contenant cette géométrie.

---

## 2. Workflow des POI

### Création d'un POI

#### Via Clic-Droit (PC)
1. **Action** : Clic droit sur la carte -> Marqueur "Brouillon".
2. **Validation** : Clic sur "Valider cette position".
3. **Zone** : La fonction `getZoneFromCoords` (`src/utils.js`) est appelée.
   - Elle teste le point GPS contre les polygones définis dans `zonesData` (`src/zones.js`).
   - Si le point est dans un polygone, le nom de la zone (ex: "Houmt Souk") est assigné.
   - Sinon, la zone est marquée "Hors zone" ou "A définir".

#### Via Import Photo (PC - `handleDesktopPhotoImport`)
1. **Extraction GPS** : Les coordonnées EXIF sont lues.
2. **Clustering** : Les photos proches (<50m) sont regroupées.
3. **Recherche** : Le système cherche un POI existant à <100m du centre du groupe.
   - Si trouvé : Proposition d'ajout des photos au POI existant.
   - Si non trouvé : Proposition de création d'un **Nouveau POI**.
4. **Zone** : Lors de la création, la même logique `getZoneFromCoords` est appliquée pour déterminer la zone automatiquement.

### Problème de la zone "A définir"
*Constat : Des POI ajoutés ou fusionnés se retrouvent avec la zone "A définir".*

**Cause identifiée** :
Le module de fusion (`src/fusion.js`), utilisé pour intégrer les nouveaux POI, forçait explicitement la valeur par défaut :
```javascript
"Zone": "A définir"
```
au lieu de calculer la zone dynamiquement via `getZoneFromCoords` comme le fait le mode création standard.
Bien que `zones.js` et `map.geojson` contiennent les définitions correctes, le script de fusion ignorait cette étape de calcul.

**Solution appliquée** : Le script de fusion a été corrigé pour importer et utiliser la fonction de détection de zone.

---

## 3. Qualité du Code ("Clean Code")

### État Actuel (Mars 2024)
Suite à la campagne de refactoring (Refonte V2.5), le code a été nettoyé et unifié. L'application utilise une architecture modulaire ES6 stricte.

### Points Corrigés et Validés
*   ✅ **Variables Globales** : Suppression de la pollution de l'objet `window` (ex: `window.state`). L'état est géré via `src/state.js`.
*   ✅ **Centralisation** : La logique de détection de zone (`getZoneFromCoords`) et de calcul de distance est centralisée dans `src/utils.js` et utilisée partout (y compris dans `src/fusion.js`).
*   ✅ **Redondances** : Le code de `src/map.js` a été épuré (suppression des commentaires dupliqués et unification de la génération des icônes).

Pour un audit complet de l'état actuel, se référer au document `ETAT_DU_CODE.md`.
