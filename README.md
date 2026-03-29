# NOA — Policy Compiler for AI Personas

> **Dress your AI.** Define personas, policies, and behavior rules with `.noa` files.

## Repository Structure

```
noa-os/
├── noa-vscode/          # VS Code Extension (main product)
│   ├── src/             # TypeScript source (39 files, 9,041 lines)
│   ├── tests/           # 9 test files, 238 cases
│   ├── presets/          # 10 .noa preset files
│   ├── schemas/          # JSON Schema for .noa validation
│   ├── syntaxes/         # TextMate grammar for .noa highlighting
│   ├── media/            # Extension icon
│   ├── README.md         # Extension documentation (English)
│   ├── CHANGELOG.md      # Release notes
│   ├── CONTRIBUTING.md   # Contribution guide
│   └── LICENSE           # MIT
│
├── docs/                # Project documentation
│   ├── NOA_CLOTHING_FRAMEWORK_DESIGN.md  # Technical design spec (Korean)
│   ├── NOA_BUSINESS_POSITION.md          # Business positioning (Korean)
│   ├── NOR_BRAND.md                      # Brand guide + visual identity
│   └── AGENTS.md                         # Agent workflow reference
│
├── legacy/              # Original Python engines (reference only)
│   ├── noa_os_v28_core.py        # Aegis v28 core
│   ├── Sovereign OS v27.py       # Sovereign v27
│   ├── NOA Enterprise Edition.py # Enterprise UI
│   ├── OS.py                     # OS kernel simulator
│   └── OS GUI.py                 # GUI simulator
│
├── .github/             # CI + community templates
│   ├── workflows/ci.yml
│   ├── ISSUE_TEMPLATE/
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── FUNDING.yml
│
└── CLAUDE.md            # AI agent instructions
```

## Quick Start

```bash
# Install the VS Code extension
code --install-extension noa-vscode/noa-clothing-framework-1.1.0.vsix

# Or download from GitHub Releases
```

## Extension Details

See [noa-vscode/README.md](noa-vscode/README.md) for full documentation:
- 9 Engines (HFCP/EH/HCRF/OCFP/TLMH/NSG/Ledger/NIB/Band Optimizer)
- 7-stage Compiler + 4 Adapters (Claude/GPT/Local/Copilot)
- Verification-First Studio (5-lock state machine)
- 12 `@noa` commands
- 238 tests passed

## Documentation

| Document | Language | Description |
|----------|----------|-------------|
| [Extension README](noa-vscode/README.md) | English | Installation, features, commands |
| [Design Spec](docs/NOA_CLOTHING_FRAMEWORK_DESIGN.md) | Korean | Technical architecture |
| [Business Position](docs/NOA_BUSINESS_POSITION.md) | Korean | Market positioning, pricing |
| [Brand Guide](docs/NOR_BRAND.md) | Korean | NOR identity, colors, icon |
| [Contributing](noa-vscode/CONTRIBUTING.md) | English | How to contribute |
| [Changelog](noa-vscode/CHANGELOG.md) | English | Release history |

## License

[MIT](noa-vscode/LICENSE)
