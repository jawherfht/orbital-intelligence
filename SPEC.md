# PROMPT CLAUDE CODE — Orbital Intelligence : Satellite Tracking & Proximity Monitoring

> Copiez l'intégralité de ce document dans Claude Code, à la racine d'un dossier vide (ou du dépôt de votre plateforme).

---

## 0. TON RÔLE ET TA FAÇON DE TRAVAILLER

Tu es un ingénieur full-stack senior spécialisé en visualisation 3D WebGL (Three.js / React Three Fiber) et en mécanique orbitale appliquée (SGP4, repères ECI/ECEF/géodésique). Tu construis un **module indépendant** d'une plateforme de hackathon. Ce module doit être :

- **scientifiquement honnête** : il ne prétend jamais à une précision qu'il n'a pas ;
- **visuellement convaincant** : style « centre de contrôle spatial », sombre et élégant ;
- **démontrable en 3 minutes devant un jury**, y compris **sans connexion Internet** ;
- **intégrable** plus tard dans la plateforme principale (composant React autonome et exportable).

### Règles de travail impératives

1. **Avance par phases** (section 9). À la fin de chaque phase : le projet compile, les tests passent, tu mets à jour `PROGRESS.md` et tu me fais un résumé court (ce qui est fait, ce qui reste, comment tester).
2. **Ne t'arrête jamais en silence.** Si tu es bloqué, applique le protocole de la section 1.
3. **Vérifie avant d'affirmer.** Pour toute API de bibliothèque (surtout `satellite.js`), lis la documentation installée dans `node_modules` (README, fichiers `.d.ts`) avant de l'utiliser. N'invente aucune fonction.
4. **Commits git fréquents** et atomiques, avec des messages clairs (`feat:`, `fix:`, `docs:`, `test:`).
5. **Pas de sur-ingénierie.** Pas de microservices, pas de multi-agents, pas de base de données, pas de Machine Learning dans le MVP.
6. **Tout le code est en TypeScript strict** (`"strict": true`), sans `any` sauf justification en commentaire.

---

## 1. PROTOCOLE QUAND TU ES BLOQUÉ (TRÈS IMPORTANT)

Tu es « bloqué » quand une décision change significativement le résultat et que ce document ne la tranche pas, ou quand une contrainte technique empêche d'avancer (CORS, API qui a changé, dépendance cassée, résultat de calcul incohérent).

**Quand cela arrive :**

1. **Arrête-toi et pose-moi la question** avec ce format exact :

```
🛑 BLOCAGE — [titre court]
Contexte : [1 à 3 phrases : ce que tu faisais, ce qui bloque]
Ce que j'ai déjà essayé : [liste courte]
Options :
  A) [option] — avantages / inconvénients
  B) [option] — avantages / inconvénients
  C) [option] — (si pertinent)
✅ Ma recommandation : [A/B/C] parce que [raison]
En attendant ta réponse, je continue sur : [tâche non bloquée]
```

2. **Pose au maximum 3 questions à la fois**, regroupées.
3. **Continue sur une tâche non bloquée** pendant l'attente, si elle existe. Sinon, attends ma réponse.
4. **Consigne chaque décision** (question, réponse, date) dans `DECISIONS.md`.
5. Après ma réponse, **reprends exactement là où tu t'étais arrêté**, sans recommencer le travail déjà fait.

**Décisions sur lesquelles tu DOIS me demander :**
- ajouter un backend (FastAPI ou Node) au lieu d'un fonctionnement 100 % frontend ;
- intégrer le module dans un dépôt existant ou modifier du code hors du dossier du module ;
- dépasser 2 000 objets affichés simultanément ;
- ajouter une dépendance lourde non listée en section 3 (> 500 Ko gzip) ;
- toute fonctionnalité qui afficherait une « probabilité de collision » ;
- appeler une API payante ou nécessitant une clé (LLM, Space-Track, etc.) ;
- changer la langue de l'interface (voir section 2.4).

**Décisions que tu prends seul (sans me demander), en les notant dans `DECISIONS.md` :**
- noms de fichiers, structure interne des composants, refactorisations locales ;
- choix de couleurs et d'espacements dans le cadre de la charte (section 7) ;
- valeurs par défaut raisonnables (pas de temps, seuils) documentées dans `src/config.ts` ;
- correction des bugs et des avertissements TypeScript ou ESLint.

