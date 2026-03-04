import { createCanvas } from 'canvas';
import fs from 'fs';

function saveCanvas(canvas, path) {
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path, buffer);
  console.log(`Created: ${path}`);
}

// Cockroach run spritesheet (6 frames, 64x64 each = 384x64)
{
  const canvas = createCanvas(384, 64);
  const ctx = canvas.getContext('2d');
  for (let i = 0; i < 6; i++) {
    const x = i * 64;
    // Body
    ctx.fillStyle = '#5c3317';
    ctx.fillRect(x + 12, 20, 40, 28);
    // Head
    ctx.fillStyle = '#4a2810';
    ctx.fillRect(x + 46, 22, 14, 16);
    // Eyes
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(x + 52, 24, 4, 4);
    // Antennae
    ctx.strokeStyle = '#3a1a08';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 56, 22);
    ctx.lineTo(x + 60 + (i % 2) * 2, 10 + (i % 3) * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 58, 24);
    ctx.lineTo(x + 62 + (i % 2) * 2, 14 + (i % 3) * 2);
    ctx.stroke();
    // Legs (animated positions)
    ctx.strokeStyle = '#3a1a08';
    ctx.lineWidth = 2;
    const legOffset = (i % 3) * 3;
    for (let l = 0; l < 3; l++) {
      const ly = 36 + l * 6;
      ctx.beginPath();
      ctx.moveTo(x + 16 + l * 10, ly);
      ctx.lineTo(x + 10 + l * 10 - legOffset, 58 + (l % 2) * 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 16 + l * 10, ly);
      ctx.lineTo(x + 22 + l * 10 + legOffset, 58 + ((l + 1) % 2) * 4);
      ctx.stroke();
    }
  }
  saveCanvas(canvas, 'public/sprites/cockroach-run.png');
}

// Cockroach jump (single 64x64)
{
  const canvas = createCanvas(64, 64);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#5c3317';
  ctx.fillRect(12, 24, 40, 24);
  ctx.fillStyle = '#4a2810';
  ctx.fillRect(46, 26, 14, 14);
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(52, 28, 4, 4);
  // Tucked legs
  ctx.strokeStyle = '#3a1a08';
  ctx.lineWidth = 2;
  for (let l = 0; l < 3; l++) {
    ctx.beginPath();
    ctx.moveTo(16 + l * 10, 40);
    ctx.lineTo(20 + l * 10, 48);
    ctx.stroke();
  }
  saveCanvas(canvas, 'public/sprites/cockroach-jump.png');
}

