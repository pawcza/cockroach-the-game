"""The roach's skins for the shop: painted ones that replace the body on the rig, repainted by tools/art/comfy.py from
the roach's own picture, keeping its outline. What it wears is in worn.py. Ids match src/config/skins.ts and
server/economy.ts."""

PAINTED = {name: f"art/sprites/shop/skin-{name}.png" for name in ("zombie", "lodowy", "robot", "lawa", "metal", "kosmiczny")}
