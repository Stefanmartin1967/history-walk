# ROADMAP: History Walk 2.0 (Vers l'autonomie Serveur)

Ce document trace la feuille de route technique pour transformer l'application actuelle (Client-Only / IndexedDB) en une application Client-Serveur autonome (HW 2.0).
L'objectif est de permettre la centralisation des données, la synchronisation multi-appareils et le multi-utilisateur, tout en conservant l'historique actuel.

---

## 1. Pourquoi une évolution ?

Actuellement, HW 1.0 est une **PWA autonome (Progressive Web App)** :
-   **Avantage :** Fonctionne sans internet, hébergement gratuit (GitHub Pages), respect total de la vie privée.
-   **Limite :** Les données sont prisonnières du navigateur. Si vous changez de téléphone ou d'ordinateur, vous devez transférer manuellement un fichier de sauvegarde. Impossible de voir les circuits d'un ami sans qu'il vous envoie un fichier.

**HW 2.0 (Cible) :**
-   **Serveur Central :** Une base de données unique stocke tout.
-   **Authentification :** Un compte utilisateur (Login/Mot de passe).
-   **Sync :** Vous commencez un circuit sur PC, vous le finissez sur Mobile, tout est à jour instantanément.

---

## 2. Architecture Cible (Niveau 1 - Perso + Officiel)

Pour rester simple et autonome (auto-hébergeable), voici l'architecture recommandée :

### A. La Stack Technique
*   **Serveur (Back-end) :** Node.js (Express) ou Python (FastAPI). Facile à lancer sur un petit serveur (Raspberry Pi, VPS à 5€, NAS Synology).
*   **Base de Données :** **SQLite** (un seul fichier `.db`, très facile à sauvegarder) ou **PostgreSQL** (plus robuste si > 100 utilisateurs).
*   **Stockage Photos :** Dossier local sur le serveur (`/uploads`) ou S3 (MinIO) si besoin de scalabilité.

### B. Le Modèle de Données (Schéma DB)

Voici comment vos données IndexedDB actuelles seront transformées en tables relationnelles :

**Table `Users`**
| Colonne | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Identifiant unique |
| `email` | String | Login |
| `password_hash` | String | Mot de passe sécurisé |

**Table `PoiUserData` (Remplace `poiUserData` local)**
| Colonne | Type | Description |
| :--- | :--- | :--- |
| `user_id` | UUID | Lien vers l'utilisateur |
| `map_id` | String | Ex: 'djerba' |
| `poi_id` | String | Ex: 'HW-042' |
| `status` | String | 'visited', 'planned' |
| `notes` | Text | Note personnelle |
| `photos` | JSON | Liste des chemins de fichiers (ex: `['/uploads/img1.jpg']`) |

**Table `UserCircuits` (Remplace `savedCircuits`)**
| Colonne | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Identifiant unique |
| `user_id` | UUID | Propriétaire |
| `name` | String | Nom du circuit |
| `geojson` | JSON | Le tracé et les points |
| `is_shared` | Boolean | (Futur) Public ou Privé |

---

## 3. Stratégie de Migration (Ne rien perdre)

La grande question est : *"Comment je transfère mes données actuelles vers ce futur serveur ?"*

### Étape 1 : L'Export Total (Côté Client - Actuel)
Vous disposez déjà de l'outil nécessaire.
*   **Fonctionnalité :** "Sauvegarde Complète (PC)" (`HistoryWalk_FULL_PC_...json`).
*   **Ce qu'elle contient :**
    *   Vos status (Visité/Pas visité).
    *   Vos notes.
    *   Vos circuits.
    *   **Vos photos** (encodées en texte "Base64").
*   **Action requise aujourd'hui :** Faites régulièrement des sauvegardes complètes sur PC. C'est votre assurance-vie numérique.
*   **⚠️ Important :** L'export est "par carte". Si vous avez des données sur plusieurs cartes (ex: Djerba ET Hammamet), vous devez générer un fichier de sauvegarde pour chacune d'elles.

### Étape 2 : L'Importateur (Côté Serveur - Futur)
Lorsque vous installerez le serveur HW 2.0, il faudra coder un petit script d'initialisation (`import_migration.js`).

**Logique du script :**
1.  Lire le fichier `HistoryWalk_FULL_PC_...json`.
2.  Créer votre compte utilisateur dans la DB.
3.  Pour chaque POI dans le fichier :
    *   Insérer une ligne dans la table `PoiUserData`.
    *   **Décodage Photos :** Le script détectera les chaînes "Base64" des photos, les convertira en fichiers `.jpg` réels, les enregistrera dans le dossier `/uploads` du serveur, et mettra à jour le lien dans la base de données.
4.  Pour chaque Circuit :
    *   Insérer une ligne dans `UserCircuits`.

**Résultat :** Vous vous connectez au nouveau site HW 2.0, et toutes vos photos et visites sont là.

---

## 4. Préparation du Code (Ce qu'on peut faire maintenant)

Même sans coder le serveur tout de suite, nous pouvons structurer le code actuel pour faciliter la transition.

1.  **Isolation des Appels de Données (API Layer)**
    Actuellement, le code appelle directement `indexedDB`.
    *   *Idée :* Créer une classe `DataManager` générique.
    *   *Actuel :* `DataManager.save(poi)` -> écrit dans IndexedDB.
    *   *Futur :* `DataManager.save(poi)` -> enverra une requête `fetch('/api/poi', ...)` au serveur.
    *   *Avantage :* Le jour J, on change juste l'intérieur de `DataManager`, et tout le reste de l'application (la carte, l'interface) continue de fonctionner sans rien changer.

2.  **Standardisation des IDs**
    Assurez-vous que les IDs de vos lieux (HW-ID) ne changent pas. Ils sont la clé de voûte pour relier vos données locales aux données du serveur.

## Conclusion

La transition est tout à fait possible et sécurisée.
*   **Vos données sont en sécurité** tant que vous faites des "Sauvegardes Complètes PC".
*   **Les Photos** seront migrées en les transformant de "texte" (Base64) à "fichier" (JPG) lors de l'import serveur.
*   **L'application** peut être préparée doucement en isolant la logique de base de données.

Ce document servira de référence pour le développeur (ou vous-même) qui lancera le chantier HW 2.0.