// Cockroach dead (single 64x64 - on its back)
{
  const canvas = createCanvas(64, 64);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#5c3317';
  ctx.fillRect(12, 20, 40, 28);
  ctx.fillStyle = '#4a2810';
  ctx.fillRect(46, 22, 14, 16);
  // X eyes
  ctx.strokeStyle = '#ff0000';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(52, 24); ctx.lineTo(56, 28); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(56, 24); ctx.lineTo(52, 28); ctx.stroke();
  // Legs up
  ctx.strokeStyle = '#3a1a08';
  for (let l = 0; l < 3; l++) {
    ctx.beginPath();
    ctx.moveTo(16 + l * 10, 20);
    ctx.lineTo(12 + l * 10, 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(16 + l * 10, 20);
    ctx.lineTo(22 + l * 10, 6);
    ctx.stroke();
  }
  saveCanvas(canvas, 'public/sprites/cockroach-dead.png');
}

// Apple (32x32)
{
  const canvas = createCanvas(32, 32);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ff2222';
  ctx.beginPath();
  ctx.arc(16, 18, 12, 0, Math.PI * 2);
  ctx.fill();
  // Leaf
  ctx.fillStyle = '#22cc22';
  ctx.fillRect(14, 2, 4, 8);
  // Shine
  ctx.fillStyle = '#ff8888';
  ctx.fillRect(10, 12, 4, 4);
  saveCanvas(canvas, 'public/sprites/apple.png');
}

// Pest spray (64x96)
{
  const canvas = createCanvas(64, 96);
  const ctx = canvas.getContext('2d');
  // Can
  ctx.fillStyle = '#228822';
  ctx.fillRect(20, 10, 24, 50);
  ctx.fillStyle = '#116611';
  ctx.fillRect(26, 4, 12, 10);
  // Mist
  ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
  ctx.beginPath();
  ctx.arc(32, 80, 24, 0, Math.PI * 2);
  ctx.fill();
  saveCanvas(canvas, 'public/sprites/pest-spray.png');
}

// Newspaper (96x64)
{
  const canvas = createCanvas(96, 64);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#cccccc';
  ctx.fillRect(10, 15, 76, 34);
  ctx.fillStyle = '#999999';
  ctx.fillRect(14, 19, 68, 2);
  ctx.fillRect(14, 25, 68, 2);
  ctx.fillRect(14, 31, 68, 2);
  ctx.fillRect(14, 37, 40, 2);
  saveCanvas(canvas, 'public/sprites/newspaper.png');
}

// Onion (48x48)
{
  const canvas = createCanvas(48, 48);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#9933cc';
  ctx.beginPath();
  ctx.arc(24, 28, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#22aa22';
  ctx.fillRect(20, 2, 8, 14);
  // Stink lines
  ctx.strokeStyle = 'rgba(153, 51, 204, 0.5)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(10 + i * 14, 10);
    ctx.quadraticCurveTo(14 + i * 14, 4, 18 + i * 14, 10);
    ctx.stroke();
  }
  saveCanvas(canvas, 'public/sprites/onion.png');
}

// Flipper (80x32)
{
  const canvas = createCanvas(80, 32);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#cc8844';
  ctx.fillRect(5, 8, 70, 16);
  ctx.fillStyle = '#aa6622';
  ctx.fillRect(5, 8, 15, 16);
  saveCanvas(canvas, 'public/sprites/flipper.png');
}

// Bird (48x48)
{
  const canvas = createCanvas(48, 48);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#222222';
  // Body
  ctx.beginPath();
  ctx.ellipse(24, 28, 14, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  // Wing
  ctx.fillStyle = '#333333';
  ctx.beginPath();
  ctx.moveTo(10, 24);
  ctx.lineTo(24, 12);
  ctx.lineTo(38, 24);
  ctx.fill();
  // Beak
  ctx.fillStyle = '#ff8800';
  ctx.fillRect(36, 26, 8, 4);
  // Eye
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(32, 24, 3, 3);
  saveCanvas(canvas, 'public/sprites/bird.png');
}

// Cat paw (64x64)
{
  const canvas = createCanvas(64, 64);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ff8833';
  ctx.fillRect(15, 10, 34, 44);
  // Pads
  ctx.fillStyle = '#ffaa66';
  ctx.beginPath(); ctx.arc(24, 52, 6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(40, 52, 6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(32, 56, 8, 0, Math.PI * 2); ctx.fill();
  // Claws
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(20, 8); ctx.lineTo(22, 14); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(32, 6); ctx.lineTo(32, 12); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(44, 8); ctx.lineTo(42, 14); ctx.stroke();
  saveCanvas(canvas, 'public/sprites/cat-paw.png');
}

// Sky background (800x400)
{
  const canvas = createCanvas(800, 400);
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 400);
  grad.addColorStop(0, '#0a0015');
  grad.addColorStop(0.3, '#1a0a2e');
  grad.addColorStop(0.6, '#2d1b4e');
  grad.addColorStop(1, '#4a1a3d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 800, 400);
  // Moon
  ctx.fillStyle = '#ffeecc';
  ctx.beginPath();
  ctx.arc(650, 80, 50, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffe8b0';
  ctx.beginPath();
  ctx.arc(645, 75, 48, 0, Math.PI * 2);
  ctx.fill();
  // Stars
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * 800;
    const y = Math.random() * 200;
    const size = Math.random() * 2 + 1;
    ctx.fillRect(x, y, size, size);
  }
  saveCanvas(canvas, 'public/backgrounds/sky.png');
}

// Midground (800x400 with silhouettes)
{
  const canvas = createCanvas(800, 400);
  const ctx = canvas.getContext('2d');
  // Transparent background
  ctx.clearRect(0, 0, 800, 400);
  // Silhouetted buildings/dead trees
  ctx.fillStyle = '#0a0510';
  // House 1
  ctx.fillRect(50, 250, 120, 150);
  ctx.beginPath();
  ctx.moveTo(40, 250);
  ctx.lineTo(110, 190);
  ctx.lineTo(180, 250);
  ctx.fill();
  // Dead tree
  ctx.fillRect(250, 200, 10, 200);
  ctx.strokeStyle = '#0a0510';
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(255, 240); ctx.lineTo(230, 210); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(255, 260); ctx.lineTo(280, 230); ctx.stroke();
  // House 2
  ctx.fillStyle = '#0a0510';
  ctx.fillRect(400, 270, 100, 130);
  ctx.beginPath();
  ctx.moveTo(390, 270);
  ctx.lineTo(450, 220);
  ctx.lineTo(510, 270);
  ctx.fill();
  // Windmill
  ctx.fillRect(600, 230, 15, 170);
  ctx.beginPath();
  ctx.moveTo(607, 230);
  ctx.lineTo(570, 200);
  ctx.lineTo(607, 230);
  ctx.lineTo(645, 200);
  ctx.lineTo(607, 230);
  ctx.lineTo(607, 190);
  ctx.fill();
  // Another dead tree
  ctx.fillRect(720, 220, 8, 180);
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(724, 250); ctx.lineTo(750, 220); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(724, 270); ctx.lineTo(700, 240); ctx.stroke();
  saveCanvas(canvas, 'public/backgrounds/midground.png');
}

// Floor tiles - top (800x16)
{
  const canvas = createCanvas(800, 16);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#3d2b1f';
  ctx.fillRect(0, 0, 800, 16);
  // Tile lines
  ctx.strokeStyle = '#2a1a10';
  ctx.lineWidth = 1;
  for (let x = 0; x < 800; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 16);
    ctx.stroke();
  }
  ctx.strokeStyle = '#4a3828';
  ctx.beginPath();
  ctx.moveTo(0, 2);
  ctx.lineTo(800, 2);
  ctx.stroke();
  saveCanvas(canvas, 'public/backgrounds/floor-top.png');
}

// Floor tiles - bottom (800x16)
{
  const canvas = createCanvas(800, 16);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2a1a10';
  ctx.fillRect(0, 0, 800, 16);
  ctx.strokeStyle = '#1a0a05';
  ctx.lineWidth = 1;
  for (let x = 0; x < 800; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 16);
    ctx.stroke();
  }
  ctx.strokeStyle = '#3a2818';
  ctx.beginPath();
  ctx.moveTo(0, 2);
  ctx.lineTo(800, 2);
  ctx.stroke();
  saveCanvas(canvas, 'public/backgrounds/floor-bottom.png');
}

console.log('All assets generated!');
