#!/usr/bin/env bash
# Pipeline freshness test:
#   1. Run the full service pipeline (plan → frames → videos → assemble).
#   2. Snapshot all downstream artifact keys.
#   3. Re-render a single frame.
#   4. Assert: that scene's videoStorageKey is null (cascade-invalidated).
#   5. Edit a scene's imagePrompt via PATCH.
#   6. Assert: that scene's frame AND video are nulled.
#   7. Re-animate that one scene, re-assemble.
#   8. Assert: a NEW MP4 was written (different storageKey than the first).
#
# Uses an existing Story Booth idea so we don't re-pay for the initial
# frames/videos. Requires the dev server running on port 3210.

set -uo pipefail
PORT=${PORT:-3210}
BASE="http://localhost:${PORT}"

bold()  { printf "\033[1m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m" "$*"; }
red()   { printf "\033[31m%s\033[0m" "$*"; }

ok()   { printf "  %s %s\n" "$(green ✓)" "$*"; }
bad()  { printf "  %s %s\n" "$(red ✗)" "$*"; FAILED=1; }

FAILED=0

# ── poll helper ───────────────────────────────────────────────────────────
poll() {
  local jid="$1" label="$2" max="${3:-60}"
  local OUT STATUS PROG
  for _ in $(seq 1 "$max"); do
    sleep 3
    OUT=$(curl -s "$BASE/api/jobs/$jid")
    STATUS=$(echo "$OUT" | python3 -c "import sys,json;print(json.load(sys.stdin)['status'])" 2>/dev/null || echo "?")
    PROG=$(echo "$OUT" | python3 -c "import sys,json;print(json.load(sys.stdin)['progress'])" 2>/dev/null || echo "?")
    printf "    [%-10s] %-9s (%s%%)\r" "$label" "$STATUS" "$PROG" >&2
    if [[ "$STATUS" == "SUCCEEDED" || "$STATUS" == "FAILED" ]]; then
      printf "\n" >&2
      echo "$OUT"
      return
    fi
  done
  printf "\n" >&2
  echo "$OUT"
}

# ── 0. locate the Story Booth idea ────────────────────────────────────────
bold "=== locate Story Booth ==="
node -e "
const {PrismaClient} = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const i = await p.idea.findFirst({
    where:{title:{contains:'Story booth'}},
    include:{tracks:true},
    orderBy:{createdAt:'desc'}
  });
  const tid = i.tracks.find(t => t.kind === 'SERVICE').id;
  const plan = await p.artifact.findFirst({
    where:{trackId:tid, kind:'SCENE_PLAN'},
    orderBy:{createdAt:'desc'}
  });
  const video = await p.artifact.findFirst({
    where:{trackId:tid, kind:'VIDEO'},
    orderBy:{createdAt:'desc'},
    include:{versions:{orderBy:{createdAt:'desc'},take:1}},
  });
  console.log('IID=' + i.id);
  console.log('TID=' + tid);
  console.log('PA=' + plan.id);
  console.log('INITIAL_VIDEO_KEY=' + (video?.versions[0]?.storageKey ?? ''));
  await p.\$disconnect();
})();
" > /tmp/fresh-ids
cat /tmp/fresh-ids
TID=$(grep TID /tmp/fresh-ids | cut -d= -f2)
PA=$(grep PA /tmp/fresh-ids | cut -d= -f2)
INITIAL_VIDEO_KEY=$(grep INITIAL_VIDEO_KEY /tmp/fresh-ids | cut -d= -f2)

