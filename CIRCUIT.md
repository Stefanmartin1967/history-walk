# Documentation Technique : Gestion des Circuits et HW-ID

Ce document détaille le cycle de vie d'un circuit dans l'application History Walk, la gestion de l'identifiant unique (`HW-ID`), et les mécanismes de validation lors de l'importation de traces réelles.

## 1. Cycle de vie d'un Circuit

### A. Création et Brouillon
1.  **Mode Sélection** : L'utilisateur active le mode sélection (`toggleSelectionMode`).
2.  **Ajout de POI** : Chaque clic sur un marqueur l'ajoute à `state.currentCircuit`.
3.  **Persistence du Brouillon** :
    *   À chaque modification, le circuit est sauvegardé dans IndexedDB sous la clé `circuitDraft_{mapId}`.
    *   Cela permet de ne pas perdre le travail en cas de rechargement de page.
    *   L'ID du circuit est `null` tant qu'il n'est pas exporté.

### B. Sauvegarde et Export (Officialisation)
L'action de "Sauvegarder" (`saveAndExportCircuit` dans `src/gpx.js`) déclenche la création finale du circuit :
1.  **Génération ID** : Si c'est un nouveau circuit, un ID unique est généré : `HW-{Timestamp}` (ex: `HW-1715698421000`).
2.  **Stockage** : Le circuit est enregistré dans `state.myCircuits` et persisté dans IndexedDB.
3.  **Export GPX** : Un fichier `.gpx` est généré et téléchargé automatiquement.

---

## 2. Le HW-ID (History Walk ID)

L'ID `HW-` est la clé de voûte de la cohérence entre l'application et les fichiers GPX externes.

### Structure
*   Format : `HW-[Timestamp]`
*   Exemple : `HW-1741258963254`

### Stockage dans le GPX
Lors de l'export, cet ID est intégré "en dur" dans les métadonnées du fichier XML pour permettre une identification certaine lors de la réimportation.

```xml
<metadata>
    <name>Mon Super Circuit</name>
    <keywords>Djerba, [HW-ID:HW-1741258963254]</keywords> <!-- Emplacement Principal -->
</metadata>
<!-- ... -->
<desc>... [HW-ID:HW-1741258963254] ...</desc> <!-- Support Legacy (Anciennes versions) -->
```

*Note : L'application cherche l'ID dans les balises `<desc>` (ancien format) puis `<keywords>` (nouveau format).*

---

## 3. Import de Trace Réelle (GPX)

