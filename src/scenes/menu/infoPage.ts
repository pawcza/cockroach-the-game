/**
 * Jak grać: a short illustrated guide in six pages, one tab each, every page fitting the area without scrolling.
 * The numbers it states are read from the game's own constants, never retyped.
 */
import Phaser from 'phaser';
import { APPLE_SCORE, BEER_SCORE, PILL_DURATION, PILL_SCORE, PILL_SPEED_MULTIPLIER } from '../../config/constants';
import { ATLAS, SPRITE_SCALE, frameOf, hasFrame, playLoop, textureOf } from '../../config/sprites';
import { BOSSES, type BossDef } from '../../systems/boss/bosses';
import { checkpointsUnlocked, profile } from '../../systems/Profile';
import { AMMO_PER_BOX, KILL_SCORE, MAGAZINE } from '../../systems/gunRules';
import { ENDLESS_NAME } from '../../systems/checkpoints';
import { comboMultiplier, DistancePoints, endlessBonus } from '../../systems/RunState';
import { DASH_THROUGH_SCORE, NEAR_MISS_SCORE } from '../../systems/RiskBonus';
import { buttonStyle, capCentreShift, smallStyle, UI_TEXT } from '../../utils/TextStyles';
import { ICON_HIDDEN } from '../../systems/achievementView';
import { addAchievementIcon } from '../../ui/achievementIcon';
import { addArrowKeycap, addKeycap } from '../../ui/Keycap';
import { addTabs, GAP, TAB_H, TOUCH_MIN, type Rect } from '../../ui/kit';
import { createButton, createPanel, type UIButton } from '../../ui/shared';

const BONE = UI_TEXT.bone;
/** Running text: a step brighter than the muted grey, which is for what is secondary. */
const IDLE = '#cdbfa9';
const MUTED = UI_TEXT.muted;
const GOLD = '#e8c15a';
const DANGER = '#e07a6a';

/** Each page keeps the accent of the quarter it grew from: pickups green, hazards red, controls blue, points gold. */
const ACCENT = { good: 0x6fc25a, bad: 0xc8503c, controls: 0x4aa3b8, points: 0xe8c15a, modes: 0xc9a0dc };

const PAD = 16;
const TOP = 12;
const LINE_SPACING = 4;
const CARD_GAP = 12;
/** A card's header row: its art on the left, then its name. */
const ICON_W = 72;
const HEADER_H = 64;
/** Art stands this far under the middle of its header row. */
const SPRITE_FEET = 28;
const CARD_H = 160;

const TABS = ['Sterowanie', 'Zbieraj', 'Unikaj', 'Punkty', 'Bossowie', 'Tryby'];

export interface InfoPage {
  /** Opened again: the pages that read the player's progress (the bosses) are drawn afresh. */
  refresh: () => void;
}

/** A number as Polish prints it: at most two decimals, a comma for the point, never a raw float. */
const fmt = (n: number): string => String(Math.round(n * 100) / 100).replace('.', ',');

interface Card {
  accent: number;
  title: string;
  /** Gold, under the title: what it scores. */
  tag?: string;
  titleColor?: string;
  /** Draws the art centred on (x, y). */
  icon: (x: number, y: number) => void;
  body: string;
}

