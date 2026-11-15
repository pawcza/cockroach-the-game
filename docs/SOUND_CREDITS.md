# Sound credits

Most sound effects in the game were made for it by `tools/audio` (`python3 tools/audio/build.py`, then `install.py`): numpy/scipy synthesis, some of it layered with a sample from a CC0 pack. Each sound is rebuilt the same way every time, and loudness is set per category.

- **Synthesised**: made entirely by `tools/audio`, no third-party samples in them.
- **Made from CC0 packs**: a sample from one of the packs below, processed and layered with synthesis.
  Every pack is released under CC0 1.0 (public-domain dedication): attribution is not required, and the credit lines are courtesy. Each pack's page, author, licence evidence and zip SHA-256 are in `tools/audio/licenses/`.
- **Boss music**: each boss's fight track (`tools/audio/music/build_boss_music.py --mix`, music-*) and the two ambient loops under the versus screen and the ability screen (boss-prelude, boss-aftermath) are synthesised here too and listed with the rest below.
- **Level-skin sounds**: the sounds the level skins play in place of their base enemy's when that one would sound wrong (a party blower must not croak like a frog), `tools/audio/sounds_skins.py`, installed in `public/audio/skins/`; the skins whose base sound still fits keep it. Synthesised or made from the same packs, listed with the rest below.
- Not listed here, and unchanged: the other sound effects (the obstacles' sounds that were kept, the pause crickets and so on), the level music, and the boss growls adapted from Ogrebane's Monster Sound Pack (CC0, OpenGameArt.org); see [LICENSE](../LICENSE).

219 sounds shipped: 130 synthesised, 89 made from CC0 packs.

## Synthesised

- floor-switch (Drop to the bottom lane)
- dash-ready (Dash recharged)
- roach-noise (Roach ambient skitter (loops, every 20-35 s))
- heartbeat (Death replay heartbeat (loops; the old death sound ran at half speed))
- onion (Onion obstacle on screen)
- spray (Pest spray on screen)
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
- ex-leak (The tank leaks, whistling higher each rage step (played at rising rate))
- ex-rush (The charge passes along a lane)
- ex-whiff (A lunge into empty air)
- bigos-overload (His system overloads (drop bounced back))
- bigos-shriek (A speaker shrieks with feedback (played at 1.6x rate))
- bigos-defeat (DJ Bigos is defeated: the deck winds down)
- hedgehog (Hedgehog curls and rushes)
- centipede-rear (Centipede rears with a hiss, then scuttles)
- zapper-charge (Bug zapper charges)
- zapper-bolt (Bug zapper bolt)
- aerosol-rattle (Aerosol can shot: rattles before it blows)
- aerosol-blast (Aerosol can blast)
- bait-ooze (Poison bait oozes out)
- bleach-drip (Bleach drop falls and splashes)
- frog-croak (Frog's throat swells: croak)
- frog-tongue (Frog's tongue lashes out)
- repeller-hum (Ultrasonic repeller comes into view)
- repeller-ring (Repeller sends a ring down the lane)
- spraywall-puff (Spray can shakes and puffs its cloud wall)
- gull-screech (Gull screeches)
- hen-cluck (Hen clucks (the wind-up))
- robovac-whir (Robot vacuum comes into view)
- lamp-flicker (Lamp flickers)
- lamp-snap (Lamp snaps on)
- wasp-buzz (Wasp locks on, trembling)
- wasp-dive (Wasp dives)
- vacuum-roar (Vacuum cleaner's roar from behind)
- boss-prelude (Versus splash: tense pre-battle loop (every boss))
- boss-aftermath (Ability screen after a boss: calm relieved loop)
- lv2-fern-onion (Level 2 skin, potted fern: replaces onion)
- lv2-pipe-bleach-drip (Level 2 skin, leaking rusty water pipe: replaces bleach-drip)
- lv4-toadstool-onion (Level 4 skin, toadstool: replaces onion)
- lv4-puffball-spray (Level 4 skin, puffball mushroom puffing spores: replaces spray)
- lv4-molehole-vacuum-roar (Level 4 skin, molehill sucking things in: replaces vacuum-roar)
- lv5-candle-bleach-drip (Level 5 skin, candle dripping wax: replaces bleach-drip)
- lv5-angel-bird (Level 5 skin, flying nativity angel with a tiny trumpet: replaces bird)
- lv5-goose-hen-cluck (Level 5 skin, goose: replaces hen-cluck)
- lv5-carp-frog-croak (Level 5 skin, carp in a basin: replaces frog-croak)
- lv6-extinguisher-spray (Level 6 skin, fire extinguisher blast: replaces spray)
- lv6-coaster-bird (Level 6 skin, thrown beer coaster whizzing: replaces bird)
- lv6-blower-frog-croak (Level 6 skin, party blower: replaces frog-croak)
- lv6-speaker-vacuum-roar (Level 6 skin, bass speaker sucking in: replaces vacuum-roar)
- lv7-cormorant-hen-cluck (Level 7 skin, cormorant: replaces hen-cluck)
- lv7-shrimp-centipede-rear (Level 7 skin, shrimp rearing: replaces centipede-rear)
- lv8-thurible-spray (Level 8 skin, incense burner (chain clink, smoke puff): replaces spray)
- lv8-spacehen-hen-cluck (Level 8 skin, hen in a space helmet: replaces hen-cluck)
- lv8-spacehen-hen-peck (Level 8 skin, hen in a space helmet: replaces hen-peck)
- lv8-satellite-jellyfish (Level 8 skin, satellite (beeps): replaces jellyfish)
- lv8-meteor-gull-screech (Level 8 skin, meteor dive (whoosh and roar): replaces gull-screech)
- lv8-ufo-wasp-buzz (Level 8 skin, tiny UFO (hum, dive): replaces wasp-buzz)
- lv8-ufo-wasp-dive (Level 8 skin, tiny UFO (hum, dive): replaces wasp-dive)
- lv8-rover-robovac-whir (Level 8 skin, old lunar rover (motor whir, breaking): replaces robovac-whir)
- lv9-vodka-aerosol-rattle (Level 9 skin, vodka bottle (glass clink, shatter): replaces aerosol-rattle)
- lv9-lynx-cat (Level 9 skin, lynx pounce (snarl): replaces cat)
- lv9-shotglass-jellyfish (Level 9 skin, floating shot glass (glassy shimmer): replaces jellyfish)
- lv9-eagle-gull-screech (Level 9 skin, eagle dive (cry): replaces gull-screech)
- lv9-mosquito-wasp-buzz (Level 9 skin, huge mosquito (whine, dive): replaces wasp-buzz)
- lv9-mosquito-wasp-dive (Level 9 skin, huge mosquito (whine, dive): replaces wasp-dive)
- lv9-mushrooms-repeller-hum (Level 9 skin, glowing mushroom ring (hum, ring pulse): replaces repeller-hum)
- lv9-mushrooms-repeller-ring (Level 9 skin, glowing mushroom ring (hum, ring pulse): replaces repeller-ring)
- lv10-mutant-cat (Level 10 skin, three-eyed mutant cat pounce: replaces cat)
- lv10-fridge-jellyfish (Level 10 skin, small floating fridge (compressor hum, buzz, cold shimmer): replaces jellyfish)
- lv10-vulture-gull-screech (Level 10 skin, wasteland vulture dive (hoarse hiss-croak, wing rush): replaces gull-screech)
- lv10-drone-wasp-buzz (Level 10 skin, battered quadcopter drone (rotor whine, bearing rattle): replaces wasp-buzz)
- lv10-drone-wasp-dive (Level 10 skin, battered quadcopter drone (rotor whine, bearing rattle): replaces wasp-dive)
- music-lodzia-d (Pani Lodzia's fight music: Babcia na przesterze)
- music-bigos-f (DJ Bigos's fight music: Pompa na weselu)
- music-zlewiatan-c (Zlewiatan's fight music: Szlam z rury)
- music-eksterminator-d (Eksterminator's fight music: Opryskiwacz)

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
  - `Audio/footstep_concrete_001.ogg` -> boots-stomp
  - `Audio/impactGlass_heavy_000.ogg` -> lv9-vodka-aerosol-blast
  - `Audio/impactGlass_heavy_001.ogg` -> zl-head-smash
  - `Audio/impactGlass_heavy_002.ogg` -> lv6-mug-flipper
  - `Audio/impactGlass_light_001.ogg` -> lv5-bauble-onion
  - `Audio/impactGlass_light_004.ogg` -> moult-pop
  - `Audio/impactGlass_medium_002.ogg` -> combo-break
  - `Audio/impactMetal_heavy_000.ogg` -> zl-head-fall
  - `Audio/impactMetal_heavy_001.ogg` -> vs-slam-1
  - `Audio/impactMetal_heavy_002.ogg` -> bigos-wreck
  - `Audio/impactMetal_heavy_003.ogg` -> vs-name
  - `Audio/impactMetal_heavy_004.ogg` -> zl-radiator
  - `Audio/impactMetal_light_001.ogg` -> bullet-ricochet, lv10-pipe-newspaper
  - `Audio/impactMetal_light_002.ogg` -> boss-parry
  - `Audio/impactMetal_light_003.ogg` -> lodzia-boomerang
  - `Audio/impactMetal_light_004.ogg` -> shell-casing
  - `Audio/impactMetal_medium_001.ogg` -> ex-knock, ex-tank-ping
  - `Audio/impactMetal_medium_002.ogg` -> lv8-rover-robovac-crack
  - `Audio/impactMetal_medium_004.ogg` -> lv10-pipe-newspaper
  - `Audio/impactPlate_heavy_001.ogg` -> ex-shove
  - `Audio/impactPlate_heavy_002.ogg` -> vs-slam-2
  - `Audio/impactPlate_heavy_003.ogg` -> lodzia-stomp, zl-head-smash
  - `Audio/impactPlate_medium_001.ogg` -> zl-head-bounce
  - `Audio/impactPunch_heavy_000.ogg` -> przebicie
  - `Audio/impactPunch_heavy_001.ogg` -> lodzia-smack
  - `Audio/impactPunch_heavy_002.ogg` -> death-b, ex-struck
  - `Audio/impactPunch_medium_001.ogg` -> bullet-hit
  - `Audio/impactSoft_heavy_001.ogg` -> lodzia-slap
  - `Audio/impactSoft_heavy_002.ogg` -> mop-slap
  - `Audio/impactSoft_medium_001.ogg` -> hop-land
  - `Audio/impactSoft_medium_002.ogg` -> lv4-frond-newspaper
  - `Audio/impactSoft_medium_003.ogg` -> lv7-sandals-boots-stomp
  - `Audio/impactTin_medium_001.ogg` -> ex-lob, lv10-trolley-bison, robovac-crack
  - `Audio/impactTin_medium_002.ogg` -> ex-grenade-bounce, lv10-trolley-bison
  - `Audio/impactTin_medium_003.ogg` -> ex-canister-pop, lv10-trolley-bison, lv7-crab-cat
  - `Audio/impactWood_heavy_002.ogg` -> bigos-bonk
  - `Audio/impactWood_light_001.ogg` -> hen-peck, lv3-barrel-bleach-drip
  - `Audio/impactWood_light_003.ogg` -> lv8-scroll-newspaper
  - `Audio/impactWood_medium_002.ogg` -> lv4-rake-mop-slap, lv6-mug-flipper

### kenney-rpg-audio
- Page: https://kenney.nl/assets/rpg-audio
- Author: Kenney (kenney.nl)
- Licence: CC0 1.0, http://creativecommons.org/publicdomain/zero/1.0/
- Files used:
  - `Audio/bookFlip3.ogg` -> lv6-blower-frog-tongue
  - `Audio/bookPlace2.ogg` -> lv6-vinyl-newspaper
  - `Audio/cloth1.ogg` -> lodzia-pocket
  - `Audio/cloth2.ogg` -> lv7-windbreak-newspaper
  - `Audio/cloth3.ogg` -> ex-shove, lodzia-whoosh
  - `Audio/cloth4.ogg` -> lv4-frond-newspaper, lv7-windbreak-newspaper
  - `Audio/creak2.ogg` -> zl-creak, zl-head-fall
  - `Audio/handleCoins2.ogg` -> ui-purchase
  - `Audio/handleSmallLeather.ogg` -> lodzia-pocket
  - `Audio/metalClick.ogg` -> beer-3, ex-mine-arm
  - `Audio/metalLatch.ogg` -> ex-charge, ex-pump, ex-tank-vent

### kenney-sci-fi-sounds
- Page: https://kenney.nl/assets/sci-fi-sounds
- Author: Kenney (kenney.nl)
- Licence: CC0 1.0, http://creativecommons.org/publicdomain/zero/1.0/
- Files used:
  - `Audio/explosionCrunch_000.ogg` -> shot-down-b
  - `Audio/lowFrequency_explosion_001.ogg` -> bigos-blast-b
  - `Audio/slime_000.ogg` -> glue-squelch

### kenney-ui-audio
- Page: https://kenney.nl/assets/ui-audio
- Author: Kenney (kenney.nl)
- Licence: CC0 1.0, http://creativecommons.org/publicdomain/zero/1.0/
- Files used:
  - `Audio/click4.ogg` -> ui-press-a

### oga-100-cc0-sfx
- Page: https://opengameart.org/content/100-cc0-sfx
- Author: rubberduck (OpenGameArt user)
- Licence: CC0 1.0, http://creativecommons.org/publicdomain/zero/1.0/
- Files used:
  - `hit_01.ogg` -> lv3-flyswatter-flipper
  - `paper_01.ogg` -> lv6-vinyl-newspaper, lv8-scroll-newspaper
  - `paper_03.ogg` -> lv8-scroll-newspaper
  - `paper_04.ogg` -> lv8-scroll-newspaper
  - `plop_01.ogg` -> lv5-carp-frog-tongue
  - `plop_02.ogg` -> lv3-tomato-glue-squelch
  - `splash_01.ogg` -> lv5-carp-frog-tongue
  - `switch_01.ogg` -> lv4-flashlight-lamp-flicker
  - `switch_02.ogg` -> lv4-flashlight-lamp-flicker, lv4-flashlight-lamp-snap

### oga-100-cc0-sfx-2
- Page: https://opengameart.org/content/100-cc0-sfx-2
- Author: rubberduck (OpenGameArt user)
- Licence: CC0 1.0, http://creativecommons.org/publicdomain/zero/1.0/
- Files used:
  - `sfx100v2_glass_02.ogg` -> lv9-bottle-flipper
  - `sfx100v2_stones_01.ogg` -> lv8-moonrock-aerosol-blast

### oga-100-metal-wood
- Page: https://opengameart.org/content/100-cc0-metal-and-wood-sfx
- Author: rubberduck (OpenGameArt user)
- Licence: CC0 1.0, http://creativecommons.org/publicdomain/zero/1.0/
- Files used:
  - `keys_03.ogg` -> lodzia-pocket
  - `metal_sheet_03.ogg` -> lv10-sign-flipper
  - `metal_slam_01.ogg` -> ex-tank-burst
  - `metal_spring_01.ogg` -> ex-lob
  - `metal_spring_02.ogg` -> lv10-wire-hedgehog
  - `wood_cracking_03.ogg` -> lv9-tree-zapper-bolt
  - `wood_hit_01.ogg` -> lv7-windbreak-newspaper
  - `wood_hit_03.ogg` -> lv4-branch-flipper

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
  - `bfh1_glass_breaking_03.ogg` -> lv9-vodka-aerosol-blast
  - `bfh1_rock_breaking_01.ogg` -> lv8-moonrock-aerosol-blast
  - `bfh1_rock_falling_03.ogg` -> lv8-moonrock-aerosol-blast, zl-slab-impact
  - `bfh1_rock_hit_01.ogg` -> lv8-moonrock-aerosol-rattle, zl-slab-impact
  - `bfh1_wood_breaking_03.ogg` -> lv9-tree-zapper-bolt

### oga-80-creature
- Page: https://opengameart.org/content/80-cc0-creature-sfx
- Author: rubberduck (OpenGameArt user)
- Licence: CC0 1.0, http://creativecommons.org/publicdomain/zero/1.0/
- Files used:
  - `alien_03.ogg` -> lv8-alien-cat
  - `barking_01.ogg` -> lv6-dog-cat
  - `barking_02.ogg` -> lv6-dog-cat
  - `burble_01.ogg` -> lv8-blob-frog-croak
  - `burble_02.ogg` -> lv7-octopus-frog-croak
  - `burp_01.ogg` -> burp-a
  - `grunt_02.ogg` -> lv9-boar-robovac-whir
  - `grunt_03.ogg` -> lv9-boar-robovac-whir
  - `hurt_01.ogg` -> lv9-boar-robovac-crack
  - `roar_02.ogg` -> zl-roar

### oga-squish
- Page: https://opengameart.org/content/squish-sounds-effects
- Author: EZduzziteh (OpenGameArt user)
- Licence: CC0 1.0, http://creativecommons.org/publicdomain/zero/1.0/
- Files used:
  - `oga-squish__squish_03.mp3` -> lv3-tomato-glue-squelch
  - `oga-squish__squish_04.mp3` -> zl-splat
  - `oga-squish__squish_05.mp3` -> lv8-blob-frog-tongue
  - `oga-squish__squishpop.mp3` -> lv4-resin-stub-bleach-drip, lv7-octopus-frog-tongue
  - `oga-squish__squishsplat_impact.mp3` -> death-b

