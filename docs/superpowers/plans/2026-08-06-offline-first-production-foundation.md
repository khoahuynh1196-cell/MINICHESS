# Offline-First Production Foundation Plan

## Goal
Build a stable, complete playable auto-battler foundation before online systems.

## Priority
1. Canonical rules and deterministic simulation.
2. Complete gameplay systems.
3. Godot architecture rebuild.
4. Combat presentation and asset pipeline.
5. Offline vertical slice.
6. Online layer after foundation.

## Rules Foundation

Create one source of truth:

rules/production/ruleset.json

Contains board, economy, shop, XP, level, items, Unique limits, rounds and combat timing.

## Game Core

Preserve deterministic simulation.

Required:
- snapshot input
- event timeline
- replay hash
- targeting
- movement
- skills
- traits
- items
- summons
- statuses
- death resolution

No UI logic in simulation.

## Gameplay Systems

Complete H01-H20 with data-driven:
- stats
- skills
- traits
- visual profiles
- animation keys
- VFX keys

Traits:
condition → trigger → effect → presentation.

Items:
stats → triggers → effects → visuals.

Unique Transformation requires gameplay, visual, animation, VFX, audio and tooltip.

## Godot Client

Rebuild into:

App
- Home
- Prepare
- Combat
- Reward
- Result

Client presents state only. Combat events drive visuals.

## Combat Presentation

Implement animation timeline, impact timing, projectiles, skills, damage numbers, statuses, death flow, camera rules and VFX pooling.

## Asset Pipeline

Every hero has:
- board visual
- portrait
- icon
- rig
- animations
- transformation

Remake heroes, monsters, UI, VFX and audio.

## Vertical Slice

Target:

Launch → Run → Buy → Build → Combat → Reward → Upgrade → Boss → Result → Replay

Requirements:
- 20 minute session
- Android playable
- no debug controls
- stable save/resume

## Deferred

Online, authentication, websocket, matchmaking, ranked, seasons, achievements, leaderboard and scaling are postponed until foundation quality gates pass.
