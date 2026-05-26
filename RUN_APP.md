# Comment lancer l'application (Guide Rapide)

Ce document résume les étapes pour installer et lancer l'application Glassfolio sur votre machine.

## 1. Installation des dépendances
Ouvrez votre terminal dans le dossier du projet et exécutez la commande suivante :

```sh
npm install
```
*   **Pourquoi ?** Cette commande télécharge toutes les bibliothèques nécessaires (React, Vite, etc.) listées dans le fichier `package.json`.

## 2. Lancer le serveur de développement
Exécutez cette commande pour démarrer l'application :

```sh
npm run dev
```

## 3. Accéder à l'application
Une fois le serveur lancé, ouvrez votre navigateur à l'adresse suivante :
👉 **[http://localhost:3000](http://localhost:3000)**

---

## Notes Windows (PowerShell)
Si vous voyez une erreur de type `PSSecurityException` ("running scripts is disabled"), vous avez deux solutions :

1.  **Solution recommandée :** Utilisez toujours `npm.cmd` au lieu de `npm`.
2.  **Solution permanente :** Ouvrez PowerShell en tant qu'administrateur et tapez :
    ```powershell
    Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
    ```
