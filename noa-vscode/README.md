# NOA Clothing Framework

> **Dress your AI.** Define personas, policies, and behavior rules with `.noa` files.

NOA is a VS Code extension that compiles layered persona definitions into model-specific artifacts for Claude, GPT, local models, and Copilot.

## Features

### Core
- `.noa` YAML schema with real-time validation, autocomplete, and hover docs
- 7-stage compiler: parse, normalize, merge, resolve, validate, explain, export
- Layered merge with monotonic union (deny rules can never be removed)
- Provenance tracking (which layer contributed which rule)

### Engines (9)
| Engine | Role |
|--------|------|
| HFCP v2.7 | Conversation energy scoring |
| EH v16.4-R | Hallucination detection (6 domain rule tables) |
| HCRF v1.2 | Responsibility gate |
| OCFP v2.0 | Corporate filter (HR/Legal/External risk) |
| TLMH v2.0 | Research partner mode |
| NSG v1.0 | 5-part security kernel (FSM + policy + gateway + audit + spike observer) |
| Ledger v28 | Hash-chain audit log |
| NIB v1.0 | Temporal pattern analysis (invariant bridge) |
| Band Optimizer | Engine parameter optimization (0.48~0.52 limit band) |

### VS Code Integration
- Wardrobe sidebar (browse and wear presets)
- Layer stack view
- Status bar (active persona + engine scores)
- `@noa` Copilot Chat commands (10 commands)
- CodeLens (Compile / Preview / Explain)

### Presets (10)
`secure`, `medical`, `legal`, `creative`, `education`, `engineering`, `finance`, `public-edu`, `research`, `default`

## Quick Start

1. Install from VS Code Marketplace
2. Open any `.noa` file or run `NOA: Wear Persona`
3. Pick a preset (e.g., `medical`)
4. In Copilot Chat: `@noa status`

## @noa Commands

| Command | Description |
|---------|-------------|
| `@noa wear <name>` | Wear a persona |
| `@noa strip <name>` | Remove a persona |
| `@noa swap <old> <new>` | Atomic swap |
| `@noa explain [field]` | Why this rule applies |
| `@noa process <text>` | Run text through all engines |
| `@noa status` | Current state |
| `@noa list` | Active layers |
| `@noa validate` | Check diagnostics |
| `@noa export [target]` | Export for Claude/GPT/Local |
| `@noa ledger [n]` | Recent audit log |

## Architecture

```
.noa Source(s) --> [Compiler] --> ResolvedProfile --> [Adapters] --> Model Artifacts
                      |
                  [9 Engines] --> processTurn() pipeline
                      |
                  [Simulator] --> Scenario validation
```

## License

MIT
