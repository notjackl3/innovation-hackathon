#!/usr/bin/env bash
# Walks one idea through each pipeline end-to-end with real OpenAI/Meshy calls.
# Designed to fail loudly with exit 1 at the first broken step so we can debug
# precisely where things break.

set -uo pipefail
PORT=${PORT:-3210}
BASE="http://localhost:${PORT}"

bold()  { printf "\033[1m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m" "$*"; }
red()   { printf "\033[31m%s\033[0m" "$*"; }
gray()  { printf "\033[90m%s\033[0m" "$*"; }

# poll <job_id> <label> <max_iter>
# Prints status updates to stderr, the final job JSON to stdout. Returns
# non-zero if FAILED or never completes.
poll() {
  local jid="$1" label="$2" max="${3:-60}"
  local OUT STATUS PROG
  for i in $(seq 1 "$max"); do
    sleep 2
    OUT=$(curl -s "$BASE/api/jobs/$jid")
    STATUS=$(echo "$OUT" | python3 -c "import sys,json;print(json.load(sys.stdin)['status'])" 2>/dev/null || echo "?")
    PROG=$(echo "$OUT" | python3 -c "import sys,json;print(json.load(sys.stdin)['progress'])" 2>/dev/null || echo "?")
    printf "    [%-12s] %2s/%-2s: %-9s (%s%%)\n" "$label" "$i" "$max" "$STATUS" "$PROG" >&2
    if [[ "$STATUS" == "SUCCEEDED" ]]; then
      echo "$OUT"
      return 0
    fi
    if [[ "$STATUS" == "FAILED" ]]; then
      ERR=$(echo "$OUT" | python3 -c "import sys,json;print(json.load(sys.stdin).get('error',''))")
      printf "    [%-12s] %s — %s\n" "$label" "$(red FAIL)" "$ERR" >&2
      echo "$OUT"
      return 1
    fi
  done
  printf "    [%-12s] %s\n" "$label" "$(red TIMEOUT)" >&2
  return 2
}

bold "===== Bootstrapping company (Tim Hortons via research) ====="
R=$(curl -s -X POST "$BASE/api/research/company" -H 'Content-Type: application/json' -d '{"name":"Tim Hortons"}')
TOP=$(echo "$R" | python3 -c "import sys,json;d=json.load(sys.stdin);c=d['candidates'][0];print(json.dumps({'name':c['name'],'summary':c['summary'],'brief':c['brief']}))")
NAME=$(echo "$TOP" | python3 -c "import sys,json;print(json.load(sys.stdin)['name'])")
PAY=$(python3 -c "import json,sys;t=json.loads(sys.stdin.read());print(json.dumps({'name':t['name'],'rawProfile':t['summary'],'brief':t['brief']}))" <<< "$TOP")
CID=$(curl -s -X POST "$BASE/api/companies" -H 'Content-Type: application/json' -d "$PAY" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
echo "  company: $CID ($NAME)"

run_pipeline() {
  local TYPE="$1" TITLE="$2" RAW="$3"
  bold ""
  bold "===== Pipeline: $TYPE — $TITLE ====="

  PAYLOAD=$(python3 -c "import json,sys;print(json.dumps({'companyId':sys.argv[1],'title':sys.argv[2],'rawInput':sys.argv[3]}))" "$CID" "$TITLE" "$RAW")
  IRES=$(curl -s -X POST "$BASE/api/ideas" -H 'Content-Type: application/json' -d "$PAYLOAD")
  IID=$(echo "$IRES" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
  JID=$(echo "$IRES" | python3 -c "import sys,json;print(json.load(sys.stdin)['jobId'])")
  echo "  idea: $IID"

  poll "$JID" "triage" 15 > /dev/null || return 1
  GOT_TYPE=$(curl -s "$BASE/api/ideas/$IID" | python3 -c "import sys,json;print(json.load(sys.stdin)['primaryType'])")
  if [ "$GOT_TYPE" != "$TYPE" ]; then
    # Force the right track if classification disagrees
    echo "  $(gray "(classified as $GOT_TYPE, forcing $TYPE track)")"
    curl -s -X POST "$BASE/api/ideas/$IID/tracks" -H 'Content-Type: application/json' -d "{\"kind\":\"$TYPE\"}" > /dev/null
  fi
  TID=$(curl -s "$BASE/api/ideas/$IID" | python3 -c "
import sys, json
d = json.load(sys.stdin)
t = [t for t in d['tracks'] if t['kind']=='$TYPE']
print(t[0]['id'] if t else '')")
  echo "  track: $TID"

  case "$TYPE" in
    PRODUCT)  run_product "$TID" "$IID" ;;
    SERVICE)  run_service "$TID" "$IID" ;;
    SOFTWARE) run_software "$TID" "$IID" ;;
  esac
}

