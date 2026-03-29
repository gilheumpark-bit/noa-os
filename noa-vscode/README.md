<p align="center">
  <strong>NOA Clothing Framework</strong><br>
  <em>Policy Compiler for AI Personas</em>
</p>

<p align="center">
  <a href="https://github.com/gilheumpark-bit/noa-os/actions"><img src="https://github.com/gilheumpark-bit/noa-os/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/version-1.1.0-blue" alt="Version">
  <img src="https://img.shields.io/badge/engines-9-green" alt="Engines">
  <img src="https://img.shields.io/badge/tests-315+-brightgreen" alt="Tests">
  <img src="https://img.shields.io/badge/license-MIT-yellow" alt="License">
  <img src="https://img.shields.io/badge/TypeScript-strict-blue" alt="TypeScript">
</p>

---

## Why NOA?

Every AI starts naked. Users repeat themselves every session.

```
# Without NOA
User: "I'm a doctor, skip basic explanations, cite evidence levels..."
AI:   (forgets next session)

# With NOA
$ @noa wear medical
AI:   (evidence-based mode, risk classification, citation required)
      (persists across sessions, layered with safety policies)
```

NOA compiles **layered persona definitions** into model-specific artifacts.
One `.noa` file works across Claude, GPT, local models, and Copilot.

---

## Core Concepts

| Metaphor | Meaning |
|----------|---------|
| **Body** | AI model (Claude, GPT, Ollama, Copilot) |
| **Clothes** | `.noa` file (persona, policies, behavior rules) |
| **Accessories** | Skills, MCP tools, integrations |

**Key differentiators:**
- **Model-agnostic** — one `.noa` works everywhere
- **Layerable** — stack multiple personas (base + domain + user)
- **Monotonic safety** — deny rules can never be removed by child layers
- **Explainable** — provenance tracking shows which layer set each rule
- **Auditable** — SHA256 hash-chain ledger for every action
- **Verification-first** — changes must pass 75-point gate before apply

---

## Engines (9)

| Engine | Version | Role |
|--------|---------|------|
| HFCP | v2.7 | Conversation energy scoring + NrgMemory + RclLevel |
| EH | v16.4-R | Hallucination detection (6 domain rule tables) |
| HCRF | v1.2 | Responsibility gate (5-part, pressure window) |
| OCFP | v2.0 | Corporate filter (HR/Legal/External risk) |
| TLMH | v2.0 | Research partner mode (invitation-based) |
| NSG | v1.0 | 5-part security kernel (DAK + SPE + ASG + IARL + BSSO) |
| Ledger | v28 | Hash-chain audit log + ContextState CoW |
| NIB | v1.0 | Temporal pattern analysis (Invariant Bridge) |
| Band Optimizer | v1.0 | 11-parameter optimization (0.48~0.52 limit band) |

---

## Verification-First Studio

Every change goes through a locked pipeline:

```
[Change Request]
       |
  [draft()] -------- snapshot saved
       |
  [verify()] ------- 75-point gate (compiler + 9 engines)
       |
  [auto-fix] ------- recompile roundtrip (max 3 iterations)
       |
  [approve()] ------ human gate (blockers = 0 required)
       |
  [apply()] -------- snapshot + approvedBy required
       |
  [rollback()] ----- actual snapshot restore
```

**5-Lock State Machine:**
1. **State lock** — snapshot frozen at draft time
2. **Transition lock** — only valid transitions allowed
3. **Verification lock** — passed + score >= 75 + no blockers
4. **Apply lock** — snapshot + approvedBy must exist
5. **Recovery lock** — APPLIED + snapshotJson required for rollback

**Enforcement Gate:**
`ALLOW` < `FORCE_UNCERTAINTY` < `DOWNGRADE` < `BLOCK` < `SEAL`

---

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
| `verify` | Verification loop (auto-fix + re-verify) |
| `rollback` | Actual snapshot restore |
| `export [target]` | Export for Claude/GPT/Local |
| `ledger [n]` | Recent audit log |

---

## VS Code Integration

- **Wardrobe sidebar** — browse and wear presets
- **Layer stack view** — active layer ordering
- **Explain View** — provenance visualization (which layer set which rule)
- **Preview Panel** — compile result preview
- **Language Server** — `.noa` autocomplete, validation, hover docs, CodeLens
- **Status bar** — `[medical + secure] [HFCP:72] [EH:TRUST] [NSG:IDLE]`
- **File watcher** — real-time `.noa` create/modify/delete tracking
- **Chat Participant** — `@noa` commands in Copilot Chat

---

## Presets (10)

| Preset | Kind | Domain |
|--------|------|--------|
| `secure` | base | Safety foundation (always applied) |
| `medical` | domain | Evidence-based medical assistant |
| `legal` | domain | Contract/regulation analysis |
| `creative` | domain | Creative writing partner |
| `education` | domain | Teaching assistant |
| `engineering` | domain | Technical precision |
| `finance` | domain | Financial analysis |
| `public-edu` | domain | Public service / education policy |
| `research` | domain | TLMH-based research partner |
| `default` | user | User preference baseline |

---

## Architecture

```
.noa Source(s)
    |
    v
[Compiler 7-stage] ---> parse -> normalize -> merge -> resolve -> validate -> explain -> export
    |
    v
[4 Adapters] ---> Claude / GPT / Local (Ollama, LM Studio) / Copilot
    |
    v
[Session Manager] ---> wear / strip / swap + processTurn (9 engines)
    |
    v
[Verification Studio] ---> verify -> autoFix -> recompile -> re-verify (3 max)
    |                              |
    v                         [ChangeManager 5-lock]
[Enforcement Gate]           Draft -> Verify -> Approve -> Apply -> Rollback
    |
    v
[Engine Simulator] ---> 48 scenarios x 8 domains
    |
[Band Optimizer] ---> 11 params x 0.48~0.52 band
```

---

## Audit Trail

All success/failure paths record to hash-chain ledger:

| Event | When |
|-------|------|
| `SESSION_START` | Session created |
| `WEAR` / `WEAR_ROLLED_BACK` | Persona applied / verification rollback |
| `ENFORCEMENT` | Block/downgrade (including no-profile) |
| `AUTO_FIX` / `RECOMPILE_AFTER_FIX` | Fix applied / recompile after fix |
| `VERIFICATION_ESCALATED` | Loop exceeded 3 iterations |
| `ROLLBACK` / `ROLLBACK_FAILED` | Restore success / parse failure |

---

## Quick Start

```bash
# 1. Install
code --install-extension noa-os.noa-clothing-framework

# 2. Wear a persona
@noa wear medical

# 3. Check status
@noa status

# 4. Process text through all engines
@noa process "Is this medication safe?"

# 5. Run verification
@noa verify
```

---

## Stats

| Metric | Value |
|--------|-------|
| Source files | 39 |
| Lines of TypeScript | 9,041 |
| Test files | 9 |
| Test cases | ~315 |
| Simulation scenarios | 48 |
| Presets | 10 |
| @noa commands | 12 |
| Engines | 9 |
| Tunable parameters | 11 |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE)
