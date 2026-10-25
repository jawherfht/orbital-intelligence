# PROGRESS — Orbital Intelligence

Légende : ✅ fait · 🟡 en cours · ⬜ à faire · ⚠️ en attente d'une décision

## Phase 0 — Cadrage ✅ (2026-10-25)
- ✅ SPEC.md lu en entier et copié à la racine
- ✅ Questions de cadrage tranchées (DECISIONS D1–D13)
- ✅ PROGRESS.md et DECISIONS.md créés

## Phase 1 — Socle ✅ (2026-10-25)
- ✅ Vite + React + TypeScript strict + Tailwind + R3F + drei + zustand + vitest + satellite.js
- ✅ API satellite.js 7.1.0 vérifiée (D14), modèle de repère ECI + rotation GMST (D15)
- ✅ Terre jour/nuit selon le Soleil réel, lumières des villes, atmosphère, étoiles, OrbitControls
- ✅ Mode debug : FPS, marqueurs d'alignement de texture
- ⚠️ Provenance des textures à confirmer (D10)

## Phase 2 — Données et moteur orbital ✅ (2026-10-25)
- ✅ `scripts/fetch-snapshots.ts` (`npm run data:update`) : CelesTrak OMM JSON, puis miroir GitHub de CelesTrak (D20), garde de 2 h, `--force`
- ✅ Snapshots réels dans `public/data/` : 7 groupes, 1 365 objets (Starlink échantillonné à 400)
- ✅ Client : snapshot local → refresh live (CelesTrak → proxy dev → miroir), cache IndexedDB de 2 h, indicateur de source
- ✅ Parsing OMM → `SatelliteRecord`, catégorie déduite (D12), dédoublonnage, objets en erreur SGP4 ignorés et comptés
- ✅ `propagate.ts`, `derived.ts`, `orbitPath.ts`
- ✅ Tests : ISS (≈ 417 km, 93,0 min), GEO ≈ 1 436 min, HEO/MEO, erreur SGP4 ignorée, conversion TLE → OMM exacte, recherche

## Phase 3 — Visualisation et interaction (MVP) ✅ (2026-10-25)
- ✅ M1 Terre 3D (phase 1) + essaim en un seul draw call (D21)
- ✅ M2 snapshot < 2 s, refresh live, indicateur de source et de date, « N objects skipped »
- ✅ M3 Web Worker de propagation à 4 Hz + interpolation d'Hermite (< 0,1 km à x600, D11)
- ✅ M4 recherche par nom ou NORAD, navigation clavier, message si aucun résultat
- ✅ M5 fiche complète : époque des données, âge, validité
- ✅ M6 trajectoire (passé en trait plein qui s'estompe, futur en pointillés, D23) + trace au sol en option
- ✅ M7 Live / Pause / x1 x10 x60 x600 / curseur −6 h…+72 h / UTC / avertissement d'époque
- ✅ Survol (infobulle), clic (sélection + caméra qui se recentre), filtres de catégories et de groupes, orbite affichée ou masquée
- ✅ Vérification de bout en bout dans Chromium headless (captures d'écran desktop et mobile)

## Phase 4 — Proximity Screening + Timeline ✅ (2026-10-25)
- ✅ Worker de screening : pré-filtre apogée/périgée, balayage à 30 s avec garde, section dorée, annulation, barre de progression
- ✅ Ensembles limités : objet sélectionné face à ≤ 500 objets, ou groupe contre lui-même (≤ 300)
- ✅ Paires co-localisées (modules amarrés) exclues et comptées (D24)
- ✅ Cartes « Potential Close Approach — Requires Verification » avec distance, TCA, vitesse relative, âge des données, lien « Why does this need verification? »
- ✅ Frise chronologique, saut au TCA, arcs en ambre, graphe distance/temps
- ✅ Test : orbites synthétiques, TCA à ± 2 s, accord avec un balayage de 50 ms (D25)
- ✅ Scénario simulé avec bandeau permanent (D9)

## Phase 5 — Finition et démo ✅ (2026-10-25)
- ✅ Panneau Explain déterministe, badges Computed / Reference, interface `ExplanationProvider` (sans LLM)
- ✅ Modal « Methods & Limitations »
- ✅ Mode démo en un clic, hors ligne (D26)
- ✅ Responsive : tiroirs sous 900 px, aucun défilement horizontal à 390 px ; panneaux repliables sur desktop
- ✅ `README.md`, `docs/METHODOLOGY.md`, `DECISIONS.md` à jour

## Sources multiples — CelesTrak + Space-Track + N2YO ✅ (2026-10-25, D28)
- ✅ Serveur local sans dépendance (`server/`) : secrets dans `.env`, proxy CelesTrak (repli sur le miroir), Space-Track (connexion, gp, gp_history), N2YO (positions)
- ✅ Limites de débit et caches : Space-Track 30/min, 300/h, 1 h ; N2YO 1 000/h, 30 s ; CelesTrak 2 h
- ✅ Validation & fraîcheur appliquées à chaque jeu d'éléments, quelle que soit la source
- ✅ Onglet Verify : comparaison CelesTrak ↔ Space-Track, historique, bascule vers un jeu plus récent, comparaison des positions N2YO ↔ SGP4
- ✅ `npm run dev` lance le serveur et Vite ensemble ; `npm start` sert le build de production
- ✅ 55 tests (clients serveur avec `fetch` simulé, validation, comparaisons)
- ⚠️ Appels réels à Space-Track et N2YO à vérifier avec les identifiants de l'utilisateur (domaines bloqués dans l'environnement cloud)

## Définition de « terminé » (SPEC §11)
- ✅ `npm install && npm run dev` démarre sans erreur
- ✅ `npm run build` et `npm test` passent (55 tests), sans erreur TypeScript
- ✅ M1 à M7 respectent leurs critères
- ✅ Vocabulaire interdit absent (test automatique sur `en.ts` et sur tout `src/`)
- ✅ Fonctionne hors ligne avec les snapshots
- ⚠️ ≥ 50 FPS avec 1 000 objets : à mesurer sur une machine équipée d'un GPU (D27)
- ✅ `OrbitalIntelligenceModule` exportable et documenté

## Reste à faire / pistes
- Confirmer la provenance des textures (D10) ou les remplacer par les fichiers NASA officiels
- Lancer `npm run data:update --force` sur une machine qui atteint CelesTrak pour obtenir l'OMM natif et le groupe `gnss`
- Plus tard (hors périmètre) : Maneuver Optimizer, probabilités/covariance, CDM, historique côté serveur