run_product() {
  local TID="$1" IID="$2"
  echo "  --- generate 4 sketch variations ---"
  RES=$(curl -s -X POST "$BASE/api/tracks/$TID/product/sketches" -H 'Content-Type: application/json' -d '{"n":4}')
  JID=$(echo "$RES" | python3 -c "import sys,json;print(json.load(sys.stdin)['jobId'])")
  poll "$JID" "sketches" 90 > /dev/null || { echo "  $(red PRODUCT FAIL: sketches)"; return 1; }

  INFO=$(curl -s "$BASE/api/tracks/$TID")
  ART=$(echo "$INFO" | python3 -c "import sys,json;print([a for a in json.load(sys.stdin)['artifacts'] if a['kind']=='SKETCH'][0]['id'])")
  V0=$(echo "$INFO" | python3 -c "import sys,json;a=[a for a in json.load(sys.stdin)['artifacts'] if a['kind']=='SKETCH'][0];print(a['currentVersionId'])")
  echo "  --- 4 versions saved, current: ${V0: -8} ---"

  echo "  --- generate 3D model (Meshy) ---"
  RES=$(curl -s -X POST "$BASE/api/tracks/$TID/product/mesh" -H 'Content-Type: application/json' -d "{\"sourceVersionId\":\"$V0\"}")
  JID=$(echo "$RES" | python3 -c "import sys,json;print(json.load(sys.stdin)['jobId'])")
  OUT=$(poll "$JID" "mesh-submit" 30) || { echo "  $(red PRODUCT FAIL: mesh submit)"; return 1; }
  POLL_JID=$(echo "$OUT" | python3 -c "import sys,json;print(json.load(sys.stdin)['output']['pollJobId'])")
  echo "  --- poll mesh task (this takes minutes for real Meshy) ---"
  OUT=$(poll "$POLL_JID" "mesh-poll" 180) || { echo "  $(red PRODUCT FAIL: mesh poll)"; return 1; }
  KEY=$(echo "$OUT" | python3 -c "import sys,json;d=json.load(sys.stdin);print((d.get('output') or {}).get('storageKey',''))")
  echo "  --- GLB key: $KEY ---"

  if [ -n "$KEY" ]; then
    curl -s "$BASE/api/storage/$KEY" -o /tmp/p.glb
    HEAD=$(head -c 4 /tmp/p.glb 2>/dev/null)
    if [ "$HEAD" = "glTF" ]; then
      echo "  $(green PRODUCT PASS): $(file /tmp/p.glb)"
    else
      echo "  $(red "PRODUCT WARN"): GLB doesn't start with 'glTF' magic"
      head -c 50 /tmp/p.glb | od -c | head -1
    fi
  fi
}

run_service() {
  local TID="$1" IID="$2"
  echo "  --- generate scene plan (auto-renders all frames after) ---"
  RES=$(curl -s -X POST "$BASE/api/tracks/$TID/service/scene-plan" -H 'Content-Type: application/json' -d '{"n":3}')
  JID=$(echo "$RES" | python3 -c "import sys,json;print(json.load(sys.stdin)['jobId'])")
  OUT=$(poll "$JID" "scene-plan" 20) || { echo "  $(red SERVICE FAIL: plan)"; return 1; }
  PA=$(echo "$OUT" | python3 -c "import sys,json;print(json.load(sys.stdin)['output']['artifactId'])")
  echo "  --- plan: $PA ---"

  # The plan handler auto-enqueues GEN_ALL_FRAMES — find that job.
  sleep 2
  ALL_JID=$(node -e "
const {PrismaClient} = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const j = await p.generationJob.findFirst({
    where: { trackId: '$TID', kind: 'GEN_ALL_FRAMES' },
    orderBy: { createdAt: 'desc' }
  });
  console.log(j ? j.id : '');
  await p.\$disconnect();
})();" 2>/dev/null)
  echo "  --- auto-spawned all-frames job: $ALL_JID ---"
  poll "$ALL_JID" "all-frames" 240 > /dev/null || { echo "  $(red SERVICE FAIL: all frames)"; return 1; }

  echo "  --- count rendered frames ---"
  node -e "
