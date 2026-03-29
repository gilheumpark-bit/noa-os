# Changelog

## [1.1.0] - 2026-03-29

### Added
- **Verification-First Studio** (verification-studio.ts, 5-PART):
  - `verify()` — unified verification (compiler + 9 engines, 75-point gate)
  - `autoFix()` — auto-fix suggestions with field-path targeting
  - `ChangeManager` — 5-lock state machine (Draft→Verify→Approve→Apply→Rollback)
  - `verificationLoop()` — recompile roundtrip loop (RecomputeCallback, 3 max iterations)
  - `enforce()` — EnforcementGate (ALLOW→FORCE_UNCERTAINTY→DOWNGRADE→BLOCK→SEAL)
- `@noa verify` command — verification loop with auto-fix + re-verify + escalation
- `@noa rollback` command — actual snapshot restore (not just stage change)
- `wear()` verification gate — auto-rollback on validation failure
- No-profile path → DOWNGRADE (not ALLOW) with Ledger recording
- `.noa` file watcher — real-time create/modify/delete tracking
- GitHub Actions CI (typecheck → lint → test → build → smoke)
- `typecheck` script (`tsc --noEmit`)
- Audit trail: RECOMPILE_AFTER_FIX, ROLLBACK_FAILED, WEAR_ROLLED_BACK events

### Changed
- `processTurn()` now returns `enforcement` field (EnforcementResult)
- `verificationLoop()` uses RecomputeCallback for fresh status after auto-fix
- ChangeManager: 5-lock enforcement (snapshot, transition, verification, apply, recovery)
- `@noa process` — engine-by-engine analysis table with enforcement display

### Fixed
- processTurn() early return missing enforcement (DOWNGRADE for no-profile)
- engine-sim.ts wear() return type handling (rolledBack check)
- rollback() catch block now records ROLLBACK_FAILED to ledger

## [1.0.0] - 2026-03-29

### Added
- 9-engine pipeline: HFCP v2.7, EH v16.4-R, HCRF v1.2, OCFP v2.0, TLMH v2.0, NSG v1.0, Ledger v28, NIB v1.0, Band Optimizer
- 7-stage compiler: parse, normalize, merge, resolve, validate, explain, export
- 4 model adapters: Claude, GPT, Local (Ollama/LM Studio), Copilot
- 10 preset .noa files across 8 domains
- VS Code UI: Wardrobe TreeView, Layer Stack, Explain View, Preview Panel, Language Server, Chat Participant
- @noa chat commands (10): wear, strip, swap, explain, status, process, list, validate, export, ledger
- Engine Simulator with 48 scenarios across 8 domains
- Band Optimizer (0.48~0.52 limit band) with 11 tunable parameters
- QA checklist (18 categories, 380~580 test cases)
- Hash-chain audit ledger (SHA256, genesis-linked)
- Copy-on-Write context state with message fingerprinting
