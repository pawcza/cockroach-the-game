"""Renders the shop's art with a local ComfyUI (Krea 2 turbo): `python3 tools/art/comfy.py [name ...]`.

Free and local, no paid services. Mind the GPU: renders belong to 02:00-09:00 unless the owner says otherwise. Each
item renders a few seeds into art/renders/<name>-<seed>.png; the chosen one is copied by hand to art/sprites/shop/.
Skins start from art/sprites/roach.png (image to image), so they keep the roach's outline and the rig still fits.
"""
import json
import os
import shutil
import sys
import time
import urllib.request
from pathlib import Path

# Another local job may own the ComfyUI on :8188; a one-off run for the game uses another port
COMFY = os.environ.get("COMFY_URL", "http://127.0.0.1:8189")
COMFY_DIR = Path(__file__).resolve().parents[3] / "ComfyUI"
OUT = Path("art/renders")
SEEDS = tuple(int(s) for s in os.environ.get("SEEDS", "11,23,37").split(","))

STYLE = ("pixel art game sprite, 16-bit, crisp square pixels, bold dark outline, flat shading with two highlight tones, "
         "single object centred, isolated on a plain pure white background, no shadow, no text, no frame")

# Head: worn on top of the head, facing right
HEAD = {
    "korona": "a small golden royal crown with red and blue gems",
    "czapka": "a red baseball cap seen from the side, the bill pointing right",
    "kowbojski": "a brown leather cowboy hat seen from the side",
    "wiking": "a viking helmet with two curved white horns, seen from the side",
    "aureola": "a glowing golden halo ring, seen slightly from above",
    "imprezowa": "a bright colourful party hat cone with pink, yellow and blue stripes and a fluffy pom-pom on top",
    "smiglo-czapka": "a colourful striped beanie cap seen from the side, with a short stick on top",
    "smiglo": "a small red two-blade toy propeller seen from the front",
    "cylinder": "a tall black top hat with a red band, seen from the side",
    "sluchawki": "big chunky headphones seen from the side",
}
# Back: on the roach's back or its rear, facing right (the roach runs to the right)
BACK = {
    "rakieta": "a small retro metal rocket engine nozzle seen from the side, the opening pointing left",
    "plomien": "a rocket exhaust flame jet pointing left, orange and yellow, seen from the side",
    "piwo": "a can of beer seen from the side, green and gold label",
    "piana": "a small splash of white beer foam with bubbles",
    "skrzydlo": "a single translucent glittering fairy wing, pale blue and pink, seen from the side",
    "peleryna": "a red superhero cape flowing to the left, seen from the side",
    "plecak": "a small retro jetpack with two silver tanks, seen from the side",
    "balonik": "a shiny red party balloon on a thin white string",
}
# Skins: the roach repainted, from its own picture
SKINS = {
    "robot": "a chrome robot cockroach with rivets, metal plates and a glowing blue eye, metal legs",
    "zombie": "a zombie cockroach, sickly bright green rotting shell with purple bruises, black stitches and bandages",
    "lodowy": "a cockroach made of translucent blue ice crystals, frosty",
    "lawa": "a cockroach of black volcanic rock with glowing orange lava cracks",
    "kosmiczny": "a cockroach with a starry purple galaxy pattern, cosmic nebula shell",
    "zloty-metal": "a cockroach made of shiny polished solid gold metal",
}
SKIN_DENOISE = 0.62
# Repaints that barely took at the usual strength. Drift off the outline doesn't matter: the rig keeps the roach's own
SKIN_DENOISE_FOR = {"zombie": 0.68}


def graph(prompt: str, seed: int, prefix: str, init: str | None = None) -> dict:
    wf = {
        "unet": {"class_type": "UNETLoader", "inputs": {"unet_name": "krea2_turbo_fp8_scaled.safetensors", "weight_dtype": "default"}},
        "clip": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen3vl_4b_fp8_scaled.safetensors", "type": "krea2"}},
        "vae": {"class_type": "VAELoader", "inputs": {"vae_name": "qwen_image_vae.safetensors"}},
        "pos": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["clip", 0], "text": prompt}},
        "neg": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["pos", 0]}},
        "lat": {"class_type": "EmptySD3LatentImage", "inputs": {"width": 768, "height": 768, "batch_size": 1}},
        "ks": {"class_type": "KSampler", "inputs": {"model": ["unet", 0], "positive": ["pos", 0], "negative": ["neg", 0],
               "latent_image": ["lat", 0], "seed": seed, "steps": 12, "cfg": 1.0, "sampler_name": "euler",
               "scheduler": "simple", "denoise": 1.0}},
        "dec": {"class_type": "VAEDecode", "inputs": {"samples": ["ks", 0], "vae": ["vae", 0]}},
        "save": {"class_type": "SaveImage", "inputs": {"images": ["dec", 0], "filename_prefix": prefix}},
    }
    if init:
        wf["init_img"] = {"class_type": "LoadImage", "inputs": {"image": init}}
        wf["init_lat"] = {"class_type": "VAEEncode", "inputs": {"pixels": ["init_img", 0], "vae": ["vae", 0]}}
        wf["ks"]["inputs"]["latent_image"] = ["init_lat", 0]
        wf["ks"]["inputs"]["denoise"] = SKIN_DENOISE_FOR.get(prefix.split("/")[-1].rsplit("-", 1)[0], SKIN_DENOISE)
    return wf


def call(path: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(f"{COMFY}{path}", data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request) as response:
        return json.loads(response.read())


def render(name: str, prompt: str, seed: int, init: str | None = None) -> Path:
    prefix = f"roach-shop/{name}-{seed}"
    queued = call("/prompt", {"prompt": graph(prompt, seed, prefix, init)})["prompt_id"]
    while True:
        history = call(f"/history/{queued}")
        if queued in history:
            break
        time.sleep(1)
    image = next(iter(history[queued]["outputs"]["save"]["images"]))
    query = f"filename={image['filename']}&subfolder={image['subfolder']}&type=output"
    target = OUT / f"{name}-{seed}.png"
    with urllib.request.urlopen(f"{COMFY}/view?{query}") as response:
        target.write_bytes(response.read())
    return target


def main(names: list[str]) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    shutil.copy("art/sprites/roach.png", COMFY_DIR / "input" / "roach-shop-source.png")
    jobs = [(n, f"{p}, {STYLE}", None) for n, p in {**HEAD, **BACK}.items()]
    jobs += [(n, f"{p}, side view facing right, same pose and outline, {STYLE}", "roach-shop-source.png") for n, p in SKINS.items()]
    for name, prompt, init in jobs:
        if names and name not in names:
            continue
        for seed in SEEDS:
            started = time.time()
            path = render(name, prompt, seed, init)
            print(f"{path} {time.time() - started:.0f}s", flush=True)


if __name__ == "__main__":
    main(sys.argv[1:])