---

## 2. CONTEXTE DU PROJET

### 2.1 Objectif

Permettre à un utilisateur de :
- **visualiser** les satellites en orbite terrestre sur un globe 3D interactif ;
- **rechercher** un satellite par nom ou par identifiant NORAD ;
- **explorer** sa trajectoire calculée (passée récente et future) ;
- **consulter** sa fiche technique (altitude estimée, inclinaison, vitesse, période, date des données) ;
- **(optionnel) repérer des rapprochements potentiels** entre objets d'un ensemble limité, présentés comme des événements **qui méritent une vérification**, jamais comme des collisions certaines.

### 2.2 Ce que ce module N'EST PAS

- Ce n'est **pas** un système de gestion du trafic spatial.
- Il ne calcule **pas** de probabilité de collision. Les éléments orbitaux publics (TLE/OMM) ne contiennent pas d'information de covariance. Les agences comme l'ESA utilisent des données d'incertitude et des messages de conjonction (CDM) pour évaluer un risque.
- Il ne fournit **pas** de positions mesurées en temps réel. Il **estime** des positions à partir d'éléments orbitaux datés, propagés avec SGP4. La précision se dégrade avec l'écart entre l'époque des données et l'instant calculé (typiquement de l'ordre du kilomètre à l'époque, puis davantage au fil des jours).

### 2.3 Règle de vocabulaire OBLIGATOIRE

| ❌ Interdit | ✅ À utiliser |
|---|---|
| « HIGH COLLISION RISK » | « Potential Close Approach — Requires Verification » |
| « Collision probability » | « Minimum computed distance » |
| « Real-time position » | « Estimated position (SGP4) » |
| « Collision predicted » | « Close approach flagged for review » |

Chaque alerte de rapprochement affiche obligatoirement :
- la **distance minimale calculée** (km) ;
- le **TCA** (Time of Closest Approach, en UTC) ;
- la **vitesse relative** (km/s) ;
- l'**âge des données** des deux objets (écart entre l'époque OMM et le TCA) ;
- un lien « Pourquoi une vérification ? » qui ouvre une explication des limites.

### 2.4 Langue

Langue par défaut de l'interface : **anglais** pour les libellés techniques (comme sur la maquette), avec textes explicatifs en anglais. Toutes les chaînes doivent passer par un fichier `src/i18n/en.ts` pour permettre d'ajouter le français plus tard. **Demande-moi en phase 0** si je préfère le français ou une interface bilingue.

---

## 3. STACK TECHNIQUE (À RESPECTER)

| Composant | Technologie | Rôle |
|---|---|---|
| Build | **Vite** + **React 18+** + **TypeScript** | Application frontend |
| 3D | **three**, **@react-three/fiber**, **@react-three/drei** | Globe, satellites, orbites |
| Calcul orbital | **satellite.js** (dernière version stable) | Parsing OMM/TLE, propagation SGP4, transformations de repères |
| État global | **zustand** | Catalogue, sélection, temps de simulation |
| Styles | **Tailwind CSS** | Interface des panneaux |
| Graphiques | **recharts** (ou équivalent léger) | Courbe de distance, timeline |
| Tests | **vitest** | Tests unitaires du moteur orbital et du screening |
| Calcul lourd | **Web Worker** natif (Vite `?worker`) | Propagation de masse et screening hors du thread principal |
| Backend | **Aucun dans le MVP** (voir section 1 si nécessaire) | — |

**Avant d'écrire le moteur orbital**, ouvre `node_modules/satellite.js/README.md` et les types `.d.ts` pour confirmer :
- la fonction de création d'un `satrec` à partir d'un objet **OMM JSON** (selon la version : `json2satrec` ou équivalent). Si elle n'existe pas dans la version installée, convertis l'OMM en TLE ou utilise la fonction documentée, et note ce choix dans `DECISIONS.md` ;
- `propagate`, `gstime`, `eciToEcf`, `eciToGeodetic`, `degreesLat`, `degreesLong` (ou leurs équivalents actuels) ;
- la gestion des erreurs de propagation (retour `false`/`null` ou `satrec.error` non nul pour les objets décroissants) : ces objets doivent être ignorés proprement.

