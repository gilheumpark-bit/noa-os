# NOA Clothing Framework

> **Dress your AI.** Policy Compiler for AI Personas.

NOA is a VS Code extension that compiles layered persona definitions into model-specific artifacts for Claude, GPT, local models, and Copilot. Verification-first architecture ensures every change is validated, enforced, and auditable.

## Features

### Core
- `.noa` YAML schema with real-time validation, autocomplete, and hover docs
- 7-stage compiler: parse, normalize, merge, resolve, validate, explain, export
- Layered merge with monotonic union (deny rules can never be removed)
- Provenance tracking (which layer contributed which rule)
- `.noa` file watcher (real-time create/modify/delete tracking)

### Engines (9)
| Engine | Version | Role |
|--------|---------|------|
| HFCP | v2.7 | Conversation energy scoring + NrgMemory + RclLevel + MemoryEcology |
| EH | v16.4-R | Hallucination detection (6 domain rule tables, source credibility) |
| HCRF | v1.2 | Responsibility gate (5-part, pressure window, authority transfer block) |
| OCFP | v2.0 | Corporate filter (HR/Legal/External risk, configurable seal/limit) |
| TLMH | v2.0 | Research partner mode (invitation-based, question quality filter) |
| NSG | v1.0 | 5-part security kernel (DAK FSM + SPE + ASG + IARL + BSSO) |
| Ledger | v28 | Hash-chain audit log + ContextState CoW + MessageFrame fingerprint |
| NIB | v1.0 | Temporal pattern analysis (Invariant Bridge, 7 invariant features) |
| Band Optimizer | v1.0 | Engine parameter optimization (0.48~0.52 limit band, 11 params) |

### Verification-First Studio
- `verify()` — Unified verification (compiler + 9 engines, 75-point gate)
- `autoFix()` — Auto-fix suggestions with field-path targeting
- `ChangeManager` — 5-lock state machine (Draft → Verify → Approve → Apply → Rollback)
- `verificationLoop()` — Recompile roundtrip loop (3 iterations max, then escalate)
- `enforce()` — EnforcementGate (ALLOW → FORCE_UNCERTAINTY → DOWNGRADE → BLOCK → SEAL)

### VS Code Integration
- Wardrobe sidebar (browse and wear presets)
- Layer stack view
- Explain View (Provenance visualization)
- Preview Panel (compile result)
- Status bar (active persona + engine scores + NSG/NIB)
- `@noa` Copilot Chat commands (12 commands)
- CodeLens (Compile / Preview / Explain)

### Presets (10)
`secure`, `medical`, `legal`, `creative`, `education`, `engineering`, `finance`, `public-edu`, `research`, `default`

### CI
GitHub Actions quality gate: `typecheck → lint → test → build → smoke`

## Quick Start

1. Install from VS Code Marketplace
2. Open any `.noa` file or run `NOA: Wear Persona`
3. Pick a preset (e.g., `medical`)
4. In Copilot Chat: `@noa status`

## @noa Commands (12)

| Command | Description |
|---------|-------------|
| `wear <name>` | Wear a persona (verification gate + auto-rollback) |
| `strip <name>` | Remove a persona |
| `swap <old> <new>` | Atomic swap |
| `explain [field]` | Why this rule applies (Provenance) |
| `process <text>` | 9-engine analysis table + Enforcement |
| `status` | Current state |
| `list` | Active layers |
| `validate` | Check diagnostics |
| `verify` | Verification loop (auto-fix + re-verify + escalation) |
| `rollback` | Restore last applied change (actual snapshot restore) |
| `export [target]` | Export for Claude/GPT/Local |
| `ledger [n]` | Recent audit log (default: 5) |

## Architecture

```
.noa Source(s) --> [Compiler 7-stage] --> ResolvedProfile --> [Adapters 4] --> Artifacts
                         |
                    [9 Engines] --> processTurn() pipeline
                         |
                  [Verification Studio] --> verify → autoFix → recompile → re-verify
                         |                         |
                  [Enforcement Gate]          [ChangeManager 5-lock]
                         |                         |
                    ALLOW ~ SEAL            Draft → Verify → Approve → Apply → Rollback
                         |
                    [Simulator] --> 48 scenarios × 8 domains
                         |
                  [Band Optimizer] --> 11 params × 0.48~0.52 band
```

## Audit Trail

All success/failure paths record to hash-chain ledger:

| Event | When |
|-------|------|
| SESSION_START | Session created |
| WEAR / WEAR_ROLLED_BACK | Persona applied / verification rollback |
| ENFORCEMENT | Block/downgrade decision (including no-profile) |
| AUTO_FIX / RECOMPILE_AFTER_FIX | Auto-fix applied / recompile after fix |
| VERIFICATION_ESCALATED | Loop exceeded 3 iterations |
| ROLLBACK / ROLLBACK_FAILED | Restore success / parse failure |

## Stats

- **39** source files, **9,041** lines of TypeScript
- **8** test files, **48** simulation scenarios
- **10** preset `.noa` files across 8 domains
- **12** `@noa` chat commands

## License

MIT
