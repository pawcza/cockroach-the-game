# Sound credits

Most sound effects in the game were made for it by `tools/audio` (`python3 tools/audio/build.py`, then `install.py`): numpy/scipy synthesis, some of it layered with a sample from a CC0 pack. Each sound is rebuilt the same way every time, and loudness is set per category.

- **Synthesised**: made entirely by `tools/audio`, no third-party samples in them.
- **Made from CC0 packs**: a sample from one of the packs below, processed and layered with synthesis.
  Every pack is released under CC0 1.0 (public-domain dedication): attribution is not required, and the credit lines are courtesy. Each pack's page, author, licence evidence and zip SHA-256 are in `tools/audio/licenses/`.
- Not listed here, and unchanged: the other sound effects (the obstacles' sounds that were kept, the pause crickets and so on), the music, and the boss growls adapted from Ogrebane's Monster Sound Pack (CC0, OpenGameArt.org); see [LICENSE](../LICENSE).

100 sounds shipped: 63 synthesised, 37 made from CC0 packs.

## Synthesised

- floor-switch (Drop to the bottom lane)
- dash-ready (Dash recharged)
- roach-noise (Roach ambient skitter (loops, every 20-35 s))
- heartbeat (Death replay heartbeat (loops; the old death sound ran at half speed))
- onion (Onion obstacle on screen)
- spray (Pest spray on screen)
- disco (Disco ball on screen)
- apple-a (Pick up an apple (also the combo chime base))
- pill (Pick up a pill)
- pill-end (Pill wears off)
- combo-tick-1 (Combo tick, 8 rising pitches (one per combo step))
- combo-tick-2 (Combo tick, 8 rising pitches (one per combo step))
- combo-tick-3 (Combo tick, 8 rising pitches (one per combo step))
- combo-tick-4 (Combo tick, 8 rising pitches (one per combo step))
- combo-tick-5 (Combo tick, 8 rising pitches (one per combo step))
- combo-tick-6 (Combo tick, 8 rising pitches (one per combo step))
- combo-tick-7 (Combo tick, 8 rising pitches (one per combo step))
- combo-tick-8 (Combo tick, 8 rising pitches (one per combo step))
- mult-up (Score multiplier goes up)
- combo-lost (Combo lost)
- na-styk (NA STYK! (close call))
- ui-hover (Hover / select / focus)
- ui-back (Back / close)
- ui-slider (Slider tick (settings))
- ui-error (Error / denied)
- stinger-01 (Score milestone sound, tier 1 of 14)
- stinger-02 (Score milestone sound, tier 2 of 14)
- stinger-03 (Score milestone sound, tier 3 of 14)
- stinger-04 (Score milestone sound, tier 4 of 14)
- stinger-05 (Score milestone sound, tier 5 of 14)
- stinger-06 (Score milestone sound, tier 6 of 14)
- stinger-07 (Score milestone sound, tier 7 of 14)
- stinger-08 (Score milestone sound, tier 8 of 14)
- stinger-09 (Score milestone sound, tier 9 of 14)
- stinger-10 (Score milestone sound, tier 10 of 14)
- stinger-11 (Score milestone sound, tier 11 of 14)
- stinger-12 (Score milestone sound, tier 12 of 14)
- stinger-13 (Score milestone sound, tier 13 of 14)
- stinger-14 (Score milestone sound, tier 14 of 14)
- boss-gun-a (Gun shot (pistol; boss shots + VS screen))
- vs-whoosh (VS screen: panel whoosh)
- vs-burst (VS screen: VS burst)
- ability-reward (Ability reward fanfare (icon lands + title slam))
- boss-defeat (Boss defeat: explosion series)
- victory (Victory jingle)
- lodzia-shockwave (Lane shockwave rumble)
- lodzia-spin (Thrown slipper spinning past)
- bigos-thump (Speaker thump (kick))
- bigos-charge (Charge-up before the blast)
- bigos-beam (Light beam hum (loops))
- bigos-sizzle (Overload sizzle)
- bigos-scratch-a (Record scratch)
- zl-gurgle (Drain gurgle rises (the boss appears))
- zl-slab-launch (Concrete slab launched)
- zl-spit (Sizzling, crackling spit)
- zl-fishbone (Fishbone flick)
- zl-bubble-blow (Bubble blown up)
- zl-bubble-pop (Bubble pops)
- zl-drain-away (Drain-away (boss sinks out))
- ex-pressure (Pressure hiss)
- ex-stream (Spray stream (loops, seamless ~1 s))
- ex-gas (Gas cloud hiss (loops, seamless))
- ex-mask (Mask breath)

## Made from CC0 packs

### kenney-casino-audio
- Page: https://kenney.nl/assets/casino-audio
- Author: Kenney (kenney.nl)
- Licence: CC0 1.0, http://creativecommons.org/publicdomain/zero/1.0/
- Files used:
  - `Audio/die-throw-2.ogg` -> lodzia-curler

### kenney-impact-sounds
- Page: https://kenney.nl/assets/impact-sounds
- Author: Kenney (kenney.nl)
- Licence: CC0 1.0, http://creativecommons.org/publicdomain/zero/1.0/
- Files used:
  - `Audio/impactGlass_light_004.ogg` -> moult-pop
  - `Audio/impactGlass_medium_002.ogg` -> combo-break
  - `Audio/impactMetal_heavy_001.ogg` -> vs-slam-1
  - `Audio/impactMetal_heavy_002.ogg` -> bigos-wreck
  - `Audio/impactMetal_heavy_003.ogg` -> vs-name
  - `Audio/impactMetal_heavy_004.ogg` -> zl-radiator
  - `Audio/impactMetal_light_001.ogg` -> bullet-ricochet
  - `Audio/impactMetal_light_003.ogg` -> lodzia-boomerang
  - `Audio/impactMetal_light_004.ogg` -> shell-casing
  - `Audio/impactMetal_medium_001.ogg` -> ex-tank-ping
  - `Audio/impactPlate_heavy_002.ogg` -> vs-slam-2
  - `Audio/impactPlate_heavy_003.ogg` -> lodzia-stomp
  - `Audio/impactPunch_heavy_000.ogg` -> przebicie
  - `Audio/impactPunch_heavy_001.ogg` -> lodzia-smack
  - `Audio/impactPunch_heavy_002.ogg` -> death-b
  - `Audio/impactPunch_medium_001.ogg` -> bullet-hit
  - `Audio/impactSoft_heavy_001.ogg` -> lodzia-slap
  - `Audio/impactSoft_medium_001.ogg` -> hop-land
  - `Audio/impactTin_medium_001.ogg` -> ex-lob
  - `Audio/impactTin_medium_003.ogg` -> ex-canister-pop

### kenney-rpg-audio
- Page: https://kenney.nl/assets/rpg-audio
- Author: Kenney (kenney.nl)
- Licence: CC0 1.0, http://creativecommons.org/publicdomain/zero/1.0/
- Files used:
  - `Audio/cloth1.ogg` -> lodzia-pocket
  - `Audio/cloth3.ogg` -> lodzia-whoosh
  - `Audio/creak2.ogg` -> zl-creak
  - `Audio/handleCoins2.ogg` -> ui-purchase
  - `Audio/handleSmallLeather.ogg` -> lodzia-pocket
  - `Audio/metalClick.ogg` -> beer-3
  - `Audio/metalLatch.ogg` -> ex-pump, ex-tank-vent

### kenney-sci-fi-sounds
- Page: https://kenney.nl/assets/sci-fi-sounds
- Author: Kenney (kenney.nl)
- Licence: CC0 1.0, http://creativecommons.org/publicdomain/zero/1.0/
- Files used:
  - `Audio/explosionCrunch_000.ogg` -> shot-down-b
  - `Audio/lowFrequency_explosion_001.ogg` -> bigos-blast-b

### kenney-ui-audio
- Page: https://kenney.nl/assets/ui-audio
- Author: Kenney (kenney.nl)
- Licence: CC0 1.0, http://creativecommons.org/publicdomain/zero/1.0/
- Files used:
  - `Audio/click4.ogg` -> ui-press-a

### oga-100-metal-wood
- Page: https://opengameart.org/content/100-cc0-metal-and-wood-sfx
- Author: rubberduck (OpenGameArt user)
- Licence: CC0 1.0, http://creativecommons.org/publicdomain/zero/1.0/
- Files used:
  - `keys_03.ogg` -> lodzia-pocket
  - `metal_slam_01.ogg` -> ex-tank-burst
  - `metal_spring_01.ogg` -> ex-lob

### oga-512-retro
- Page: https://opengameart.org/content/512-sound-effects-8-bit-style
- Author: SubspaceAudio (OpenGameArt user)
- Licence: CC0 1.0, http://creativecommons.org/publicdomain/zero/1.0/
- Files used:
  - `The Essential Retro Video Game Sound Effects Collection [512 sounds] By Juhani Junkala/Movement/Jumping and Landing/sfx_movement_jump5.wav` -> jump-b

### oga-75-breaking-hit
- Page: https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx
- Author: rubberduck (OpenGameArt user)
- Licence: CC0 1.0, http://creativecommons.org/publicdomain/zero/1.0/
- Files used:
  - `bfh1_breaking_01.ogg` -> przebicie
  - `bfh1_rock_falling_03.ogg` -> zl-slab-impact
  - `bfh1_rock_hit_01.ogg` -> zl-slab-impact

### oga-80-creature
- Page: https://opengameart.org/content/80-cc0-creature-sfx
- Author: rubberduck (OpenGameArt user)
- Licence: CC0 1.0, http://creativecommons.org/publicdomain/zero/1.0/
- Files used:
  - `burp_01.ogg` -> burp-a
  - `roar_02.ogg` -> zl-roar

### oga-squish
- Page: https://opengameart.org/content/squish-sounds-effects
- Author: EZduzziteh (OpenGameArt user)
- Licence: CC0 1.0, http://creativecommons.org/publicdomain/zero/1.0/
- Files used:
  - `oga-squish__squish_04.mp3` -> zl-splat
  - `oga-squish__squishsplat_impact.mp3` -> death-b