L'import d'un GPX sur un circuit existant (`processImportedGpx` dans `src/gpx.js`) sert à remplacer le tracé théorique (lignes droites vol d'oiseau) par le tracé réel enregistré sur le terrain.

### Algorithme de Validation

Lorsqu'un utilisateur tente d'importer un fichier GPX sur un circuit actif (ID: `TARGET_ID`), l'application suit cette logique stricte :

#### Étape 1 : Recherche de Signature
L'analyseur XML scanne le fichier pour trouver une chaîne `[HW-ID:...]`.

#### Étape 2 : Validation d'Identité (Si ID trouvé)
*   **Cas A : Match Parfait** (`ID_FICHIER === TARGET_ID`)
    *   ✅ **Import autorisé immédiatement.**
    *   La trace réelle remplace l'ancienne.
*   **Cas B : Mismatch** (`ID_FICHIER !== TARGET_ID`)
    *   ⛔ **Erreur Bloquante.**
    *   Message : "Erreur d'identification : L'ID du fichier ne correspond pas au circuit actuel."
    *   *But : Empêcher d'écraser le circuit A avec la trace du circuit B par erreur.*

#### Étape 3 : Validation Heuristique (Si AUCUN ID trouvé)
Si le fichier provient d'une source externe (Strava, Wikiloc...) ou d'une très vieille version sans ID :
1.  **Comparaison Géographique** : L'algo compare les Waypoints (`<wpt>`) du fichier avec les POIs du circuit.
2.  **Critère** : Un point est considéré comme "commun" s'il est à moins de ~50m (`0.0005` deg) d'un POI du circuit.
3.  **Décision** :
    *   ✅ **Si correspondances trouvées** : Demande de confirmation simple ("X étapes correspondent...").
    *   ⚠️ **Si aucune correspondance** : Avertissement Critique ("Ce fichier ne contient ni ID certifié, ni étapes communes...").

---

## 4. Checklist de Tests Manuels

Voici la procédure pour valider le bon fonctionnement du module Circuit et Import.

### Test 1 : Création et Génération ID
*   [ ] **Action** : Créer un circuit de 3 points, ajouter un titre, cliquer sur "Export GPX".
*   [ ] **Vérification** : Le fichier GPX se télécharge.
*   [ ] **Vérification** : Ouvrir le GPX (Bloc-notes) et vérifier la présence de `<keywords>...[HW-ID:HW-...]</keywords>`.
*   [ ] **Vérification** : Dans l'app, le circuit a maintenant une icône "Vol d'oiseau" (Oiseau).

### Test 2 : Import Trace Réelle (Succès - Même Circuit)
*   [ ] **Pré-requis** : Utiliser le fichier GPX généré au Test 1.
*   [ ] **Action** : Sélectionner ce même circuit dans l'app. Cliquer sur le bouton "Import GPX" (Nuage). Choisir le fichier.
*   [ ] **Résultat attendu** : Succès immédiat (ou message "Trace importée"). L'icône du circuit passe à "Empreintes" (Trace réelle).

### Test 3 : Protection contre l'écrasement (ID Mismatch)
*   [ ] **Pré-requis** : Créer un **deuxième** circuit différent (Circuit B).
*   [ ] **Action** : Sélectionner le Circuit B. Tenter d'importer le fichier GPX du **Circuit A** (Test 1).
*   [ ] **Résultat attendu** : ⛔ **Erreur bloquante**. Message explicite mentionnant que l'ID ne correspond pas.

### Test 4 : Import Fichier Externe (Pas d'ID)
*   [ ] **Pré-requis** : Créer un fichier GPX bidon (ou prendre une trace Strava) qui passe par les mêmes lieux mais **SANS** la balise `[HW-ID:...]` dans les métadonnées.
*   [ ] **Action** : Importer ce fichier sur le circuit correspondant.
*   [ ] **Résultat attendu** : ✅ **Confirmation requise**. Message : "Ce fichier n'a pas d'ID certifié, mais X étapes correspondent...". Accepter doit fonctionner.

### Test 5 : Import Fichier Incohérent (Pas d'ID + Pas de lieux)
*   [ ] **Pré-requis** : Un fichier GPX neutre situé à Paris (hors zone).
*   [ ] **Action** : Importer sur un circuit à Djerba.
*   [ ] **Résultat attendu** : ⚠️ **Avertissement Critique**. Message : "Ce fichier ne contient ni ID certifié, ni étapes communes... Êtes-vous SÛR ?".

### Test 6 : Persistance du HW-ID après modifications
*   [ ] **Action** : Charger un circuit existant (déjà exporté une fois).
*   [ ] **Action** : Ajouter un point, changer le titre.
*   [ ] **Action** : Re-sauvegarder (Export GPX).
*   [ ] **Vérification** : Ouvrir le nouveau GPX. L'ID (`HW-...`) doit être **identique** à celui du Test 1. Il ne doit pas avoir changé.

## 5. Pistes pour Tests Automatisés (Bonus)

Si vous souhaitez automatiser ces tests à l'avenir (CI/CD), voici l'approche recommandée :

1.  **Framework** : Utiliser **Playwright** ou **Cypress**.
2.  **Scénario E2E (End-to-End)** :
    *   Simuler le clic sur les marqueurs pour créer un circuit.
    *   Intercepter l'événement de téléchargement du fichier GPX.
    *   Lire le contenu du fichier téléchargé et vérifier l'expression régulière `/\[HW-ID:HW-\d+\]/`.
3.  **Tests Unitaires (Jest)** :
    *   Isoler la fonction `processImportedGpx` (nécessite de mocker `DOMParser` et `FileReader`).
    *   Injecter des chaînes XML fictives (avec et sans ID).
    *   Vérifier que la promesse est résolue ou rejetée selon le cas.