---

## 4. DONNÉES — CELESTRAK

### 4.1 Source

Documentation officielle des formats : https://celestrak.org/NORAD/documentation/gp-data-formats.php

Endpoints à utiliser (format OMM JSON) :
- un objet : `https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=JSON` (ISS) ;
- un groupe : `https://celestrak.org/NORAD/elements/gp.php?GROUP=<groupe>&FORMAT=JSON`.

Groupes conseillés pour la démo (à valider dans la doc CelesTrak) : `stations`, `visual`, `active` (gros volume, à filtrer), `starlink` (à échantillonner), `weather`, `resource`, `gnss`.

### 4.2 Contraintes à respecter

- **Respecte les règles d'usage de CelesTrak** : les données GP ne changent pas plus d'une fois toutes les quelques heures. Ne télécharge **jamais** le même groupe en boucle. Mets en place un cache (voir 4.3).
- **CORS** : vérifie si un `fetch` direct depuis le navigateur fonctionne. Sinon, utilise le **proxy de développement Vite** (`server.proxy`) pour le développement, et les snapshots locaux pour la démo. Ne contourne rien d'autre ; si ni l'un ni l'autre ne suffit, applique le protocole de blocage.

### 4.3 Stratégie de données (obligatoire pour une démo fiable)

1. Script `scripts/fetch-snapshots.ts` (exécuté via `npm run data:update`) qui télécharge les groupes choisis et les enregistre dans `public/data/<groupe>.json`, avec un fichier `public/data/manifest.json` contenant la date de téléchargement.
2. Au démarrage, l'application :
   - charge d'abord le **snapshot local** (affichage immédiat, fonctionne hors ligne) ;
   - propose un bouton **« Refresh from CelesTrak »** qui tente un rechargement live, mis en cache dans `localStorage`/IndexedDB avec horodatage (avec `try/catch`), et ne refait pas l'appel si le cache a moins de 2 heures.
3. Indicateur visible dans l'interface : **« Data source: snapshot of [date] »** ou **« Data source: CelesTrak live, fetched [heure] »**.

### 4.4 Modèle de données interne

```ts
// src/types/orbital.ts
export interface SatelliteRecord {
  noradId: number;
  name: string;
  intlDesignator?: string;      // OBJECT_ID
  epoch: Date;                  // EPOCH de l'OMM
  inclinationDeg: number;
  eccentricity: number;
  meanMotionRevPerDay: number;
  raanDeg: number;
  argPerigeeDeg: number;
  meanAnomalyDeg: number;
  bstar: number;
  group: string;                // groupe CelesTrak d'origine
  category: 'station' | 'payload' | 'debris' | 'rocket_body' | 'unknown';
  satrec: unknown;              // typé selon satellite.js
}

export interface StateVector {
  time: Date;
  positionEciKm: [number, number, number];
  velocityEciKmS: [number, number, number];
  latDeg: number;
  lonDeg: number;
  altKm: number;
  speedKmS: number;
}
```

Valeurs dérivées à calculer et afficher : **période** (min) = 1440 / moyen mouvement ; **demi-grand axe** via la 3ᵉ loi de Kepler (μ = 398 600,4418 km³/s²) ; **apogée/périgée** (km au-dessus de R⊕ = 6 378,137 km) ; **type d'orbite** (LEO < 2 000 km, MEO, GEO ≈ 35 786 km, HEO si e > 0,25).

---

## 5. ARCHITECTURE DU CODE

