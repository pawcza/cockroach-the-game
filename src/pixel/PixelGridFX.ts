import Phaser from 'phaser';
import { PIXEL_BLOCK } from '../config/constants';

// One colour per PIXEL_BLOCK × PIXEL_BLOCK block, taken from the block's top-left texel (no blending), so
// everything the camera draws, rotated or scaled, lands on the same coarse grid.
const FRAG = `
precision mediump float;
uniform sampler2D uMainSampler;
uniform vec2 uResolution;
uniform float uBlock;
varying vec2 outTexCoord;
void main() {
  vec2 texel = floor(outTexCoord * uResolution / uBlock) * uBlock + 0.5;
  gl_FragColor = texture2D(uMainSampler, texel / uResolution);
}
`;

export class PixelGridFX extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game: Phaser.Game) {
    super({ game, name: 'PixelGridFX', fragShader: FRAG });
  }

  onDraw(renderTarget: Phaser.Renderer.WebGL.RenderTarget): void {
    this.set2f('uResolution', renderTarget.width, renderTarget.height);
    this.set1f('uBlock', PIXEL_BLOCK);
    this.bindAndDraw(renderTarget);
  }
}
