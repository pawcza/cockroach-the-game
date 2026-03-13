import Phaser from 'phaser';

export const FONT_FAMILY = '"Press Start 2P", monospace';

export function getScale(): number {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 1.5 : 1;
}

/**
 * Obstacle type to texture key mapping, shared between GameOverScene
 * and MultiplayerGameOverScene.
 */
export const OBSTACLE_TEXTURE: Record<string, string> = {
  bird: 'bird',
  cat: 'cat-paw',
  flipper: 'flipper',
  newspaper: 'newspaper',
  onion: 'onion',
  spray: 'pest-spray',
  disco: 'disco-ball',
  jellyfish: 'jellyfish',
  pope: 'pope',
  bison: 'bison',
  blackhole: 'black-hole',
};

/** Polish death-cause labels used in multiplayer game-over rankings. */
export const OBSTACLE_LABEL: Record<string, string> = {
  onion: 'Cebula',
  spray: 'Spray',
  flipper: 'Klapek',
  newspaper: 'Gazeta',
  bird: 'Ptak',
  cat: '\u0141apa kota',
  disco: 'Dyskoteka',
  jellyfish: 'Meduza',
  pope: 'Papie\u017c',
  bison: '\u017bubr',
  blackhole: 'Czarna dziura',
  fall: 'Spad\u0142',
};
