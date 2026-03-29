# Changelog

## [1.0.0] - 2026-03-29

### Added
- 9-engine pipeline: HFCP v2.7, EH v16.4-R, HCRF v1.2, OCFP v2.0, TLMH v2.0, NSG v1.0, Ledger v28, NIB v1.0, Band Optimizer
- 7-stage compiler: parse, normalize, merge, resolve, validate, explain, export
- 4 model adapters: Claude, GPT, Local (Ollama/LM Studio), Copilot
- 10 preset .noa files: secure, medical, legal, creative, education, engineering, finance, public-edu, research, default
- VS Code UI: Wardrobe TreeView, Layer Stack, Explain View, Preview Panel, Language Server, Chat Participant
- @noa chat commands (10): wear, strip, swap, explain, status, process, list, validate, export, ledger
- Engine Simulator with 47 scenarios across 8 domains
- Band Optimizer (0.48~0.52 limit band) with 11 tunable parameters
- QA checklist (18 categories, 380~580 test cases)
- Hash-chain audit ledger (SHA256, genesis-linked)
- Copy-on-Write context state with message fingerprinting