# Capture pre-test scene state
pre_state() {
  node -e "
const {PrismaClient} = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const a = await p.artifact.findUnique({where:{id:'$PA'}, include:{versions:{orderBy:{createdAt:'desc'},take:1}}});
  const plan = JSON.parse(a.versions[0].contentJson);
  console.log(JSON.stringify(plan.scenes.map(s => ({
    index: s.index,
    title: s.title,
    imagePrompt: s.imagePrompt,
    frameStorageKey: s.frameStorageKey,
    videoStorageKey: s.videoStorageKey,
  }))));
  await p.\$disconnect();
})();
"
}
echo ""
bold "=== before any change ==="
PRE=$(pre_state)
echo "$PRE" | python3 -c "
import sys, json
scenes = json.loads(sys.stdin.read())
for s in scenes:
    print(f\"  scene {s['index']:>2} {s['title'][:30]:<30}  frame={'YES' if s['frameStorageKey'] else 'NO ':<3}  video={'YES' if s['videoStorageKey'] else 'NO '}\")
"
SCENE0_FRAME_BEFORE=$(echo "$PRE" | python3 -c "import sys,json;print(json.loads(sys.stdin.read())[0]['frameStorageKey'])")
SCENE0_VIDEO_BEFORE=$(echo "$PRE" | python3 -c "import sys,json;print(json.loads(sys.stdin.read())[0]['videoStorageKey'])")

# ── 1. cascade test: regenerate scene 0 frame ──────────────────────────────
echo ""
bold "=== TEST 1: re-render scene 0 frame should clear its video ==="
RES=$(curl -s -X POST "$BASE/api/tracks/$TID/service/scenes/0/frame" -H 'Content-Type: application/json' -d "{\"scenePlanArtifactId\":\"$PA\"}")
JID=$(echo "$RES" | python3 -c "import sys,json;print(json.load(sys.stdin)['jobId'])")
poll "$JID" "frame-0" 40 > /dev/null

POST=$(pre_state)
SCENE0_FRAME_AFTER=$(echo "$POST" | python3 -c "import sys,json;print(json.loads(sys.stdin.read())[0]['frameStorageKey'])")
SCENE0_VIDEO_AFTER=$(echo "$POST" | python3 -c "import sys,json;print(json.loads(sys.stdin.read())[0]['videoStorageKey'])")
SCENE1_VIDEO_AFTER=$(echo "$POST" | python3 -c "import sys,json;print(json.loads(sys.stdin.read())[1]['videoStorageKey'])")

[ "$SCENE0_FRAME_AFTER" != "$SCENE0_FRAME_BEFORE" ] && ok "scene 0 frame changed (new storageKey)" || bad "scene 0 frame did NOT change"
[ "$SCENE0_VIDEO_AFTER" = "None" ] && ok "scene 0 video cleared (cascade)" || bad "scene 0 video NOT cleared (still '$SCENE0_VIDEO_AFTER')"
[ "$SCENE1_VIDEO_AFTER" != "None" ] && ok "scene 1 video unchanged (correctly preserved)" || bad "scene 1 video was wrongly cleared"

# ── 2. PATCH a scene's imagePrompt → both frame and video should clear ────
echo ""
bold "=== TEST 2: PATCH imagePrompt on scene 2 should clear frame+video ==="
PRE2=$(pre_state)
SCENE2_FRAME_BEFORE=$(echo "$PRE2" | python3 -c "import sys,json;print(json.loads(sys.stdin.read())[2]['frameStorageKey'])")
SCENE2_VIDEO_BEFORE=$(echo "$PRE2" | python3 -c "import sys,json;print(json.loads(sys.stdin.read())[2]['videoStorageKey'])")

# Build a new plan with scene 2's imagePrompt edited
NEW_PLAN=$(python3 -c "
import sys, json, urllib.request
data = urllib.request.urlopen('$BASE/api/tracks/$TID').read()
d = json.loads(data)
plan_art = [a for a in d['artifacts'] if a['kind']=='SCENE_PLAN'][0]
v = [v for v in plan_art['versions'] if v['id']==plan_art['currentVersionId']][0]
plan = json.loads(v['contentJson'])
# Make a meaningful change to scene 2's imagePrompt
plan['scenes'][2]['imagePrompt'] = 'EDITED — ' + plan['scenes'][2]['imagePrompt']
# Also tweak a caption (which should NOT invalidate anything)
plan['scenes'][1]['caption'] = 'CAPTION TWEAK'
print(json.dumps({'scenePlanArtifactId':'$PA','plan':plan}))
")
PATCH_RES=$(curl -s -X PATCH "$BASE/api/tracks/$TID/service/scene-plan" -H 'Content-Type: application/json' -d "$NEW_PLAN")
echo "  PATCH response: $PATCH_RES"

POST2=$(pre_state)
SCENE2_FRAME_AFTER=$(echo "$POST2" | python3 -c "import sys,json;print(json.loads(sys.stdin.read())[2]['frameStorageKey'])")
SCENE2_VIDEO_AFTER=$(echo "$POST2" | python3 -c "import sys,json;print(json.loads(sys.stdin.read())[2]['videoStorageKey'])")
SCENE1_FRAME_AFTER=$(echo "$POST2" | python3 -c "import sys,json;print(json.loads(sys.stdin.read())[1]['frameStorageKey'])")
SCENE1_VIDEO_AFTER=$(echo "$POST2" | python3 -c "import sys,json;print(json.loads(sys.stdin.read())[1]['videoStorageKey'])")

[ "$SCENE2_FRAME_AFTER" = "None" ] && ok "scene 2 frame cleared (imagePrompt change → frame invalid)" || bad "scene 2 frame NOT cleared (still '$SCENE2_FRAME_AFTER')"
[ "$SCENE2_VIDEO_AFTER" = "None" ] && ok "scene 2 video cleared (cascade from frame)" || bad "scene 2 video NOT cleared"
[ "$SCENE1_FRAME_AFTER" != "None" ] && ok "scene 1 frame preserved (only caption changed, not imagePrompt)" || bad "scene 1 frame wrongly cleared"
INVALIDATED_F=$(echo "$PATCH_RES" | python3 -c "import sys,json;print(json.load(sys.stdin).get('invalidatedFrames',-1))")
INVALIDATED_V=$(echo "$PATCH_RES" | python3 -c "import sys,json;print(json.load(sys.stdin).get('invalidatedVideos',-1))")
echo "  PATCH report: invalidatedFrames=$INVALIDATED_F, invalidatedVideos=$INVALIDATED_V"

# ── 3. assemble should produce a NEW MP4 ───────────────────────────────────
echo ""
bold "=== TEST 3: assemble should produce a new MP4 (after edits) ==="
# First, re-render the cleared frame so assemble doesn't fail
RES=$(curl -s -X POST "$BASE/api/tracks/$TID/service/scenes/2/frame" -H 'Content-Type: application/json' -d "{\"scenePlanArtifactId\":\"$PA\"}")
JID=$(echo "$RES" | python3 -c "import sys,json;print(json.load(sys.stdin)['jobId'])")
poll "$JID" "frame-2-re" 40 > /dev/null

# Assemble — should produce a brand new video version
RES=$(curl -s -X POST "$BASE/api/tracks/$TID/service/video" -H 'Content-Type: application/json' -d "{\"scenePlanArtifactId\":\"$PA\"}")
JID=$(echo "$RES" | python3 -c "import sys,json;print(json.load(sys.stdin)['jobId'])")
ASM=$(poll "$JID" "assemble" 30)
NEW_VIDEO_KEY=$(echo "$ASM" | python3 -c "import sys,json;print((json.load(sys.stdin).get('output') or {}).get('videoStorageKey',''))")
echo "  initial video key: ${INITIAL_VIDEO_KEY:-(none)}"
echo "  new     video key: $NEW_VIDEO_KEY"
[ -n "$NEW_VIDEO_KEY" ] && [ "$NEW_VIDEO_KEY" != "$INITIAL_VIDEO_KEY" ] && ok "assemble produced a NEW MP4 (fresh, not cached)" || bad "assemble did NOT produce a new key"

# Verify version lineage
node -e "
const {PrismaClient} = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const vid = await p.artifact.findFirst({where:{trackId:'$TID',kind:'VIDEO'}, include:{versions:{orderBy:{createdAt:'desc'},take:3}}});
  console.log('  VIDEO artifact has', vid.versions.length, 'recent versions:');
  for (const v of vid.versions) {
    console.log('   ', v.id.slice(-8), 'parent=', (v.parentVersionId || '—').slice(-8), 'key=', (v.storageKey||'').slice(-40));
  }
  await p.\$disconnect();
})();
"

echo ""
bold "=== summary ==="
if [ "$FAILED" = "0" ]; then
  echo "$(green ALL FRESHNESS TESTS PASSED)"
else
  echo "$(red SOME TESTS FAILED)"
fi
exit $FAILED
