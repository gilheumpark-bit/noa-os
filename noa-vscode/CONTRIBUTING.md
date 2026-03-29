# Contributing to NOA Clothing Framework

## Getting Started

```bash
git clone https://github.com/gilheumpark-bit/noa-os.git
cd noa-os/noa-vscode
npm install
```

## Development

```bash
npm run build     # esbuild bundle
npm run watch     # watch mode
npm run typecheck # tsc --noEmit
npm run lint      # eslint
npm run test      # vitest
```

## Before Submitting a PR

1. Run the full quality gate:
   ```bash
   npm run typecheck && npm run lint && npm run test && npm run build
   ```

2. Follow the PR template checklist

3. Ensure all new code paths have:
   - Test coverage
   - Ledger event recording
   - Enforcement gate consideration

## Architecture Rules

- **Engines are stateless or self-contained** — no cross-engine direct calls
- **Session is the orchestrator** — all engine coordination goes through `processTurn()`
- **Verification before apply** — use `ChangeManager` for any state mutations
- **Monotonic safety** — deny rules and locks can only grow, never shrink
- **Audit everything** — every success/failure path must record to Ledger

## Code Style

- TypeScript strict mode
- No `any` types (use `unknown` + type narrowing)
- No `exec()` / `eval()` / `os.system()`
- PART-based structure for files > 100 lines
- Named constants instead of magic numbers

## .noa Preset Guidelines

- All presets must extend `base/secure`
- Priority ranges: base (0-99), domain (100-299), user (300-599), session (600+)
- Include `persona.role` in every preset
- Test with `@noa wear <preset>` + `@noa verify`