```
orbital-intelligence/
├── public/
│   ├── data/                    # snapshots OMM + manifest.json
│   └── textures/                # earth_day, earth_night, clouds, normal, specular (libres de droits)
├── scripts/
│   └── fetch-snapshots.ts
├── src/
│   ├── config.ts                # TOUS les paramètres réglables (seuils, pas de temps, limites)
│   ├── types/orbital.ts
│   ├── i18n/en.ts
│   ├── data/
│   │   ├── celestrakClient.ts   # fetch + cache + fallback snapshot
│   │   └── catalog.ts           # parsing OMM → SatelliteRecord, catégorisation
│   ├── orbital/
│   │   ├── propagate.ts         # wrappers satellite.js, gestion des erreurs
│   │   ├── frames.ts            # ECI → ECEF → coordonnées scène Three.js
│   │   ├── orbitPath.ts         # échantillonnage d'une trajectoire
│   │   ├── derived.ts           # période, apogée, périgée, type d'orbite
│   │   └── __tests__/
│   ├── screening/
│   │   ├── prefilter.ts         # filtre apogée/périgée
│   │   ├── closeApproach.ts     # recherche grossière + raffinement
│   │   ├── screening.worker.ts
│   │   └── __tests__/
│   ├── store/
│   │   ├── simulationClock.ts   # temps simulé, vitesse x1…x1000, pause
│   │   └── useOrbitalStore.ts
│   ├── scene/
│   │   ├── OrbitalScene.tsx     # <Canvas>, caméra, contrôles, lumières
│   │   ├── Earth.tsx            # sphère texturée, rotation selon GMST, atmosphère
│   │   ├── Starfield.tsx
│   │   ├── SatelliteSwarm.tsx   # InstancedMesh pour tous les objets
│   │   ├── SelectedSatellite.tsx
│   │   ├── OrbitTrail.tsx       # ligne de trajectoire (passé estompé, futur pointillé)
│   │   └── CloseApproachMarker.tsx
│   ├── ui/
│   │   ├── TopBar.tsx           # titre, source de données, horloge UTC simulée
│   │   ├── SearchPanel.tsx
│   │   ├── SatelliteInfoPanel.tsx
│   │   ├── TimeControls.tsx
│   │   ├── LayerFilters.tsx
│   │   ├── ProximityPanel.tsx
│   │   ├── EventTimeline.tsx
│   │   ├── DistanceChart.tsx
│   │   ├── LimitationsModal.tsx # « Pourquoi une vérification ? »
│   │   └── ExplainPanel.tsx     # explications déterministes (section 8.3)
│   ├── OrbitalIntelligenceModule.tsx  # composant racine EXPORTABLE
│   └── main.tsx                 # app de démonstration autonome
├── docs/
│   └── METHODOLOGY.md
├── README.md
├── PROGRESS.md
└── DECISIONS.md
```

**Point d'intégration :** `OrbitalIntelligenceModule` doit pouvoir être monté dans n'importe quelle application React avec des props simples :

```ts
interface OrbitalIntelligenceModuleProps {
  initialGroups?: string[];          // ex. ['stations', 'visual']
  initialSelectedNoradId?: number;   // ex. 25544
  enableProximityScreening?: boolean;
  height?: string | number;
  onSatelliteSelect?: (noradId: number) => void;
}
```

---

## 6. EXIGENCES TECHNIQUES DÉTAILLÉES

### 6.1 Repères et échelle (source fréquente de bugs : sois rigoureux)

- Unité de scène : **1 unité = 1 rayon terrestre** (6 378,137 km), pour éviter les problèmes de précision flottante.
- Choisis **un seul** des deux modèles suivants et documente-le dans `frames.ts` :
  - **Option recommandée** : les satellites sont placés en **ECI**, et la Terre **tourne** de l'angle GMST (`gstime`) autour de son axe ;
  - ou : les satellites sont placés en **ECEF** et la Terre est fixe.
- Conversion d'axes : ECI/ECEF a Z vers le pôle Nord, alors que Three.js a Y vers le haut. Mapping : `scene.x = eci.x`, `scene.y = eci.z`, `scene.z = -eci.y`. Vérifie le sens par un test.
- **Test de validation obligatoire** : à un instant donné, la position géodésique (lat/lon) de l'ISS calculée doit tomber sur le bon point de la texture de la Terre. Ajoute un mode debug affichant un marqueur lat/lon (0°,0°) et (36,8°N, 10,2°E) pour vérifier l'alignement de la texture.

### 6.2 Performance

