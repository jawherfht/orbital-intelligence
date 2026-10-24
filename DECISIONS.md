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
