import { createCanvas } from 'canvas';
import fs from 'fs';

function saveCanvas(canvas, path) {
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path, buffer);
  const kb = (buffer.length / 1024).toFixed(1);
  console.log(`Created: ${path} (${kb} KB)`);
}

// ============================================================
// HELPER: draw an ellipse path (for older canvas polyfill)
// ============================================================
function ellipsePath(ctx, cx, cy, rx, ry) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(rx, ry);
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.restore();
}

// ============================================================
// 1. COCKROACH RUN SPRITESHEET  (384x64, 6 frames of 64x64)
// ============================================================
{
  const W = 64, H = 64, FRAMES = 6;
  const canvas = createCanvas(W * FRAMES, H);
  const ctx = canvas.getContext('2d');

  for (let f = 0; f < FRAMES; f++) {
    const ox = f * W; // frame offset x
    const phase = (f / FRAMES) * Math.PI * 2;

    ctx.save();
    ctx.translate(ox, 0);

    // --- Shadow under body ---
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ellipsePath(ctx, 30, 58, 22, 4);
    ctx.fill();

    // --- LEGS (3 pairs, alternating gait) ---
    // Each pair: left goes down when right goes up
    const legPairs = [
      { bodyX: 16, bodyY: 38 },
      { bodyX: 26, bodyY: 40 },
      { bodyX: 36, bodyY: 38 },
    ];

    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';

    for (let p = 0; p < 3; p++) {
      const lp = legPairs[p];
      // Each leg pair has opposite phase; middle pair offset by PI
      const legPhase = phase + (p % 2 === 0 ? 0 : Math.PI);

      // Left leg (goes down-left)
      const lFootX = lp.bodyX - 8 + Math.sin(legPhase) * 5;
      const lFootY = 54 + Math.cos(legPhase) * 3;
      const lKneeX = lp.bodyX - 5 + Math.sin(legPhase) * 2;
      const lKneeY = lp.bodyY + 6;

      ctx.strokeStyle = '#3a1a08';
      ctx.beginPath();
      ctx.moveTo(lp.bodyX, lp.bodyY);
      ctx.quadraticCurveTo(lKneeX, lKneeY, lFootX, lFootY);
      ctx.stroke();
      // Tiny foot
      ctx.strokeStyle = '#2a0a00';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(lFootX, lFootY);
      ctx.lineTo(lFootX - 2, lFootY + 2);
      ctx.stroke();
      ctx.lineWidth = 2.2;

      // Right leg (goes down-right)
      const rFootX = lp.bodyX + 8 - Math.sin(legPhase) * 5;
      const rFootY = 54 - Math.cos(legPhase) * 3;
      const rKneeX = lp.bodyX + 5 - Math.sin(legPhase) * 2;
      const rKneeY = lp.bodyY + 6;

      ctx.strokeStyle = '#3a1a08';
      ctx.beginPath();
      ctx.moveTo(lp.bodyX, lp.bodyY);
      ctx.quadraticCurveTo(rKneeX, rKneeY, rFootX, rFootY);
      ctx.stroke();
      ctx.strokeStyle = '#2a0a00';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(rFootX, rFootY);
      ctx.lineTo(rFootX + 2, rFootY + 2);
      ctx.stroke();
      ctx.lineWidth = 2.2;
    }

    // --- BODY (abdomen, thorax, head) ---
    // Abdomen (large back section)
    const abdGrad = ctx.createRadialGradient(22, 34, 2, 22, 34, 18);
    abdGrad.addColorStop(0, '#7a4422');
    abdGrad.addColorStop(0.5, '#5c3317');
    abdGrad.addColorStop(1, '#3a1a08');
    ctx.fillStyle = abdGrad;
    ctx.beginPath();
    ellipsePath(ctx, 22, 34, 16, 12);
    ctx.fill();

    // Body segments (subtle lines across abdomen)
    ctx.strokeStyle = 'rgba(30, 10, 0, 0.35)';
    ctx.lineWidth = 0.8;
    for (let s = 0; s < 4; s++) {
      const sy = 27 + s * 4;
      ctx.beginPath();
      ctx.moveTo(10, sy);
      ctx.quadraticCurveTo(22, sy + 1.5, 34, sy);
      ctx.stroke();
    }

    // Wings (folded, slightly darker overlay)
    ctx.fillStyle = 'rgba(60, 30, 10, 0.45)';
    ctx.beginPath();
    ctx.moveTo(12, 26);
    ctx.quadraticCurveTo(22, 22, 32, 26);
    ctx.quadraticCurveTo(22, 42, 12, 26);
    ctx.fill();
    // Wing vein
    ctx.strokeStyle = 'rgba(40, 15, 0, 0.3)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(14, 28);
    ctx.quadraticCurveTo(22, 26, 30, 28);
    ctx.stroke();

    // Thorax
    const thorGrad = ctx.createRadialGradient(40, 30, 1, 40, 30, 10);
    thorGrad.addColorStop(0, '#6b3820');
    thorGrad.addColorStop(1, '#4a2810');
    ctx.fillStyle = thorGrad;
    ctx.beginPath();
    ellipsePath(ctx, 40, 30, 8, 9);
    ctx.fill();

    // Head
    const headGrad = ctx.createRadialGradient(52, 28, 1, 52, 28, 7);
    headGrad.addColorStop(0, '#6b3820');
    headGrad.addColorStop(1, '#3a1a08');
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ellipsePath(ctx, 52, 28, 7, 6);
    ctx.fill();

    // Mandibles
    ctx.strokeStyle = '#2a0a00';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(57, 30);
    ctx.lineTo(60, 33);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(57, 26);
    ctx.lineTo(60, 23);
    ctx.stroke();

    // Eyes (compound, red with glow)
    ctx.fillStyle = '#cc0000';
    ctx.beginPath();
    ctx.arc(54, 25, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff3333';
    ctx.beginPath();
    ctx.arc(54.5, 24.5, 1.2, 0, Math.PI * 2);
    ctx.fill();

    // Second eye (slightly behind)
    ctx.fillStyle = '#990000';
    ctx.beginPath();
    ctx.arc(52, 24, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#cc2222';
    ctx.beginPath();
    ctx.arc(52.3, 23.5, 1, 0, Math.PI * 2);
    ctx.fill();

    // Antennae (wavy, animated)
    ctx.strokeStyle = '#3a1a08';
    ctx.lineWidth = 1.4;
    const antWave = Math.sin(phase) * 3;
    // Antenna 1
    ctx.beginPath();
    ctx.moveTo(56, 23);
    ctx.quadraticCurveTo(58, 14 + antWave, 62, 8 + antWave * 0.5);
    ctx.stroke();
    // Antenna tip
    ctx.fillStyle = '#5c3317';
    ctx.beginPath();
    ctx.arc(62, 8 + antWave * 0.5, 1.2, 0, Math.PI * 2);
    ctx.fill();
    // Antenna 2
    ctx.strokeStyle = '#3a1a08';
    ctx.beginPath();
    ctx.moveTo(54, 22);
    ctx.quadraticCurveTo(56, 12 - antWave, 60, 5 - antWave * 0.5);
    ctx.stroke();
    ctx.fillStyle = '#5c3317';
    ctx.beginPath();
    ctx.arc(60, 5 - antWave * 0.5, 1.2, 0, Math.PI * 2);
    ctx.fill();

    // Specular highlight on shell
    ctx.fillStyle = 'rgba(255,255,220,0.12)';
    ctx.beginPath();
    ellipsePath(ctx, 20, 30, 6, 3);
    ctx.fill();

    ctx.restore();
  }
  saveCanvas(canvas, 'public/sprites/cockroach-run.png');
}

// ============================================================
// 2. COCKROACH JUMP (64x64)
// ============================================================
{
  const canvas = createCanvas(64, 64);
  const ctx = canvas.getContext('2d');

  // Body angled slightly upward — we rotate
  ctx.save();
  ctx.translate(32, 36);
  ctx.rotate(-0.2); // slight upward angle
  ctx.translate(-32, -36);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.beginPath();
  ellipsePath(ctx, 30, 56, 18, 3);
  ctx.fill();

  // Tucked legs (pulled under body)
  ctx.strokeStyle = '#3a1a08';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (let p = 0; p < 3; p++) {
    const bx = 16 + p * 10;
    // Legs folded tightly
    ctx.beginPath();
    ctx.moveTo(bx, 40);
    ctx.quadraticCurveTo(bx - 2, 46, bx + 2, 48);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bx, 40);
    ctx.quadraticCurveTo(bx + 4, 46, bx + 1, 48);
    ctx.stroke();
  }

  // Abdomen
  const abdGrad = ctx.createRadialGradient(22, 36, 2, 22, 36, 18);
  abdGrad.addColorStop(0, '#7a4422');
  abdGrad.addColorStop(0.5, '#5c3317');
  abdGrad.addColorStop(1, '#3a1a08');
  ctx.fillStyle = abdGrad;
  ctx.beginPath();
  ellipsePath(ctx, 22, 36, 16, 11);
  ctx.fill();

  // Wings slightly spread
  ctx.fillStyle = 'rgba(80, 45, 20, 0.4)';
  ctx.beginPath();
  ctx.moveTo(8, 28);
  ctx.quadraticCurveTo(22, 18, 36, 28);
  ctx.quadraticCurveTo(22, 44, 8, 28);
  ctx.fill();
  // Second wing layer (spread out more)
  ctx.fillStyle = 'rgba(100, 60, 30, 0.25)';
  ctx.beginPath();
  ctx.moveTo(6, 26);
  ctx.quadraticCurveTo(22, 14, 38, 26);
  ctx.quadraticCurveTo(22, 46, 6, 26);
  ctx.fill();

  // Segments
  ctx.strokeStyle = 'rgba(30, 10, 0, 0.3)';
  ctx.lineWidth = 0.7;
  for (let s = 0; s < 3; s++) {
    const sy = 30 + s * 4;
    ctx.beginPath();
    ctx.moveTo(10, sy);
    ctx.quadraticCurveTo(22, sy + 1, 34, sy);
    ctx.stroke();
  }

  // Thorax
  ctx.fillStyle = '#4a2810';
  ctx.beginPath();
  ellipsePath(ctx, 40, 32, 8, 8);
  ctx.fill();

  // Head
  ctx.fillStyle = '#3a1a08';
  ctx.beginPath();
  ellipsePath(ctx, 52, 28, 7, 6);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#cc0000';
  ctx.beginPath();
  ctx.arc(54, 25, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ff3333';
  ctx.beginPath();
  ctx.arc(54.5, 24.5, 1.2, 0, Math.PI * 2);
  ctx.fill();

  // Antennae swept back
  ctx.strokeStyle = '#3a1a08';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(56, 23);
  ctx.quadraticCurveTo(60, 12, 63, 6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(54, 22);
  ctx.quadraticCurveTo(58, 10, 61, 3);
  ctx.stroke();
  // Antenna tips
  ctx.fillStyle = '#5c3317';
  ctx.beginPath(); ctx.arc(63, 6, 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(61, 3, 1.2, 0, Math.PI * 2); ctx.fill();

  // Second eye
  ctx.fillStyle = '#990000';
  ctx.beginPath();
  ctx.arc(52, 24, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#cc2222';
  ctx.beginPath();
  ctx.arc(52.3, 23.5, 1, 0, Math.PI * 2);
  ctx.fill();

  // Mandibles
  ctx.strokeStyle = '#2a0a00';
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(57, 30); ctx.lineTo(60, 33); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(57, 26); ctx.lineTo(60, 23); ctx.stroke();

  // Shell highlight
  ctx.fillStyle = 'rgba(255,255,220,0.1)';
  ctx.beginPath();
  ellipsePath(ctx, 20, 32, 6, 3);
  ctx.fill();

  // Motion lines (jumping upward)
  ctx.strokeStyle = 'rgba(150,130,100,0.25)';
  ctx.lineWidth = 1;
  for (let ml = 0; ml < 4; ml++) {
    ctx.beginPath();
    ctx.moveTo(14 + ml * 10, 54);
    ctx.lineTo(12 + ml * 10, 62);
    ctx.stroke();
  }

  ctx.restore();
  saveCanvas(canvas, 'public/sprites/cockroach-jump.png');
}

// ============================================================
// 3. COCKROACH DEAD (64x64) — flipped upside down
// ============================================================
{
  const canvas = createCanvas(64, 64);
  const ctx = canvas.getContext('2d');

  // Flip vertically — legs pointing UP
  ctx.save();
  ctx.translate(32, 32);
  ctx.scale(1, -1);
  ctx.translate(-32, -32);

  // Shadow (appears at top because flipped)
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ellipsePath(ctx, 30, 58, 20, 3);
  ctx.fill();

  // Stiff legs pointing down (will appear as UP after flip)
  ctx.strokeStyle = '#3a1a08';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (let p = 0; p < 3; p++) {
    const bx = 16 + p * 10;
    // Left leg - stiff, spread
    ctx.beginPath();
    ctx.moveTo(bx, 40);
    ctx.lineTo(bx - 8, 56);
    ctx.lineTo(bx - 10, 60);
    ctx.stroke();
    // Right leg
    ctx.beginPath();
    ctx.moveTo(bx, 40);
    ctx.lineTo(bx + 8, 56);
    ctx.lineTo(bx + 10, 60);
    ctx.stroke();
  }

  // Abdomen (pale underside since dead/flipped)
  const abdGrad = ctx.createRadialGradient(22, 36, 2, 22, 36, 16);
  abdGrad.addColorStop(0, '#8a6644');
  abdGrad.addColorStop(0.6, '#6c4a2e');
  abdGrad.addColorStop(1, '#4a2810');
  ctx.fillStyle = abdGrad;
  ctx.beginPath();
  ellipsePath(ctx, 22, 34, 16, 12);
  ctx.fill();

  // Thorax
  ctx.fillStyle = '#5a3418';
  ctx.beginPath();
  ellipsePath(ctx, 40, 30, 8, 9);
  ctx.fill();

  // Head
  ctx.fillStyle = '#4a2810';
  ctx.beginPath();
  ellipsePath(ctx, 52, 28, 7, 6);
  ctx.fill();

  ctx.restore();

  // X eyes (draw AFTER restoring so they're right-side up and visible)
  ctx.strokeStyle = '#ff0000';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  // Eye 1
  ctx.beginPath(); ctx.moveTo(50, 32); ctx.lineTo(55, 37); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(55, 32); ctx.lineTo(50, 37); ctx.stroke();
  // Eye 2
  ctx.beginPath(); ctx.moveTo(44, 33); ctx.lineTo(48, 37); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(48, 33); ctx.lineTo(44, 37); ctx.stroke();

  // Droopy antennae
  ctx.strokeStyle = '#3a1a08';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(54, 38);
  ctx.quadraticCurveTo(58, 44, 62, 50);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(52, 38);
  ctx.quadraticCurveTo(54, 46, 58, 54);
  ctx.stroke();

  // Little "soul leaving body" swirl (trippy touch)
  ctx.strokeStyle = 'rgba(200, 200, 255, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(32, 20);
  ctx.quadraticCurveTo(28, 14, 32, 10);
  ctx.quadraticCurveTo(36, 6, 32, 2);
  ctx.stroke();

  saveCanvas(canvas, 'public/sprites/cockroach-dead.png');
}

// ============================================================
// 4. APPLE (32x32) — glowing, saturated
// ============================================================
{
  const canvas = createCanvas(32, 32);
  const ctx = canvas.getContext('2d');

  // Outer glow
  ctx.fillStyle = 'rgba(255, 50, 50, 0.15)';
  ctx.beginPath();
  ctx.arc(16, 18, 15, 0, Math.PI * 2);
  ctx.fill();

  // Shadow underneath
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ellipsePath(ctx, 16, 30, 10, 2);
  ctx.fill();

  // Apple body
  const appleGrad = ctx.createRadialGradient(13, 15, 2, 16, 18, 13);
  appleGrad.addColorStop(0, '#ff4444');
  appleGrad.addColorStop(0.4, '#dd1111');
  appleGrad.addColorStop(0.8, '#aa0000');
  appleGrad.addColorStop(1, '#880000');
  ctx.fillStyle = appleGrad;
  ctx.beginPath();
  // Apple shape with indent at top
  ctx.moveTo(16, 7);
  ctx.bezierCurveTo(6, 8, 2, 18, 6, 26);
  ctx.bezierCurveTo(8, 30, 13, 31, 16, 30);
  ctx.bezierCurveTo(19, 31, 24, 30, 26, 26);
  ctx.bezierCurveTo(30, 18, 26, 8, 16, 7);
  ctx.fill();

  // Highlight/shine
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath();
  ctx.arc(11, 14, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.arc(10, 13, 2, 0, Math.PI * 2);
  ctx.fill();

  // Stem
  ctx.strokeStyle = '#553311';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(16, 8);
  ctx.quadraticCurveTo(17, 4, 18, 2);
  ctx.stroke();

  // Leaf
  ctx.fillStyle = '#22aa22';
  ctx.beginPath();
  ctx.moveTo(17, 5);
  ctx.quadraticCurveTo(23, 2, 26, 4);
  ctx.quadraticCurveTo(23, 7, 17, 5);
  ctx.fill();
  // Leaf vein
  ctx.strokeStyle = '#118811';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(18, 5);
  ctx.lineTo(24, 4);
  ctx.stroke();

  // Second leaf (smaller)
  ctx.fillStyle = '#33bb33';
  ctx.beginPath();
  ctx.moveTo(15, 6);
  ctx.quadraticCurveTo(10, 3, 7, 5);
  ctx.quadraticCurveTo(10, 8, 15, 6);
  ctx.fill();

  // Subtle red gradient overlay for depth
  ctx.fillStyle = 'rgba(100, 0, 0, 0.12)';
  ctx.beginPath();
  ctx.moveTo(16, 7);
  ctx.bezierCurveTo(22, 8, 28, 18, 26, 26);
  ctx.bezierCurveTo(22, 30, 18, 30, 16, 30);
  ctx.fill();

  // Bottom dimple shadow
  ctx.fillStyle = 'rgba(80, 0, 0, 0.15)';
  ctx.beginPath();
  ctx.arc(16, 28, 4, 0, Math.PI);
  ctx.fill();

  // Extra sparkle dot
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.arc(10, 12, 1, 0, Math.PI * 2);
  ctx.fill();

  saveCanvas(canvas, 'public/sprites/apple.png');
}

// ============================================================
// 5. PEST SPRAY (64x96)
// ============================================================
{
  const canvas = createCanvas(64, 96);
  const ctx = canvas.getContext('2d');

  // Green mist cloud from nozzle
  for (let i = 5; i >= 0; i--) {
    ctx.fillStyle = `rgba(80, 220, 80, ${0.04 + i * 0.02})`;
    ctx.beginPath();
    ctx.arc(32 + i * 2, 82 + i * 3, 12 + i * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Mist particles
  ctx.fillStyle = 'rgba(100, 255, 100, 0.15)';
  for (let i = 0; i < 8; i++) {
    const mx = 20 + Math.random() * 24;
    const my = 70 + Math.random() * 24;
    ctx.beginPath();
    ctx.arc(mx, my, 2 + Math.random() * 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Can body
  const canGrad = ctx.createLinearGradient(18, 0, 46, 0);
  canGrad.addColorStop(0, '#cc2222');
  canGrad.addColorStop(0.3, '#ee4444');
  canGrad.addColorStop(0.5, '#ffcc00');
  canGrad.addColorStop(0.7, '#ee4444');
  canGrad.addColorStop(1, '#aa1111');
  ctx.fillStyle = canGrad;
  // Rounded rectangle for can
  const cx = 18, cy = 8, cw = 28, ch = 52, cr = 4;
  ctx.beginPath();
  ctx.moveTo(cx + cr, cy);
  ctx.lineTo(cx + cw - cr, cy);
  ctx.quadraticCurveTo(cx + cw, cy, cx + cw, cy + cr);
  ctx.lineTo(cx + cw, cy + ch - cr);
  ctx.quadraticCurveTo(cx + cw, cy + ch, cx + cw - cr, cy + ch);
  ctx.lineTo(cx + cr, cy + ch);
  ctx.quadraticCurveTo(cx, cy + ch, cx, cy + ch - cr);
  ctx.lineTo(cx, cy + cr);
  ctx.quadraticCurveTo(cx, cy, cx + cr, cy);
  ctx.fill();

  // Can highlight stripe
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(22, 10, 4, 48);

  // Label area (white band)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(20, 22, 24, 20);
  // Skull symbol on label
  ctx.fillStyle = '#222222';
  // Skull circle
  ctx.beginPath();
  ctx.arc(32, 29, 5, 0, Math.PI * 2);
  ctx.fill();
  // Skull eyes
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(30, 28, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(34, 28, 1.5, 0, Math.PI * 2);
  ctx.fill();
  // Skull nose
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(31.5, 30, 1.2, 1.5);
  // Crossbones
  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(26, 35); ctx.lineTo(38, 39);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(38, 35); ctx.lineTo(26, 39);
  ctx.stroke();

  // Warning stripe at bottom
  for (let s = 0; s < 7; s++) {
    ctx.fillStyle = s % 2 === 0 ? '#ffcc00' : '#222222';
    ctx.fillRect(18 + s * 4, 50, 4, 8);
  }

  // Nozzle/cap
  ctx.fillStyle = '#666666';
  ctx.fillRect(28, 2, 8, 8);
  // Nozzle tip
  ctx.fillStyle = '#888888';
  ctx.beginPath();
  ctx.moveTo(32, 60);
  ctx.lineTo(28, 66);
  ctx.lineTo(36, 66);
  ctx.closePath();
  ctx.fill();
  // Spray button on top
  ctx.fillStyle = '#444444';
  ctx.fillRect(30, 0, 4, 4);

  // Metallic rim top
  ctx.fillStyle = '#999999';
  ctx.fillRect(19, 8, 26, 2);
  // Metallic rim bottom
  ctx.fillStyle = '#888888';
  ctx.fillRect(19, 58, 26, 2);

  saveCanvas(canvas, 'public/sprites/pest-spray.png');
}

// ============================================================
// 6. NEWSPAPER (96x64) — rolled up, being swung
// ============================================================
{
  const canvas = createCanvas(96, 64);
  const ctx = canvas.getContext('2d');

  ctx.save();
  ctx.translate(48, 32);
  ctx.rotate(-0.25); // tilted for "swinging" look
  ctx.translate(-48, -32);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ellipsePath(ctx, 48, 58, 38, 4);
  ctx.fill();

  // Rolled newspaper body (cylinder shape)
  const paperGrad = ctx.createLinearGradient(0, 14, 0, 50);
  paperGrad.addColorStop(0, '#f0e8d8');
  paperGrad.addColorStop(0.3, '#e8dcc8');
  paperGrad.addColorStop(0.7, '#d8ccb4');
  paperGrad.addColorStop(1, '#c8bca0');
  ctx.fillStyle = paperGrad;

  // Main cylinder
  ctx.beginPath();
  ctx.moveTo(10, 18);
  ctx.lineTo(86, 18);
  ctx.quadraticCurveTo(90, 32, 86, 46);
  ctx.lineTo(10, 46);
  ctx.quadraticCurveTo(6, 32, 10, 18);
  ctx.fill();

  // Paper edge lines (text illusion)
  ctx.strokeStyle = 'rgba(100, 80, 60, 0.25)';
  ctx.lineWidth = 0.6;
  for (let ln = 0; ln < 8; ln++) {
    const ly = 21 + ln * 3.2;
    ctx.beginPath();
    ctx.moveTo(14, ly);
    ctx.lineTo(82, ly);
    ctx.stroke();
  }

  // "Headlines" — thicker lines representing text
  ctx.strokeStyle = 'rgba(60, 40, 20, 0.45)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(14, 22);
  ctx.lineTo(50, 22);
  ctx.stroke();
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(14, 26);
  ctx.lineTo(70, 26);
  ctx.stroke();

  // Rubber band in the middle
  ctx.fillStyle = '#8B4513';
  ctx.fillRect(42, 16, 12, 32);
  // Rubber band highlight
  ctx.fillStyle = 'rgba(255,200,150,0.3)';
  ctx.fillRect(44, 16, 3, 32);
  // Rubber band edges
  ctx.strokeStyle = '#6a3210';
  ctx.lineWidth = 1;
  ctx.strokeRect(42, 16, 12, 32);

  // End of roll (circular opening visible on right)
  ctx.fillStyle = '#d8ccb4';
  ctx.beginPath();
  ellipsePath(ctx, 86, 32, 4, 14);
  ctx.fill();
  ctx.strokeStyle = '#b0a488';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ellipsePath(ctx, 86, 32, 4, 14);
  ctx.stroke();
  // Inner spiral of rolled paper
  ctx.strokeStyle = 'rgba(100, 80, 60, 0.3)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ellipsePath(ctx, 86, 32, 2, 8);
  ctx.stroke();

  // Left end
  ctx.fillStyle = '#d8ccb4';
  ctx.beginPath();
  ellipsePath(ctx, 10, 32, 4, 14);
  ctx.fill();
  ctx.strokeStyle = '#b0a488';
  ctx.beginPath();
  ellipsePath(ctx, 10, 32, 4, 14);
  ctx.stroke();

  // Motion lines (swinging effect)
  ctx.strokeStyle = 'rgba(180,160,140,0.4)';
  ctx.lineWidth = 1.2;
  for (let ml = 0; ml < 3; ml++) {
    ctx.beginPath();
    ctx.moveTo(88 + ml * 4, 20 + ml * 3);
    ctx.lineTo(92 + ml * 4, 44 - ml * 3);
    ctx.stroke();
  }

  ctx.restore();
  saveCanvas(canvas, 'public/sprites/newspaper.png');
}

// ============================================================
// 7. ONION (48x48) — stinky, layered
// ============================================================
{
  const canvas = createCanvas(48, 48);
  const ctx = canvas.getContext('2d');

  // Stink lines (wavy green, drawn behind)
  ctx.strokeStyle = 'rgba(80, 180, 40, 0.5)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    const sx = 10 + i * 10;
    ctx.beginPath();
    ctx.moveTo(sx, 16);
    ctx.quadraticCurveTo(sx - 3, 10, sx, 6);
    ctx.quadraticCurveTo(sx + 3, 2, sx, -2);
    ctx.stroke();
  }
  // Extra stink wisps
  ctx.strokeStyle = 'rgba(100, 200, 60, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(16, 14);
  ctx.quadraticCurveTo(13, 8, 16, 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(32, 14);
  ctx.quadraticCurveTo(35, 8, 32, 2);
  ctx.stroke();

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ellipsePath(ctx, 24, 46, 14, 2);
  ctx.fill();

  // Roots at bottom
  ctx.strokeStyle = '#8B7355';
  ctx.lineWidth = 1;
  for (let r = 0; r < 5; r++) {
    ctx.beginPath();
    ctx.moveTo(18 + r * 3, 42);
    ctx.quadraticCurveTo(16 + r * 3, 46, 15 + r * 4, 47);
    ctx.stroke();
  }

  // Onion body
  const onionGrad = ctx.createRadialGradient(22, 30, 3, 24, 32, 16);
  onionGrad.addColorStop(0, '#e8cc88');
  onionGrad.addColorStop(0.4, '#cc88cc');
  onionGrad.addColorStop(0.7, '#9944aa');
  onionGrad.addColorStop(1, '#662288');
  ctx.fillStyle = onionGrad;
  ctx.beginPath();
  // Onion shape: wider at bottom, narrower at top
  ctx.moveTo(24, 16);
  ctx.bezierCurveTo(8, 20, 6, 36, 14, 42);
  ctx.bezierCurveTo(18, 45, 30, 45, 34, 42);
  ctx.bezierCurveTo(42, 36, 40, 20, 24, 16);
  ctx.fill();

  // Layer lines (visible onion layers)
  ctx.strokeStyle = 'rgba(120, 50, 150, 0.35)';
  ctx.lineWidth = 0.8;
  for (let l = 0; l < 4; l++) {
    const lo = l * 3;
    ctx.beginPath();
    ctx.moveTo(14 + lo, 24 + lo);
    ctx.quadraticCurveTo(24, 20 + lo * 0.5, 34 - lo, 24 + lo);
    ctx.stroke();
  }

  // Highlight
  ctx.fillStyle = 'rgba(255,255,200,0.2)';
  ctx.beginPath();
  ellipsePath(ctx, 20, 28, 5, 8);
  ctx.fill();

  // Top sprout
  ctx.fillStyle = '#55aa33';
  ctx.beginPath();
  ctx.moveTo(22, 18);
  ctx.quadraticCurveTo(20, 10, 18, 4);
  ctx.lineTo(22, 6);
  ctx.quadraticCurveTo(23, 12, 24, 16);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(25, 18);
  ctx.quadraticCurveTo(27, 10, 30, 4);
  ctx.lineTo(26, 6);
  ctx.quadraticCurveTo(25, 12, 24, 16);
  ctx.fill();

  // Papery skin texture
  ctx.strokeStyle = 'rgba(180, 140, 80, 0.2)';
  ctx.lineWidth = 0.4;
  for (let t = 0; t < 6; t++) {
    ctx.beginPath();
    ctx.moveTo(16 + t * 3, 22);
    ctx.lineTo(14 + t * 3, 40);
    ctx.stroke();
  }

  saveCanvas(canvas, 'public/sprites/onion.png');
}

// ============================================================
// 8. FLIPPER / SANDAL (80x32)
// ============================================================
{
  const canvas = createCanvas(80, 32);
  const ctx = canvas.getContext('2d');

  ctx.save();
  ctx.translate(40, 16);
  ctx.rotate(-0.15); // mid-swing tilt
  ctx.translate(-40, -16);

  // Motion blur lines
  ctx.strokeStyle = 'rgba(180,160,140,0.3)';
  ctx.lineWidth = 1;
  for (let m = 0; m < 3; m++) {
    ctx.beginPath();
    ctx.moveTo(72 + m * 3, 6 + m * 2);
    ctx.lineTo(74 + m * 3, 26 - m * 2);
    ctx.stroke();
  }

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.beginPath();
  ellipsePath(ctx, 36, 30, 32, 2);
  ctx.fill();

  // Sole - flip-flop shape (tapered front, wider back)
  const soleGrad = ctx.createLinearGradient(0, 8, 0, 26);
  soleGrad.addColorStop(0, '#dd8844');
  soleGrad.addColorStop(0.5, '#cc7733');
  soleGrad.addColorStop(1, '#aa5522');
  ctx.fillStyle = soleGrad;
  ctx.beginPath();
  ctx.moveTo(8, 14);
  ctx.bezierCurveTo(4, 10, 8, 8, 18, 8);
  ctx.lineTo(58, 6);
  ctx.bezierCurveTo(68, 6, 72, 10, 70, 16);
  ctx.lineTo(68, 20);
  ctx.bezierCurveTo(66, 26, 60, 28, 50, 28);
  ctx.lineTo(18, 26);
  ctx.bezierCurveTo(8, 26, 4, 22, 8, 14);
  ctx.fill();

  // Sole edge (darker)
  ctx.strokeStyle = '#884422';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(8, 14);
  ctx.bezierCurveTo(4, 10, 8, 8, 18, 8);
  ctx.lineTo(58, 6);
  ctx.bezierCurveTo(68, 6, 72, 10, 70, 16);
  ctx.lineTo(68, 20);
  ctx.bezierCurveTo(66, 26, 60, 28, 50, 28);
  ctx.lineTo(18, 26);
  ctx.bezierCurveTo(8, 26, 4, 22, 8, 14);
  ctx.stroke();

  // Sole texture lines (tread)
  ctx.strokeStyle = 'rgba(80,40,10,0.25)';
  ctx.lineWidth = 0.5;
  for (let t = 0; t < 8; t++) {
    const tx = 14 + t * 7;
    ctx.beginPath();
    ctx.moveTo(tx, 10);
    ctx.lineTo(tx - 1, 24);
    ctx.stroke();
  }

  // Toe strap (V-shape, the thong part)
  ctx.strokeStyle = '#664422';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  // V from between toes to sides
  ctx.beginPath();
  ctx.moveTo(62, 10);
  ctx.quadraticCurveTo(56, 16, 50, 10);
  ctx.stroke();
  // Connecting straps going back
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(62, 10);
  ctx.quadraticCurveTo(58, 16, 58, 22);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(50, 10);
  ctx.quadraticCurveTo(48, 16, 50, 22);
  ctx.stroke();

  // Strap highlight
  ctx.strokeStyle = 'rgba(255,200,150,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(61, 10);
  ctx.quadraticCurveTo(56, 14, 51, 10);
  ctx.stroke();

  // Sole cross-hatch tread pattern (bottom visible)
  ctx.strokeStyle = 'rgba(60, 30, 10, 0.2)';
  ctx.lineWidth = 0.5;
  for (let t = 0; t < 12; t++) {
    const tx = 12 + t * 5;
    ctx.beginPath();
    ctx.moveTo(tx, 22);
    ctx.lineTo(tx + 3, 26);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tx + 3, 22);
    ctx.lineTo(tx, 26);
    ctx.stroke();
  }

  // Worn spot on heel
  ctx.fillStyle = 'rgba(200, 160, 120, 0.15)';
  ctx.beginPath();
  ellipsePath(ctx, 16, 18, 6, 4);
  ctx.fill();

  // Sole thickness visible at edge
  ctx.strokeStyle = '#775533';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(8, 22);
  ctx.bezierCurveTo(4, 24, 6, 26, 16, 27);
  ctx.stroke();

  ctx.restore();
  saveCanvas(canvas, 'public/sprites/flipper.png');
}

// ============================================================
// 9. BIRD (48x48) — menacing crow
// ============================================================
{
  const canvas = createCanvas(48, 48);
  const ctx = canvas.getContext('2d');

  // Attack dive angle
  ctx.save();
  ctx.translate(24, 24);
  ctx.rotate(0.15);
  ctx.translate(-24, -24);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ellipsePath(ctx, 24, 46, 16, 2);
  ctx.fill();

  // Wings spread — left wing
  ctx.fillStyle = '#1a1a22';
  ctx.beginPath();
  ctx.moveTo(24, 22);
  ctx.quadraticCurveTo(10, 10, 2, 8);
  ctx.lineTo(4, 14);
  ctx.quadraticCurveTo(12, 16, 20, 26);
  ctx.closePath();
  ctx.fill();
  // Wing feather tips
  ctx.fillStyle = '#222233';
  ctx.beginPath();
  ctx.moveTo(2, 8);
  ctx.lineTo(0, 6);
  ctx.lineTo(4, 10);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(6, 10);
  ctx.lineTo(3, 7);
  ctx.lineTo(7, 12);
  ctx.closePath();
  ctx.fill();

  // Right wing
  ctx.fillStyle = '#1a1a22';
  ctx.beginPath();
  ctx.moveTo(24, 22);
  ctx.quadraticCurveTo(38, 10, 46, 8);
  ctx.lineTo(44, 14);
  ctx.quadraticCurveTo(36, 16, 28, 26);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#222233';
  ctx.beginPath();
  ctx.moveTo(46, 8);
  ctx.lineTo(48, 6);
  ctx.lineTo(44, 10);
  ctx.closePath();
  ctx.fill();

  // Body
  const bodyGrad = ctx.createRadialGradient(24, 28, 2, 24, 28, 10);
  bodyGrad.addColorStop(0, '#2a2a33');
  bodyGrad.addColorStop(1, '#0a0a12');
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ellipsePath(ctx, 24, 28, 10, 8);
  ctx.fill();

  // Tail feathers
  ctx.fillStyle = '#111118';
  ctx.beginPath();
  ctx.moveTo(14, 30);
  ctx.lineTo(6, 38);
  ctx.lineTo(10, 36);
  ctx.lineTo(8, 40);
  ctx.lineTo(14, 36);
  ctx.closePath();
  ctx.fill();

  // Head
  ctx.fillStyle = '#1a1a22';
  ctx.beginPath();
  ctx.arc(30, 22, 6, 0, Math.PI * 2);
  ctx.fill();

  // Beak (sharp, pointing down)
  ctx.fillStyle = '#cc8800';
  ctx.beginPath();
  ctx.moveTo(35, 21);
  ctx.lineTo(42, 28);
  ctx.lineTo(35, 25);
  ctx.closePath();
  ctx.fill();
  // Beak highlight
  ctx.fillStyle = '#eebb33';
  ctx.beginPath();
  ctx.moveTo(35, 21);
  ctx.lineTo(39, 24);
  ctx.lineTo(35, 23);
  ctx.closePath();
  ctx.fill();

  // Angry red eye
  ctx.fillStyle = '#ff0000';
  ctx.beginPath();
  ctx.arc(32, 20, 2.5, 0, Math.PI * 2);
  ctx.fill();
  // Eye pupil
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(32.5, 20, 1.2, 0, Math.PI * 2);
  ctx.fill();
  // Eye glint
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(31.5, 19.5, 0.7, 0, Math.PI * 2);
  ctx.fill();

  // Angry eyebrow
  ctx.strokeStyle = '#0a0a12';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(29, 18);
  ctx.lineTo(34, 17);
  ctx.stroke();

  // Talons
  ctx.strokeStyle = '#444444';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  // Left talon
  ctx.beginPath();
  ctx.moveTo(20, 35);
  ctx.lineTo(18, 40);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(20, 35);
  ctx.lineTo(22, 40);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(20, 35);
  ctx.lineTo(16, 39);
  ctx.stroke();
  // Right talon
  ctx.beginPath();
  ctx.moveTo(28, 35);
  ctx.lineTo(26, 40);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(28, 35);
  ctx.lineTo(30, 40);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(28, 35);
  ctx.lineTo(32, 39);
  ctx.stroke();

  // Claw tips (sharp points)
  ctx.fillStyle = '#666666';
  for (const [tx, ty] of [[18, 40], [22, 40], [16, 39], [26, 40], [30, 40], [32, 39]]) {
    ctx.beginPath();
    ctx.arc(tx, ty, 0.8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Feather texture on body
  ctx.strokeStyle = 'rgba(40, 40, 50, 0.4)';
  ctx.lineWidth = 0.6;
  for (let fy = 24; fy < 36; fy += 3) {
    for (let fx = 18; fx < 32; fx += 4) {
      ctx.beginPath();
      ctx.arc(fx, fy, 2, 0.3, Math.PI - 0.3);
      ctx.stroke();
    }
  }

  // Wing feather edges (serrated)
  ctx.strokeStyle = 'rgba(30, 30, 40, 0.5)';
  ctx.lineWidth = 0.8;
  // Left wing feathers
  for (let wf = 0; wf < 4; wf++) {
    const wfx = 6 + wf * 5;
    const wfy = 10 + wf * 3;
    ctx.beginPath();
    ctx.moveTo(wfx, wfy);
    ctx.lineTo(wfx + 2, wfy + 4);
    ctx.stroke();
  }
  // Right wing feathers
  for (let wf = 0; wf < 4; wf++) {
    const wfx = 42 - wf * 5;
    const wfy = 10 + wf * 3;
    ctx.beginPath();
    ctx.moveTo(wfx, wfy);
    ctx.lineTo(wfx - 2, wfy + 4);
    ctx.stroke();
  }

  // Breast/belly lighter shade
  ctx.fillStyle = 'rgba(50, 50, 60, 0.3)';
  ctx.beginPath();
  ellipsePath(ctx, 24, 32, 6, 4);
  ctx.fill();

  ctx.restore();
  saveCanvas(canvas, 'public/sprites/bird.png');
}

// ============================================================
// 10. CAT PAW (64x64) — orange, claws out
// ============================================================
{
  const canvas = createCanvas(64, 64);
  const ctx = canvas.getContext('2d');

  // Swiping from top-right
  ctx.save();
  ctx.translate(32, 32);
  ctx.rotate(0.2);
  ctx.translate(-32, -32);

  // Fur edge glow (warm orange)
  ctx.fillStyle = 'rgba(255, 140, 50, 0.1)';
  ctx.beginPath();
  ellipsePath(ctx, 32, 34, 28, 24);
  ctx.fill();

  // Main paw shape (furry)
  const pawGrad = ctx.createRadialGradient(30, 30, 4, 32, 34, 22);
  pawGrad.addColorStop(0, '#ffaa55');
  pawGrad.addColorStop(0.5, '#ee8833');
  pawGrad.addColorStop(1, '#cc6622');
  ctx.fillStyle = pawGrad;

  // Paw body — rounded, wider at bottom
  ctx.beginPath();
  ctx.moveTo(16, 14);
  ctx.bezierCurveTo(10, 16, 8, 28, 10, 40);
  ctx.bezierCurveTo(12, 52, 20, 58, 32, 58);
  ctx.bezierCurveTo(44, 58, 52, 52, 54, 40);
  ctx.bezierCurveTo(56, 28, 54, 16, 48, 14);
  ctx.quadraticCurveTo(32, 10, 16, 14);
  ctx.fill();

  // Fur texture (wispy strokes around edge)
  ctx.strokeStyle = 'rgba(200, 120, 40, 0.4)';
  ctx.lineWidth = 1;
  const furPoints = [
    [12, 20], [10, 28], [11, 36], [14, 46],
    [52, 20], [54, 28], [53, 36], [50, 46],
    [20, 12], [28, 10], [36, 10], [44, 12],
  ];
  for (const [fx, fy] of furPoints) {
    const dx = fx < 32 ? -3 : 3;
    const dy = fy < 24 ? -3 : (fy > 40 ? 3 : 0);
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx + dx, fy + dy);
    ctx.stroke();
  }

  // Darker stripe patterns (tabby markings)
  ctx.strokeStyle = 'rgba(150, 70, 20, 0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(20, 18);
  ctx.quadraticCurveTo(22, 24, 20, 30);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(44, 18);
  ctx.quadraticCurveTo(42, 24, 44, 30);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(32, 14);
  ctx.lineTo(32, 22);
  ctx.stroke();

  // Toe beans / paw pads
  // Main central pad (large, pink)
  const padGrad = ctx.createRadialGradient(32, 48, 1, 32, 48, 8);
  padGrad.addColorStop(0, '#ffaaaa');
  padGrad.addColorStop(1, '#dd7788');
  ctx.fillStyle = padGrad;
  ctx.beginPath();
  // Roughly heart/triangular large pad
  ctx.moveTo(24, 44);
  ctx.quadraticCurveTo(28, 40, 32, 42);
  ctx.quadraticCurveTo(36, 40, 40, 44);
  ctx.quadraticCurveTo(38, 52, 32, 54);
  ctx.quadraticCurveTo(26, 52, 24, 44);
  ctx.fill();

  // Small toe pads (4 beans)
  ctx.fillStyle = '#ee8899';
  const toePositions = [
    [18, 38, 4], [26, 34, 3.5], [38, 34, 3.5], [46, 38, 4],
  ];
  for (const [tx, ty, tr] of toePositions) {
    ctx.beginPath();
    ellipsePath(ctx, tx, ty, tr, tr * 0.8);
    ctx.fill();
  }
  // Toe pad highlights
  ctx.fillStyle = 'rgba(255,200,200,0.4)';
  for (const [tx, ty, tr] of toePositions) {
    ctx.beginPath();
    ctx.arc(tx - 0.5, ty - 0.5, tr * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // CLAWS — sharp, white, extended
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(180,180,180,0.8)';
  ctx.lineWidth = 0.8;
  const clawData = [
    { base: [16, 34], tip: [8, 22], ctrl: [10, 28] },
    { base: [24, 30], tip: [18, 16], ctrl: [20, 22] },
    { base: [40, 30], tip: [46, 16], ctrl: [44, 22] },
    { base: [48, 34], tip: [56, 22], ctrl: [54, 28] },
  ];
  for (const c of clawData) {
    ctx.beginPath();
    ctx.moveTo(c.base[0] - 1.5, c.base[1]);
    ctx.quadraticCurveTo(c.ctrl[0] - 1, c.ctrl[1], c.tip[0], c.tip[1]);
    ctx.quadraticCurveTo(c.ctrl[0] + 1, c.ctrl[1], c.base[0] + 1.5, c.base[1]);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
  saveCanvas(canvas, 'public/sprites/cat-paw.png');
}

// ============================================================
// 11. SKY BACKGROUND (800x400) — trippy, eerie
// ============================================================
{
  const canvas = createCanvas(800, 400);
  const ctx = canvas.getContext('2d');

  // Deep gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, 400);
  skyGrad.addColorStop(0, '#050010');
  skyGrad.addColorStop(0.15, '#0a0020');
  skyGrad.addColorStop(0.35, '#1a0a3e');
  skyGrad.addColorStop(0.55, '#2d1b5e');
  skyGrad.addColorStop(0.75, '#4a1a4d');
  skyGrad.addColorStop(1, '#5a2040');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, 800, 400);

  // Subtle spiral pattern (trippy, very faint)
  ctx.strokeStyle = 'rgba(100, 50, 150, 0.06)';
  ctx.lineWidth = 2;
  for (let sp = 0; sp < 2; sp++) {
    const scx = 300 + sp * 250;
    const scy = 150 + sp * 60;
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 8; a += 0.1) {
      const r = a * 8;
      const sx = scx + Math.cos(a) * r;
      const sy = scy + Math.sin(a) * r;
      if (a === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  }

  // Stars (varied sizes, some twinkling)
  // Use a seeded-ish approach for reproducibility
  const starSeed = [
    0.12, 0.87, 0.34, 0.56, 0.78, 0.91, 0.23, 0.45, 0.67, 0.09,
    0.31, 0.53, 0.75, 0.97, 0.19, 0.41, 0.63, 0.85, 0.07, 0.29,
    0.51, 0.73, 0.95, 0.17, 0.39, 0.61, 0.83, 0.05, 0.27, 0.49,
    0.71, 0.93, 0.15, 0.37, 0.59, 0.81, 0.03, 0.25, 0.47, 0.69,
    0.14, 0.88, 0.36, 0.58, 0.80, 0.92, 0.24, 0.46, 0.68, 0.10,
    0.32, 0.54, 0.76, 0.98, 0.20, 0.42, 0.64, 0.86, 0.08, 0.30,
  ];
  for (let i = 0; i < 60; i++) {
    const sx = starSeed[i % starSeed.length] * 800;
    const sy = starSeed[(i + 17) % starSeed.length] * 280;
    const size = starSeed[(i + 7) % starSeed.length] * 2 + 0.5;
    const bright = 0.4 + starSeed[(i + 3) % starSeed.length] * 0.6;

    // Star glow
    ctx.fillStyle = `rgba(200, 200, 255, ${bright * 0.15})`;
    ctx.beginPath();
    ctx.arc(sx, sy, size * 3, 0, Math.PI * 2);
    ctx.fill();

    // Star core
    ctx.fillStyle = `rgba(255, 255, 255, ${bright})`;
    ctx.beginPath();
    ctx.arc(sx, sy, size, 0, Math.PI * 2);
    ctx.fill();

    // Some stars get cross sparkle
    if (size > 1.8) {
      ctx.strokeStyle = `rgba(255, 255, 255, ${bright * 0.4})`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(sx - size * 2, sy);
      ctx.lineTo(sx + size * 2, sy);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sx, sy - size * 2);
      ctx.lineTo(sx, sy + size * 2);
      ctx.stroke();
    }
  }

  // Oversized eerie moon
  const moonX = 650, moonY = 90, moonR = 60;
  // Moon glow (large, soft)
  const moonGlow = ctx.createRadialGradient(moonX, moonY, moonR * 0.5, moonX, moonY, moonR * 2.5);
  moonGlow.addColorStop(0, 'rgba(255, 240, 200, 0.15)');
  moonGlow.addColorStop(0.5, 'rgba(255, 220, 180, 0.06)');
  moonGlow.addColorStop(1, 'rgba(255, 200, 150, 0)');
  ctx.fillStyle = moonGlow;
  ctx.beginPath();
  ctx.arc(moonX, moonY, moonR * 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Moon body
  const moonBodyGrad = ctx.createRadialGradient(moonX - 10, moonY - 10, 5, moonX, moonY, moonR);
  moonBodyGrad.addColorStop(0, '#fff8e0');
  moonBodyGrad.addColorStop(0.3, '#ffe8b0');
  moonBodyGrad.addColorStop(0.7, '#eeccaa');
  moonBodyGrad.addColorStop(1, '#ccaa88');
  ctx.fillStyle = moonBodyGrad;
  ctx.beginPath();
  ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
  ctx.fill();

  // Moon craters
  const craters = [
    { x: -15, y: -20, r: 12, d: 0.08 },
    { x: 20, y: -5, r: 8, d: 0.06 },
    { x: -5, y: 15, r: 15, d: 0.1 },
    { x: 25, y: 20, r: 6, d: 0.05 },
    { x: -25, y: 5, r: 9, d: 0.07 },
    { x: 10, y: -25, r: 7, d: 0.05 },
    { x: -10, y: 30, r: 5, d: 0.04 },
  ];
  for (const cr of craters) {
    ctx.fillStyle = `rgba(180, 160, 120, ${cr.d})`;
    ctx.beginPath();
    ctx.arc(moonX + cr.x, moonY + cr.y, cr.r, 0, Math.PI * 2);
    ctx.fill();
    // Crater rim highlight
    ctx.strokeStyle = `rgba(255, 240, 200, ${cr.d * 0.8})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(moonX + cr.x, moonY + cr.y, cr.r, Math.PI * 0.8, Math.PI * 1.8);
    ctx.stroke();
  }

  // Wispy red/orange clouds
  ctx.globalAlpha = 0.15;
  for (let c = 0; c < 5; c++) {
    const cy = 180 + c * 40;
    const cx = 100 + c * 150;
    const cloudGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 80 + c * 20);
    cloudGrad.addColorStop(0, c % 2 === 0 ? '#ff4422' : '#ff8844');
    cloudGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cloudGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 80 + c * 20, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // More defined cloud wisps
  ctx.strokeStyle = 'rgba(200, 80, 40, 0.08)';
  ctx.lineWidth = 3;
  for (let w = 0; w < 4; w++) {
    const wy = 220 + w * 35;
    ctx.beginPath();
    ctx.moveTo(0, wy);
    for (let wx = 0; wx < 800; wx += 20) {
      ctx.quadraticCurveTo(wx + 10, wy + Math.sin(wx * 0.02 + w) * 15, wx + 20, wy);
    }
    ctx.stroke();
  }

  saveCanvas(canvas, 'public/backgrounds/sky.png');
}

// ============================================================
// 12. MIDGROUND (800x400) — Courage-style silhouettes
// ============================================================
{
  const canvas = createCanvas(800, 400);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 800, 400);

  const darkColor = '#08040e';

  // ---- Ground line ----
  ctx.fillStyle = darkColor;
  ctx.fillRect(0, 360, 800, 40);
  // Uneven ground
  ctx.beginPath();
  ctx.moveTo(0, 360);
  for (let gx = 0; gx <= 800; gx += 10) {
    ctx.lineTo(gx, 356 + Math.sin(gx * 0.03) * 3 + Math.sin(gx * 0.07) * 2);
  }
  ctx.lineTo(800, 400);
  ctx.lineTo(0, 400);
  ctx.fill();

  // ---- HOUSE 1 (Nowhere-style, crooked) ----
  ctx.fillStyle = darkColor;
  ctx.save();
  ctx.translate(80, 0);
  ctx.transform(1, 0, -0.05, 1, 0, 0); // slight lean
  // Main structure
  ctx.fillRect(0, 240, 100, 120);
  // Roof (tall, pointed)
  ctx.beginPath();
  ctx.moveTo(-15, 240);
  ctx.lineTo(50, 160);
  ctx.lineTo(115, 240);
  ctx.fill();
  // Chimney
  ctx.fillRect(75, 175, 18, 50);
  // Window (just a dark cutout)
  ctx.fillStyle = 'rgba(40, 20, 60, 0.6)';
  ctx.fillRect(25, 270, 20, 25);
  ctx.fillRect(60, 270, 20, 25);
  // Door
  ctx.fillStyle = 'rgba(30, 15, 45, 0.5)';
  ctx.fillRect(38, 320, 24, 40);
  // Attic window
  ctx.fillStyle = 'rgba(60, 30, 80, 0.5)';
  ctx.beginPath();
  ctx.arc(50, 210, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ---- DEAD TREE 1 (twisted) ----
  ctx.fillStyle = darkColor;
  ctx.save();
  ctx.translate(240, 0);
  // Trunk
  ctx.beginPath();
  ctx.moveTo(0, 360);
  ctx.lineTo(-3, 280);
  ctx.quadraticCurveTo(-5, 240, 2, 200);
  ctx.quadraticCurveTo(8, 240, 12, 280);
  ctx.lineTo(10, 360);
  ctx.fill();
  // Branch 1 (left, twisted up)
  ctx.lineWidth = 5;
  ctx.strokeStyle = darkColor;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(2, 240);
  ctx.quadraticCurveTo(-20, 220, -30, 195);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-30, 195);
  ctx.quadraticCurveTo(-35, 185, -28, 178);
  ctx.stroke();
  // Branch 2 (right)
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(5, 260);
  ctx.quadraticCurveTo(25, 240, 35, 225);
  ctx.stroke();
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(35, 225);
  ctx.quadraticCurveTo(42, 218, 38, 210);
  ctx.stroke();
  // Branch 3 (top, crooked)
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(2, 210);
  ctx.quadraticCurveTo(-10, 190, -5, 175);
  ctx.stroke();
  ctx.restore();

  // ---- HOUSE 2 (smaller, more decrepit) ----
  ctx.fillStyle = darkColor;
  ctx.save();
  ctx.translate(380, 0);
  ctx.transform(1, 0, 0.03, 1, 0, 0); // slight lean right
  ctx.fillRect(0, 280, 80, 80);
  // Roof
  ctx.beginPath();
  ctx.moveTo(-10, 280);
  ctx.lineTo(40, 220);
  ctx.lineTo(90, 280);
  ctx.fill();
  // Window
  ctx.fillStyle = 'rgba(40, 20, 60, 0.5)';
  ctx.fillRect(20, 300, 15, 15);
  ctx.fillRect(50, 300, 15, 15);
  // Broken fence
  ctx.fillStyle = darkColor;
  for (let fp = 0; fp < 5; fp++) {
    const fh = 12 + (fp % 3) * 4;
    ctx.fillRect(85 + fp * 8, 360 - fh, 3, fh);
  }
  ctx.fillRect(85, 352, 40, 2);
  ctx.restore();

  // ---- WINDMILL ----
  ctx.fillStyle = darkColor;
  ctx.save();
  ctx.translate(560, 0);
  // Tower
  ctx.beginPath();
  ctx.moveTo(-8, 360);
  ctx.lineTo(-4, 230);
  ctx.lineTo(20, 230);
  ctx.lineTo(24, 360);
  ctx.fill();
  // Cap
  ctx.beginPath();
  ctx.moveTo(-10, 230);
  ctx.lineTo(8, 210);
  ctx.lineTo(26, 230);
  ctx.fill();
  // Blades (X pattern)
  ctx.lineWidth = 4;
  ctx.strokeStyle = darkColor;
  ctx.lineCap = 'round';
  const bladeLen = 50;
  const bcx = 8, bcy = 225;
  const bladeAngle = 0.3; // slight rotation
  for (let b = 0; b < 4; b++) {
    const a = bladeAngle + (b * Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(bcx, bcy);
    ctx.lineTo(bcx + Math.cos(a) * bladeLen, bcy + Math.sin(a) * bladeLen);
    ctx.stroke();
    // Blade panel
    ctx.lineWidth = 1;
    ctx.fillStyle = darkColor;
    ctx.beginPath();
    const bx = bcx + Math.cos(a) * bladeLen;
    const by = bcy + Math.sin(a) * bladeLen;
    const perpX = Math.cos(a + Math.PI / 2) * 6;
    const perpY = Math.sin(a + Math.PI / 2) * 6;
    ctx.moveTo(bcx + Math.cos(a) * 10, bcy + Math.sin(a) * 10);
    ctx.lineTo(bcx + Math.cos(a) * 10 + perpX, bcy + Math.sin(a) * 10 + perpY);
    ctx.lineTo(bx + perpX, by + perpY);
    ctx.lineTo(bx, by);
    ctx.fill();
    ctx.lineWidth = 4;
  }
  ctx.restore();

  // ---- DEAD TREE 2 ----
  ctx.fillStyle = darkColor;
  ctx.save();
  ctx.translate(700, 0);
  ctx.beginPath();
  ctx.moveTo(0, 360);
  ctx.lineTo(2, 300);
  ctx.quadraticCurveTo(3, 260, -2, 220);
  ctx.quadraticCurveTo(3, 260, 8, 300);
  ctx.lineTo(8, 360);
  ctx.fill();
  ctx.strokeStyle = darkColor;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-1, 250);
  ctx.quadraticCurveTo(-18, 230, -25, 215);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-25, 215);
  ctx.lineTo(-30, 205);
  ctx.stroke();
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(5, 270);
  ctx.quadraticCurveTo(20, 255, 28, 240);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(28, 240);
  ctx.lineTo(32, 232);
  ctx.stroke();
  ctx.restore();

  // ---- Distant hills ----
  ctx.fillStyle = 'rgba(8, 4, 14, 0.7)';
  ctx.beginPath();
  ctx.moveTo(0, 370);
  for (let hx = 0; hx <= 800; hx += 5) {
    ctx.lineTo(hx, 340 + Math.sin(hx * 0.008) * 15 + Math.sin(hx * 0.02) * 5);
  }
  ctx.lineTo(800, 400);
  ctx.lineTo(0, 400);
  ctx.fill();

  saveCanvas(canvas, 'public/backgrounds/midground.png');
}

// ============================================================
// 13. FLOOR TOP — wooden shelf texture (800x16)
// ============================================================
{
  const canvas = createCanvas(800, 16);
  const ctx = canvas.getContext('2d');

  // Wood base
  const woodGrad = ctx.createLinearGradient(0, 0, 0, 16);
  woodGrad.addColorStop(0, '#6b4a2a');
  woodGrad.addColorStop(0.15, '#7a5a38');
  woodGrad.addColorStop(0.3, '#5e3a1e');
  woodGrad.addColorStop(0.5, '#6b4a2a');
  woodGrad.addColorStop(0.85, '#5a3818');
  woodGrad.addColorStop(1, '#4a2a10');
  ctx.fillStyle = woodGrad;
  ctx.fillRect(0, 0, 800, 16);

  // Wood grain lines (horizontal, slightly wavy)
  ctx.strokeStyle = 'rgba(40, 20, 5, 0.3)';
  ctx.lineWidth = 0.5;
  for (let g = 0; g < 6; g++) {
    const gy = 2 + g * 2.5;
    ctx.beginPath();
    ctx.moveTo(0, gy);
    for (let gx = 0; gx < 800; gx += 8) {
      ctx.lineTo(gx + 8, gy + Math.sin(gx * 0.05 + g) * 0.8);
    }
    ctx.stroke();
  }

  // Knots (darker spots)
  ctx.fillStyle = 'rgba(30, 15, 0, 0.2)';
  const knots = [120, 340, 580, 720];
  for (const kx of knots) {
    ctx.beginPath();
    ellipsePath(ctx, kx, 8, 4, 3);
    ctx.fill();
  }

  // Top edge highlight (light reflection on shelf edge)
  ctx.strokeStyle = 'rgba(255, 220, 180, 0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 1);
  ctx.lineTo(800, 1);
  ctx.stroke();

  // Bottom shadow
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 15);
  ctx.lineTo(800, 15);
  ctx.stroke();

  // Plank separations
  ctx.strokeStyle = 'rgba(30, 15, 0, 0.25)';
  ctx.lineWidth = 1;
  for (let px = 0; px < 800; px += 120) {
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, 16);
    ctx.stroke();
  }

  saveCanvas(canvas, 'public/backgrounds/floor-top.png');
}

// ============================================================
// 14. FLOOR BOTTOM — cracked kitchen tile (800x16)
// ============================================================
{
  const canvas = createCanvas(800, 16);
  const ctx = canvas.getContext('2d');

  // Tile base
  const tileGrad = ctx.createLinearGradient(0, 0, 0, 16);
  tileGrad.addColorStop(0, '#c8b8a4');
  tileGrad.addColorStop(0.5, '#b8a894');
  tileGrad.addColorStop(1, '#a89884');
  ctx.fillStyle = tileGrad;
  ctx.fillRect(0, 0, 800, 16);

  // Individual tiles (alternating slightly different shades)
  for (let tx = 0; tx < 800; tx += 32) {
    const shade = (tx / 32) % 2 === 0 ? 0 : 8;
    ctx.fillStyle = `rgb(${184 + shade}, ${168 + shade}, ${148 + shade})`;
    ctx.fillRect(tx + 1, 1, 30, 14);
  }

  // Grout lines
  ctx.strokeStyle = '#8a7a66';
  ctx.lineWidth = 1;
  for (let tx = 0; tx < 800; tx += 32) {
    ctx.beginPath();
    ctx.moveTo(tx, 0);
    ctx.lineTo(tx, 16);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(800, 0);
  ctx.stroke();

  // Cracks (random-ish but seeded)
  ctx.strokeStyle = 'rgba(60, 40, 20, 0.35)';
  ctx.lineWidth = 0.7;
  const crackStarts = [45, 180, 310, 460, 590, 710];
  for (const cs of crackStarts) {
    ctx.beginPath();
    ctx.moveTo(cs, 3);
    ctx.lineTo(cs + 5, 8);
    ctx.lineTo(cs + 2, 13);
    ctx.stroke();
    // Branch crack
    ctx.beginPath();
    ctx.moveTo(cs + 5, 8);
    ctx.lineTo(cs + 12, 6);
    ctx.stroke();
  }

  // Dirt/stain spots
  ctx.fillStyle = 'rgba(80, 60, 40, 0.08)';
  const stains = [80, 250, 450, 650];
  for (const sx of stains) {
    ctx.beginPath();
    ellipsePath(ctx, sx, 8, 12, 4);
    ctx.fill();
  }

  // Top edge shadow
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 0.5);
  ctx.lineTo(800, 0.5);
  ctx.stroke();

  // Tile texture noise (subtle speckles for realism)
  for (let tx = 0; tx < 800; tx += 3) {
    for (let ty = 0; ty < 16; ty += 3) {
      const speck = Math.sin(tx * 7.3 + ty * 13.1) * 0.5 + 0.5;
      if (speck > 0.7) {
        ctx.fillStyle = `rgba(${speck > 0.85 ? 160 : 120}, ${speck > 0.85 ? 140 : 100}, ${speck > 0.85 ? 120 : 80}, 0.08)`;
        ctx.fillRect(tx, ty, 1, 1);
      }
    }
  }

  // Additional cracks (finer)
  ctx.strokeStyle = 'rgba(80, 60, 40, 0.2)';
  ctx.lineWidth = 0.4;
  const fineCracks = [95, 220, 385, 530, 660, 770];
  for (const fc of fineCracks) {
    ctx.beginPath();
    ctx.moveTo(fc, 1);
    ctx.quadraticCurveTo(fc + 3, 8, fc - 2, 15);
    ctx.stroke();
  }

  // Tile highlight (some tiles slightly brighter edge)
  ctx.strokeStyle = 'rgba(220, 200, 180, 0.12)';
  ctx.lineWidth = 0.5;
  for (let tx = 0; tx < 800; tx += 64) {
    ctx.beginPath();
    ctx.moveTo(tx + 1, 2);
    ctx.lineTo(tx + 30, 2);
    ctx.stroke();
  }

  saveCanvas(canvas, 'public/backgrounds/floor-bottom.png');
}

console.log('\nAll assets generated! ASTRAL DAVE signing off.');
