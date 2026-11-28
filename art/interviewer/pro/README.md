# Building Cue

```
ref.png ──meshy_cue.py──> work/meshy_rigged.glb          Meshy image-to-3D + auto-rig (35 credits)
        ──meshy_prep.py─> work/rigged_meshy.glb          bone names
        ──face_rig.py───> work/cue_face_raw.glb          face shapes, with anchors.json
        ──build_cue_pro.py─> work/cue_pro_raw.glb, public/interviewer/cue.png, work/render/bust_*.png
        ──pack_web.mjs──> public/interviewer/cue.glb     1.75 MB
        ──brand.py──────> docs/brand/gen/examiner-1.png, examiner-2.png, public/examiner-mark.png
```

`work/meshy_rigged.glb` and `work/cue_face_raw.glb` are committed, so the last three steps run without Meshy.

```bash
B=/path/to/blender-5.3/blender.exe                 # Blender 5.3
CP=/path/to/CyberPlay_Lab/tools/charpipe           # shared character tools (meshy_prep, face_rig, pack_web)
cd art/interviewer/pro

python meshy_cue.py                       # only for a new reference; key in %USERPROFILE%\.meshy_key
$B -b --factory-startup --python $CP/meshy_prep.py -- work/meshy_rigged.glb work/rigged_meshy.glb
$B -b --factory-startup --python $CP/face_rig.py -- work/rigged_meshy.glb work/cue_face_raw.glb \
    --face mesh --max-tris 32000 --style stylized --height 1.68 --qa work/qa --landmarks work/landmarks.json --anchors anchors.json

$B -b --factory-startup --python build_cue_pro.py                 # add: -- --preview DIR  (pose stills)  or  -- --no-render
node $CP/pack_web.mjs work/cue_pro_raw.glb ../../../public/interviewer/cue.glb --tex 1024
node $CP/label_glb.mjs ../../../public/interviewer/cue.glb "AI-generated 3D model (Meshy, meshy.ai, paid plan, customer-owned output) from an AI-generated reference image (OpenAI gpt-image-2); rig, face shapes, props and animation finished in Blender for SpeakWise"
python brand.py                                                   # needs Pillow
```

After a rebuild, raise the `?v=` number on `cue.glb` in `components/interviewer/cueStage.ts`.

## What the app expects

`cueStage.ts` loads one animation and cuts it into poses by frame, at 24 fps. `RANGES` in `build_cue_pro.py` and the
`action(...)` calls in `cueStage.ts` must list the same frames. The camera is in `cueStage.ts`; the model is scaled so
the waist sits on the bottom edge of the stage.

## Known limits

- The glasses are part of the body mesh and the eyes are painted on the lenses, so the glasses cannot slide down her nose and the eyes cannot turn.
- The auto-rig has no finger bones. Hands keep their open shape.
- The speaking mouth follows a baked syllable pattern while the examiner's audio plays. It is not driven by the audio.
- `anchors.json` was measured by hand for this mesh. A new Meshy model needs new anchors.

## Check

`node playwright/cue-check.mjs out --live` joins a seeded local course and runs a two-question interview against a stand-in for the Live API. See the header of that file.