- **InstancedMesh** pour l'essaim de satellites (un seul draw call). Couleur par instance selon la catégorie.
- Propagation de tous les objets dans un **Web Worker** à fréquence réduite (ex. 2 à 5 Hz), puis interpolation linéaire côté rendu à 60 FPS.
- Trajectoire : seulement pour l'objet sélectionné (± 1 orbite, ~180 points).
- Objectif : **≥ 50 FPS avec 1 000 objets** sur un portable standard. Affiche un compteur FPS en mode debug.
- Limite par défaut : `MAX_RENDERED_OBJECTS = 1500` dans `config.ts`.

### 6.3 Horloge de simulation

- Temps simulé indépendant du temps réel : boutons **Live**, **Pause**, vitesses **x1, x10, x60, x600**, et un **curseur temporel** de −6 h à +72 h.
- Toujours afficher l'heure simulée en **UTC**.
- Si l'écart entre l'époque des données et le temps simulé dépasse 7 jours, afficher l'avertissement : « Propagation far from data epoch — accuracy degraded ».

### 6.4 Interaction

- Survol d'un satellite → infobulle (nom, NORAD, altitude).
- Clic → sélection, panneau d'information, trajectoire, caméra qui se recentre en douceur.
- Recherche : par nom (insensible à la casse, partiel) ou par numéro NORAD exact ; navigation clavier dans les résultats.
- Filtres par catégorie et par groupe ; option « orbits visible / hidden ».

---

## 7. DESIGN VISUEL

**Style de référence :** interface de centre de contrôle spatial. Fond noir profond avec champ d'étoiles, Terre réaliste éclairée (côté nuit avec lumières des villes), panneaux translucides flottant aux quatre coins, accents néon.

- **Palette** (tokens CSS dans `:root`) :
  - fond `#05070d`, panneaux `rgba(10, 16, 32, 0.72)` avec `backdrop-filter: blur(12px)`, bordure `rgba(120, 160, 255, 0.18)` ;
  - texte principal `#e6edf7`, secondaire `#8a9bb8` ;
  - accent cyan `#38bdf8` (sélection), vert `#22c55e` (actif), ambre `#f59e0b` (rapprochement à vérifier), rouge `#ef4444` **réservé** aux distances < seuil serré, toujours accompagné de la mention « Requires Verification ».
- **Typographie** : `Inter` pour l'interface, `JetBrains Mono` pour les valeurs numériques (Google Fonts).
- **Terre** : textures jour/nuit mélangées selon la direction du Soleil (shader simple), couche de nuages légèrement animée, halo atmosphérique (fresnel). Utilise uniquement des textures libres de droits (ex. NASA Blue Marble / Black Marble, domaine public) et cite la source dans le README.
- **Satellites** : petits points lumineux (sprites additifs) ; l'objet sélectionné a un halo pulsant.
- **Trajectoires** : passé en trait continu qui s'estompe, futur en pointillés ; arc de rapprochement en ambre.
- **Disposition (desktop)** :
  - haut : barre (titre « ORBITAL INTELLIGENCE », source des données, horloge UTC) ;
  - haut gauche : *Proximity Monitoring* (liste des événements + mini-graphe de distance) ;
  - haut droit : *Satellites* (recherche + liste + fiche) ;
  - bas : contrôles du temps et timeline des événements ;
  - bas droit : filtres de couches.
- **Responsive** : sur écran étroit (< 900 px), les panneaux deviennent des tiroirs repliables ; la scène reste plein écran.
- **Micro-animations** : transitions de 200 à 300 ms, aucun effet qui gêne la lecture des chiffres.

> Si j'ai fourni une maquette réalisée avec Claude Design, **respecte-la en priorité** sur cette section et signale-moi les écarts.

---

## 8. FONCTIONNALITÉS ET CRITÈRES D'ACCEPTATION

### 8.1 MVP (obligatoire)

