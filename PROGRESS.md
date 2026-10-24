# PROGRESS — Orbital Intelligence

Légende : ✅ fait · 🟡 en cours · ⬜ à faire · ⚠️ en attente d'une décision

## Phase 0 — Cadrage ✅ (2026-10-25)
- ✅ SPEC.md lu en entier et copié à la racine
- ✅ Questions de cadrage tranchées (DECISIONS D1–D13)
- ✅ PROGRESS.md et DECISIONS.md créés

## Phase 1 — Socle ✅ (2026-10-25)
- ✅ Vite + React + TypeScript strict + Tailwind + R3F + drei + zustand + vitest + satellite.js
- ✅ API satellite.js 7.1.0 vérifiée dans les `.d.ts` installés (DECISIONS D14)
- ✅ Terre texturée, tournant selon le GMST, éclairage jour/nuit selon la position réelle du Soleil
- ✅ Lumières des villes côté nuit, reflet sur les océans, halo atmosphérique
- ✅ Champ d'étoiles, OrbitControls avec limites de zoom
- ✅ Horloge de simulation (store) et heure UTC simulée dans la barre du haut
- ✅ Mode debug : compteur FPS + marqueurs d'alignement (0°/0° et Tunis) — alignement vérifié visuellement
- ✅ Polices intégrées au build (fonctionne hors ligne)
- ✅ Composant exportable `OrbitalIntelligenceModule`
- ✅ Tests : repères (axes, cohérence satellite.js, UV de texture), direction du Soleil, vocabulaire interdit
- ⚠️ Provenance des textures à confirmer (DECISIONS D10)
- ⚠️ FPS non mesurable ici (rendu logiciel sans GPU dans l'environnement cloud) : à vérifier sur une vraie machine

## Phase 2 — Données et moteur orbital ⬜
- ⬜ `scripts/fetch-snapshots.ts` + `npm run data:update` (CelesTrak bloqué dans le cloud → lancement sur la machine de l'utilisateur, D5)
- ⬜ Client de données : snapshot local, refresh live, cache IndexedDB 2 h, indicateur de source
- ⬜ Parsing OMM → `SatelliteRecord`, catégorie déduite
- ⬜ Propagation, grandeurs dérivées
- ⬜ Tests : ISS (altitude, période), GEO ≈ 1 436 min, objet en erreur ignoré

## Phase 3 — Visualisation et interaction (fin du MVP) ⬜
- ⬜ Essaim InstancedMesh + Web Worker + interpolation
- ⬜ Sélection, recherche, fiche, trajectoire
- ⬜ Contrôles du temps complets (Live, Pause, vitesses, curseur, avertissement d'époque)
- ⬜ **Point de contrôle : validation du MVP par l'utilisateur**

## Phase 4 — Proximity Screening + Timeline ⬜
## Phase 5 — Finition et démo ⬜