const {PrismaClient} = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const a = await p.artifact.findUnique({where: {id: '$PA'}, include: {versions: {orderBy: {createdAt: 'desc'}, take: 1}}});
  const plan = JSON.parse(a.versions[0].contentJson);
  for (const s of plan.scenes) console.log('    scene', s.index, ':', s.frameStorageKey ? 'PNG' : 'MISSING');
  await p.\$disconnect();
})();
" 2>/dev/null

  echo "  --- assemble MP4 (ffmpeg-static) ---"
  RES=$(curl -s -X POST "$BASE/api/tracks/$TID/service/video" -H 'Content-Type: application/json' -d "{\"scenePlanArtifactId\":\"$PA\"}")
  JID=$(echo "$RES" | python3 -c "import sys,json;print(json.load(sys.stdin)['jobId'])")
  OUT=$(poll "$JID" "assemble" 90) || { echo "  $(red SERVICE FAIL: assemble)"; return 1; }
  VKEY=$(echo "$OUT" | python3 -c "import sys,json;print(json.load(sys.stdin)['output']['videoStorageKey'])")
  USED=$(echo "$OUT" | python3 -c "import sys,json;print(json.load(sys.stdin)['output']['rendererUsed'])")
  echo "  --- video key: $VKEY (renderer=$USED) ---"
  curl -s "$BASE/api/storage/$VKEY" -o /tmp/s.mp4
  if file /tmp/s.mp4 | grep -q "ISO Media"; then
    echo "  $(green SERVICE PASS): $(file /tmp/s.mp4)"
  else
    echo "  $(red "SERVICE WARN"): $(file /tmp/s.mp4)"
  fi
}

run_software() {
  local TID="$1" IID="$2"
  echo "  --- generate product spec ---"
  RES=$(curl -s -X POST "$BASE/api/tracks/$TID/software/spec")
  JID=$(echo "$RES" | python3 -c "import sys,json;print(json.load(sys.stdin)['jobId'])")
  OUT=$(poll "$JID" "spec" 20) || { echo "  $(red SOFTWARE FAIL: spec)"; return 1; }
  SPEC=$(echo "$OUT" | python3 -c "import sys,json;print(json.load(sys.stdin)['output']['artifactId'])")
  echo "  --- spec: $SPEC ---"

  echo "  --- generate all screens ---"
  RES=$(curl -s -X POST "$BASE/api/tracks/$TID/software/screens" -H 'Content-Type: application/json' -d "{\"productSpecArtifactId\":\"$SPEC\"}")
  JID=$(echo "$RES" | python3 -c "import sys,json;print(json.load(sys.stdin)['jobId'])")
  OUT=$(poll "$JID" "screens" 120) || { echo "  $(red SOFTWARE FAIL: screens)"; return 1; }
  BUNDLE=$(echo "$OUT" | python3 -c "import sys,json;print(json.load(sys.stdin)['output']['artifactId'])")
  COUNT=$(echo "$OUT" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['output']['bundle']['screens']))")
  echo "  --- $COUNT screens rendered in bundle $BUNDLE ---"

  echo "  --- publish demo ---"
  RES=$(curl -s -X POST "$BASE/api/tracks/$TID/software/demo/publish" -H 'Content-Type: application/json' -d "{\"bundleArtifactId\":\"$BUNDLE\"}")
  SLUG=$(echo "$RES" | python3 -c "import sys,json;print(json.load(sys.stdin)['slug'])")
  echo "  --- share slug: $SLUG ---"
  HTTP=$(curl -s -o /tmp/demo.html -w "%{http_code}" "$BASE/demo/$SLUG")
  echo "  --- public demo HTTP $HTTP ($(wc -c < /tmp/demo.html)b) ---"
  if [ "$HTTP" = "200" ]; then
    echo "  $(green SOFTWARE PASS): demo published at /demo/$SLUG"
  else
    echo "  $(red SOFTWARE FAIL): /demo/$SLUG returned $HTTP"
  fi
}

OVERALL=0
run_pipeline "PRODUCT"  "Cat-ear gaming headset" "A wireless gaming headset shaped like a cat with backlit ears, plush ear cups, and a noise-cancelling boom mic." || OVERALL=1
run_pipeline "SERVICE"  "Story booth cafe"        "A cozy in-store story booth at Tim Hortons cafes where customers record a 60-second story for a chance to be featured. Subscription experience." || OVERALL=1
run_pipeline "SOFTWARE" "Receipt API"             "An API that turns receipt photos into structured expense data for accountants." || OVERALL=1

bold ""
if [ "$OVERALL" = "0" ]; then
  echo "$(green "ALL PIPELINES PASSED")"
else
  echo "$(red "AT LEAST ONE PIPELINE FAILED")"
fi
exit $OVERALL