| # | Fonctionnalité | Critères d'acceptation |
|---|---|---|
| M1 | **Earth 3D Viewer** | Terre texturée qui tourne selon le GMST ; zoom/rotation fluides (OrbitControls avec limites) ; champ d'étoiles ; ≥ 50 FPS. |
| M2 | **Chargement des données** | Snapshot local chargé en < 2 s ; bouton refresh live avec cache de 2 h ; indicateur de source et de date ; objets en erreur SGP4 ignorés et comptés (« 3 objects skipped »). |
| M3 | **Propagation et animation** | Positions mises à jour selon l'horloge simulée ; ISS à une altitude plausible (≈ 400–430 km) et période ≈ 92–93 min. |
| M4 | **Satellite Search** | Recherche par nom et NORAD ; sélection depuis les résultats ; message clair si aucun résultat. |
| M5 | **Satellite Information** | Nom, NORAD, désignateur international, catégorie, altitude estimée, latitude/longitude, vitesse, inclinaison, excentricité, période, apogée/périgée, type d'orbite, **époque des données et âge (« Data epoch: … (2.3 days old) »)**. |
| M6 | **Orbit Prediction** | Trajectoire sur ± 1 période pour l'objet sélectionné ; trace au sol (ground track) optionnelle sur le globe ; mise à jour quand le temps change. |
| M7 | **Contrôles du temps** | Live / Pause / vitesses / curseur ; horloge UTC ; avertissement si propagation éloignée de l'époque. |

### 8.2 Optionnel (après validation du MVP)

**O1 — Proximity Screening** (dans le Web Worker)

Algorithme à implémenter et à documenter dans `docs/METHODOLOGY.md` :

