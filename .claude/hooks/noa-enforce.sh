#!/bin/bash
# NOA Rules v2.0 Enforcement Scanner
# PreToolUse hook on Write/Edit — blocks violations.
#
# Exit 0 = ALLOW, Exit 2 = BLOCK (stderr → Claude feedback)
# No jq dependency. Uses python3 for JSON parsing.

INPUT=$(cat)

# ─── Parse JSON with python3 ──────────────────────────────

read -r FILE_PATH CONTENT <<'PYEOF'
$(python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    ti = d.get('tool_input', d)
    fp = ti.get('file_path', '')
    ct = ti.get('content', ti.get('new_string', ''))
    # Output file_path on first line, content after separator
    print(fp)
    print('---NOA_SEP---')
    print(ct)
except Exception as e:
    print('')
    print('---NOA_SEP---')
    print('')
" <<< "$INPUT")
PYEOF

# Simpler approach: use python3 directly
PARSED=$(python3 -c "
import sys, json
try:
    d = json.loads(sys.stdin.read())
    ti = d.get('tool_input', d)
    fp = ti.get('file_path', '')
    ct = ti.get('content', ti.get('new_string', ''))
    print('FILE_PATH=' + fp)
except:
    print('FILE_PATH=')
" <<< "$INPUT" 2>/dev/null)

FILE_PATH=$(echo "$PARSED" | grep "^FILE_PATH=" | sed 's/^FILE_PATH=//')

# Skip non-code files
if [ -z "$FILE_PATH" ]; then exit 0; fi

case "$FILE_PATH" in
  *.ts|*.tsx|*.js|*.jsx|*.py|*.rs|*.go|*.java|*.cpp|*.c|*.cs) ;;
  *) exit 0 ;;
esac

case "$FILE_PATH" in
  *.test.*|*.spec.*|*__test__*) exit 0 ;;
esac

# Get content via python3
CONTENT=$(python3 -c "
import sys, json
try:
    d = json.loads(sys.stdin.read())
    ti = d.get('tool_input', d)
    print(ti.get('content', ti.get('new_string', '')))
except:
    print('')
" <<< "$INPUT" 2>/dev/null)

if [ -z "$CONTENT" ]; then exit 0; fi

VIOLATIONS=""
SCORE=100
BLOCKED=false

# Helper: safe integer from grep -c (strip whitespace/newlines)
safe_count() {
  local val
  val=$(echo "$1" | tr -d '[:space:]' | head -c 10)
  if [[ "$val" =~ ^[0-9]+$ ]]; then echo "$val"; else echo "0"; fi
}

# ─── E1: PART Structure ───────────────────────────────────

LINE_COUNT=$(safe_count "$(echo "$CONTENT" | wc -l)")
PART_COUNT=$(safe_count "$(echo "$CONTENT" | grep -cE "^(//|#)\s*(PART|Part)\s+[0-9]" 2>/dev/null || echo 0)")

if [ "$LINE_COUNT" -ge 100 ] && [ "$PART_COUNT" -eq 0 ]; then
  VIOLATIONS="${VIOLATIONS}[E1-BLOCK] ${LINE_COUNT} lines without PART headers (100+ requires PARTs)\n"
  SCORE=$((SCORE - 30))
  BLOCKED=true
fi

if [ "$LINE_COUNT" -ge 300 ] && [ "$PART_COUNT" -lt 3 ]; then
  VIOLATIONS="${VIOLATIONS}[E1-BLOCK] ${LINE_COUNT} lines need 3+ PARTs (found ${PART_COUNT})\n"
  SCORE=$((SCORE - 20))
  BLOCKED=true
fi

# ─── E2[C]: Dangerous Patterns ────────────────────────────

EXEC_COUNT=$(safe_count "$(echo "$CONTENT" | grep -cE '\beval\s*\(|\bexec\s*\(|os\.system\s*\(' 2>/dev/null || echo 0)")
if [ "$EXEC_COUNT" -gt 0 ]; then
  VIOLATIONS="${VIOLATIONS}[E2C-BLOCK] ${EXEC_COUNT}x eval/exec/os.system\n"
  SCORE=$((SCORE - 25))
  BLOCKED=true
fi

# ─── E3: Completeness ─────────────────────────────────────

TODO_COUNT=$(safe_count "$(echo "$CONTENT" | grep -ciE '\bTODO\b|\bFIXME\b|\bHACK\b|\bXXX\b' 2>/dev/null || echo 0)")
STUB_COUNT=$(safe_count "$(echo "$CONTENT" | grep -cE '^\s*(pass|\.\.\.)\s*$' 2>/dev/null || echo 0)")
NOTIMPL_COUNT=$(safe_count "$(echo "$CONTENT" | grep -cE 'NotImplementedError|not.implemented' 2>/dev/null || echo 0)")
INCOMPLETE=$((TODO_COUNT + STUB_COUNT + NOTIMPL_COUNT))

if [ "$INCOMPLETE" -gt 5 ]; then
  VIOLATIONS="${VIOLATIONS}[E3-BLOCK] ${INCOMPLETE} incomplete markers (TODO:${TODO_COUNT} stub:${STUB_COUNT} notimpl:${NOTIMPL_COUNT})\n"
  SCORE=$((SCORE - 25))
  BLOCKED=true
elif [ "$INCOMPLETE" -gt 0 ]; then
  VIOLATIONS="${VIOLATIONS}[E3-WARN] ${INCOMPLETE} incomplete markers\n"
  SCORE=$((SCORE - $((INCOMPLETE * 5))))
fi

# ─── E4: 75-Point Gate ────────────────────────────────────

if [ "$SCORE" -lt 75 ] && [ "$LINE_COUNT" -ge 20 ]; then
  BLOCKED=true
  VIOLATIONS="${VIOLATIONS}[E4-BLOCK] Score ${SCORE}/100 (below 75-point gate)\n"
fi

# ─── Verdict ──────────────────────────────────────────────

if [ "$BLOCKED" = true ]; then
  {
    echo "NOA ENFORCEMENT: BLOCKED (${SCORE}/100)"
    echo -e "$VIOLATIONS"
    echo "Fix violations, then retry. Add '// PART N' headers for 100+ line files."
  } >&2
  exit 2
fi

if [ -n "$VIOLATIONS" ]; then
  {
    echo "NOA ENFORCEMENT: PASS (${SCORE}/100) with warnings"
    echo -e "$VIOLATIONS"
  } >&2
fi

exit 0
