# Configuration Agent IA - [NOM DU PROJET]

Ce document est la source de vérité pour les agents IA intervenant sur ce repo. 
*Note à l'IA : Lors de la première session, complète les sections entre crochets `[...]` en fonction de l'analyse du besoin.*

##  Contexte Projet

- **Type** : Application Web / API (Architecture à définir)
- **Objectif** : [DÉCRIRE LA VALEUR MÉTIER ICI]
- **Environnements** : dev / staging / prod

## Stack Technique (À compléter par l'IA)

- **Frontend** : [FRAMEWORK / BIBLIOTHÈQUE]
- **Backend** : [LANGAGE / FRAMEWORK]
- **Base de données** : [TYPE / ORM]
- **Infrastructure** : [CONTAINERISATION / IAAS]

## Structure du Repo & Intentions

- `src/` : Code applicatif
- `src/api/` : Endpoints et logique serveur
- `src/ui/` : Composants d'interface
- `assets/` : Ressources statiques (images, fonts, icônes…)
- `src/locales/` : **Source de vérité textuelle** (Toute chaîne de caractères doit être ici. INTERDICTION de hardcoder du texte dans les composants).
    - `[langue-région]/`        # ex : fr-FR/, en-US/, de-CH/ — [À COMPLÉTER]
    - `README.md`               # Convention de nommage des clés de traduction
- `src/theme/tokens/` : **Variables de design partagées** (couleurs, espacements, typographie…)
    - `README.md` # Source de vérité pour tout token visuel ou thématique
- `tests` # Tests (unitaires, intégration, e2e)
- `infra` # Infrastructure as Code — modifier uniquement avec ADR associé
- `docs/summaries/` : Résumés automatiques par dossier (Source de vérité pour la navigation des agents).
- `docs/decisions/` : ADR (Architecture Decision Records).
- `docs/sessions-ia/` : Journaux de bord des interventions IA.

## Pack Réutilisable

- Dossier source du pack curé : `curated-agent-kit/`.
- Agents retenus : `planner`, `architect`, `code-reviewer`, `security-reviewer`, `tdd-guide`, `typescript-reviewer`, `doc-updater`, `loop-operator`.
- Skills retenus : `search-first`, `verification-loop`, `tdd-workflow`, `strategic-compact`, `security-scan`, `coding-standards`.
- Règle de sélection : ne réimporter que les règles liées à la stack réelle du projet, jamais tout le catalogue.
- Base minimale à conserver dans chaque projet : `rules/common/`.
- Packs à ajouter seulement si la stack les justifie : `rules/typescript/`, `rules/web/`, `rules/python/`, `rules/swift/`, `rules/java/`, `rules/cpp/`, `rules/csharp/`, `rules/rust/`.

## Mémoire et Outils (MCP)

Les serveurs MCP configurés pour ce projet :

1. **MCP Memory** : 
   - Usage : Stockage des entités et relations du graphe de connaissances.
   - Commande : `npx -y @modelcontextprotocol/server-memory`

2. **MCP Obsidian** :
   - Usage : Lecture/Écriture des specs et logs de session.
   - Chemin : `./docs/brain` (dossier Obsidian projet-local, à stocker dans le repo)
   - Commande : `npx -y obsidian-mcp ./docs/brain`

## Règles de Développement & Contraintes

## Conventions de code
 
- **Typage :** `[À COMPLÉTER — ex : TypeScript strict, Python typed, etc.]`
- **Validation des entrées :** utiliser uniquement la lib déclarée dans la Stack — ne pas en introduire une seconde
- **Logs :** utiliser uniquement le logger déclaré dans la Stack — ne pas en introduire un second
- **Textes :** toute chaîne visible par l'utilisateur passe par `locales/` — jamais en dur dans le code
- **Tokens visuels :** toute valeur de design (couleur, espacement…) passe par `design-tokens/` — jamais en dur dans le code
- **Tests :** toute nouvelle fonctionnalité doit avoir au minimum un test *happy path*
- **Import par projet :** copier seulement les agents, skills et rules utiles à la stack du projet, puis garder le reste hors du dépôt projet.
---
 
## Zones sensibles
 
| Zone | Règle |
|------|-------|
| `infra/` | Ne modifier qu'après création ou mise à jour d'un ADR dans `docs/decisions/` |
| `locales/` | Ne jamais supprimer une clé sans vérifier qu'elle n'est plus référencée |
 
---

## Instructions pour l'Agent

1. **Phase d'Initialisation** :
   - Lire ce fichier `AGENTS.md`.
   - Interroger le MCP `memory` pour obtenir l'overview.
   - Consulter `docs/summaries/` pour comprendre l'arborescence sans tout lire.

2. **Phase d'Action** :
   - Proposer un plan avant tout refactoring majeur.
   - Utiliser des questions structurées au MCP pour explorer les dépendances.

3. **Phase de Clôture (Post-Tâche)** :
   - Mettre à jour les résumés dans `docs/summaries/` si la structure a changé.
   - Documenter les décisions clés dans `docs/decisions/`.
   - Créer une note de session dans le vault Obsidian (`05-Sessions-IA`).


## Règles pour les agents
 
### Au début de chaque session
 
1. Lire ce fichier (`AGENTS.md`) en entier.
2. Interroger le MCP `memory` pour un **overview du repo**.
3. Consulter les résumés dans `docs/summaries/` avant d'ouvrir des fichiers volumineux.
### Pendant le travail
 
4. Minimiser les lectures de fichiers bruts — privilégier les questions structurées :
   - *"liste les dépendances de ce module"*
   - *"montre les call sites de cette fonction"*
5. Ne **jamais** écrire de secrets, credentials ou tokens dans les fichiers markdown.
6. Ne **jamais** introduire de texte en dur ou de valeur visuelle codée en dur — utiliser `locales/` et `design-tokens/`.
7. Proposer un **plan écrit** avant tout refactor majeur ou changement d'API public.
### Après une tâche significative (bugfix, feature, refactor)
 
### **Phase de Clôture (Post-Tâche)** :
8. Mettre à jour les résumés dans `docs/summaries/` si la structure a changé.
9. Documenter les décisions clés dans `docs/decisions/`.
10. Créer une note de session dans le vault Obsidian (`05-Sessions-IA`).
---
 

## Commandes de Développement (À ajuster)

- `pnpm dev` : Lancer l'environnement local
- `pnpm test` : Exécuter la suite de tests
- `pnpm build` : Vérification de la compilation


*Dernière mise à jour : `[DATE]` — `[auteur ou agent ayant complété le template]`*