export function buildInfoPage(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  /** Under the page's header (kit contentArea). */
  area: Rect,
  isMobile: boolean,
  onTutorial: () => void,
  /** The tabs and the page's own buttons, each time the page changes; `initial` is the one to focus. */
  onButtons: (buttons: UIButton[], initial: UIButton) => void,
): InfoPage {
  const cx = Math.round(area.x + area.w / 2);
  const body = scene.add.container(0, 0);
  const panel: Rect = { x: area.x, y: area.y + TAB_H + GAP, w: area.w, h: area.h - TAB_H - GAP };
  const inner = panel.w - PAD * 2;
  const left = panel.x + PAD;
  const top = panel.y + TOP;
  const floor = panel.y + panel.h - TOP;

  let current = 0;
  const tabs = addTabs(scene, container, {
    cx, y: area.y + TAB_H / 2, maxW: area.w, labels: TABS, onPick: (i) => show(i, tabs.buttons[i]),
  });
  container.add(body);

  // --- Pieces every page uses ---
  const text = (x: number, y: number, content: string, color: string, opts: { width?: number; originX?: number; size?: string } = {}): Phaser.GameObjects.Text => {
    const t = scene.add.text(x, y, content, smallStyle({
      fontSize: opts.size ?? '7px', color, strokeThickness: 0, lineSpacing: LINE_SPACING,
      ...(opts.width ? { wordWrap: { width: opts.width, useAdvancedWrap: true } } : {}),
    })).setOrigin(opts.originX ?? 0, 0);
    body.add(t);
    return t;
  };
  /** A text whose capitals, not its line box, sit on `cy`. */
  const centred = (x: number, cy: number, content: string, color: string, originX = 0): Phaser.GameObjects.Text => {
    const t = text(x, cy, content, color, { originX }).setOrigin(originX, 0.5);
    return t.setY(cy + capCentreShift(t));
  };

  /** An animated sprite of the game's art, centred; one whose pack has not streamed in yet is left out, not shown broken. */
  const sprite = (key: string) => (x: number, y: number): void => {
    const frame = frameOf(key);
    if (!hasFrame(frame)) return;
    // Its pivot is its baseline: it stands on a line half a header row under the middle
    const s = scene.add.sprite(x, y + SPRITE_FEET, textureOf(frame), frame).setScale(SPRITE_SCALE);
    playLoop(s, key);
    body.add(s);
  };
  /** A button's picture from the atlas, drawn at `scale` times the pixel grid's. */
  const buttonArt = (name: string, scale = 1) => (x: number, y: number): void => {
    body.add(scene.add.image(x, y, ATLAS, frameOf(name, 0)).setScale(SPRITE_SCALE * scale));
  };
  /** An achievement icon (24 native px): the picture for a thing a card is about; `ach-unknown` for what is not met yet. */
  const iconArt = (name: string) => (x: number, y: number): void => {
    body.add(addAchievementIcon(scene, x, y, name));
  };
  const unknownArt = iconArt(ICON_HIDDEN);

  /** A slab with a coloured bar on its left edge. */
  const slab = (x: number, y: number, w: number, h: number, accent: number): void => {
    body.add(createPanel(scene, x, y, w, h, 1));
    body.add(scene.add.rectangle(x, y, 4, h, accent).setOrigin(0, 0));
  };

  /** Four cards in two columns filling the page, centred from top to bottom. */
  const grid = (cards: Card[]): void => {
    const w = Math.floor((inner - CARD_GAP) / 2);
    const h = Math.min(CARD_H, Math.floor((panel.h - TOP * 2 - CARD_GAP) / 2));
    const first = Math.round(panel.y + (panel.h - (h * 2 + CARD_GAP)) / 2);
    cards.forEach((card, i) => {
      const x = left + (i % 2) * (w + CARD_GAP);
      const y = first + Math.floor(i / 2) * (h + CARD_GAP);
      slab(x, y, w, h, card.accent);
      const textX = x + 16;
      card.icon(x + 16 + ICON_W / 2, y + 12 + HEADER_H / 2);
      const titleY = card.tag ? y + 12 + HEADER_H / 2 - 12 : y + 12 + HEADER_H / 2;
      centred(x + 16 + ICON_W + 8, titleY, card.title, card.titleColor ?? BONE);
      if (card.tag) centred(x + 16 + ICON_W + 8, titleY + 24, card.tag, GOLD);
      const cursor = y + 12 + HEADER_H + 4;
      text(textX, cursor, card.body, IDLE, { width: w - 32 });
    });
  };

  // --- 1. Sterowanie ---
  const controls = (): UIButton[] => {
    const bottomRow = TOUCH_MIN + 12;
    const cardH = panel.h - TOP * 2 - bottomRow;
    const bigW = Math.round((inner - CARD_GAP) * 0.6);
    const smallW = inner - bigW - CARD_GAP;

    /** The keys: a keycap or two and what they do, a row each. */
    const keyboard = (x: number, y: number, w: number): void => {
      const rows: [string[], string][] = [
        [['up', 'down'], 'Zmiana toru'],
        [['right'], 'Dash'],
        [['SPACJA'], 'Strzał'],
        [['ESC'], 'Pauza'],
      ];
      const step = Math.min(56, Math.floor((cardH - 56 - 12) / rows.length));
      const textX = x + Math.min(160, Math.round(w * 0.45));
      rows.forEach(([keys, what], i) => {
        const cy = y + i * step + step / 2;
        let kx = x;
        for (const key of keys) {
          const cap = key === 'up' || key === 'down' || key === 'right' ? addArrowKeycap(scene, key) : addKeycap(scene, key, '10px');
          cap.setPosition(Math.round(kx + cap.displayWidth / 2), cy);
          body.add(cap);
          kx += cap.displayWidth + 8;
        }
        centred(textX, cy, what, BONE);
      });
    };

    /**
     * A phone's screen as the game lays it out (TouchControls: the left half takes the lane tap, the buttons stand in
     * the bottom corners, pause in the top one), every control named where it is. `s` is the diagram's scale to the game.
     */
    const phone = (x: number, y: number, w: number, h: number): void => {
      const s = w / scene.cameras.main.width;
      const g = scene.add.graphics();
      body.add(g);
      g.fillStyle(0x3d2e25, 1).fillRect(x - 2, y - 2, w + 4, h + 4);
      g.fillStyle(0x0d0906, 1).fillRect(x, y, w, h);
      g.fillStyle(0xe8c15a, 0.16).fillRect(x, y, w / 2, h);
      g.fillStyle(0x3d2e25, 1).fillRect(x + w / 2 - 1, y, 2, h);
      const grid = 4;
      const disc = (cx0: number, cy0: number, r: number, color: number): void => {
        for (let yy = -r; yy < r; yy += grid) {
          const half = Math.round(Math.sqrt(r * r - (yy + grid / 2) * (yy + grid / 2)) / grid) * grid;
          g.fillStyle(color, 1).fillRect(cx0 - half, cy0 + yy, half * 2, grid);
        }
      };
      // Where the game puts them: plates of 60 texels at the pixel scale, 12 in from the corner, 14 between
      const r = Math.max(8, Math.round(30 * SPRITE_SCALE * s / grid) * grid);
      const margin = Math.round(12 * s);
      const gunX = x + w - margin - r;
      const dashX = gunX - 2 * r - Math.round(14 * s);
      const baseY = y + h - margin - r;
      const laneX = x + margin + r;
      disc(laneX, baseY, r, 0x8a7d6b);
      disc(dashX, baseY, r, 0xe8c15a);
      disc(gunX, baseY, r, 0xb9a78d);
      const pauseR = Math.max(8, Math.round(12 * SPRITE_SCALE * s / grid) * grid);
      disc(x + w - margin - pauseR, y + margin + pauseR, pauseR, 0x8a7d6b);

      const lane = text(x + w / 4, y + h / 2 - 18, 'Dotknij:\nzmiana toru', BONE, { originX: 0.5 });
      lane.setAlign('center');
      // Names over their buttons, one a line higher than the other so neighbours never meet, each with a tick down to its button
      const tick = (tx: number, from: number, to: number): void => { g.fillStyle(0xcdbfa9, 1).fillRect(tx - 1, from, 2, to - from); };
      const name = (label: string, tx: number, ty: number, down: number, edge?: number): void => {
        // `edge`: the label's right end stays inside the screen, the tick still drops from over its button
        if (edge === undefined) centred(tx, ty, label, BONE, 0.5);
        else centred(edge, ty, label, BONE, 1);
        tick(tx, ty + 12, down);
      };
      // The lane button: the game draws it in this corner, though the whole left half takes the tap
      name('TOR', laneX, baseY - r - 12, baseY - r - 2);
      name('STRZAŁ', gunX, baseY - r - 34, baseY - r - 2, x + w - 6);
      name('DASH', dashX, baseY - r - 12, baseY - r - 2);
      centred(x + w - margin - 2 * pauseR - 12, y + margin + pauseR, 'Pauza', BONE, 1);
    };

    const keyboardFirst = !isMobile;
    const place = (device: 'keyboard' | 'phone', x: number, w: number): void => {
      slab(x, top, w, cardH, ACCENT.controls);
      centred(x + 16, top + 22, device === 'keyboard' ? 'Klawiatura' : 'Telefon', GOLD);
      const y = top + 44;
      if (device === 'keyboard') keyboard(x + 16, y, w);
      else {
        const availH = cardH - 44 - 12;
        const mockW = Math.min(w - 32, Math.round(availH * scene.cameras.main.width / scene.cameras.main.height));
        const mockH = Math.round(mockW * scene.cameras.main.height / scene.cameras.main.width);
        phone(x + Math.round((w - mockW) / 2), y, mockW, mockH);
      }
    };
    place(keyboardFirst ? 'keyboard' : 'phone', left, bigW);
    place(keyboardFirst ? 'phone' : 'keyboard', left + bigW + CARD_GAP, smallW);

    // The lesson again, and why two of the controls are not yet on the screen
    // (under the first tab, so the arrow down from it lands on it)
    const tutorial = createButton(scene, left + 100, floor - TOUCH_MIN / 2, 200, TOUCH_MIN, 'Samouczek', 0x444444,
      buttonStyle({ fontSize: '10px' }), onTutorial);
    body.add(tutorial.all);
    centred(left + inner, floor - TOUCH_MIN / 2, 'Dash i strzał dają bossowie.', MUTED, 1);
    return [tutorial];
  };

  // --- 2. Zbieraj ---
  const collect = (): UIButton[] => {
    const reachedAmmo = profile().stats.bestDistance >= BOSSES[1].triggerDistance;
    grid([
      {
        accent: ACCENT.good, icon: sprite('apple'), title: 'Jabłko', tag: `+${APPLE_SCORE} pkt`,
        body: 'Najczęstszy kąsek. Każdy zebrany dodaje +1 do kombo.',
      },
      {
        accent: ACCENT.good, icon: sprite('beer-1'), title: 'Piwo', tag: `+${BEER_SCORE} pkt`,
        body: `Trafia się rzadziej, ale płaci ${fmt(BEER_SCORE / APPLE_SCORE)} raza więcej niż jabłko. Też +1 do kombo.`,
      },
      {
        accent: ACCENT.good, icon: sprite('pill'), title: 'Pigułka', tag: `+${PILL_SCORE} pkt`,
        body: `Rzadka. Przez ${PILL_DURATION / 1000} s biegniesz ${fmt(PILL_SPEED_MULTIPLIER)}x szybciej, a przeszkody, w które wpadniesz, odlatują.`,
      },
      reachedAmmo
        ? {
            accent: ACCENT.good, icon: sprite('ammo'), title: 'Skrzynka z amunicją', tag: `+${AMMO_PER_BOX} naboje`,
            body: `Od poziomu 7. Uzupełnia magazynek, który mieści ${MAGAZINE} naboi.`,
          }
        : {
            accent: ACCENT.good, icon: unknownArt, title: '???', titleColor: MUTED,
            body: 'Dobiegnij dalej, a się dowiesz.',
          },
    ]);
    return [];
  };

  // --- 3. Unikaj ---
  const avoid = (): UIButton[] => {
    grid([
      {
        accent: ACCENT.bad, icon: sprite('onion'), title: 'Dotknięcie kończy bieg', titleColor: DANGER,
        body: 'Przeszkoda w twoim torze zabija. Zmień tor, żeby ją ominąć.',
      },
      {
        accent: ACCENT.bad, icon: sprite('spray'), title: 'Inna skórka, ten sam wróg',
        body: 'W każdym poziomie wrogowie wyglądają inaczej, ale zachowują się tak samo.',
      },
      {
        accent: ACCENT.bad, icon: sprite('bleach'), title: 'NA STYK!', tag: `+${NEAR_MISS_SCORE} pkt`,
        body: 'Zmień tor tuż przed uderzeniem. Dostajesz punkty i +1 do kombo.',
      },
      {
        // The same gate as the crate in Zbieraj: until the pistol's boss is reached, a neutral icon
        accent: ACCENT.bad, icon: profile().stats.bestDistance >= BOSSES[1].triggerDistance ? sprite('ammo') : iconArt('ach-bolt'), title: 'Dash i strzał', tag: `+${DASH_THROUGH_SCORE} / +${KILL_SCORE} pkt`,
        body: 'Dash przebija wszystko w twoim torze, strzał zdejmuje wroga. Oba dają bossowie.',
      },
    ]);
    return [];
  };

  // --- 4. Punkty i kombo ---
  const score = (): UIButton[] => {
    // The rules in players' numbers, read from the game's own functions
    const perCombo = (comboMultiplier(1) - 1) * 100;
    const comboExample = 40;
    const perMetreAtLevel1 = new DistancePoints(0).advance(1000, () => 1) / 1000;
    const levelExample = 8;
    const metreExample = new DistancePoints(0).advance(1000, () => levelExample) / 1000;
    // The server pays a run score / 100 (server/runs.ts runCrumbs): it cannot be imported here, it holds the database
    const pointsPerCrumb = 100;
    grid([
      {
        accent: ACCENT.points, icon: iconArt('ach-flame'), title: 'Kombo', tag: 'rośnie z każdym trafieniem',
        body: 'Zbierasz, mijasz na styk, przebijasz, strzelasz: kombo rośnie. Przegapiony przedmiot ucina je o połowę.',
      },
      {
        accent: ACCENT.points, icon: iconArt('ach-coin-10k'), title: 'Mnożnik', tag: `+${fmt(perCombo)}% za każde kombo`,
        body: `Kombo ${comboExample} = punkty x${fmt(comboMultiplier(comboExample))}. Od poziomu 11 dochodzi bonus: poziom 20 to jeszcze x${fmt(endlessBonus(20))}.`,
      },
      {
        accent: ACCENT.points, icon: iconArt('ach-shoe'), title: 'Dystans i czas', tag: `Metr płaci ${fmt(perMetreAtLevel1)} pkt × poziom`,
        body: `Na poziomie ${levelExample} to ${fmt(metreExample)} pkt za metr, niezależnie od kombo. Do tego 1 pkt za każdą sekundę.`,
      },
      {
        accent: ACCENT.points, icon: buttonArt('btn-crumb', 2), title: 'Okruszki', tag: `${pointsPerCrumb} punktów = 1 okruszek`,
        body: 'Dostajesz je za każdy bieg, jeśli jesteś zalogowany, co najmniej 1. Wydasz je w Szafie.',
      },
    ]);
    return [];
  };

  // --- 5. Bossowie i skróty ---
  const bosses = (): UIButton[] => {
    const { stats } = profile();
    const unlocked = checkpointsUnlocked();
    const order = [...BOSSES].sort((a, b) => a.triggerDistance - b.triggerDistance);
    // Meeting a boss is reaching his distance (the same rule as the achievements): until then he is "???", no spoilers
    const met = (boss: BossDef, i: number): boolean => stats.bestDistance >= boss.triggerDistance || unlocked > i;
    const reward: Record<BossDef['id'], string> = {
      lodzia: 'Dash. Po niej każdy bieg zaczynasz z nim.',
      bigos: `Pistolet do końca biegu: ${MAGAZINE} naboi, skrzynki uzupełniają.`,
      zlewiatan: 'Wylinka: jedno trafienie zrzuca pancerz zamiast cię zabić.',
      eksterminator: `${ENDLESS_NAME}: poziomy 11+ i własny ranking.`,
    };
    const rowH = 54;
    let y = top;
    order.forEach((boss, i) => {
      const known = met(boss, i);
      slab(left, y, inner, rowH, known ? boss.accent : 0x3d2e25);
      // The boss's head from the achievements' icons: in the core atlas, so always there
      const bx = left + 16 + ICON_W / 2;
      iconArt(known ? `ach-boss-${boss.id}` : ICON_HIDDEN)(bx, y + rowH / 2);
      const textX = left + 16 + ICON_W + 8;
      centred(textX, y + 15, known ? boss.name : '???', known ? BONE : MUTED);
      if (known) centred(left + inner - 16, y + 15, `${boss.triggerDistance} m`, GOLD, 1);
      centred(textX, y + rowH - 15, known ? reward[boss.id] : 'Dobiegnij dalej, a się dowiesz.', known ? IDLE : MUTED);
      y += rowH + 6;
    });
    const h = floor - y;
    slab(left, y, inner, h, ACCENT.points);
    text(left + 16, y + 10, 'Skróty', GOLD);
    text(left + 16, y + 38, 'Pokonany boss odkłada start tuż za siebie: wybierzesz go przyciskiem Start w menu. Taki bieg to Trening, bez rankingu. Wyjątek to start po ostatnim bossie: ma własny ranking.', IDLE, { width: inner - 32 });
    return [];
  };

  // --- 6. Tryby ---
  const modes = (): UIButton[] => {
    grid([
      {
        accent: ACCENT.modes, icon: buttonArt('btn-roach'), title: 'Jeden Karaluch',
        body: 'Jeden bieg, jedno życie. Wynik trafia do rankingu, jeśli jesteś zalogowany.',
      },
      {
        accent: ACCENT.modes, icon: buttonArt('btn-calendar'), title: 'Karaluch Dnia',
        body: 'Ten sam bieg dla wszystkich i jedna tablica na dzień. Liczy się twój najlepszy wynik.',
      },
      {
        accent: ACCENT.modes, icon: buttonArt('btn-roaches'), title: 'Zjazd Karaluchów',
        body: 'Biegnij ze znajomymi w jednym biegu i sprawdź, kto dobiegnie dalej.',
      },
      {
        accent: ACCENT.modes, icon: iconArt('ach-clipboard'), title: 'Misje i okruszki',
        body: 'Zalogowany dostajesz misje. Okruszki z misji, osiągnięć i biegów wydasz w Szafie.',
      },
    ]);
    return [];
  };

  const pages = [controls, collect, avoid, score, bosses, modes];

  const show = (i: number, focus?: UIButton): void => {
    current = i;
    tabs.setActive(i);
    body.removeAll(true);
    body.add(createPanel(scene, panel.x, panel.y, panel.w, panel.h));
    const own = pages[i]();
    onButtons([...tabs.buttons, ...own], focus ?? tabs.buttons[i]);
  };

  show(0);
  return { refresh: () => show(current) };
}
