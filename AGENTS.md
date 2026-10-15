# AGENTS — GlassFolio (source de vérité)

Ce fichier est la **source de vérité** pour les agents IA intervenant sur ce dépôt.

## Prime directive

Avant d'écrire ou modifier du code, **lire et respecter** `AI_CODING_STANDARDS.md`.
En cas de conflit entre des règles, `AI_CODING_STANDARDS.md` prime.

---

## Contexte projet

- **Type** : Application web frontend (Vite + React). Pas de backend à ce stade.
- **Objectif** : Dashboard financier « premium » (portefeuille, transactions, positions, objectifs), **offline-first** et prêt pour une future migration InstantDB.
- **Contraintes clés** : multi-thèmes (Light/Dark/Midnight), i18n FR/EN, zéro hardcoding (texte + visuel), typage strict.

## Stack technique (réelle)

- **Frontend** : React, React Router, TypeScript, Vite.
- **UI / Theming** : Tailwind via CDN dans `index.html` + **classes sémantiques** mappées sur variables CSS.
- **i18n** : `i18next` + `react-i18next`, traductions dans `locales/`.
- **Charts** : Recharts. **Icons** : lucide-react.
- **Data** : couche `src/services/` + `src/services/db.ts` (mock `localStorage`) avec **délai artificiel** à conserver.
- **Cible (non implémentée)** : déploiement Vercel + InstantDB, sans API REST lourde.

## Structure du repo (actuelle)

```
GlassFolio/
├── pages/           # Pages routées (Dashboard, Portfolio, Transactions, …)
├── components/      # Composants UI réutilisables (Layout, cards, boutons, …)
├── context/         # Auth/Data context (thèmes, préférences, auth)
├── src/services/    # Couche data (db.ts + services)
├── src/types.ts     # Interfaces TypeScript
├── locales/         # Traductions i18n (en/, fr/)
├── utils/           # Utilitaires (ex: CSV)
├── test-data/       # CSV d'exemples (imports)
├── index.html       # Variables CSS + injection Tailwind CDN
└── curated-agent-kit/  # Pack réutilisable (référence) — pas la source de vérité
```

> ℹ️ Il n'y a plus de dossier `docs/` dans ce dépôt. Toute la documentation projet (features, ADRs, sessions IA, codemaps) est centralisée dans le coffre Obsidian global accessible via le serveur MCP `obsidian`.

---

## Règles non négociables (résumé opérationnel)

Les détails complets sont dans `AI_CODING_STANDARDS.md`.

- **Zéro texte UI en dur** : tout texte visible passe par i18n (`t('namespace:key')`) et doit exister en `locales/en` + `locales/fr`.
- **Zéro valeur visuelle codée en dur** : pas de hex/RGB dans les `.tsx`. Utiliser uniquement les classes sémantiques (ex: `bg-card`, `text-secondary`, `border-subtle`).
- **Form elements** : respecter le pattern `bg-subtle text-primary border-subtle focus:ring-primary focus:border-primary`.
- **Data access** : les composants/pages ne touchent jamais `localStorage` directement ; passer par `src/services/`.
- **Dates** : stocker/transporter en **ISO 8601 string** ; ne pas persister de `Date` brute dans le mock DB.
- **Typage strict** : pas de `any` ; types explicites, retours explicites sur les services.
- **Latence simulée** : ne pas supprimer le `delay(ms)` des services/mock DB.
- **AI-First & Compatibilité MCP Systématique** :
  - **Toute nouvelle fonctionnalité ou entité métier** (ex: emprunts, actifs, alertes, budgets) **DOIT obligatoirement** déclarer ses outils IA correspondants dans `src/services/ai/tools/` et les enregistrer dans `aiToolRegistry`.
  - **Human-in-the-loop obligatoire** : Toute action provoquant une modification ou création de données financières réelles **DOIT** définir `requiresConfirmation: true` afin d'exiger une validation explicite de l'utilisateur avant exécution.
  - **Objectif zéro rétro-ingénierie** : Tout nouveau développement doit être immédiatement exploitable par l'assistant In-App et les clients MCP externes (Claude Desktop, Cursor, Antigravity) dès son implémentation.

