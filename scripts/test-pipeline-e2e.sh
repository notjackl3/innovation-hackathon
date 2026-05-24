#!/usr/bin/env bash
# End-to-end pipeline test: research → company → idea → triage → generate → share.
# Uses the real OpenAI API (MOCK_AI=false). Expects dev server on $PORT (default 3210).

set -euo pipefail
PORT=${PORT:-3210}
BASE="http://localhost:${PORT}"

bold()  { printf "\033[1m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m" "$*"; }
red()   { printf "\033[31m%s\033[0m" "$*"; }

poll_job() {
  local jid="$1"
  local label="$2"
  local max="${3:-30}"
  local OUT STATUS PROG
  for i in $(seq 1 "$max"); do
    sleep 2
    OUT=$(curl -s "$BASE/api/jobs/$jid")
    STATUS=$(echo "$OUT" | python3 -c "import sys,json;print(json.load(sys.stdin)['status'])" 2>/dev/null || echo "?")
    PROG=$(echo "$OUT" | python3 -c "import sys,json;print(json.load(sys.stdin)['progress'])" 2>/dev/null || echo "?")
    printf "    [%s] %s/%s: %s (%s%%)\n" "$label" "$i" "$max" "$STATUS" "$PROG" >&2
    if [[ "$STATUS" == "SUCCEEDED" ]]; then
      printf "    [%s] %s\n" "$label" "$(green DONE)" >&2
      echo "$OUT"
      return 0
    fi
    if [[ "$STATUS" == "FAILED" ]]; then
      printf "    [%s] %s\n" "$label" "$(red FAILED)" >&2
      echo "$OUT" | python3 -c "import sys,json;d=json.load(sys.stdin);print('    error:', d.get('error'))" >&2
      return 1
    fi
  done
  printf "    [%s] %s after %s polls\n" "$label" "$(red TIMEOUT)" "$max" >&2
  return 1
}

bold "=== 1. RESEARCH agent: Patagonia ==="
RES=$(curl -s -X POST "$BASE/api/research/company" -H 'Content-Type: application/json' -d '{"name":"Patagonia"}')
TOP=$(echo "$RES" | python3 -c "
import sys, json
d = json.load(sys.stdin)
c = d['candidates'][0]
print(json.dumps({'name': c['name'], 'summary': c['summary'], 'brief': c['brief']}))
")
echo "  top candidate: $(echo "$TOP" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['name'])")"
echo "  industry: $(echo "$TOP" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['brief']['industry'])")"

bold "=== 2. CREATE company from research candidate ==="
NAME=$(echo "$TOP" | python3 -c "import sys,json;print(json.load(sys.stdin)['name'])")
BRIEF=$(echo "$TOP" | python3 -c "import sys,json;print(json.dumps(json.load(sys.stdin)['brief']))")
SUMMARY=$(echo "$TOP" | python3 -c "import sys,json;print(json.load(sys.stdin)['summary'])")
PAYLOAD=$(python3 -c "
import json, sys
print(json.dumps({'name': sys.argv[1], 'rawProfile': sys.argv[2], 'brief': json.loads(sys.argv[3])}))
" "$NAME" "$SUMMARY" "$BRIEF")
CID=$(curl -s -X POST "$BASE/api/companies" -H 'Content-Type: application/json' -d "$PAYLOAD" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
echo "  created company: $CID"
echo "  briefJson palette: $(node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
(async()=>{const c=await p.company.findUnique({where:{id:'$CID'}}); console.log(JSON.parse(c.briefJson).visualStyle.palette); await p.\$disconnect();})();
")"

bold "=== 3. CREATE idea (SERVICE-leaning) ==="
RES=$(curl -s -X POST "$BASE/api/ideas" -H 'Content-Type: application/json' \
  -d "{\"companyId\":\"$CID\",\"title\":\"Worn Wear pop-up cafe\",\"rawInput\":\"A pop-up cafe service inside Patagonia stores where customers can repair their gear with a barista, while sharing stories about the outdoors.\"}")
IID=$(echo "$RES" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
TRIAGE_JID=$(echo "$RES" | python3 -c "import sys,json;print(json.load(sys.stdin)['jobId'])")
echo "  idea: $IID"

bold "=== 4. TRIAGE poll ==="
JOB_OUT=$(poll_job "$TRIAGE_JID" "triage" 20) || exit 1
TYPE=$(curl -s "$BASE/api/ideas/$IID" | python3 -c "import sys,json;print(json.load(sys.stdin)['primaryType'])")
echo "  classified as: $TYPE"

if [ "$TYPE" != "SERVICE" ]; then
  echo "  $(red NOTE) expected SERVICE, got $TYPE — continuing anyway"
fi

bold "=== 5. GENERATE — visit /ideas/[id]/generate (renders the workspace) ==="
HTTP=$(curl -s -o /tmp/gen.html -w "%{http_code}" "$BASE/ideas/$IID/generate")
echo "  GET /ideas/$IID/generate → $HTTP ($(wc -c < /tmp/gen.html) bytes)"

# Get the auto-created track (should be SERVICE)
TID=$(curl -s "$BASE/api/ideas/$IID" | python3 -c "
import sys, json
d = json.load(sys.stdin)
t = [t for t in d['tracks'] if t['kind']==d['primaryType']]
print(t[0]['id'] if t else '')
")
echo "  track: $TID"

bold "=== 6. Generate SCENE PLAN ==="
RES=$(curl -s -X POST "$BASE/api/tracks/$TID/service/scene-plan" -H 'Content-Type: application/json' -d '{"n":4}')
JID=$(echo "$RES" | python3 -c "import sys,json;print(json.load(sys.stdin)['jobId'])")
poll_job "$JID" "scene-plan" 20 > /dev/null
PA=$(curl -s "$BASE/api/tracks/$TID" | python3 -c "import sys,json;print([a for a in json.load(sys.stdin)['artifacts'] if a['kind']=='SCENE_PLAN'][0]['id'])")
echo "  plan artifact: $PA"

bold "=== 7. Generate REAL FRAME for scene 0 (this proves the fix) ==="
RES=$(curl -s -X POST "$BASE/api/tracks/$TID/service/scenes/0/frame" -H 'Content-Type: application/json' -d "{\"scenePlanArtifactId\":\"$PA\"}")
JID=$(echo "$RES" | python3 -c "import sys,json;print(json.load(sys.stdin)['jobId'])")
OUT=$(poll_job "$JID" "frame-0" 50) || exit 1
KEY=$(echo "$OUT" | python3 -c "import sys,json;print(json.load(sys.stdin)['output']['storageKey'])")
echo "  frame storage key: $KEY"
curl -s "$BASE/api/storage/$KEY" -o /tmp/frame.png
file /tmp/frame.png

bold "=== 8. Visit /ideas/[id]/share to confirm artifacts appear ==="
HTTP=$(curl -s -o /tmp/share.html -w "%{http_code}" "$BASE/ideas/$IID/share")
echo "  GET /ideas/$IID/share → $HTTP ($(wc -c < /tmp/share.html) bytes)"
grep -oE "Service video|Sketches|3D model|Software demo" /tmp/share.html | sort -u | sed 's/^/  found: /'

bold "=== summary ==="
echo "  $(green PASS) full pipeline: research → company → idea → triage → generate → real frame"
echo "  artifact key: $KEY"
