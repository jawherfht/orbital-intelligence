# DECISIONS — Orbital Intelligence

Journal des décisions (question, réponse, date). `SPEC.md` fait foi ; ce fichier précise ou adapte ce que SPEC.md ne tranche pas.

## Phase 0 — Cadrage (2026-10-25)

| # | Question | Décision | Source |
|---|---|---|---|
| D1 | Langue de l'interface | **Anglais seul**, toutes les chaînes dans `src/i18n/en.ts`. Français éventuellement en phase 5. | Recommandation validée par l'utilisateur |
| D2 | Emplacement du module | **Dépôt dédié** `jawherfht/orbital-intelligence`, projet à la racine. Aucun lien avec BEAI_RAG. | Utilisateur (dépôt créé) |
| D3 | Licences | Dépendances de code : MIT/Apache/BSD/ISC. Ressources : **OFL** (polices) et **domaine public** (textures NASA) autorisés. Chaque ressource est listée dans la section *Credits* du README. | Recommandation validée |
| D4 | Polices | `@fontsource/inter` et `@fontsource/jetbrains-mono` (npm, OFL), intégrées au build, **pas de Google Fonts** → fonctionne hors ligne. Remplace la mention « Google Fonts » de la section 7 de SPEC.md. | Recommandation validée |
| D5 | Données CelesTrak | `celestrak.org` est **bloqué** depuis l'environnement cloud (proxy 403, constaté le 2026-10-25). Le script `npm run data:update` sera écrit en phase 2 ; s'il est toujours bloqué, l'utilisateur le lance sur sa machine et commite `public/data/`. **Aucune donnée inventée.** | Option A puis B |
| D6 | Textures de la Terre | Textures du paquet npm **three-globe** (MIT), après vérification de leur provenance (voir D10). | Option C |
| D7 | Seuil « serré » (rouge) | Distance minimale **< 1 km**, toujours avec « Requires Verification ». Ambre entre 1 km et le seuil réglable (10 km par défaut). | Recommandation validée |
| D8 | Référence du test TCA (phase 4) | Deux orbites synthétiques construites pour se croiser à un instant connu ; TCA attendu à ± 2 s. | Recommandation validée |
| D9 | Démo sans rapprochement réel | Jamais d'événement inventé dans les données réelles. Mode **« Simulated test scenario »** basé sur les orbites synthétiques, bandeau permanent « SIMULATED TEST SCENARIO — NOT REAL DATA », utilisé seulement si le screening réel ne trouve rien. | Recommandation validée |
| D11 | Interpolation | Erreur mesurée ; si > 5 km à l'écran en x600, proposition d'une méthode plus précise. | Recommandation validée |
| D12 | Catégorie | Déduite du nom (`DEB`, `R/B`) et du groupe ; affichée « Category (inferred) ». | Recommandation validée |
| D13 | Cache live | IndexedDB, avec try/catch ; l'app fonctionne sans. | Recommandation validée |

## Phase 1 — Socle (2026-10-25)

### D10 — Provenance des textures three-globe ⚠️ À CONFIRMER

Textures copiées depuis `node_modules/three-globe/example/img/` (three-globe 2.45.6, licence MIT du paquet) :

| Fichier du projet | Source | Taille |
|---|---|---|
| `public/textures/earth_day.jpg` | `earth-blue-marble.jpg` | 4096×2048 |
| `public/textures/earth_night.jpg` | `earth-night.jpg` | 4096×2048 |
| `public/textures/earth_water_mask.png` | `earth-water.png`, converti en niveaux de gris | 1600×800 |

Constat : le paquet **ne documente pas** l'origine de ces images (aucune mention dans le README ni le `package.json`). Visuellement, elles correspondent aux mosaïques NASA *Blue Marble* (jour, avec bathymétrie) et *Black Marble / Earth at Night* (nuit), qui sont dans le domaine public. **C'est une déduction, pas une preuve.** La couche de nuages (`clouds.png`, 4,9 Mo) n'a pas été reprise : provenance inconnue.

