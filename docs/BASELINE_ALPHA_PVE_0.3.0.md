# Alpha PvE 0.3.0 Baseline

- Code commit: `417ede007c9627fb0262cf18bf7b1c2af3ac3380`
- Annotated tag: `alpha-pve-0.3.0-baseline`
- Purpose: rollback/reference point before the 4×8 production-rules migration
- Verified in an isolated GitHub Actions worktree on 2026-08-05
- Verification sequence: `pnpm install --frozen-lockfile`, `pnpm --filter @auto-battler/game-core build`, then `pnpm run check`
- Fresh focused evidence: 100 game-core tests and 142 server tests passed; TypeScript typechecks passed after the required workspace dependency build
- The baseline tag preserves the code state before the production branch CI/bootstrap fixes
- This tag does not claim Godot CI health, physical-device performance, online readiness, or Google Play readiness

The original root `pnpm run check` command did not build the workspace dependency
before server typechecking. Baseline verification therefore builds
`@auto-battler/game-core` first without modifying the tagged source. The Gate 0
branch fixes this CI precondition separately.
