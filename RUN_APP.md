# Comment lancer l'application (Guide Rapide)

Ce document résume les étapes pour installer et lancer l'application Glassfolio sur votre machine.

## 1. Installation des dépendances
Ouvrez votre terminal dans le dossier du projet et exécutez la commande suivante :

```powershell
npm.cmd install
```
*   **Pourquoi ?** Cette commande télécharge toutes les bibliothèques nécessaires (React, Vite, etc.) listées dans le fichier `package.json`.
*   **Note :** On utilise `.cmd` pour éviter les erreurs de sécurité PowerShell sur votre système.

## 2. Définir la clé API (Optionnel)
Si vous avez besoin des fonctionnalités IA, créez un fichier `.env.local` à la racine et ajoutez :
```env
VITE_GEMINI_API_KEY=VOTRE_CLE_ICI
```

## 3. Lancer le serveur de développement
Exécutez cette commande pour démarrer l'application :

```powershell
npm.cmd run dev
```

## 4. Accéder à l'application
Une fois le serveur lancé, ouvrez votre navigateur à l'adresse suivante :
👉 **[http://localhost:3000](http://localhost:3000)**

---

## Résolution des problèmes (Erreur de script PowerShell)
Si vous voyez une erreur de type `PSSecurityException` ("running scripts is disabled"), vous avez deux solutions :

1.  **Solution recommandée :** Utilisez toujours `npm.cmd` au lieu de `npm`.
2.  **Solution permanente :** Ouvrez PowerShell en tant qu'administrateur et tapez :
    ```powershell
    Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
    ```
