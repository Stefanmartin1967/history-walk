# Amélioration du Partage de Circuit par QR Code

## Résumé des Modifications

Ce document détaille les corrections et améliorations apportées à la fonctionnalité de partage de circuit via QR Code.

### 1. Correction du Bug de Persistance (Circuit manquant)

**Problème :**
Lorsqu'un utilisateur scannait un QR Code, le circuit était chargé dans la "mémoire vive" (comme un brouillon actif) mais n'était jamais sauvegardé dans la base de données locale (IndexedDB). Par conséquent, il n'apparaissait pas dans la liste "Mes Circuits" et disparaissait au rechargement de la page.

**Solution :**
La fonction `loadCircuitFromIds` dans `src/circuit.js` a été modifiée pour :
1.  Créer un véritable objet `Circuit` avec un ID unique (`circuit-[timestamp]`) et un nom par défaut (`Circuit Importé (DD/MM/YYYY)`).
2.  Sauvegarder immédiatement ce circuit via `saveCircuit()`.
3.  Déclencher l'événement `circuit:list-updated` pour rafraîchir instantanément la liste des circuits dans l'interface.

### 2. QR Code Universel (Web URL)

**Problème :**
Le format précédent utilisait un protocole interne (`hw:ID1,ID2`). Ce format n'était lisible que par le scanner intégré à l'application. Scanner le code avec l'appareil photo du téléphone ou une autre application de QR Code affichait simplement du texte brut inutile.

**Solution :**
Le format du QR Code généré (`generateCircuitQR`) a été changé pour une URL Web standard :
`https://[votre-site]/[dossier]/?import=ID1,ID2`

**Avantages :**
*   **Scanner Interne (App) :** Continue de fonctionner. Le scanner détecte la présence de `import=` et charge le circuit.
*   **Scanner Externe (Caméra) :** Ouvre maintenant le navigateur, charge l'application History Walk, détecte le paramètre `?import=`, et lance automatiquement l'importation du circuit.

### 3. Fichiers Modifiés

*   `src/circuit.js` : Logique de génération et de chargement (Sauvegarde DB ajoutée).
*   `src/mobile.js` : Adaptation du scanner interne pour accepter les URLs.
*   `src/main.js` : Ajout de la détection des paramètres URL au démarrage de l'application.

## Comment Tester

1.  **Génération (PC) :** Créez un circuit, cliquez sur "Partager". Le QR Code généré contient maintenant une URL.
2.  **Scan Interne (Mobile) :** Ouvrez le menu Mobile > Scanner un circuit. Scannez le code. Le circuit doit se charger ET apparaître dans "Mes Circuits".
3.  **Scan Externe (Mobile) :** Utilisez l'appareil photo du téléphone. Scannez le code. Cliquez sur le lien. L'application s'ouvre et importe le circuit automatiquement.
