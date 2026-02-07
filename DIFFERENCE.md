# Audit des Différences Mobile vs Desktop

Ce document recense les divergences fonctionnelles et ergonomiques identifiées entre la version Mobile et la version Desktop de l'application.

> **Note :** La version Desktop (PC) privilégie la carte et la barre latérale "Explorer", tandis que la version Mobile privilégie les listes et la navigation par onglets (Dock).

## 1. Gestion des Circuits (Liste & Actions)

| Fonctionnalité | Mobile | Desktop (PC) |
| :--- | :--- | :--- |
| **Marquer "Fait"** | ✅ **Bouton dédié** en bas de la liste des étapes ("Circuit terminé" / "Marquer comme fait"). | ✅ **Disponible**. Bouton "Cercle/Check" dans la liste Explorer pour basculer l'état. |
| **Inverser le sens** | ❌ **Supprimé**. Fonctionnalité abandonnée. | ❌ **Absent**. Fonctionnalité abandonnée. |
| **Filtre par Zone** | ✅ **Disponible**. Via le bouton "Œil" ou la barre d'outils contextuelle. | ❌ **Absent de la liste (Intentionnel)**. Utile sur Mobile pour la géolocalisation ("près de moi"). Sur PC, l'Explorer global suffit. |
| **Indicateur Restaurant** | ✅ Icône "Couverts" visible dans la liste des circuits. | ✅ Icône "Couverts" visible dans la liste Explorer. |
| **Suppression** | ✅ Glissement ou Menu contextuel (selon OS). | ✅ Bouton "Corbeille" au survol dans la liste Explorer. |

## 2. Navigation & Interface

| Fonctionnalité | Mobile | Desktop (PC) |
| :--- | :--- | :--- |
| **Structure** | **Dock (Barre inférieure)** : Circuits, Recherche, Ajout (+), Actions. | **Barre Latérale (Sidebar)** : Onglets (Explorer / Détails / Édition Circuit). La carte occupe tout le reste. |
| **Recherche** | **Vue dédiée** : Ouvre un écran spécifique avec liste de résultats persistante. | **Barre de recherche** : Champ en haut à gauche avec menu déroulant (type autocomplétion). |
| **Légende** | Via Menu "Actions" ou bouton dédié. | Bouton flottant sur la carte (Point d'interrogation). |
| **Mode Sombre** | ✅ Supporté (Thème automatique ou manuel). | ✅ Supporté (Sélecteur de thème en haut à droite). |

## 3. Création & Édition de Lieux (POI)

| Fonctionnalité | Mobile | Desktop (PC) |
| :--- | :--- | :--- |
| **Création** | **Capture GPS** : Bouton central "+" qui capture la position actuelle et détecte automatiquement la Zone. | **Clic Droit** : Menu contextuel sur la carte -> "Créer un brouillon" -> Ouverture de l'éditeur riche. |
| **Photos** | **Camera / Galerie** : Via l'input standard du navigateur. | **Import Avancé** : Module dédié avec Drag & Drop, lecture EXIF, regroupement par clusters (80m), détection de doublons et "Force Add". |
| **Déplacement** | **Mise à jour GPS** : Bouton pour remplacer la position du lieu par la position actuelle du téléphone. | **Glisser-Déposer** : Le marqueur est déplaçable à la souris en mode édition. |

## 4. Outils Système

| Fonctionnalité | Mobile | Desktop (PC) |
| :--- | :--- | :--- |
| **Sauvegarde** | **Fichier .txt** : Sauvegarde légère des données utilisateur (localStorage). | **Sauvegarde Complète** : Export JSON complet incluant les photos (Base64) ou Export "Mobile" (.txt). |
| **Scanner QR** | ✅ **Intégré**. Permet de scanner des circuits ou une synchronisation PC. | ❌ **Absent**. (Le PC affiche le QR code pour être scanné par le mobile). |
| **Synchronisation** | **Emetteur & Récepteur**. Peut générer un QR ou en scanner un. | **Emetteur**. Génère un QR code de synchronisation pour transférer l'état vers le mobile. |
| **Export GPX** | ✅ Disponible pour les circuits. | ✅ Disponible pour les circuits. |

## Synthèse

L'expérience est désormais alignée sur les fonctionnalités critiques. La version Desktop offre des outils d'édition et de gestion plus puissants (Photos, Import GPX avancé), tandis que la version Mobile se concentre sur l'usage terrain (GPS, Scanner, Liste simple).
