import Phaser from 'phaser';
import { DEPTH } from '../config/constants';

const TEXTURE = 'contact-shadow';
const TEXTURE_W = 64;
const TEXTURE_H = 16;
const HEIGHT_RATIO = 0.16;

function ensureTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEXTURE)) return;
  const canvas = scene.textures.createCanvas(TEXTURE, TEXTURE_W, TEXTURE_H)!;
  const ctx = canvas.getContext();
  ctx.translate(TEXTURE_W / 2, TEXTURE_H / 2);
  ctx.scale(TEXTURE_W / TEXTURE_H, 1);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, TEXTURE_H / 2);
  gradient.addColorStop(0, 'rgba(0,0,0,0.8)');
  gradient.addColorStop(0.6, 'rgba(0,0,0,0.5)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(-TEXTURE_H, -TEXTURE_H, TEXTURE_H * 2, TEXTURE_H * 2);
  canvas.refresh();
}

/** The soft dark patch that plants an object on a ledge. */
export function addContactShadow(scene: Phaser.Scene, x: number, y: number, width: number): Phaser.GameObjects.Image {
  ensureTexture(scene);
  const shadow = scene.add.image(x, y, TEXTURE).setDepth(DEPTH.CONTACT_SHADOW);
  shadow.setDisplaySize(width, Math.max(6, width * HEIGHT_RATIO));
  return shadow;
}