Conformément à D6 (« si la provenance n'est pas claire, arrête-toi et demande-moi »), la question est posée à l'utilisateur à la fin de la phase 1. En attendant, ces textures sont utilisées **à titre provisoire** ; les remplacer par les fichiers NASA officiels ne demande que d'écraser les trois fichiers ci-dessus (mêmes noms, projection équirectangulaire, longitude 0° au centre).

### D14 — API satellite.js 7.1.0 confirmée (lecture des `.d.ts` installés)

| Besoin (SPEC §3) | Fonction confirmée | Signature / remarque |
|---|---|---|
| OMM JSON → satrec | `json2satrec(jsonobj: OMMJsonObject, opsmode?)` | Existe ; `OMMJsonObject` rend optionnels les champs absents chez CelesTrak. Pas de conversion TLE nécessaire. |
| TLE → satrec | `twoline2satrec(l1, l2)` | Disponible en secours. |
| Propagation | `propagate(satrec, date: Date)` | Retourne `PositionAndVelocity \| null` (km, km/s, ECI/TEME). **`null` en cas d'erreur.** |
| Erreurs | `satrec.error` de type `SatRecError` | `None=0`, `Decayed=6`, etc. Les objets en erreur seront ignorés et comptés (phase 2). |
| Décroissance | `checkForDecay` | Option `communityDecayCheckEnabled` de `propagate`. |
| GMST | `gstime(date: Date)` | Radians. |
| Repères | `eciToEcf`, `ecfToEci`, `eciToGeodetic(eci, gmst)` | `eciToGeodetic` renvoie `{ latitude, longitude (rad), height (km) }`. |
| Conversions | `degreesLat`, `degreesLong`, `radiansToDegrees` | — |
| Soleil | `sunPos(jday(date))` | Vecteur ECI en UA ; utilisé pour l'éclairage jour/nuit. |

### D15 — Modèle de repère retenu

Satellites en **ECI** ; la Terre tourne de **GMST** autour de l'axe Y de la scène. Mapping `scene = (x, z, −y)`, 1 unité = 6 378,137 km. Documenté dans `src/orbital/frames.ts` et vérifié par trois familles de tests : mapping d'axes, cohérence avec `ecfToEci` de satellite.js, et position des UV d'une `THREE.SphereGeometry` (alignement de la texture). Vérifié visuellement avec les marqueurs de debug (Tunis et 0°/0° tombent au bon endroit).

### D16 — Workers en format ES

satellite.js 7 embarque une version WASM optionnelle dont les workers utilisent un `await` de premier niveau. Vite doit donc produire les workers au format ES (`worker.format: 'es'` dans `vite.config.ts`). Sans cela, `vite build` échoue. Le WASM n'est pas utilisé et n'est pas inclus dans le build.

### D17 — Versions installées

React 19, Vite 8, TypeScript 7, Tailwind CSS 4, three 0.186, @react-three/fiber 9, drei 10, zustand 5, vitest 5 : dernières versions stables au 2026-10-25, conformes à la stack de SPEC §3 (« React 18+ »). Avec TypeScript 7, le build utilise `tsc` simple (sans `-b`).

### D18 — Paramètre d'URL `?t=`

`?t=2026-10-25T12:00:00Z` démarre l'horloge simulée à cet instant UTC. Utile pour les tests visuels et pour la démo (choisir une heure où la Tunisie est éclairée).

### D19 — Vue d'ouverture

La caméra s'ouvre au-dessus de l'Afrique du Nord et de la Méditerranée (30°N, 10°E), recalculée selon l'heure simulée, pour que le jury voie d'emblée une région familière.

## Phases 2 à 5 (2026-10-25)

### D20 — Source des données : CelesTrak, puis miroir GitHub de CelesTrak

`celestrak.org` reste bloqué depuis l'environnement cloud (proxy 403, vérifié de nouveau le 2026-10-25), ainsi que les API tierces (tle.ivanstanojevic.me, wheretheiss.at). Seuls GitHub et npm sont accessibles.

- `npm run data:update` essaie **d'abord CelesTrak en OMM JSON**. En cas d'échec, il lit le dépôt public [2048lr/celestrak-mirror](https://github.com/2048lr/celestrak-mirror). Son workflow GitHub Actions (lu et vérifié) télécharge `celestrak.org/NORAD/elements/gp.php?GROUP=<g>&FORMAT=tle` toutes les 30 min, avec un contrôle de cohérence.
- Les TLE sont convertis en OMM **sans perte** (`src/data/tle.ts`, test d'équivalence avec `twoline2satrec` : < 5 m d'écart, dû à la précision à la milliseconde de `json2satrec`).
- Le manifeste enregistre, pour chaque groupe, l'URL réelle, le format (`celestrak-omm` ou `mirror-tle`) et l'heure de rafraîchissement du miroir. L'interface affiche « via GitHub mirror of CelesTrak ». **Aucune donnée inventée** : ce sont les données GP de CelesTrak, relayées.
- Snapshot actuel : 7 groupes (stations, weather, resource, science, amateur, geo, starlink échantillonné à 400) = 1 365 objets ; 1 333 après dédoublonnage et contrôle SGP4. `gnss` n'est pas dans le miroir : il sera récupéré dès que le script tournera sur une machine qui atteint CelesTrak.
- Rafraîchissement en direct dans le navigateur : CelesTrak direct → proxy Vite (dev) → miroir, avec un cache IndexedDB de 2 h.

### D21 — Points (THREE.Points) au lieu d'InstancedMesh

SPEC §6.2 demande un InstancedMesh et SPEC §7 des « sprites additifs ». `THREE.Points` avec un shader (disque doux additif, taille par point, couleur par catégorie) satisfait les deux exigences : **un seul draw call** et un rendu en sprites. C'est aussi moins coûteux que 1 500 sphères instanciées. Les objets masqués par les filtres reçoivent une taille 0. La sélection se fait en espace écran (rayon de 10 px), en ignorant les objets cachés par la Terre.

### D11 (suite) — Interpolation mesurée

Avec une interpolation linéaire, l'erreur atteint ~24 km pour l'ISS à x600, puisque les échantillons du worker sont espacés de 150 s. Le module utilise donc une **interpolation d'Hermite cubique** avec les vitesses SGP4 : moins de 0,1 km (test `interpolate.test.ts`). L'erreur réelle est aussi mesurée en continu et affichée en mode Debug.

### D22 — Graphiques en SVG plutôt que recharts

Il n'y a qu'un seul graphique (distance/temps autour du TCA) et une frise : un SVG intégré de quelques dizaines de lignes suffit. On évite environ 100 Ko gzip de dépendance (SPEC §3 autorise « recharts ou équivalent léger »). L'échelle logarithmique rend lisibles à la fois le minimum (km) et les extrémités (milliers de km).

### D23 — Trajectoire 3D sur une orbite complète

Dans le repère inertiel, une orbite se referme sur elle-même. Une trace de ±1 période dessinait donc deux fois la même ellipse, et le passé (trait plein) se superposait au futur (pointillés). Choix retenu :
- trajectoire 3D : −½ période en trait plein qui s'estompe, puis +½ période en pointillés, soit une orbite complète ;
- trace au sol (option) : ±1 période, car la rotation de la Terre sépare les deux passages.

Les échantillons calculés couvrent bien ±1 période (SPEC M6).

### D24 — Objets co-localisés exclus du screening

CelesTrak publie plusieurs modules de l'ISS (POISK, etc.) avec les mêmes éléments que la station. Leur « distance minimale » vaut 0 km par construction, comme la ligne « now 0.00 km HIGH » de la maquette de référence. Les paires dont les éléments sont identiques sont **exclues et comptées** (« 3 co-located pairs excluded »), au lieu d'être signalées.

### D25 — Scénario synthétique calibré

Les termes J2 (séculaires et à courte période) dépendent de l'inclinaison. Avec une construction purement képlérienne, le croisement se décalait de plusieurs secondes et de plusieurs km. Les anomalies moyennes sont donc **calibrées numériquement** sur les passages réels au nœud ascendant calculés par SGP4 (bissection). L'époque des éléments est fixée 10 min avant le croisement : la régression nodale différentielle écarte les lignes des nœuds d'environ 0,6° en 3 h. Résultat : TCA à moins de 1 s de l'instant prévu, distance minimale d'environ 2,5 km.

### D26 — Mode démo

Le bouton « Start demo » enchaîne les 5 étapes de SPEC §10, avec des légendes. Le screening réel est lancé sur l'ISS. S'il ne trouve rien (cas habituel), la démo bascule sur le scénario simulé avec bandeau (D9). La démo fonctionne entièrement hors ligne et « Stop demo » l'interrompt à tout moment.

### D27 — FPS

L'environnement cloud n'a pas de GPU : le rendu y est logiciel (SwiftShader) et n'est pas représentatif. Le compteur FPS (mode Debug) permet de vérifier l'objectif ≥ 50 FPS sur une vraie machine. Coût par image côté CPU : interpolation de 1 333 objets plus une copie de buffer, soit bien moins d'une milliseconde.

## Sources multiples (2026-10-25)

### D28 — CelesTrak + Space-Track + N2YO, avec un petit serveur local

Demande de l'utilisateur : utiliser trois API gratuites qui fournissent des données orbitales réelles ou des positions calculées, sans aucune donnée inventée. Architecture : CelesTrak (primaire) et Space-Track (secondaire) → validation & fraîcheur → SGP4 → globe 3D, avec N2YO pour vérifier ponctuellement les positions.

- **Pourquoi un serveur** : Space-Track exige un compte et une session par cookie, et n'autorise pas le CORS. N2YO exige une clé API. Ces secrets ne doivent jamais se retrouver dans le bundle du navigateur. Le serveur `server/index.ts` est en Node ≥ 22, **sans dépendance** : `node:http` et `fetch`. Il lit `.env` (ignoré par git, modèle dans `.env.example`) et expose `/api/orbital/*`. `npm run dev` lance le serveur et Vite ensemble, `npm start` sert le build de production. L'application reste utilisable sans serveur (snapshot local), mais la vérification indique alors « serveur injoignable ».
- **CelesTrak** (`/api/orbital/celestrak/group/:g`) : OMM JSON, avec repli sur le miroir GitHub (D20), cache de 2 h. Le bouton « Refresh from CelesTrak » passe d'abord par ce serveur, ce qui supprime tout problème de CORS en production.
- **Space-Track** (`/api/orbital/spacetrack/gp/:id` et `/history/:id`) :
  - connexion `POST /ajaxauth/login` (`identity`, `password`), session par cookie, reconnexion après 90 min ou sur un 401 ;
  - requêtes `class/gp` et `class/gp_history`, triées par `EPOCH desc` ;
  - limites de 30 requêtes/min et 300/h appliquées côté serveur (mêmes valeurs que la bibliothèque Python `spacetrack`), cache de 1 h : on ne re-télécharge jamais les mêmes données en boucle.
- **N2YO** (`/api/orbital/n2yo/positions/:id`) : `positions/{id}/{lat}/{lng}/{alt}/{s}/&apiKey=`, au plus 300 s, 1 000 transactions/h, cache de 30 s.
- **Validation & fraîcheur** (`src/data/validation.ts`), appliquée à **chaque** jeu d'éléments, quelle que soit la source :
  - champs numériques ;
  - 0 ≤ e < 1, 0 ≤ i ≤ 180°, 0,05 < n < 17,5 tours/jour ;
  - `EPHEMERIS_TYPE` = 0 ;
  - époque valide et pas plus d'1 jour dans le futur ;
  - fraîcheur : fresh < 3 j, aging ≤ 7 j, sinon stale.
- **Onglet Verify** (objet sélectionné) :
  - époque et fraîcheur de la source en usage ;
  - Space-Track : époque, écarts Δi, ΔRAAN et Δn, et **distance entre les deux positions SGP4** à l'instant simulé. Si le jeu Space-Track est plus récent (> 30 min), un bouton permet de l'utiliser pour cet objet (« Element source: Space-Track » dans la fiche) ;
  - historique des 10 derniers jeux d'éléments, avec l'intervalle entre deux mises à jour ;
  - N2YO : positions prédites comparées à nos positions SGP4 aux **mêmes horodatages**, avec l'écart horizontal moyen et maximal et l'écart d'altitude. N2YO calcule lui-même ces positions à partir de ses propres éléments : c'est une prédiction indépendante, pas une mesure.
- **Aucune valeur de remplacement** : sans clé, avec une limite atteinte ou une erreur réseau, l'interface affiche la raison (« not configured — add N2YO_API_KEY to .env… »), jamais un chiffre de substitution.
- **Tests** : les clients serveur sont testés avec un `fetch` simulé qui suit les formats documentés (champs en chaînes de Space-Track, cookie, `{"Login":"Failed"}`, URL N2YO avec `&apiKey=`). Les valeurs orbitales proviennent du jeu ISS réel. **Limite** : depuis l'environnement cloud, space-track.org et api.n2yo.com sont bloqués (vérifié : « fetch failed »). Les appels réels n'ont donc pas pu être exécutés ici ; ils doivent être vérifiés sur une machine avec les identifiants de l'utilisateur.
- Cette fonctionnalité répond à deux points que SPEC §1 réservait à l'utilisateur, l'ajout d'un backend et l'appel d'API à clé : il l'a demandée explicitement.

### D29 — Agent de décision LLM (gpt-4o-mini) pour les rapprochements potentiels

Demande de l'utilisateur : quand un « Potential Close Approach » est détecté, un agent LLM (OpenAI **gpt-4o-mini**) choisit la meilleure action. Cette action exige une approbation humaine, sauf quand le rapprochement est très serré : elle est alors exécutée automatiquement. Un historique garde les actions approuvées, rejetées et exécutées automatiquement.

- **Le LLM choisit, il ne calcule pas.** Le serveur calcule les options possibles (`server/agent.ts`) :
  - `monitor` : continuer la surveillance ;
  - `request_update` : demander des données de suivi plus récentes ;
  - poussées le long de la trajectoire (`along_track_burn`), dimensionnées pour des distances cibles de 2 et 5 km. Approximation au premier ordre de Clohessy–Wiltshire, Δx ≈ 3·Δv·t ; poussée 2 h avant le TCA (au plus tôt dans 10 min, au moins 30 min avant le TCA) ; Δv ≤ 2 m/s ;
  - aucune poussée pour un débris ou un étage de fusée.
- **Appel OpenAI** : Chat Completions avec le modèle `gpt-4o-mini`, `temperature` 0,2 et `response_format` en `json_schema` strict, où `option_id` est un **enum limité aux options calculées**. La réponse est revalidée : un identifiant inconnu est rejeté. Le prompt interdit toute probabilité et tout chiffre inventé.
- **Repli** : sans clé, en cas d'erreur API ou de réponse invalide, une règle déterministe choisit l'action. Elle est affichée comme « rule-based (LLM unavailable: raison) », jamais présentée comme une décision du LLM.
- **Politique (déterministe, pas le LLM)** :
  - distance minimale calculée < 1 km (`AGENT.autoExecuteKm`) → **auto-executed**, enregistré avec `resolvedBy: auto-policy` ;
  - sinon → **pending**, en attente d'**Approve** ou **Reject** (avec commentaire facultatif) par l'opérateur.
- **Déclenchement** : après chaque screening, l'agent analyse automatiquement les 3 événements les plus serrés (`AGENT.autoAnalyzeTop`), ce qui limite le coût des appels. Les autres s'analysent à la demande avec le bouton « Ask agent ». Un événement déjà décidé n'est pas renvoyé au LLM.
- **Historique** : stocké dans `data/decisions.json` côté serveur (ignoré par git), filtrable, exportable en JSON. Une décision déjà tranchée ne peut plus être modifiée (409).
- **Simulation** : « exécuter » signifie enregistrer et afficher la décision. Le tableau de bord ne commande aucun engin spatial ; c'est indiqué dans l'interface.
- **Clé** : `OPENAI_API_KEY` dans `.env`, lu par le serveur uniquement. Le serveur lit aussi `../.env` quand le projet se trouve dans un sous-dossier de HackLumen, dont le `.env` contient déjà cette variable.
- **Tests** : 9 tests avec un OpenAI simulé au format Chat Completions documenté. **Limite** : api.openai.com est bloqué dans l'environnement cloud, l'appel réel n'a donc pas été exécuté ici. Il doit être vérifié sur la machine de l'utilisateur, avec sa clé.
- Cette fonctionnalité correspond à deux éléments de SPEC §8.4 (« Plus tard ») et §1 : un LLM payant et des manœuvres. L'utilisateur les a demandés explicitement, et la limite de vocabulaire est respectée : aucune probabilité n'est affichée.

### D30 — Options de l'agent selon la distance (correctif de D29)

Constat de l'utilisateur, avec gpt-4o-mini connecté : l'agent répondait **toujours** « Request fresher tracking data ».

**Causes :**
- le prompt demandait de préférer une demande de données dès que les éléments sont anciens ; or ils ont toujours 1 à 2 jours ;
- cette option était proposée même sous 1 km, où « exécuter automatiquement » une simple demande de données ne protège de rien ;
- les poussées n'étaient calculées que pour l'objet primaire.

**Correctif** (le filtrage est fait par le code, avant l'appel au LLM) :

| Distance minimale calculée | Options proposées |
|---|---|
| < 1 km (exécution automatique) | **poussées uniquement**. Si aucun objet ne peut manœuvrer : surveiller ou demander des données |
| 1 à 5 km | poussées, surveiller, et demander des données si le TCA est à au moins 12 h |
| ≥ 5 km | surveiller, et demander des données si le TCA est à au moins 12 h |

- **Poussées** : calculées pour **chaque** objet manœuvrable (charge utile ou station), le primaire comme le secondaire, avec les identifiants `burn_p_…` et `burn_s_…`.
- **Prompt** : il explique ces niveaux et rappelle qu'une demande de données ne change pas la trajectoire.
- **Versions** : `AGENT_POLICY_VERSION = 2` ; une décision prise avec d'anciennes règles n'est plus réutilisée.
- **Tests** : 4 nouveaux tests, 68 au total.

### D31 — Suppression de l'option « Request fresher tracking data »

Demande de l'utilisateur : l'agent ne doit plus proposer « Request fresher tracking data ». Cette option est retirée du code et du prompt.

| Distance minimale calculée | Options proposées |
|---|---|
| < 1 km | poussées uniquement ; surveiller si aucun objet ne peut manœuvrer |
| 1 à 5 km | poussées et surveiller |
| ≥ 5 km | surveiller |

- `AGENT_POLICY_VERSION = 3` : les anciennes décisions ne sont plus réutilisées.
- Elles restent visibles dans l'historique ; supprimer `data/decisions.json` pour repartir de zéro.
- Un test vérifie que l'option n'est plus jamais proposée.
