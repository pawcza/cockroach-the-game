import { createCanvas } from 'canvas';
import fs from 'fs';

function saveCanvas(canvas, path) {
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path, buffer);
  const kb = (buffer.length / 1024).toFixed(1);
  console.log(`Created: ${path} (${kb} KB)`);
}

// ============================================================
// HELPER: draw an ellipse path
// ============================================================
function ellipsePath(ctx, cx, cy, rx, ry) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(rx, ry);
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.restore();
}

// ============================================================
// HELPER: draw a thick outlined ellipse (fill + stroke)
// ============================================================
function outlinedEllipse(ctx, cx, cy, rx, ry, fillStyle, strokeStyle, lineWidth = 2.5) {
  ctx.fillStyle = fillStyle;
  ctx.beginPath();
  ellipsePath(ctx, cx, cy, rx, ry);
  ctx.fill();
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ellipsePath(ctx, cx, cy, rx, ry);
    ctx.stroke();
  }
}

// ============================================================
// HELPER: rounded rectangle path
// ============================================================
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ============================================================
// 1. COCKROACH RUN SPRITESHEET  (576x96, 6 frames of 96x96)
// ============================================================
{
  const W = 96, H = 96, FRAMES = 6;
  const canvas = createCanvas(W * FRAMES, H);
  const ctx = canvas.getContext('2d');

  // Body dimensions — FLAT and WIDE like a real cockroach
  const bodyCX = 42, bodyCY = 62;   // center of the main body ellipse
  const bodyRX = 34, bodyRY = 16;   // wide oval: ~68px wide, ~32px tall
  const pronotumCX = 72, pronotumCY = 60;
  const pronotumRX = 14, pronotumRY = 13;
  const headCX = 83, headCY = 60;
  const headRX = 7, headRY = 6;

  for (let f = 0; f < FRAMES; f++) {
    const ox = f * W;
    const phase = (f / FRAMES) * Math.PI * 2;

    ctx.save();
    ctx.translate(ox, 0);

    // --- Ground shadow ---
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ellipsePath(ctx, bodyCX, 90, 38, 5);
    ctx.fill();

    // --- LEGS (3 pairs, tripod gait, splayed wide to sides) ---
    ctx.lineCap = 'round';
    const legAttach = [
      { x: 28, y: bodyCY + 4, angle: -2.4, len1: 16, len2: 18 },   // rear left/right
      { x: 48, y: bodyCY + 2, angle: -1.8, len1: 14, len2: 16 },   // mid
      { x: 65, y: bodyCY,     angle: -1.2, len1: 12, len2: 14 },   // front
    ];

    for (let p = 0; p < 3; p++) {
      const la = legAttach[p];
      // Tripod gait: pairs 0,2 move together, pair 1 opposite
      const legPhase = phase + (p === 1 ? Math.PI : 0);
      const swing = Math.sin(legPhase) * 6;
      const lift = Math.cos(legPhase) * 3;

      // --- Top leg (drawn behind body) ---
      const topKneeX = la.x + Math.cos(la.angle) * la.len1;
      const topKneeY = la.y - 12 + lift;
      const topFootX = topKneeX + Math.cos(la.angle - 0.3) * la.len2 + swing;
      const topFootY = topKneeY - 8 - Math.abs(lift);

      // outline
      ctx.strokeStyle = '#1a0800';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(la.x, la.y - 4);
      ctx.lineTo(topKneeX, topKneeY);
      ctx.lineTo(topFootX, topFootY);
      ctx.stroke();
      // inner
      ctx.strokeStyle = '#5a3015';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(la.x, la.y - 4);
      ctx.lineTo(topKneeX, topKneeY);
      ctx.lineTo(topFootX, topFootY);
      ctx.stroke();
      // foot barb
      ctx.strokeStyle = '#1a0800';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(topFootX, topFootY);
      ctx.lineTo(topFootX + 3, topFootY - 3);
      ctx.stroke();

      // --- Bottom leg (drawn behind body) ---
      const botKneeX = la.x + Math.cos(Math.PI - la.angle) * la.len1;
      const botKneeY = la.y + 12 - lift;
      const botFootX = botKneeX + Math.cos(Math.PI - la.angle + 0.3) * la.len2 - swing;
      const botFootY = botKneeY + 8 + Math.abs(lift);

      ctx.strokeStyle = '#1a0800';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(la.x, la.y + 4);
      ctx.lineTo(botKneeX, botKneeY);
      ctx.lineTo(botFootX, botFootY);
      ctx.stroke();
      ctx.strokeStyle = '#5a3015';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(la.x, la.y + 4);
      ctx.lineTo(botKneeX, botKneeY);
      ctx.lineTo(botFootX, botFootY);
      ctx.stroke();
      ctx.strokeStyle = '#1a0800';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(botFootX, botFootY);
      ctx.lineTo(botFootX - 3, botFootY + 3);
      ctx.stroke();
    }

    // --- BODY: Main abdomen / wing casing — wide flat oval ---
    const abdGrad = ctx.createRadialGradient(bodyCX - 6, bodyCY - 6, 4, bodyCX, bodyCY, bodyRX);
    abdGrad.addColorStop(0, '#a06030');
    abdGrad.addColorStop(0.25, '#8a4e25');
    abdGrad.addColorStop(0.5, '#6d3a18');
    abdGrad.addColorStop(0.8, '#4a2510');
    abdGrad.addColorStop(1, '#2e1508');
    ctx.fillStyle = abdGrad;
    ctx.beginPath();
    ellipsePath(ctx, bodyCX, bodyCY, bodyRX, bodyRY);
    ctx.fill();
    // Body outline
    ctx.strokeStyle = '#1a0800';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ellipsePath(ctx, bodyCX, bodyCY, bodyRX, bodyRY);
    ctx.stroke();

    // Wing casing line down the middle
    ctx.strokeStyle = 'rgba(15, 5, 0, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bodyCX - bodyRX + 10, bodyCY);
    ctx.lineTo(bodyCX + bodyRX - 4, bodyCY);
    ctx.stroke();

    // Wing casing side lines (subtle veins)
    ctx.strokeStyle = 'rgba(30, 10, 0, 0.2)';
    ctx.lineWidth = 0.8;
    for (let v = -2; v <= 2; v++) {
      if (v === 0) continue;
      const vy = bodyCY + v * 5;
      ctx.beginPath();
      ctx.moveTo(bodyCX - bodyRX + 14, vy);
      ctx.quadraticCurveTo(bodyCX, vy + v * 0.5, bodyCX + bodyRX - 8, vy);
      ctx.stroke();
    }

    // Glossy carapace highlight (shiny arc on top half)
    ctx.fillStyle = 'rgba(255,255,230,0.18)';
    ctx.beginPath();
    ellipsePath(ctx, bodyCX - 4, bodyCY - 6, bodyRX * 0.6, bodyRY * 0.35);
    ctx.fill();
    // Bright specular spot
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ellipsePath(ctx, bodyCX - 10, bodyCY - 8, 8, 4);
    ctx.fill();

    // --- PRONOTUM (head shield) ---
    const proGrad = ctx.createRadialGradient(pronotumCX, pronotumCY - 2, 2, pronotumCX, pronotumCY, pronotumRX);
    proGrad.addColorStop(0, '#9a5a30');
    proGrad.addColorStop(0.5, '#7a4422');
    proGrad.addColorStop(1, '#4a2510');
    ctx.fillStyle = proGrad;
    ctx.beginPath();
    ellipsePath(ctx, pronotumCX, pronotumCY, pronotumRX, pronotumRY);
    ctx.fill();
    ctx.strokeStyle = '#1a0800';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ellipsePath(ctx, pronotumCX, pronotumCY, pronotumRX, pronotumRY);
    ctx.stroke();
    // Pronotum highlight
    ctx.fillStyle = 'rgba(255,255,230,0.12)';
    ctx.beginPath();
    ellipsePath(ctx, pronotumCX, pronotumCY - 4, pronotumRX * 0.5, pronotumRY * 0.3);
    ctx.fill();

    // --- HEAD (small, peeking from under pronotum) ---
    ctx.fillStyle = '#4a2810';
    ctx.beginPath();
    ellipsePath(ctx, headCX, headCY, headRX, headRY);
    ctx.fill();
    ctx.strokeStyle = '#1a0800';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ellipsePath(ctx, headCX, headCY, headRX, headRY);
    ctx.stroke();

    // --- EYES (compound, dark red, on sides of head) ---
    const eyeY1 = headCY - 3;
    const eyeY2 = headCY + 3;
    for (const ey of [eyeY1, eyeY2]) {
      const eyeGrad = ctx.createRadialGradient(headCX + 4, ey, 0.5, headCX + 4, ey, 3);
      eyeGrad.addColorStop(0, '#dd3333');
      eyeGrad.addColorStop(0.6, '#aa0000');
      eyeGrad.addColorStop(1, '#660000');
      ctx.fillStyle = eyeGrad;
      ctx.beginPath();
      ctx.arc(headCX + 4, ey, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1a0800';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(headCX + 4, ey, 3, 0, Math.PI * 2);
      ctx.stroke();
      // highlight
      ctx.fillStyle = 'rgba(255,150,150,0.5)';
      ctx.beginPath();
      ctx.arc(headCX + 5, ey - 1, 1, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- ANTENNAE (long, sweeping forward with curves) ---
    const antWave = Math.sin(phase) * 4;
    ctx.lineCap = 'round';
    // Antenna 1 (upper)
    ctx.strokeStyle = '#1a0800';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(headCX + 5, headCY - 4);
    ctx.quadraticCurveTo(90, headCY - 18 + antWave, 94, headCY - 36 + antWave * 0.7);
    ctx.stroke();
    ctx.strokeStyle = '#5a3015';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(headCX + 5, headCY - 4);
    ctx.quadraticCurveTo(90, headCY - 18 + antWave, 94, headCY - 36 + antWave * 0.7);
    ctx.stroke();

    // Antenna 2 (lower)
    ctx.strokeStyle = '#1a0800';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(headCX + 5, headCY + 4);
    ctx.quadraticCurveTo(90, headCY + 18 - antWave, 94, headCY + 36 - antWave * 0.7);
    ctx.stroke();
    ctx.strokeStyle = '#5a3015';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(headCX + 5, headCY + 4);
    ctx.quadraticCurveTo(90, headCY + 18 - antWave, 94, headCY + 36 - antWave * 0.7);
    ctx.stroke();

    ctx.restore();
  }
  saveCanvas(canvas, 'public/sprites/cockroach-run.png');
}

// ============================================================
// 2. COCKROACH JUMP (96x96)
// ============================================================
{
  const canvas = createCanvas(96, 96);
  const ctx = canvas.getContext('2d');

  // Tilt the whole cockroach slightly upward for jump pose
  ctx.save();
  ctx.translate(48, 52);
  ctx.rotate(-0.25);
  ctx.translate(-48, -52);

  const bodyCX = 38, bodyCY = 58;
  const bodyRX = 32, bodyRY = 15;
  const pronotumCX = 66, pronotumCY = 56;
  const pronotumRX = 13, pronotumRY = 12;
  const headCX = 77, headCY = 56;
  const headRX = 6, headRY = 5;

  // Faint shadow (airborne)
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.beginPath();
  ellipsePath(ctx, bodyCX, 90, 24, 3);
  ctx.fill();

  // Tucked legs (folded tight underneath)
  ctx.lineCap = 'round';
  const legTuck = [
    { x: 26, y: bodyCY + 4 },
    { x: 42, y: bodyCY + 3 },
    { x: 58, y: bodyCY + 2 },
  ];
  for (let p = 0; p < 3; p++) {
    const la = legTuck[p];
    // Top tucked leg
    ctx.strokeStyle = '#1a0800';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(la.x, la.y - 3);
    ctx.quadraticCurveTo(la.x - 6, la.y - 10, la.x - 4, la.y - 16);
    ctx.stroke();
    ctx.strokeStyle = '#5a3015';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(la.x, la.y - 3);
    ctx.quadraticCurveTo(la.x - 6, la.y - 10, la.x - 4, la.y - 16);
    ctx.stroke();
    // Bottom tucked leg
    ctx.strokeStyle = '#1a0800';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(la.x, la.y + 3);
    ctx.quadraticCurveTo(la.x - 6, la.y + 10, la.x - 4, la.y + 16);
    ctx.stroke();
    ctx.strokeStyle = '#5a3015';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(la.x, la.y + 3);
    ctx.quadraticCurveTo(la.x - 6, la.y + 10, la.x - 4, la.y + 16);
    ctx.stroke();
  }

  // Body (wide flat oval)
  const abdGrad = ctx.createRadialGradient(bodyCX - 6, bodyCY - 5, 4, bodyCX, bodyCY, bodyRX);
  abdGrad.addColorStop(0, '#a06030');
  abdGrad.addColorStop(0.25, '#8a4e25');
  abdGrad.addColorStop(0.5, '#6d3a18');
  abdGrad.addColorStop(0.8, '#4a2510');
  abdGrad.addColorStop(1, '#2e1508');
  ctx.fillStyle = abdGrad;
  ctx.beginPath();
  ellipsePath(ctx, bodyCX, bodyCY, bodyRX, bodyRY);
  ctx.fill();
  ctx.strokeStyle = '#1a0800';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ellipsePath(ctx, bodyCX, bodyCY, bodyRX, bodyRY);
  ctx.stroke();

  // Wing casing line
  ctx.strokeStyle = 'rgba(15, 5, 0, 0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(bodyCX - bodyRX + 10, bodyCY);
  ctx.lineTo(bodyCX + bodyRX - 4, bodyCY);
  ctx.stroke();

  // Glossy highlight
  ctx.fillStyle = 'rgba(255,255,230,0.18)';
  ctx.beginPath();
  ellipsePath(ctx, bodyCX - 4, bodyCY - 6, bodyRX * 0.6, bodyRY * 0.35);
  ctx.fill();

  // Pronotum
  const proGrad = ctx.createRadialGradient(pronotumCX, pronotumCY - 2, 2, pronotumCX, pronotumCY, pronotumRX);
  proGrad.addColorStop(0, '#9a5a30');
  proGrad.addColorStop(0.5, '#7a4422');
  proGrad.addColorStop(1, '#4a2510');
  ctx.fillStyle = proGrad;
  ctx.beginPath();
  ellipsePath(ctx, pronotumCX, pronotumCY, pronotumRX, pronotumRY);
  ctx.fill();
  ctx.strokeStyle = '#1a0800';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ellipsePath(ctx, pronotumCX, pronotumCY, pronotumRX, pronotumRY);
  ctx.stroke();

  // Head
  ctx.fillStyle = '#4a2810';
  ctx.beginPath();
  ellipsePath(ctx, headCX, headCY, headRX, headRY);
  ctx.fill();
  ctx.strokeStyle = '#1a0800';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ellipsePath(ctx, headCX, headCY, headRX, headRY);
  ctx.stroke();

  // Eyes
  for (const ey of [headCY - 3, headCY + 3]) {
    const eyeGrad = ctx.createRadialGradient(headCX + 3, ey, 0.5, headCX + 3, ey, 3);
    eyeGrad.addColorStop(0, '#ff5544');
    eyeGrad.addColorStop(0.6, '#bb0000');
    eyeGrad.addColorStop(1, '#660000');
    ctx.fillStyle = eyeGrad;
    ctx.beginPath();
    ctx.arc(headCX + 3, ey, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1a0800';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(headCX + 3, ey, 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,200,200,0.5)';
    ctx.beginPath();
    ctx.arc(headCX + 4, ey - 1, 1, 0, Math.PI * 2);
    ctx.fill();
  }

  // Antennae (swept forward/upward)
  ctx.strokeStyle = '#1a0800';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(headCX + 4, headCY - 4);
  ctx.quadraticCurveTo(88, headCY - 22, 94, headCY - 40);
  ctx.stroke();
  ctx.strokeStyle = '#5a3015';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(headCX + 4, headCY - 4);
  ctx.quadraticCurveTo(88, headCY - 22, 94, headCY - 40);
  ctx.stroke();

  ctx.strokeStyle = '#1a0800';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(headCX + 4, headCY + 4);
  ctx.quadraticCurveTo(88, headCY + 12, 92, headCY + 28);
  ctx.stroke();
  ctx.strokeStyle = '#5a3015';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(headCX + 4, headCY + 4);
  ctx.quadraticCurveTo(88, headCY + 12, 92, headCY + 28);
  ctx.stroke();

  // Motion lines
  ctx.strokeStyle = 'rgba(150,130,100,0.3)';
  ctx.lineWidth = 1.5;
  for (let ml = 0; ml < 4; ml++) {
    ctx.beginPath();
    ctx.moveTo(10 + ml * 16, 82);
    ctx.lineTo(6 + ml * 16, 94);
    ctx.stroke();
  }

  ctx.restore();
  saveCanvas(canvas, 'public/sprites/cockroach-jump.png');
}

// ============================================================
// 3. COCKROACH DEAD (96x96) — flipped on its back, legs in air
// ============================================================
{
  const canvas = createCanvas(96, 96);
  const ctx = canvas.getContext('2d');

  // The cockroach is on its back — we draw the underside directly (no flip transform needed)
  // Body centered, legs sticking UP
  const bodyCX = 42, bodyCY = 56;
  const bodyRX = 32, bodyRY = 15;

  // Shadow underneath
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ellipsePath(ctx, bodyCX, 88, 34, 4);
  ctx.fill();

  // --- Stiff legs pointing UP (dead, splayed, rigor mortis) ---
  ctx.lineCap = 'round';
  const deadLegs = [
    { x: 24, y: bodyCY },
    { x: 40, y: bodyCY },
    { x: 56, y: bodyCY },
  ];
  for (let p = 0; p < 3; p++) {
    const la = deadLegs[p];
    const splay = (p - 1) * 8; // spread outward

    // Top leg (stiff, bent at joint, pointing up)
    ctx.strokeStyle = '#1a0800';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(la.x, la.y - 6);
    ctx.lineTo(la.x - 10 + splay, la.y - 22);
    ctx.lineTo(la.x - 6 + splay, la.y - 32);
    ctx.stroke();
    ctx.strokeStyle = '#6a4020';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(la.x, la.y - 6);
    ctx.lineTo(la.x - 10 + splay, la.y - 22);
    ctx.lineTo(la.x - 6 + splay, la.y - 32);
    ctx.stroke();

    // Bottom leg (stiff, pointing down-ish but also up since flipped)
    ctx.strokeStyle = '#1a0800';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(la.x, la.y + 6);
    ctx.lineTo(la.x + 10 - splay, la.y - 18);
    ctx.lineTo(la.x + 14 - splay, la.y - 28);
    ctx.stroke();
    ctx.strokeStyle = '#6a4020';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(la.x, la.y + 6);
    ctx.lineTo(la.x + 10 - splay, la.y - 18);
    ctx.lineTo(la.x + 14 - splay, la.y - 28);
    ctx.stroke();
  }

  // --- Body underside (pale, lighter brown — belly up) ---
  const abdGrad = ctx.createRadialGradient(bodyCX, bodyCY - 4, 4, bodyCX, bodyCY, bodyRX);
  abdGrad.addColorStop(0, '#b08855');
  abdGrad.addColorStop(0.3, '#9a7744');
  abdGrad.addColorStop(0.6, '#7a5a30');
  abdGrad.addColorStop(1, '#4a3018');
  ctx.fillStyle = abdGrad;
  ctx.beginPath();
  ellipsePath(ctx, bodyCX, bodyCY, bodyRX, bodyRY);
  ctx.fill();
  ctx.strokeStyle = '#1a0800';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ellipsePath(ctx, bodyCX, bodyCY, bodyRX, bodyRY);
  ctx.stroke();

  // Belly segments
  ctx.strokeStyle = 'rgba(40, 20, 5, 0.3)';
  ctx.lineWidth = 1;
  for (let s = -2; s <= 2; s++) {
    const sy = bodyCY + s * 4;
    ctx.beginPath();
    ctx.moveTo(bodyCX - bodyRX + 8, sy);
    ctx.quadraticCurveTo(bodyCX, sy + s * 0.5, bodyCX + bodyRX - 8, sy);
    ctx.stroke();
  }

  // Pronotum area (underside)
  ctx.fillStyle = '#6a4825';
  ctx.beginPath();
  ellipsePath(ctx, 68, bodyCY, 12, 11);
  ctx.fill();
  ctx.strokeStyle = '#1a0800';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ellipsePath(ctx, 68, bodyCY, 12, 11);
  ctx.stroke();

  // Head (underside)
  ctx.fillStyle = '#4a2810';
  ctx.beginPath();
  ellipsePath(ctx, 78, bodyCY, 6, 5);
  ctx.fill();
  ctx.strokeStyle = '#1a0800';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ellipsePath(ctx, 78, bodyCY, 6, 5);
  ctx.stroke();

  // X eyes (dead!)
  ctx.strokeStyle = '#ff0000';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  // Eye 1
  ctx.beginPath(); ctx.moveTo(79, bodyCY - 5); ctx.lineTo(83, bodyCY - 1); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(83, bodyCY - 5); ctx.lineTo(79, bodyCY - 1); ctx.stroke();
  // Eye 2
  ctx.beginPath(); ctx.moveTo(79, bodyCY + 1); ctx.lineTo(83, bodyCY + 5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(83, bodyCY + 1); ctx.lineTo(79, bodyCY + 5); ctx.stroke();

  // Droopy antennae (limp, curling down)
  ctx.strokeStyle = '#3a1a08';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(82, bodyCY - 3);
  ctx.quadraticCurveTo(88, bodyCY + 8, 92, bodyCY + 22);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(82, bodyCY + 3);
  ctx.quadraticCurveTo(90, bodyCY + 14, 94, bodyCY + 28);
  ctx.stroke();

  // Soul leaving body
  ctx.strokeStyle = 'rgba(200, 200, 255, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(42, 30);
  ctx.quadraticCurveTo(36, 20, 42, 14);
  ctx.quadraticCurveTo(48, 8, 42, 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(200, 200, 255, 0.2)';
  ctx.beginPath();
  ctx.moveTo(36, 32);
  ctx.quadraticCurveTo(30, 24, 36, 18);
  ctx.quadraticCurveTo(42, 12, 36, 6);
  ctx.stroke();

  saveCanvas(canvas, 'public/sprites/cockroach-dead.png');
}

// ============================================================
// 4. APPLE (48x48) — glowing, juicy, saturated
// ============================================================
{
  const canvas = createCanvas(48, 48);
  const ctx = canvas.getContext('2d');

  // Outer glow (larger)
  ctx.fillStyle = 'rgba(255, 50, 50, 0.12)';
  ctx.beginPath();
  ctx.arc(24, 26, 22, 0, Math.PI * 2);
  ctx.fill();

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ellipsePath(ctx, 24, 45, 14, 3);
  ctx.fill();

  // Apple body with rich gradient
  const appleGrad = ctx.createRadialGradient(18, 22, 3, 24, 26, 20);
  appleGrad.addColorStop(0, '#ff5555');
  appleGrad.addColorStop(0.3, '#ee2222');
  appleGrad.addColorStop(0.6, '#cc0000');
  appleGrad.addColorStop(0.85, '#990000');
  appleGrad.addColorStop(1, '#770000');
  ctx.fillStyle = appleGrad;
  ctx.beginPath();
  ctx.moveTo(24, 10);
  ctx.bezierCurveTo(10, 12, 2, 26, 8, 38);
  ctx.bezierCurveTo(12, 44, 19, 46, 24, 44);
  ctx.bezierCurveTo(29, 46, 36, 44, 40, 38);
  ctx.bezierCurveTo(46, 26, 38, 12, 24, 10);
  ctx.fill();

  // Outline
  ctx.strokeStyle = '#440000';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(24, 10);
  ctx.bezierCurveTo(10, 12, 2, 26, 8, 38);
  ctx.bezierCurveTo(12, 44, 19, 46, 24, 44);
  ctx.bezierCurveTo(29, 46, 36, 44, 40, 38);
  ctx.bezierCurveTo(46, 26, 38, 12, 24, 10);
  ctx.stroke();

  // Highlight/shine (big glossy spot)
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.arc(16, 20, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.arc(15, 18, 3, 0, Math.PI * 2);
  ctx.fill();
  // Extra sparkle
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(14, 17, 1.2, 0, Math.PI * 2);
  ctx.fill();

  // Bottom dimple shadow
  ctx.fillStyle = 'rgba(60, 0, 0, 0.2)';
  ctx.beginPath();
  ctx.arc(24, 42, 6, 0, Math.PI);
  ctx.fill();

  // Right side shadow for depth
  ctx.fillStyle = 'rgba(80, 0, 0, 0.15)';
  ctx.beginPath();
  ctx.moveTo(24, 10);
  ctx.bezierCurveTo(34, 12, 44, 26, 40, 38);
  ctx.bezierCurveTo(36, 44, 29, 46, 24, 44);
  ctx.fill();

  // Stem (thicker, more defined)
  ctx.strokeStyle = '#3a2208';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(24, 12);
  ctx.quadraticCurveTo(25, 6, 27, 2);
  ctx.stroke();
  ctx.strokeStyle = '#553311';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(24, 12);
  ctx.quadraticCurveTo(25, 6, 27, 2);
  ctx.stroke();

  // Leaf (bigger, more detailed)
  ctx.fillStyle = '#22bb22';
  ctx.beginPath();
  ctx.moveTo(26, 7);
  ctx.quadraticCurveTo(34, 2, 40, 5);
  ctx.quadraticCurveTo(34, 10, 26, 7);
  ctx.fill();
  ctx.strokeStyle = '#116611';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(26, 7);
  ctx.quadraticCurveTo(34, 2, 40, 5);
  ctx.quadraticCurveTo(34, 10, 26, 7);
  ctx.stroke();
  // Leaf vein
  ctx.strokeStyle = '#118811';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(28, 7);
  ctx.lineTo(36, 5);
  ctx.stroke();

  // Second leaf (smaller, other side)
  ctx.fillStyle = '#33cc33';
  ctx.beginPath();
  ctx.moveTo(22, 8);
  ctx.quadraticCurveTo(14, 4, 10, 7);
  ctx.quadraticCurveTo(14, 11, 22, 8);
  ctx.fill();
  ctx.strokeStyle = '#116611';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(22, 8);
  ctx.quadraticCurveTo(14, 4, 10, 7);
  ctx.quadraticCurveTo(14, 11, 22, 8);
  ctx.stroke();

  saveCanvas(canvas, 'public/sprites/apple.png');
}

// ============================================================
// 5. PEST SPRAY (96x128) — menacing industrial death can
// ============================================================
{
  const canvas = createCanvas(96, 128);
  const ctx = canvas.getContext('2d');

  // Green mist cloud (bigger, more layered)
  for (let i = 6; i >= 0; i--) {
    ctx.fillStyle = `rgba(80, 220, 80, ${0.03 + i * 0.018})`;
    ctx.beginPath();
    ctx.arc(48 + i * 3, 110 + i * 4, 16 + i * 5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Mist particles
  ctx.fillStyle = 'rgba(100, 255, 100, 0.12)';
  for (let i = 0; i < 12; i++) {
    const mx = 28 + Math.sin(i * 2.3) * 20;
    const my = 92 + Math.sin(i * 3.1) * 20;
    ctx.beginPath();
    ctx.arc(mx, my, 3 + Math.sin(i * 1.7) * 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Can body with metallic gradient
  const canGrad = ctx.createLinearGradient(24, 0, 72, 0);
  canGrad.addColorStop(0, '#aa1111');
  canGrad.addColorStop(0.15, '#cc2222');
  canGrad.addColorStop(0.3, '#ee4444');
  canGrad.addColorStop(0.45, '#ffdd00');
  canGrad.addColorStop(0.55, '#ffdd00');
  canGrad.addColorStop(0.7, '#ee4444');
  canGrad.addColorStop(0.85, '#cc2222');
  canGrad.addColorStop(1, '#881111');
  ctx.fillStyle = canGrad;
  roundRect(ctx, 24, 10, 48, 72, 6);
  ctx.fill();

  // Can outline
  ctx.strokeStyle = '#220000';
  ctx.lineWidth = 3;
  roundRect(ctx, 24, 10, 48, 72, 6);
  ctx.stroke();

  // Can highlight stripe
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(30, 14, 6, 64);
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(36, 14, 3, 64);

  // Label area (white band with border)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(28, 30, 40, 28);
  ctx.strokeStyle = '#666666';
  ctx.lineWidth = 1;
  ctx.strokeRect(28, 30, 40, 28);

  // Skull on label (bigger, more detailed)
  ctx.fillStyle = '#222222';
  ctx.beginPath();
  ctx.arc(48, 40, 8, 0, Math.PI * 2);
  ctx.fill();
  // Skull jaw
  ctx.beginPath();
  ctx.moveTo(42, 44);
  ctx.quadraticCurveTo(48, 52, 54, 44);
  ctx.fill();
  // Skull eyes
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(44, 39, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(52, 39, 2.5, 0, Math.PI * 2);
  ctx.fill();
  // Skull nose
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(47, 43);
  ctx.lineTo(49, 43);
  ctx.lineTo(48, 45);
  ctx.fill();
  // Crossbones
  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(36, 50); ctx.lineTo(60, 56);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(60, 50); ctx.lineTo(36, 56);
  ctx.stroke();

  // Warning stripe at bottom
  for (let s = 0; s < 10; s++) {
    ctx.fillStyle = s % 2 === 0 ? '#ffcc00' : '#222222';
    ctx.fillRect(24 + s * 5, 68, 5, 12);
  }

  // Nozzle/cap
  ctx.fillStyle = '#555555';
  roundRect(ctx, 38, 2, 20, 10, 3);
  ctx.fill();
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = 2;
  roundRect(ctx, 38, 2, 20, 10, 3);
  ctx.stroke();

  // Spray nozzle tip
  ctx.fillStyle = '#777777';
  ctx.beginPath();
  ctx.moveTo(48, 82);
  ctx.lineTo(42, 92);
  ctx.lineTo(54, 92);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#444444';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(48, 82);
  ctx.lineTo(42, 92);
  ctx.lineTo(54, 92);
  ctx.closePath();
  ctx.stroke();

  // Spray button
  ctx.fillStyle = '#444444';
  roundRect(ctx, 42, 0, 12, 4, 2);
  ctx.fill();

  // Metallic rims
  ctx.fillStyle = '#aaaaaa';
  ctx.fillRect(25, 10, 46, 3);
  ctx.fillStyle = '#999999';
  ctx.fillRect(25, 79, 46, 3);

  saveCanvas(canvas, 'public/sprites/pest-spray.png');
}

// ============================================================
// 6. NEWSPAPER (128x80) — rolled up, being swung
// ============================================================
{
  const canvas = createCanvas(128, 80);
  const ctx = canvas.getContext('2d');

  ctx.save();
  ctx.translate(64, 40);
  ctx.rotate(-0.2);
  ctx.translate(-64, -40);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ellipsePath(ctx, 64, 74, 50, 5);
  ctx.fill();

  // Rolled newspaper body (cylinder)
  const paperGrad = ctx.createLinearGradient(0, 16, 0, 64);
  paperGrad.addColorStop(0, '#f5efe0');
  paperGrad.addColorStop(0.2, '#f0e8d8');
  paperGrad.addColorStop(0.5, '#e8dcc8');
  paperGrad.addColorStop(0.8, '#d8ccb4');
  paperGrad.addColorStop(1, '#c8bca0');
  ctx.fillStyle = paperGrad;
  ctx.beginPath();
  ctx.moveTo(12, 22);
  ctx.lineTo(116, 22);
  ctx.quadraticCurveTo(122, 40, 116, 58);
  ctx.lineTo(12, 58);
  ctx.quadraticCurveTo(6, 40, 12, 22);
  ctx.fill();

  // Newspaper outline
  ctx.strokeStyle = '#8a7a66';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(12, 22);
  ctx.lineTo(116, 22);
  ctx.quadraticCurveTo(122, 40, 116, 58);
  ctx.lineTo(12, 58);
  ctx.quadraticCurveTo(6, 40, 12, 22);
  ctx.stroke();

  // Text lines (more readable)
  ctx.strokeStyle = 'rgba(100, 80, 60, 0.2)';
  ctx.lineWidth = 0.7;
  for (let ln = 0; ln < 10; ln++) {
    const ly = 26 + ln * 3.2;
    ctx.beginPath();
    ctx.moveTo(18, ly);
    ctx.lineTo(110, ly);
    ctx.stroke();
  }

  // Headlines (thicker, bolder)
  ctx.strokeStyle = 'rgba(50, 30, 10, 0.5)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(18, 28);
  ctx.lineTo(66, 28);
  ctx.stroke();
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(18, 33);
  ctx.lineTo(92, 33);
  ctx.stroke();

  // Rubber band (thicker, more visible)
  ctx.fillStyle = '#8B4513';
  ctx.fillRect(56, 18, 16, 44);
  ctx.fillStyle = 'rgba(255,200,150,0.35)';
  ctx.fillRect(58, 18, 5, 44);
  ctx.strokeStyle = '#5a2a08';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(56, 18, 16, 44);

  // End of roll (right)
  ctx.fillStyle = '#ddd0bc';
  ctx.beginPath();
  ellipsePath(ctx, 116, 40, 6, 18);
  ctx.fill();
  ctx.strokeStyle = '#a09480';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ellipsePath(ctx, 116, 40, 6, 18);
  ctx.stroke();
  // Inner spiral
  ctx.strokeStyle = 'rgba(100, 80, 60, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ellipsePath(ctx, 116, 40, 3, 10);
  ctx.stroke();
  ctx.beginPath();
  ellipsePath(ctx, 116, 40, 1.5, 5);
  ctx.stroke();

  // Left end
  ctx.fillStyle = '#ddd0bc';
  ctx.beginPath();
  ellipsePath(ctx, 12, 40, 6, 18);
  ctx.fill();
  ctx.strokeStyle = '#a09480';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ellipsePath(ctx, 12, 40, 6, 18);
  ctx.stroke();

  // Motion lines (swinging)
  ctx.strokeStyle = 'rgba(180,160,140,0.4)';
  ctx.lineWidth = 1.8;
  for (let ml = 0; ml < 4; ml++) {
    ctx.beginPath();
    ctx.moveTo(118 + ml * 4, 24 + ml * 3);
    ctx.lineTo(124 + ml * 4, 56 - ml * 3);
    ctx.stroke();
  }

  ctx.restore();
  saveCanvas(canvas, 'public/sprites/newspaper.png');
}

// ============================================================
// 7. ONION (64x64) — stinky, layered, vibrant
// ============================================================
{
  const canvas = createCanvas(64, 64);
  const ctx = canvas.getContext('2d');

  // Stink lines (wavy green, behind)
  ctx.strokeStyle = 'rgba(80, 200, 40, 0.55)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const sx = 10 + i * 12;
    ctx.beginPath();
    ctx.moveTo(sx, 20);
    ctx.quadraticCurveTo(sx - 4, 12, sx, 6);
    ctx.quadraticCurveTo(sx + 4, 0, sx, -4);
    ctx.stroke();
  }
  // Extra stink wisps
  ctx.strokeStyle = 'rgba(100, 220, 60, 0.3)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(20, 18);
  ctx.quadraticCurveTo(16, 10, 20, 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(44, 18);
  ctx.quadraticCurveTo(48, 10, 44, 2);
  ctx.stroke();

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ellipsePath(ctx, 32, 62, 18, 3);
  ctx.fill();

  // Roots
  ctx.strokeStyle = '#8B7355';
  ctx.lineWidth = 1.5;
  for (let r = 0; r < 6; r++) {
    ctx.beginPath();
    ctx.moveTo(22 + r * 4, 56);
    ctx.quadraticCurveTo(20 + r * 4, 60, 18 + r * 5, 63);
    ctx.stroke();
  }

  // Onion body with rich gradient
  const onionGrad = ctx.createRadialGradient(28, 40, 4, 32, 42, 22);
  onionGrad.addColorStop(0, '#f0dd99');
  onionGrad.addColorStop(0.25, '#e8cc88');
  onionGrad.addColorStop(0.5, '#cc88cc');
  onionGrad.addColorStop(0.75, '#9944aa');
  onionGrad.addColorStop(1, '#662288');
  ctx.fillStyle = onionGrad;
  ctx.beginPath();
  ctx.moveTo(32, 20);
  ctx.bezierCurveTo(10, 26, 6, 48, 18, 56);
  ctx.bezierCurveTo(24, 60, 40, 60, 46, 56);
  ctx.bezierCurveTo(58, 48, 54, 26, 32, 20);
  ctx.fill();

  // Onion outline
  ctx.strokeStyle = '#331144';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(32, 20);
  ctx.bezierCurveTo(10, 26, 6, 48, 18, 56);
  ctx.bezierCurveTo(24, 60, 40, 60, 46, 56);
  ctx.bezierCurveTo(58, 48, 54, 26, 32, 20);
  ctx.stroke();

  // Layer lines (visible onion layers)
  ctx.strokeStyle = 'rgba(120, 50, 150, 0.4)';
  ctx.lineWidth = 1;
  for (let l = 0; l < 5; l++) {
    const lo = l * 4;
    ctx.beginPath();
    ctx.moveTo(18 + lo, 30 + lo);
    ctx.quadraticCurveTo(32, 24 + lo * 0.5, 46 - lo, 30 + lo);
    ctx.stroke();
  }

  // Highlight
  ctx.fillStyle = 'rgba(255,255,200,0.22)';
  ctx.beginPath();
  ellipsePath(ctx, 26, 36, 7, 10);
  ctx.fill();

  // Top sprout (bigger, more detail)
  ctx.fillStyle = '#44aa22';
  ctx.strokeStyle = '#226611';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(28, 22);
  ctx.quadraticCurveTo(24, 12, 20, 2);
  ctx.lineTo(26, 6);
  ctx.quadraticCurveTo(28, 14, 32, 20);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(34, 22);
  ctx.quadraticCurveTo(38, 12, 44, 2);
  ctx.lineTo(38, 6);
  ctx.quadraticCurveTo(36, 14, 32, 20);
  ctx.fill();
  ctx.stroke();

  // Papery skin texture
  ctx.strokeStyle = 'rgba(180, 140, 80, 0.2)';
  ctx.lineWidth = 0.6;
  for (let t = 0; t < 8; t++) {
    ctx.beginPath();
    ctx.moveTo(20 + t * 4, 28);
    ctx.lineTo(18 + t * 4, 54);
    ctx.stroke();
  }

  saveCanvas(canvas, 'public/sprites/onion.png');
}

// ============================================================
// 8. FLIPPER / SANDAL (112x48) — big threatening flip-flop
// ============================================================
{
  const canvas = createCanvas(112, 48);
  const ctx = canvas.getContext('2d');

  ctx.save();
  ctx.translate(56, 24);
  ctx.rotate(-0.15);
  ctx.translate(-56, -24);

  // Motion blur lines
  ctx.strokeStyle = 'rgba(180,160,140,0.35)';
  ctx.lineWidth = 1.5;
  for (let m = 0; m < 4; m++) {
    ctx.beginPath();
    ctx.moveTo(98 + m * 4, 8 + m * 3);
    ctx.lineTo(102 + m * 4, 40 - m * 3);
    ctx.stroke();
  }

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ellipsePath(ctx, 50, 44, 44, 3);
  ctx.fill();

  // Sole - flip-flop shape
  const soleGrad = ctx.createLinearGradient(0, 10, 0, 38);
  soleGrad.addColorStop(0, '#ee9955');
  soleGrad.addColorStop(0.3, '#dd8844');
  soleGrad.addColorStop(0.7, '#cc7733');
  soleGrad.addColorStop(1, '#aa5522');
  ctx.fillStyle = soleGrad;
  ctx.beginPath();
  ctx.moveTo(10, 20);
  ctx.bezierCurveTo(4, 14, 10, 10, 24, 10);
  ctx.lineTo(80, 8);
  ctx.bezierCurveTo(94, 8, 100, 14, 96, 22);
  ctx.lineTo(94, 28);
  ctx.bezierCurveTo(92, 36, 84, 40, 70, 40);
  ctx.lineTo(24, 38);
  ctx.bezierCurveTo(10, 38, 4, 32, 10, 20);
  ctx.fill();

  // Sole outline (thick, dark)
  ctx.strokeStyle = '#663311';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(10, 20);
  ctx.bezierCurveTo(4, 14, 10, 10, 24, 10);
  ctx.lineTo(80, 8);
  ctx.bezierCurveTo(94, 8, 100, 14, 96, 22);
  ctx.lineTo(94, 28);
  ctx.bezierCurveTo(92, 36, 84, 40, 70, 40);
  ctx.lineTo(24, 38);
  ctx.bezierCurveTo(10, 38, 4, 32, 10, 20);
  ctx.stroke();

  // Sole tread texture
  ctx.strokeStyle = 'rgba(80,40,10,0.2)';
  ctx.lineWidth = 0.7;
  for (let t = 0; t < 12; t++) {
    const tx = 16 + t * 7;
    ctx.beginPath();
    ctx.moveTo(tx, 14);
    ctx.lineTo(tx - 1, 36);
    ctx.stroke();
  }

  // Toe strap V-shape
  ctx.strokeStyle = '#553311';
  ctx.lineWidth = 4.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(86, 14);
  ctx.quadraticCurveTo(76, 22, 66, 14);
  ctx.stroke();
  ctx.strokeStyle = '#664422';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(86, 14);
  ctx.quadraticCurveTo(76, 22, 66, 14);
  ctx.stroke();

  // Connecting straps
  ctx.strokeStyle = '#553311';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(86, 14);
  ctx.quadraticCurveTo(82, 22, 82, 32);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(66, 14);
  ctx.quadraticCurveTo(64, 22, 66, 32);
  ctx.stroke();

  // Strap highlight
  ctx.strokeStyle = 'rgba(255,200,150,0.3)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(84, 14);
  ctx.quadraticCurveTo(76, 20, 68, 14);
  ctx.stroke();

  // Cross-hatch tread
  ctx.strokeStyle = 'rgba(60, 30, 10, 0.2)';
  ctx.lineWidth = 0.6;
  for (let t = 0; t < 14; t++) {
    const tx = 14 + t * 6;
    ctx.beginPath();
    ctx.moveTo(tx, 32);
    ctx.lineTo(tx + 4, 38);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tx + 4, 32);
    ctx.lineTo(tx, 38);
    ctx.stroke();
  }

  // Worn spot on heel
  ctx.fillStyle = 'rgba(200, 160, 120, 0.18)';
  ctx.beginPath();
  ellipsePath(ctx, 22, 24, 8, 6);
  ctx.fill();

  // Sole thickness
  ctx.strokeStyle = '#664422';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(10, 32);
  ctx.bezierCurveTo(4, 36, 8, 40, 22, 40);
  ctx.stroke();

  ctx.restore();
  saveCanvas(canvas, 'public/sprites/flipper.png');
}

// ============================================================
// 9. BIRD (80x80) — menacing crow with feather detail
// ============================================================
{
  const canvas = createCanvas(80, 80);
  const ctx = canvas.getContext('2d');

  ctx.save();
  ctx.translate(40, 40);
  ctx.rotate(0.12);
  ctx.translate(-40, -40);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ellipsePath(ctx, 40, 76, 24, 4);
  ctx.fill();

  // Wings spread - LEFT WING
  const wingGrad = ctx.createLinearGradient(0, 20, 40, 40);
  wingGrad.addColorStop(0, '#222233');
  wingGrad.addColorStop(1, '#0a0a16');
  ctx.fillStyle = wingGrad;
  ctx.beginPath();
  ctx.moveTo(40, 36);
  ctx.quadraticCurveTo(16, 14, 2, 10);
  ctx.lineTo(4, 18);
  ctx.quadraticCurveTo(20, 24, 34, 42);
  ctx.closePath();
  ctx.fill();
  // Wing outline
  ctx.strokeStyle = '#000008';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(40, 36);
  ctx.quadraticCurveTo(16, 14, 2, 10);
  ctx.lineTo(4, 18);
  ctx.quadraticCurveTo(20, 24, 34, 42);
  ctx.stroke();
  // Feather tips on left wing
  ctx.fillStyle = '#181822';
  for (let ft = 0; ft < 4; ft++) {
    const fx = 4 + ft * 6;
    const fy = 12 + ft * 3;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx - 4, fy - 4);
    ctx.lineTo(fx + 2, fy + 3);
    ctx.closePath();
    ctx.fill();
  }
  // Feather texture on left wing
  ctx.strokeStyle = 'rgba(40, 40, 55, 0.5)';
  ctx.lineWidth = 0.8;
  for (let wf = 0; wf < 5; wf++) {
    const wfx = 8 + wf * 7;
    const wfy = 14 + wf * 4;
    ctx.beginPath();
    ctx.moveTo(wfx, wfy);
    ctx.lineTo(wfx + 3, wfy + 5);
    ctx.stroke();
  }

  // RIGHT WING
  ctx.fillStyle = wingGrad;
  ctx.beginPath();
  ctx.moveTo(40, 36);
  ctx.quadraticCurveTo(64, 14, 78, 10);
  ctx.lineTo(76, 18);
  ctx.quadraticCurveTo(60, 24, 46, 42);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#000008';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(40, 36);
  ctx.quadraticCurveTo(64, 14, 78, 10);
  ctx.lineTo(76, 18);
  ctx.quadraticCurveTo(60, 24, 46, 42);
  ctx.stroke();
  // Right wing feather tips
  ctx.fillStyle = '#181822';
  for (let ft = 0; ft < 4; ft++) {
    const fx = 76 - ft * 6;
    const fy = 12 + ft * 3;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx + 4, fy - 4);
    ctx.lineTo(fx - 2, fy + 3);
    ctx.closePath();
    ctx.fill();
  }

  // Body with gradient
  const bodyGrad = ctx.createRadialGradient(40, 46, 4, 40, 46, 16);
  bodyGrad.addColorStop(0, '#2a2a38');
  bodyGrad.addColorStop(0.5, '#181824');
  bodyGrad.addColorStop(1, '#08080e');
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ellipsePath(ctx, 40, 46, 16, 14);
  ctx.fill();
  ctx.strokeStyle = '#000008';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ellipsePath(ctx, 40, 46, 16, 14);
  ctx.stroke();

  // Belly lighter shade
  ctx.fillStyle = 'rgba(60, 60, 75, 0.3)';
  ctx.beginPath();
  ellipsePath(ctx, 40, 52, 10, 7);
  ctx.fill();

  // Feather texture on body
  ctx.strokeStyle = 'rgba(50, 50, 65, 0.4)';
  ctx.lineWidth = 0.8;
  for (let fy = 38; fy < 58; fy += 4) {
    for (let fx = 28; fx < 54; fx += 5) {
      ctx.beginPath();
      ctx.arc(fx, fy, 3, 0.3, Math.PI - 0.3);
      ctx.stroke();
    }
  }

  // Tail feathers
  ctx.fillStyle = '#0a0a14';
  ctx.beginPath();
  ctx.moveTo(22, 50);
  ctx.lineTo(8, 62);
  ctx.lineTo(14, 58);
  ctx.lineTo(10, 66);
  ctx.lineTo(18, 60);
  ctx.lineTo(14, 68);
  ctx.lineTo(24, 58);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#000008';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(22, 50);
  ctx.lineTo(8, 62);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(22, 50);
  ctx.lineTo(10, 66);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(22, 50);
  ctx.lineTo(14, 68);
  ctx.stroke();

  // Head
  const headGrad = ctx.createRadialGradient(50, 35, 2, 50, 35, 10);
  headGrad.addColorStop(0, '#2a2a38');
  headGrad.addColorStop(1, '#101018');
  ctx.fillStyle = headGrad;
  ctx.beginPath();
  ctx.arc(50, 35, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#000008';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(50, 35, 10, 0, Math.PI * 2);
  ctx.stroke();

  // Beak (sharp, pointing down — menacing)
  ctx.fillStyle = '#dd9900';
  ctx.beginPath();
  ctx.moveTo(58, 33);
  ctx.lineTo(70, 44);
  ctx.lineTo(58, 39);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#886600';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(58, 33);
  ctx.lineTo(70, 44);
  ctx.lineTo(58, 39);
  ctx.closePath();
  ctx.stroke();
  // Beak highlight
  ctx.fillStyle = '#ffcc44';
  ctx.beginPath();
  ctx.moveTo(58, 33);
  ctx.lineTo(64, 37);
  ctx.lineTo(58, 36);
  ctx.closePath();
  ctx.fill();

  // Angry red eye (BIG, expressive)
  ctx.fillStyle = '#ff0000';
  ctx.beginPath();
  ctx.arc(53, 32, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#880000';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(53, 32, 4.5, 0, Math.PI * 2);
  ctx.stroke();
  // Pupil
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(54, 32, 2.2, 0, Math.PI * 2);
  ctx.fill();
  // Eye glint
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(51.5, 30.5, 1.2, 0, Math.PI * 2);
  ctx.fill();

  // Angry eyebrow (THICK, menacing)
  ctx.strokeStyle = '#000010';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(47, 28);
  ctx.lineTo(57, 26);
  ctx.stroke();

  // Talons (bigger, sharper)
  ctx.strokeStyle = '#555555';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  // Left talon
  for (const [dx, dy] of [[-3, 8], [1, 8], [-5, 7]]) {
    ctx.beginPath();
    ctx.moveTo(33, 58);
    ctx.lineTo(33 + dx, 58 + dy);
    ctx.stroke();
  }
  // Right talon
  for (const [dx, dy] of [[-1, 8], [3, 8], [5, 7]]) {
    ctx.beginPath();
    ctx.moveTo(47, 58);
    ctx.lineTo(47 + dx, 58 + dy);
    ctx.stroke();
  }
  // Claw tips
  ctx.fillStyle = '#888888';
  for (const [tx, ty] of [[30, 66], [34, 66], [28, 65], [46, 66], [50, 66], [52, 65]]) {
    ctx.beginPath();
    ctx.arc(tx, ty, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
  saveCanvas(canvas, 'public/sprites/bird.png');
}

// ============================================================
// 10. CAT PAW (96x96) — orange, furry, claws out, TERRIFYING
// ============================================================
{
  const canvas = createCanvas(96, 96);
  const ctx = canvas.getContext('2d');

  ctx.save();
  ctx.translate(48, 48);
  ctx.rotate(0.2);
  ctx.translate(-48, -48);

  // Fur edge glow
  ctx.fillStyle = 'rgba(255, 140, 50, 0.1)';
  ctx.beginPath();
  ellipsePath(ctx, 48, 50, 42, 38);
  ctx.fill();

  // Main paw shape with rich gradient
  const pawGrad = ctx.createRadialGradient(44, 44, 6, 48, 50, 36);
  pawGrad.addColorStop(0, '#ffbb66');
  pawGrad.addColorStop(0.3, '#ffaa55');
  pawGrad.addColorStop(0.6, '#ee8833');
  pawGrad.addColorStop(1, '#cc6622');
  ctx.fillStyle = pawGrad;
  ctx.beginPath();
  ctx.moveTo(22, 20);
  ctx.bezierCurveTo(14, 24, 10, 42, 14, 60);
  ctx.bezierCurveTo(16, 78, 28, 86, 48, 86);
  ctx.bezierCurveTo(68, 86, 80, 78, 82, 60);
  ctx.bezierCurveTo(86, 42, 82, 24, 74, 20);
  ctx.quadraticCurveTo(48, 14, 22, 20);
  ctx.fill();

  // Paw outline (thick!)
  ctx.strokeStyle = '#884411';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(22, 20);
  ctx.bezierCurveTo(14, 24, 10, 42, 14, 60);
  ctx.bezierCurveTo(16, 78, 28, 86, 48, 86);
  ctx.bezierCurveTo(68, 86, 80, 78, 82, 60);
  ctx.bezierCurveTo(86, 42, 82, 24, 74, 20);
  ctx.quadraticCurveTo(48, 14, 22, 20);
  ctx.stroke();

  // Fur texture strokes around edge
  ctx.strokeStyle = 'rgba(200, 120, 40, 0.4)';
  ctx.lineWidth = 1.5;
  const furPoints = [
    [16, 30], [12, 42], [14, 54], [18, 68],
    [80, 30], [84, 42], [82, 54], [78, 68],
    [28, 16], [38, 14], [54, 14], [66, 16],
  ];
  for (const [fx, fy] of furPoints) {
    const dx = fx < 48 ? -4 : 4;
    const dy = fy < 36 ? -4 : (fy > 60 ? 4 : 0);
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx + dx, fy + dy);
    ctx.stroke();
    // Double fur stroke
    ctx.beginPath();
    ctx.moveTo(fx + 2, fy + 1);
    ctx.lineTo(fx + dx + 1, fy + dy + 2);
    ctx.stroke();
  }

  // Tabby stripe markings (darker)
  ctx.strokeStyle = 'rgba(150, 70, 20, 0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(28, 26);
  ctx.quadraticCurveTo(32, 36, 28, 46);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(68, 26);
  ctx.quadraticCurveTo(64, 36, 68, 46);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(48, 20);
  ctx.lineTo(48, 32);
  ctx.stroke();

  // Main central pad (large, pink, detailed)
  const padGrad = ctx.createRadialGradient(48, 72, 2, 48, 72, 12);
  padGrad.addColorStop(0, '#ffbbbb');
  padGrad.addColorStop(0.5, '#ffaaaa');
  padGrad.addColorStop(1, '#dd7788');
  ctx.fillStyle = padGrad;
  ctx.beginPath();
  ctx.moveTo(34, 66);
  ctx.quadraticCurveTo(40, 60, 48, 63);
  ctx.quadraticCurveTo(56, 60, 62, 66);
  ctx.quadraticCurveTo(60, 78, 48, 82);
  ctx.quadraticCurveTo(36, 78, 34, 66);
  ctx.fill();
  ctx.strokeStyle = '#bb5566';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(34, 66);
  ctx.quadraticCurveTo(40, 60, 48, 63);
  ctx.quadraticCurveTo(56, 60, 62, 66);
  ctx.quadraticCurveTo(60, 78, 48, 82);
  ctx.quadraticCurveTo(36, 78, 34, 66);
  ctx.stroke();

  // Toe beans (4 pads, bigger)
  const toePositions = [
    [24, 56, 6], [38, 50, 5.5], [58, 50, 5.5], [72, 56, 6],
  ];
  for (const [tx, ty, tr] of toePositions) {
    const toeGrad = ctx.createRadialGradient(tx, ty, 1, tx, ty, tr);
    toeGrad.addColorStop(0, '#ffbbbb');
    toeGrad.addColorStop(1, '#ee8899');
    ctx.fillStyle = toeGrad;
    ctx.beginPath();
    ellipsePath(ctx, tx, ty, tr, tr * 0.8);
    ctx.fill();
    ctx.strokeStyle = '#cc6677';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ellipsePath(ctx, tx, ty, tr, tr * 0.8);
    ctx.stroke();
  }
  // Toe pad highlights
  ctx.fillStyle = 'rgba(255,210,210,0.5)';
  for (const [tx, ty, tr] of toePositions) {
    ctx.beginPath();
    ctx.arc(tx - 1, ty - 1, tr * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // CLAWS — sharp, white, extended, SCARY
  const clawData = [
    { base: [22, 50], tip: [8, 28], ctrl: [12, 38] },
    { base: [36, 44], tip: [24, 20], ctrl: [28, 30] },
    { base: [60, 44], tip: [72, 20], ctrl: [68, 30] },
    { base: [74, 50], tip: [88, 28], ctrl: [84, 38] },
  ];
  for (const c of clawData) {
    // Claw shadow
    ctx.fillStyle = 'rgba(180,180,180,0.3)';
    ctx.beginPath();
    ctx.moveTo(c.base[0] - 2, c.base[1] + 1);
    ctx.quadraticCurveTo(c.ctrl[0] - 1, c.ctrl[1] + 1, c.tip[0] + 1, c.tip[1] + 1);
    ctx.quadraticCurveTo(c.ctrl[0] + 2, c.ctrl[1] + 1, c.base[0] + 2, c.base[1] + 1);
    ctx.fill();

    // Claw body
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(c.base[0] - 2.5, c.base[1]);
    ctx.quadraticCurveTo(c.ctrl[0] - 1.5, c.ctrl[1], c.tip[0], c.tip[1]);
    ctx.quadraticCurveTo(c.ctrl[0] + 1.5, c.ctrl[1], c.base[0] + 2.5, c.base[1]);
    ctx.fill();

    // Claw outline
    ctx.strokeStyle = 'rgba(150,150,150,0.9)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(c.base[0] - 2.5, c.base[1]);
    ctx.quadraticCurveTo(c.ctrl[0] - 1.5, c.ctrl[1], c.tip[0], c.tip[1]);
    ctx.quadraticCurveTo(c.ctrl[0] + 1.5, c.ctrl[1], c.base[0] + 2.5, c.base[1]);
    ctx.stroke();

    // Claw shine
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    const mx = (c.base[0] + c.tip[0]) / 2;
    const my = (c.base[1] + c.tip[1]) / 2;
    ctx.arc(mx - 1, my - 1, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
  saveCanvas(canvas, 'public/sprites/cat-paw.png');
}

// ============================================================
// 11. SKY BACKGROUND (800x400) — trippy, eerie (keep mostly same)
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

  // Subtle spiral pattern
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

  // Stars
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

    ctx.fillStyle = `rgba(200, 200, 255, ${bright * 0.15})`;
    ctx.beginPath();
    ctx.arc(sx, sy, size * 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(255, 255, 255, ${bright})`;
    ctx.beginPath();
    ctx.arc(sx, sy, size, 0, Math.PI * 2);
    ctx.fill();

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

  // Moon
  const moonX = 650, moonY = 90, moonR = 60;
  const moonGlow = ctx.createRadialGradient(moonX, moonY, moonR * 0.5, moonX, moonY, moonR * 2.5);
  moonGlow.addColorStop(0, 'rgba(255, 240, 200, 0.15)');
  moonGlow.addColorStop(0.5, 'rgba(255, 220, 180, 0.06)');
  moonGlow.addColorStop(1, 'rgba(255, 200, 150, 0)');
  ctx.fillStyle = moonGlow;
  ctx.beginPath();
  ctx.arc(moonX, moonY, moonR * 2.5, 0, Math.PI * 2);
  ctx.fill();

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
    ctx.strokeStyle = `rgba(255, 240, 200, ${cr.d * 0.8})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(moonX + cr.x, moonY + cr.y, cr.r, Math.PI * 0.8, Math.PI * 1.8);
    ctx.stroke();
  }

  // Clouds
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

  // Cloud wisps
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
// 12. MIDGROUND (800x400) — Courage-style silhouettes (keep same)
// ============================================================
{
  const canvas = createCanvas(800, 400);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 800, 400);

  const darkColor = '#08040e';

  // Ground line
  ctx.fillStyle = darkColor;
  ctx.fillRect(0, 360, 800, 40);
  ctx.beginPath();
  ctx.moveTo(0, 360);
  for (let gx = 0; gx <= 800; gx += 10) {
    ctx.lineTo(gx, 356 + Math.sin(gx * 0.03) * 3 + Math.sin(gx * 0.07) * 2);
  }
  ctx.lineTo(800, 400);
  ctx.lineTo(0, 400);
  ctx.fill();

  // HOUSE 1
  ctx.fillStyle = darkColor;
  ctx.save();
  ctx.translate(80, 0);
  ctx.transform(1, 0, -0.05, 1, 0, 0);
  ctx.fillRect(0, 240, 100, 120);
  ctx.beginPath();
  ctx.moveTo(-15, 240);
  ctx.lineTo(50, 160);
  ctx.lineTo(115, 240);
  ctx.fill();
  ctx.fillRect(75, 175, 18, 50);
  ctx.fillStyle = 'rgba(40, 20, 60, 0.6)';
  ctx.fillRect(25, 270, 20, 25);
  ctx.fillRect(60, 270, 20, 25);
  ctx.fillStyle = 'rgba(30, 15, 45, 0.5)';
  ctx.fillRect(38, 320, 24, 40);
  ctx.fillStyle = 'rgba(60, 30, 80, 0.5)';
  ctx.beginPath();
  ctx.arc(50, 210, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // DEAD TREE 1
  ctx.fillStyle = darkColor;
  ctx.save();
  ctx.translate(240, 0);
  ctx.beginPath();
  ctx.moveTo(0, 360);
  ctx.lineTo(-3, 280);
  ctx.quadraticCurveTo(-5, 240, 2, 200);
  ctx.quadraticCurveTo(8, 240, 12, 280);
  ctx.lineTo(10, 360);
  ctx.fill();
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
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(2, 210);
  ctx.quadraticCurveTo(-10, 190, -5, 175);
  ctx.stroke();
  ctx.restore();

  // HOUSE 2
  ctx.fillStyle = darkColor;
  ctx.save();
  ctx.translate(380, 0);
  ctx.transform(1, 0, 0.03, 1, 0, 0);
  ctx.fillRect(0, 280, 80, 80);
  ctx.beginPath();
  ctx.moveTo(-10, 280);
  ctx.lineTo(40, 220);
  ctx.lineTo(90, 280);
  ctx.fill();
  ctx.fillStyle = 'rgba(40, 20, 60, 0.5)';
  ctx.fillRect(20, 300, 15, 15);
  ctx.fillRect(50, 300, 15, 15);
  ctx.fillStyle = darkColor;
  for (let fp = 0; fp < 5; fp++) {
    const fh = 12 + (fp % 3) * 4;
    ctx.fillRect(85 + fp * 8, 360 - fh, 3, fh);
  }
  ctx.fillRect(85, 352, 40, 2);
  ctx.restore();

  // WINDMILL
  ctx.fillStyle = darkColor;
  ctx.save();
  ctx.translate(560, 0);
  ctx.beginPath();
  ctx.moveTo(-8, 360);
  ctx.lineTo(-4, 230);
  ctx.lineTo(20, 230);
  ctx.lineTo(24, 360);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-10, 230);
  ctx.lineTo(8, 210);
  ctx.lineTo(26, 230);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = darkColor;
  ctx.lineCap = 'round';
  const bladeLen = 50;
  const bcx = 8, bcy = 225;
  const bladeAngle = 0.3;
  for (let b = 0; b < 4; b++) {
    const a = bladeAngle + (b * Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(bcx, bcy);
    ctx.lineTo(bcx + Math.cos(a) * bladeLen, bcy + Math.sin(a) * bladeLen);
    ctx.stroke();
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

  // DEAD TREE 2
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

  // Distant hills
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

  const woodGrad = ctx.createLinearGradient(0, 0, 0, 16);
  woodGrad.addColorStop(0, '#6b4a2a');
  woodGrad.addColorStop(0.15, '#7a5a38');
  woodGrad.addColorStop(0.3, '#5e3a1e');
  woodGrad.addColorStop(0.5, '#6b4a2a');
  woodGrad.addColorStop(0.85, '#5a3818');
  woodGrad.addColorStop(1, '#4a2a10');
  ctx.fillStyle = woodGrad;
  ctx.fillRect(0, 0, 800, 16);

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

  ctx.fillStyle = 'rgba(30, 15, 0, 0.2)';
  const knots = [120, 340, 580, 720];
  for (const kx of knots) {
    ctx.beginPath();
    ellipsePath(ctx, kx, 8, 4, 3);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(255, 220, 180, 0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 1);
  ctx.lineTo(800, 1);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 15);
  ctx.lineTo(800, 15);
  ctx.stroke();

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

  const tileGrad = ctx.createLinearGradient(0, 0, 0, 16);
  tileGrad.addColorStop(0, '#c8b8a4');
  tileGrad.addColorStop(0.5, '#b8a894');
  tileGrad.addColorStop(1, '#a89884');
  ctx.fillStyle = tileGrad;
  ctx.fillRect(0, 0, 800, 16);

  for (let tx = 0; tx < 800; tx += 32) {
    const shade = (tx / 32) % 2 === 0 ? 0 : 8;
    ctx.fillStyle = `rgb(${184 + shade}, ${168 + shade}, ${148 + shade})`;
    ctx.fillRect(tx + 1, 1, 30, 14);
  }

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

  ctx.strokeStyle = 'rgba(60, 40, 20, 0.35)';
  ctx.lineWidth = 0.7;
  const crackStarts = [45, 180, 310, 460, 590, 710];
  for (const cs of crackStarts) {
    ctx.beginPath();
    ctx.moveTo(cs, 3);
    ctx.lineTo(cs + 5, 8);
    ctx.lineTo(cs + 2, 13);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cs + 5, 8);
    ctx.lineTo(cs + 12, 6);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(80, 60, 40, 0.08)';
  const stains = [80, 250, 450, 650];
  for (const sx of stains) {
    ctx.beginPath();
    ellipsePath(ctx, sx, 8, 12, 4);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 0.5);
  ctx.lineTo(800, 0.5);
  ctx.stroke();

  for (let tx = 0; tx < 800; tx += 3) {
    for (let ty = 0; ty < 16; ty += 3) {
      const speck = Math.sin(tx * 7.3 + ty * 13.1) * 0.5 + 0.5;
      if (speck > 0.7) {
        ctx.fillStyle = `rgba(${speck > 0.85 ? 160 : 120}, ${speck > 0.85 ? 140 : 100}, ${speck > 0.85 ? 120 : 80}, 0.08)`;
        ctx.fillRect(tx, ty, 1, 1);
      }
    }
  }

  ctx.strokeStyle = 'rgba(80, 60, 40, 0.2)';
  ctx.lineWidth = 0.4;
  const fineCracks = [95, 220, 385, 530, 660, 770];
  for (const fc of fineCracks) {
    ctx.beginPath();
    ctx.moveTo(fc, 1);
    ctx.quadraticCurveTo(fc + 3, 8, fc - 2, 15);
    ctx.stroke();
  }

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

console.log('\nAll assets generated! ASTRAL DAVE signing off... the fractals approve.');