1. **Ensemble limité** : l'objet sélectionné face à N objets (par défaut N ≤ 500), ou un groupe choisi contre lui-même (≤ 300 objets).
2. **Pré-filtre apogée/périgée** : on écarte les paires dont les plages d'altitude ne se chevauchent pas, avec une marge (ex. 10 km).
3. **Recherche grossière** : propagation sur une fenêtre (par défaut 24 h, max 72 h) avec un pas de 30 à 60 s ; distance euclidienne en ECI ; repérage des minima locaux.
4. **Raffinement** : autour de chaque minimum, recherche par section dorée (ou pas de 1 s) pour obtenir le **TCA** et la **distance minimale**.
5. **Seuil** : un événement est retenu si la distance minimale < `CLOSE_APPROACH_THRESHOLD_KM` (par défaut **10 km**, réglable dans l'interface entre 1 et 50 km).
6. **Sortie** pour chaque événement : paire d'objets, TCA (UTC), distance minimale (km), vitesse relative (km/s), âge des données des deux objets.
7. Barre de progression et possibilité d'annuler le calcul.
8. **Libellé** : « Potential Close Approach — Requires Verification » (section 2.3). Jamais de probabilité.

Attention : un pas grossier trop grand peut manquer des rapprochements rapides (vitesses relatives jusqu'à ~15 km/s en LEO). Documente cette limite et justifie le pas choisi.

**O2 — Event Timeline**
Frise chronologique des événements sur la fenêtre de calcul ; un clic sur un événement déplace l'horloge au TCA, centre la caméra sur la paire, trace les deux trajectoires et affiche un **graphe distance/temps** autour du TCA.

**O3 — Panneau d'explications** (section 8.3).

### 8.3 Explications (sans LLM dans le MVP)

Un panneau **« Explain »** fournit des textes **déterministes** générés à partir des données calculées, par exemple :

> « ISS (ZARYA) is in low Earth orbit at about 418 km altitude, with an inclination of 51.6°. Its position is estimated with the SGP4 model from orbital elements dated 1.4 days ago. Expected accuracy: roughly a few kilometres. »

Plus une page **« Methods & Limitations »** qui explique : ce qu'est un OMM/TLE, ce qu'est SGP4, pourquoi la précision se dégrade avec le temps, la différence entre **distance minimale** et **probabilité de collision**, et le rôle des données d'incertitude et des messages de conjonction utilisés par les opérateurs et agences (référence : page ESA « Collision avoidance »).

Les explications doivent toujours **distinguer clairement** les **valeurs calculées** (badge « Computed ») des **textes explicatifs génériques** (badge « Reference »).

**Assistant IA conversationnel (RAG)** : **hors MVP**. Prévois seulement une interface `ExplanationProvider` permettant de brancher un LLM plus tard. Ne l'implémente pas sans mon accord (section 1).

### 8.4 Plus tard (NE PAS IMPLÉMENTER)

- Maneuver Optimizer (simulation et optimisation de manœuvres d'évitement).
- Probabilités de collision, covariance, ingestion de CDM.
- Historique persistant côté serveur.

---

## 9. PLAN DE DÉVELOPPEMENT PAR PHASES

À la fin de chaque phase : `npm run build` et `npm test` passent, `PROGRESS.md` est à jour, un commit est fait, et tu m'envoies un résumé.

**Phase 0 — Cadrage (court)**
- Lis entièrement ce prompt. Pose-moi en une seule fois les questions de cadrage restantes (maximum 3), dont la langue de l'interface et l'intégration éventuelle dans un dépôt existant.
- Crée `PROGRESS.md` (checklist de toutes les phases) et `DECISIONS.md`.

**Phase 1 — Socle**
- Initialisation Vite + React + TS + Tailwind + R3F + drei + zustand + vitest + satellite.js.
- Lecture de la doc satellite.js installée ; note des fonctions confirmées dans `DECISIONS.md`.
- Scène : Terre texturée qui tourne, étoiles, contrôles de caméra.

**Phase 2 — Données et moteur orbital**
- `fetch-snapshots.ts`, snapshots dans `public/data/`, client avec cache et fallback.
- Parsing OMM → `SatelliteRecord`, propagation, repères, grandeurs dérivées.
- **Tests unitaires** : altitude et période de l'ISS plausibles ; conversion d'axes ; objet en erreur SGP4 ignoré ; période d'un GEO ≈ 1 436 min.

**Phase 3 — Visualisation et interaction (fin du MVP)**
- Essaim InstancedMesh + Web Worker de propagation + interpolation.
- Sélection, recherche, fiche, trajectoire, horloge de simulation.
- Vérification d'alignement de la texture (marqueurs de debug).
- **Point de contrôle : je valide le MVP avant les fonctionnalités optionnelles.**

**Phase 4 — Proximity Screening + Timeline (optionnel)**
- Worker de screening, panneau, timeline, graphe de distance, modal des limites.
- Tests : deux orbites synthétiques construites pour se croiser doivent produire un événement avec le bon TCA (à ± 2 s près).

**Phase 5 — Finition et démo**
- Explications déterministes, page *Methods & Limitations*, polish visuel, responsive.
- `README.md` : installation, commandes, mise à jour des données, crédits des textures et des données (CelesTrak), limites.
- `docs/METHODOLOGY.md` complet.
- Mode **« Demo »** (section 10).

---

## 10. SCÉNARIO DE DÉMO (À RENDRE POSSIBLE EN UN CLIC)

Bouton **« Start demo »** qui enchaîne automatiquement, avec des légendes à l'écran :

1. Vue d'ensemble : la Terre et ~1 000 objets en mouvement (accéléré x60).
2. Recherche « ISS » → sélection, zoom, fiche technique, trajectoire.
3. Avance rapide du temps → l'ISS se déplace le long de sa trajectoire prévue.
4. Lancement du screening sur un ensemble limité → apparition d'un événement « Potential Close Approach — Requires Verification ».
5. Clic sur l'événement → saut au TCA, graphe de distance, encart sur les limites.

Le mode démo doit fonctionner **entièrement hors ligne** avec les snapshots.

---

## 11. DÉFINITION DE « TERMINÉ »

- [ ] `npm install && npm run dev` démarre l'application sans erreur.
- [ ] `npm run build` et `npm test` passent, sans avertissement TypeScript.
- [ ] Toutes les fonctionnalités MVP M1 à M7 respectent leurs critères.
- [ ] Aucun texte de l'interface n'emploie le vocabulaire interdit (section 2.3) ; vérifie-le avec une recherche dans le code.
- [ ] L'application fonctionne hors ligne avec les snapshots.
- [ ] ≥ 50 FPS avec 1 000 objets.
- [ ] `OrbitalIntelligenceModule` est exportable et documenté.
- [ ] `README.md`, `docs/METHODOLOGY.md`, `PROGRESS.md` et `DECISIONS.md` sont à jour.

---

## 12. RÉFÉRENCES

- CelesTrak, formats de données GP : https://celestrak.org/NORAD/documentation/gp-data-formats.php
- satellite.js : https://github.com/shashwatak/satellite-js
- React Three Fiber : https://r3f.docs.pmnd.rs/
- ESA, Collision avoidance : https://www.esa.int/content/view/full/413425

**Commence maintenant par la Phase 0.**