---

## Workflow agent (low-token)

### Priorité de contexte

1. Lire `AI_CODING_STANDARDS.md` (règles techniques) + ce fichier (règles projet).
2. **MCP `memory`** (`glassfolio.json`) — mémoire persistante inter-sessions. Fichier : `/Users/damien/Developpement/memory/glassfolio.json`. Contient le graphe d'entités, relations et observations du projet. Interroger `read_graph` ou `search_nodes` avant toute exploration de code.
3. **MCP `obsidian`** — coffre global (`/Users/damien/Developpement/brain`) : lire les specs de features, ADRs, sessions IA et codemaps dans le dossier `GlassFolio/`.
4. **Explorer le code en ciblé** : `grep_search` / recherche par symbole avant d'ouvrir de gros fichiers.
5. N'ouvrir des fichiers bruts que pour un détail précis et uniquement les portions pertinentes.

### Utilisation du MCP Obsidian

Le coffre s'appelle `brain`. Les notes GlassFolio sont dans le sous-dossier `GlassFolio/` :

| Dossier | Contenu | Quand le consulter |
|---|---|---|
| `GlassFolio/00-Index/` | Vue d'ensemble projet, stack, contraintes | Début de session |
| `GlassFolio/01-Architecture/` | Architecture système, data flow | Avant tout changement structural |
| `GlassFolio/02-Features/` | Specs features (FEAT-KEY-Name.md) | Pour comprendre le périmètre d'une feature |
| `GlassFolio/03-Decisions/` | ADRs (décisions d'architecture) | Avant de choisir une approche technique |
| `GlassFolio/04-Relationships/` | MOC, dépendances modules | Pour comprendre l'impact d'un changement |
| `GlassFolio/05-Sessions-IA/` | Logs de sessions (écriture après PR majeure) | Pour retrouver des décisions passées |
| `GlassFolio/06-Summaries/` | Codemaps pages/components/services | Alternative rapide à la lecture de code |

### Protocole maintenance documentaire & Notion MCP (Règle d'Ingénierie Stricte)

L'espace Notion est un reflet contractuel et professionnel de l'état du code source. Tout agent IA intervenant sur le dépôt doit **obligatoirement** respecter les règles suivantes à chaque session ou PR (> 3 fichiers) :

1. **Règle du Zéro Omission sur les colonnes Notion** :
   - Toute tâche créée ou mise à jour dans `Database - Tâches` doit **remplir 100% de ses colonnes** :
     - `Tasks` (Titre clair et standardisé)
     - `ID of tasks` (Code unique formaté `TGLA-xxx`)
     - `Type` (`Fonctionnalité`, `Architecture`, `Sécurité`, `Qualité`, `Test`, `Bug`, `Autre`)
     - `Statut` (`En cours`, `Fait`, `Prêt à commencer`, `Bloqué`)
     - `Priorité` (`Critique`, `Élevée`, `Moyenne`, `Faible`, `Meilleur effort`) — **INTERDICTION ABSOLUE de laisser sur `Manquant`**.
     - `Epic` (Liaison bidirectionnelle obligatoire vers l'Epic parent)
     - `Sprint` (Liaison bidirectionnelle obligatoire vers le Sprint adéquat)
     - `Admin` (Assignation `Damien`)
   - Le corps Markdown de la fiche de tâche **doit obligatoirement inclure la section `### 🔗 Traçabilité Git & Software Engineering`** (hashes de commits, nom de la branche, et résultat des tests CI).

2. **Gouvernance des Sprints & Epics** :
   - **Sprint actif obligatoire** : Tout développement doit être rattaché à un Sprint dont `Sprint actif = true`.
   - **Démarrage d'un nouvel Epic / Gros Chantier** : Si aucun sprint actif ne correspond au chantier, créer un nouveau Sprint dans `Database - Sprints` avec :
     - `Name`, `Monday Groups`, `Objectifs du sprint`, `Date de début`, `Date de fin`, `Échéancier du sprint`, `Terminé ? = false`, `Sprint actif = true`.
     - Désactiver (`Sprint actif = false`) le sprint précédent si applicable.
   - **Clôture de Sprint** : Dès que l'ensemble des tâches d'un sprint actif sont terminées et validées par la CI (`npm test`, `npm run check:types`, `npm run check:i18n`), marquer le sprint avec `Terminé ? = true` et `Sprint actif = false`.
   - **Échéanciers & Dates sur les Epics** : Renseigner systématiquement `Échéancier planifié` (start / end) sur les Epics, et basculer la `Phase` à `Done` ou `Version définitive` à la livraison. Pour les Epics en étude, maintenir la phase `Phase d'étude` avec dates prévisionnelles et priorités explicites.

3. **Maintenance des Bugs & Retouches UI** :
   - Les micro-ajustements UI (boutons, marges, fixes cosmétiques) vont dans `Database - Bugs` (`Amélioration / Retouche UI`).
   - Tout bug résolu par un fix ou vérifié conforme en CI doit être immédiatement passé à `Corrigé`.
- **Nouvelle feature structurante** : créer/mettre à jour `FEAT-[KEY]-[nom].md` dans `02-Features/`.
- **Choix architectural** : créer un `ADR-[date]-[titre].md` dans `03-Decisions/`.
- **Changement API d'un service** : mettre à jour le codemap correspondant dans `06-Summaries/`.

### Protocole maintenance MCP Memory (`glassfolio.json`)

Le graphe Memory persisté dans `/Users/damien/Developpement/memory/glassfolio.json` doit être maintenu à jour :

- **Nouveau module/service/page/composant** : `create_entities` avec type, fichier source, exports, dépendances.
- **Nouvelle dépendance entre modules** : `create_relations` (ex: `PageX depends_on ServiceY`).
- **Modification d'API ou d'interface** : `add_observations` sur l'entité concernée.
- **Suppression de module** : `delete_entities` ou `delete_relations` pour les entrées obsolètes.
- **Après changements majeurs** : `read_graph` pour vérifier la cohérence du graphe.

> ⚠️ Ne jamais lire, modifier ou créer d'autres fichiers dans `/Users/damien/Developpement/memory/` — seul `glassfolio.json` est géré par ce projet.

### Règles tokens / latence

- Toujours préférer une requête MCP structurée à la lecture brute de fichiers.
- Interroger `memory` en premier, puis `obsidian`, puis le code source si la réponse n'y est pas.
- **Changements minimaux** : éviter les refactors esthétiques (renommages, formatage massif) non demandés.
- **Validation** : après changement, vérifier TypeScript et cohérence i18n (clés EN+FR).

---

## Zones sensibles

| Zone | Pourquoi | Règle |
|------|----------|-------|
| `AI_CODING_STANDARDS.md` | Référence architecturale | Toujours prioritaire |
| `index.html` | Tokens (variables CSS) + injection Tailwind | Ne pas inventer des couleurs/classes non sémantiques |
| `locales/` | Source de vérité des textes | Ne jamais supprimer une clé sans rechercher ses usages |
| `src/services/` | Contrat data & futur InstantDB | Ne pas casser les interfaces ; pas de `localStorage` depuis les composants |
| `context/AuthContext.tsx` | Gestion thèmes + préférences | Respecter le mécanisme `data-theme` + `.dark` |

---

## Commandes de développement

- `npm install` : installer les dépendances
- `npm run dev` : lancer le serveur local (port 3000)
- `npm run build` : build de prod
- `npm run preview` : prévisualisation du build
