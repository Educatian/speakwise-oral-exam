"""Cue reference image -> Meshy textured model (meshy-6, PBR, A-pose) -> auto-rig -> idle clip.

  python art/interviewer/pro/meshy_cue.py [--dry-run]

Adapted from CyberPlay Lab tools/charpipe/meshy_char.py. Resumable through work/meshy_manifest.json, so a
finished step is never paid twice. Every task is logged to meshy_ledger.jsonl with the balance before and after.
Key: env MESHY_API_KEY, else %USERPROFILE%\.meshy_key. It is never printed or written anywhere.
Cost (2026-11): image-to-3d 30, rigging 5, animation 3. Meshy deletes API outputs after 3 days; work/ keeps them."""
import base64, json, os, sys, time, urllib.error, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
W = os.path.join(HERE, "work")
API = "https://api.meshy.ai/openapi/v1"
LEDGER = os.path.join(HERE, "meshy_ledger.jsonl")
MAX_ATTEMPTS = 3          # first try + 2 regenerations
SPEND_CAP = 105           # owner-approved ceiling for this character
IDLE_ACTION = 0           # Meshy animation library: Idle
HEIGHT = 1.68


def key():
    k = os.environ.get("MESHY_API_KEY", "").strip()
    p = os.path.join(os.path.expanduser("~"), ".meshy_key")
    if not k and os.path.exists(p):
        k = open(p, encoding="utf-8").read().strip()
    if not k:
        sys.exit("No Meshy key (MESHY_API_KEY or %USERPROFILE%\.meshy_key).")
    return k


def call(method, path, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": "Bearer " + key(), "Content-Type": "application/json", "User-Agent": "charpipe/1.0"})
    for i in range(8):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            msg = e.read().decode()[:300]
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(15 * (i + 1)); continue
            sys.exit(f"Meshy HTTP {e.code} on {method} {path}: {msg}")
        except (urllib.error.URLError, TimeoutError):
            time.sleep(10 * (i + 1))
    sys.exit(f"Meshy: giving up on {method} {path}")


def balance():
    return call("GET", "/balance")["balance"]


def fetch(url, name):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "charpipe/1.0"}), timeout=300) as r, \
            open(os.path.join(W, name), "wb") as f:
        f.write(r.read())


def spent():
    if not os.path.exists(LEDGER):
        return 0
    return sum(json.loads(line).get("credits_consumed") or 0 for line in open(LEDGER, encoding="utf-8"))


def task(man, step, kind, body, cost):
    """Run one paid task unless the manifest already has it. Returns the finished task."""
    if not man.get(step):
        if spent() + cost > SPEND_CAP:
            sys.exit(f"SPEND_CAP {SPEND_CAP} reached ({spent()})")
        before = balance()
        man[step] = call("POST", "/" + kind, body)["result"]
        save(man)
        print(f"[meshy] {step} started", flush=True)
    else:
        before = None
    while True:
        t = call("GET", f"/{kind}/{man[step]}")
        if t.get("status") in ("SUCCEEDED", "FAILED", "CANCELED", "EXPIRED"):
            break
        time.sleep(10)
    if before is not None:
        after = balance()
        with open(LEDGER, "a", encoding="utf-8") as f:
            f.write(json.dumps({"time": time.strftime("%Y-%m-%d %H:%M:%S"), "step": step, "task_id": man[step], "status": t["status"],
                                "balance_before": before, "balance_after": after, # the balance is shared with other jobs, so trust the task's own figure when it reports one
                                "credits_consumed": t.get("consumed_credits", before - after)}) + "\n")
    if t["status"] != "SUCCEEDED":
        man.pop(step); save(man)
        sys.exit(f"{step}: {t['status']} {t.get('task_error')}")
    return t


def save(man):
    json.dump(man, open(os.path.join(W, "meshy_manifest.json"), "w"), indent=1)


def main():
    os.makedirs(W, exist_ok=True)
    mp = os.path.join(W, "meshy_manifest.json")
    man = json.load(open(mp)) if os.path.exists(mp) else {"attempts": 0}
    body = {"image_url": "data:image/png;base64,<ref.png>", "ai_model": "meshy-6", "should_texture": True, "enable_pbr": True,
            "pose_mode": "a-pose", "topology": "triangle", "should_remesh": True, "target_polycount": 30000,
            "symmetry_mode": "auto", "remove_lighting": True, "target_formats": ["glb"]}
    if "--dry-run" in sys.argv:
        print("POST /image-to-3d", json.dumps(body), "-> /rigging -> /animations  est 38"); return
    print("[meshy] balance before", balance(), "ledger spent", spent(), flush=True)
    if not man.get("model"):
        if man["attempts"] >= MAX_ATTEMPTS:
            sys.exit("max attempts reached")
        man["attempts"] += 1
        body["image_url"] = "data:image/png;base64," + base64.b64encode(open(os.path.join(HERE, "ref.png"), "rb").read()).decode()
    t = task(man, "model", "image-to-3d", body, 30)
    if not os.path.exists(os.path.join(W, "meshy_model.glb")):
        fetch(t["model_urls"]["glb"], "meshy_model.glb")
        if t.get("thumbnail_url"):
            fetch(t["thumbnail_url"], "meshy_thumb.png")
    if "--model-only" in sys.argv:
        print("[meshy] model done; balance", balance()); return
    t = task(man, "rig", "rigging", {"input_task_id": man["model"], "height_meters": HEIGHT}, 5)
    if not os.path.exists(os.path.join(W, "meshy_rigged.glb")):
        fetch((t.get("result") or t)["rigged_character_glb_url"], "meshy_rigged.glb")
    t = task(man, "idle", "animations", {"rig_task_id": man["rig"], "action_id": IDLE_ACTION}, 3)
    if not os.path.exists(os.path.join(W, "meshy_idle.glb")):
        fetch((t.get("result") or t)["animation_glb_url"], "meshy_idle.glb")
    print("[meshy] done; balance after", balance(), flush=True)


if __name__ == "__main__":
    main()
