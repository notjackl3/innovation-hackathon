#!/usr/bin/env bash
# End-to-end integration test: submit 15 diverse ideas and verify each is
# classified into the expected track, and that a matching VisualizationTrack
# is auto-created.
#
# Assumes the dev server is running on $PORT (default 3210) with MOCK_AI=true.

set -euo pipefail
PORT=${PORT:-3210}
BASE="http://localhost:${PORT}"

bold()  { printf "\033[1m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m" "$*"; }
red()   { printf "\033[31m%s\033[0m" "$*"; }
gray()  { printf "\033[90m%s\033[0m" "$*"; }

bold "=== creating fresh company ==="
CID=$(curl -s -X POST "$BASE/api/companies" \
  -H 'Content-Type: application/json' \
  -d '{"name":"ClassifyTest Co","rawProfile":"Generic test company for classification verification."}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
echo "company: $CID"
echo

bold "=== submitting 15 diverse ideas ==="

# Format: "EXPECTED|TITLE|RAW"
CASES=(
  "PRODUCT|Insulated bottle|Reusable insulated water bottle for hikers with a leak-proof lid and a magnetic strap."
  "PRODUCT|GPS sneakers|Smart sneakers with embedded GPS tracker for parents who want to know where their kids are."
  "PRODUCT|Espresso machine|Compact espresso machine that fits on any countertop and brews single-serve."
  "PRODUCT|Modular backpack|A modular backpack with swappable compartments for commuters."
  "PRODUCT|Kids headphones|Wireless noise-cancelling headphones for kids with parental volume limits."

  "SERVICE|Late-night cafe|Late-night study cafe with quiet zones and a focus playlist for university students."
  "SERVICE|Dog grooming|Subscription dog grooming service that comes to your door every two weeks."
  "SERVICE|Office massage|On-demand massage delivery for office workers during lunch."
  "SERVICE|Founder coaching|Monthly membership coaching program for first-time startup founders."
  "SERVICE|Vintage rentals|Concierge booking and pickup service for vintage event rentals."

  "SOFTWARE|Inventory dashboard|SaaS dashboard for tracking inventory across multiple warehouses, with restock alerts."
  "SOFTWARE|Code review bot|AI-powered code review chatbot that runs inside Slack."
  "SOFTWARE|Walker app|Mobile app for booking dog walkers in your neighbourhood."
  "SOFTWARE|Anomaly analytics|Analytics platform with LLM-driven anomaly detection for cloud spend."
  "SOFTWARE|Receipt API|API for converting raw receipts into structured expense data."
)

PASS=0
FAIL=0
SUMMARY=""

for entry in "${CASES[@]}"; do
  EXPECTED=$(echo "$entry" | cut -d'|' -f1)
  TITLE=$(echo "$entry" | cut -d'|' -f2)
  RAW=$(echo "$entry" | cut -d'|' -f3-)

  PAYLOAD=$(python3 -c "import json,sys;print(json.dumps({'companyId':sys.argv[1],'title':sys.argv[2],'rawInput':sys.argv[3]}))" "$CID" "$TITLE" "$RAW")

  RES=$(curl -s -X POST "$BASE/api/ideas" -H 'Content-Type: application/json' -d "$PAYLOAD")
  IID=$(echo "$RES" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
  JID=$(echo "$RES" | python3 -c "import sys,json;print(json.load(sys.stdin)['jobId'])")

  # Poll job
  for _ in $(seq 1 8); do
    sleep 0.5
    STATUS=$(curl -s "$BASE/api/jobs/$JID" | python3 -c "import sys,json;print(json.load(sys.stdin)['status'])")
    [[ "$STATUS" == SUCCEEDED || "$STATUS" == FAILED ]] && break
  done

  if [[ "$STATUS" != "SUCCEEDED" ]]; then
    printf "  %s  %-22s  → job %s\n" "$(red FAIL)" "$TITLE" "$STATUS"
    FAIL=$((FAIL+1))
    continue
  fi

  IDEA=$(curl -s "$BASE/api/ideas/$IID")
  GOT=$(echo "$IDEA" | python3 -c "import sys,json;print(json.load(sys.stdin)['primaryType'] or 'NONE')")
  TRACKS=$(echo "$IDEA" | python3 -c "import sys,json;print(','.join(t['kind'] for t in json.load(sys.stdin)['tracks']))")

  if [[ "$GOT" == "$EXPECTED" && "$TRACKS" == *"$EXPECTED"* ]]; then
    printf "  %s  %-22s  expected=%-8s  got=%-8s  tracks=%s\n" "$(green PASS)" "$TITLE" "$EXPECTED" "$GOT" "$TRACKS"
    PASS=$((PASS+1))
  else
    printf "  %s  %-22s  expected=%-8s  got=%-8s  tracks=%s\n" "$(red FAIL)" "$TITLE" "$EXPECTED" "$GOT" "$TRACKS"
    FAIL=$((FAIL+1))
  fi
done

echo
bold "=== summary ==="
printf "  passed: %d\n  failed: %d\n  total:  %d\n" "$PASS" "$FAIL" "$((PASS+FAIL))"
[[ "$FAIL" == "0" ]] || exit 1
