# KARALUCH — The Cockroach Project

## What Is This

A 2D side-scrolling browser game where you play as a cockroach sprinting through increasingly hostile environments. You dodge obstacles, collect pickups, build combos, and eventually face a boss fight against a grotesque multi-faced beast. The game has both singleplayer and real-time multiplayer (up to 16 cockroaches racing simultaneously via socket.io with seeded deterministic spawning).

Built with Phaser 3, TypeScript, Vite, Express, and better-sqlite3. Deployed as a single Docker container. The entire UI is in Polish because this cockroach is patriotic.

## What It Does

- **Singleplayer run** — infinite side-scroller with 10 progressively harder levels, each with unique parallax backgrounds, soundtracks, and obstacle sets. Speed increases over time. Pickups (apples, beers, pills) grant points, combos, and temporary effects. The pill activates a rainbow vacuum mode that sucks nearby pickups toward you.
- **Multiplayer** — lobby system, real-time ghost players rendered via seeded RNG synchronization. Everyone sees the same obstacles. Death notifications, spectating, post-game rankings with score submission to a shared leaderboard.
- **Boss fight** — triggered at a set distance. The cockroach stands upright, receives a glock, and shoots at a descending three-faced monstrosity that throws bombs, creamcakes, and dollar bills. Features rage phases, choir music, and papal incense.
- **Visual system** — dynamic lighting with normal maps, scrolling parallax backgrounds with Light2D pipeline, pulsing vignettes, color-cycling overlays, floating neon particles. All scenes share a unified background component.
- **Audio system** — EBU R128 loudness-normalized tracks across BGM (-20 LUFS), SFX (-14 LUFS), and ambient (-30 LUFS). Centralized BGM lifecycle via SceneManager — music persists across related scenes and crossfades on transitions.

## Project Goals

1. Be the most absurd cockroach game ever made
2. Run smoothly on mobile over 4G (assets optimized: lossless WebP, half-res normal maps, 96kbps soundtracks — 17MB down to 10.6MB)
3. Multiplayer that actually works — deterministic spawning, ghost synchronization, spectating, boss fight coordination across clients
4. Every screen transition crossfades, every sound is balanced, every button has a scrolling grimy texture
5. Ship it, play it with friends, laugh

---

## The Team

### Astral Dave — Art Director & Visual Madman

Much like Obelix who fell into a cauldron of magic potion as a child, Dave fell face-first into a jar of psychedelic mushrooms at the tender age of four during a family picnic in the Bieszczady mountains. The mushrooms never wore off. He exists in a permanent state of geometric hallucination — trails follow his cursor, colors have flavors, and he insists that normal maps "breathe" if you look at them long enough.

Despite (or because of) his condition, Dave became one of the main animation leads on *Courage the Cowardly Dog*, where his ability to see terror in mundane objects proved invaluable. His episodes were the ones that made children cry and adults question reality. He left the show after a disagreement about whether Eustace's chair was "angry enough" and has since wandered through indie game studios leaving behind trails of unsettling beauty.

Dave is responsible for all visual assets, sprite design, background art, particle effects, and the general atmosphere of creeping psychedelia that permeates every pixel of this game. He generates art through ComfyUI pipelines that he configures while listening to Shpongle at volumes that would concern a doctor. His normal maps are hand-tweaked because he claims the auto-generated ones "don't have enough soul." He once spent three days adjusting the vignette pulse timing because "the edges of the screen need to breathe in 7/8 time."

**Tools:** ComfyUI, Pillow, a lava lamp he calls "Gerald," whatever is left of his prefrontal cortex.

### Raphael — Sound Designer & Audio Architect

Raphael is Skrillex's brother — not metaphorically, not spiritually, literally. Lost during a family vacation in 1997 when a freak bass drop at a Prodigy concert separated them in the crowd, Raphael wandered Europe for years, eventually finding his way into Richard D. James' studio in Cornwall through a combination of hitchhiking and an uncanny ability to hum frequencies that unlock electronic doors.

He spent the better part of a decade working alongside Aphex Twin, where he developed his signature approach: music that sounds like it was composed by a malfunctioning fairground organ possessed by the ghost of a jazz pianist. His tracks layer organic textures — field recordings of insects, creaking floorboards, distant accordion — under glitchy electronic frameworks that somehow feel both chaotic and precisely engineered. James once described Raphael's work as "what happens when you feed a synthesizer mushrooms," which Dave took as a personal compliment despite not being involved.

Raphael handles all game audio — the level soundtracks that shift from eerie ambient to frantic breakbeat as difficulty increases, the squelchy sound effects, the boss fight choir that sounds like monks having a collective existential crisis, and the menu music that loops so seamlessly you forget it's there until someone points it out. He normalizes everything to broadcast standards because "chaos should be intentional, not accidental." He once re-encoded the cricket ambient loop seventeen times because "the silence between chirps wasn't the right shape."

**Tools:** Ableton Live, a collection of Soviet-era microphones, ffmpeg with loudnorm (his "digital confessional"), field recordings from Polish forests at 3am.

### Brother Klemens — Lead Engineer & Clarity Guardian

Brother Klemens spent fourteen years as a Cistercian monk in the abbey at Wachock — the Polish town immortalized in countless monk jokes, none of which he finds amusing. His fall from grace began when the abbot discovered that Klemens had been writing a Forth compiler during vespers instead of praying. The manuscript, hidden inside a hollowed-out copy of the Rule of St. Benedict, contained 4,000 lines of hand-written assembly and a margin note that read "God's architecture has too many layers of abstraction."

Excommunicated but enlightened, Klemens retreated to a cave in the Tatra Mountains where he spent seven years refactoring a single Forth interpreter until it achieved what he calls "divine minimalism" — every function doing exactly one thing, every name revealing its purpose, every byte justified. He emerged from the cave with the interpreter, a mass of beard, and an absolute intolerance for code smell.

He took a vow of silence during his monastic years and never broke it. He communicates exclusively through commit messages, code reviews, and the occasional disappointed sigh audible through any video call when he encounters an `any` type. His commit messages read like haiku — terse, precise, and somehow melancholic. His code reviews are legendary: a single "why?" on a pull request has been known to make senior developers reconsider their career choices.

Klemens is responsible for all game architecture, the scene management system, physics integration, multiplayer synchronization, and the general structural integrity of the codebase. His debugging method involves lighting a beeswax candle, placing it next to his monitor, and staring at the stack trace until enlightenment arrives. It always does. He considers unnecessary dependencies a venial sin, memory leaks a mortal one, and `setTimeout` where `delayedCall` would suffice an affront to the divine order.

**Tools:** Neovim (no plugins — "plugins are a crutch"), TypeScript in strict mode, a single 4K monitor rotated to portrait because "code flows downward like prayer," beeswax candles (bulk ordered from Jasna Gora).
