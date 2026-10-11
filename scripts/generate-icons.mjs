import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <!-- Outer Bubble Gradient -->
    <linearGradient id="bubbleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00A8FF" />
      <stop offset="50%" stop-color="#0066FF" />
      <stop offset="100%" stop-color="#0040E0" />
    </linearGradient>

    <!-- Graduation Cap Top Gradient -->
    <linearGradient id="capTopGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1A3B66" />
      <stop offset="100%" stop-color="#0B1A33" />
    </linearGradient>

    <!-- Cap Band Gradient -->
    <linearGradient id="capBandGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#0088FF" />
      <stop offset="100%" stop-color="#0055CC" />
    </linearGradient>

    <!-- Tassel Gold Gradient -->
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFD000" />
      <stop offset="100%" stop-color="#FF9900" />
    </linearGradient>

    <!-- Mouth Tongue Gradient -->
    <linearGradient id="tongueGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FF6B81" />
      <stop offset="100%" stop-color="#E03B52" />
    </linearGradient>

    <!-- Soft Drop Shadow for Cap -->
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="8" stdDeviation="6" flood-color="#001845" flood-opacity="0.25" />
    </filter>
  </defs>

  <!-- Speech Bubble Group -->
  <g>
    <!-- Main Outer Blue Bubble with Pointer Tail -->
    <path d="
      M 256 128
      C 355 128, 436 200, 436 288
      C 436 376, 355 448, 256 448
      C 225 448, 196 442, 170 431
      L 100 460
      L 124 398
      C 94 369, 76 331, 76 288
      C 76 200, 157 128, 256 128 Z
    " fill="url(#bubbleGrad)" />

    <!-- Inner White Speech Bubble Container -->
    <path d="
      M 256 156
      C 336 156, 402 215, 402 288
      C 402 361, 336 420, 256 420
      C 230 420, 206 415, 185 406
      L 132 428
      L 149 382
      C 125 358, 110 325, 110 288
      C 110 215, 176 156, 256 156 Z
    " fill="#FFFFFF" />

    <!-- Face -->
    <!-- Left Eye (Happy Arc) -->
    <path d="M 194 275 Q 212 250 230 275" fill="none" stroke="#0B1A33" stroke-width="14" stroke-linecap="round" />

    <!-- Right Eye (Happy Arc) -->
    <path d="M 282 275 Q 300 250 318 275" fill="none" stroke="#0B1A33" stroke-width="14" stroke-linecap="round" />

    <!-- Smile Mouth with Tongue -->
    <g>
      <!-- Mouth Shape -->
      <path d="M 210 310 Q 256 375 302 310 Z" fill="#0B1A33" />
      
      <!-- Tongue Clip Path -->
      <path d="M 226 332 C 238 322, 274 322, 286 332 C 298 358, 274 372, 256 372 C 238 372, 214 358, 226 332 Z" fill="url(#tongueGrad)" />
    </g>
  </g>

  <!-- Graduation Cap (Mortarboard) -->
  <g filter="url(#shadow)">
    <!-- Cap Skull Band (Bottom Base) -->
    <path d="M 160 142 Q 256 172 352 142 L 352 165 Q 256 195 160 165 Z" fill="url(#capBandGrad)" />

    <!-- Cap Diamond Top (Rhombus) -->
    <polygon points="256,60 395,115 256,155 117,115" fill="url(#capTopGrad)" />
    <polygon points="256,60 395,115 256,122 117,115" fill="#254F85" opacity="0.3" />

    <!-- Tassel Center Button -->
    <ellipse cx="256" cy="107" rx="10" ry="6" fill="url(#goldGrad)" />

    <!-- Tassel String -->
    <path d="M 256 107 Q 320 110 362 135" fill="none" stroke="url(#goldGrad)" stroke-width="5" stroke-linecap="round" />

    <!-- Tassel Ring/Band & Fringe -->
    <circle cx="362" cy="138" r="5" fill="url(#goldGrad)" />
    <path d="M 357 142 L 354 220 L 370 220 L 367 142 Z" fill="url(#goldGrad)" />
  </g>
</svg>`;

async function buildIcons() {
  const publicDir = path.join(process.cwd(), 'public');
  const appDir = path.join(process.cwd(), 'app');

  // Save SVG files
  fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgContent);
  fs.writeFileSync(path.join(appDir, 'icon.svg'), svgContent);
  console.log('Saved SVG files.');

  // Convert to PNGs
  const svgBuffer = Buffer.from(svgContent);

  await sharp(svgBuffer).resize(192, 192).png().toFile(path.join(publicDir, 'icon-192.png'));
  console.log('Generated icon-192.png');

  await sharp(svgBuffer).resize(512, 512).png().toFile(path.join(publicDir, 'icon-512.png'));
  console.log('Generated icon-512.png');

  await sharp(svgBuffer).resize(180, 180).png().toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('Generated apple-touch-icon.png');

  // Generate favicon.ico / 32x32 PNG if needed
  await sharp(svgBuffer).resize(32, 32).png().toFile(path.join(publicDir, 'favicon.ico'));
  console.log('Generated favicon.ico');

  // OG Image (1200x630 with branding)
  const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
    <rect width="1200" height="630" fill="#0F172A" />
    <!-- Background Glow -->
    <circle cx="350" cy="315" r="300" fill="#0066FF" opacity="0.15" />
    <circle cx="850" cy="315" r="250" fill="#00A8FF" opacity="0.1" />

    <!-- Embedded Logo -->
    <g transform="translate(120, 115) scale(0.78)">
      ${svgContent.replace(/<svg[^>]*>/, '').replace('</svg>', '')}
    </g>

    <!-- Text Branding -->
    <text x="560" y="290" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="88" fill="#FFFFFF" letter-spacing="-2">
      jubeidanci
    </text>
    <text x="560" y="360" font-family="system-ui, -apple-system, sans-serif" font-weight="600" font-size="32" fill="#94A3B8">
      AI-Powered Interactive Language Learning
    </text>
  </svg>`;

  await sharp(Buffer.from(ogSvg)).resize(1200, 630).png().toFile(path.join(publicDir, 'og-image.png'));
  console.log('Generated og-image.png');
}

buildIcons().catch(console.error);
