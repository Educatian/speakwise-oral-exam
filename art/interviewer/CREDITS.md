# Cue — credits, sources and licences (2026-11-28)

Cue is a fictional character. She does not depict a real person.

## Shipped Cue: `public/interviewer/cue.glb`, `cue.png`

| Step | Tool | Licence / note |
|---|---|---|
| Concept sheets | OpenAI `gpt-image-2` (image edit), 9 images: `docs/cue/concept_*.jpg`, `docs/cue/ref_male_wit3.jpg`, `art/interviewer/pro/ref.png` | **AI-generated.** The first sheets were edits of the earlier Cue render; the owner chose option F1 from `docs/cue/concept_female_sheet.jpg`. |
| Mesh, texture, PBR maps | **Meshy** image-to-3D (`meshy-6`, A-pose, 30k triangles) through the API: `pro/meshy_cue.py` | **AI-generated.** Owner's paid Meshy Pro plan, existing monthly credits, nothing purchased. Meshy's Terms of Use give paid-plan customers ownership of their output; no attribution is required. |
| Body rig | Meshy auto-rig (biped) | Same terms. Bones renamed by CyberPlay Lab `charpipe/meshy_prep.py`. |
| Face shapes | Blender 5.3, CyberPlay Lab `charpipe/face_rig.py` with hand-measured anchors (`pro/anchors.json`), then `pro/build_cue_pro.py` | Own code. Blink, brows, smile, jaw and viseme morph targets; the glasses are masked out of every shape. |
| Bust crop, pencil and clipboard, 14-pose timeline, studio renders | Blender 5.3, `pro/build_cue_pro.py`, `pro/brand.py` | Own code. The props are modelled in the script, not generated. |
| Web pack | CyberPlay Lab `charpipe/pack_web.mjs` (WebP textures, sparse morph targets) and `label_glb.mjs` | Own code. The GLB carries the disclosure in `asset.copyright` and `asset.extras.ai_generated`. |

### Meshy credits (ledger: `pro/meshy_ledger.jsonl`)

| Task | Credits |
|---|---|
| image-to-3D | 30 |
| rigging | 5 |
| idle animation clip | 3 |
| **Total** | **38** (ceiling 105, no regenerations) |

Balance 745 before, 672 after. The other 35 of that drop belong to a different job that used the same account at the same time.
The idle clip was downloaded but is not used: the listening pose is authored in `build_cue_pro.py` so that it loops on the app's timeline.

### Sizes

| File | Before | After |
|---|---|---|
| `cue.glb` | 6.72 MB | 1.75 MB |
| triangles | — | 26.8k |
| textures | — | base colour 1024 px, normal and ORM 512 px, WebP |

## Earlier Cue (kept as the fallback)

`public/interviewer/cue-classic.glb` and `cue-classic.png`, built by `build_cue.py` with `continuous_skin.py`, `eyewear.py` and `face_surface.py` (Blender 5.0.1, `Cue.blend`). Own code, no external assets.
To switch back, set `CLASSIC = true` in `components/interviewer/cueStage.ts`.

## Trying a different concept later

`docs/cue/` keeps every concept sheet. `docs/cue/ref_male_wit3.jpg` is a ready front reference for the male "witty 3" option.
Replace `pro/ref.png`, delete `pro/work/meshy_manifest.json`, and follow `pro/README.md`. One character costs 35 Meshy credits.
