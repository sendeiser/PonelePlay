import fs from "fs";
import path from "path";
import sharp from "sharp";

const iconsDir = path.join(process.cwd(), "public", "icons");
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// 512x512 SVG Master
const svgStandard = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="bgGlow" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#1f2945" />
      <stop offset="100%" stop-color="#070a12" />
    </radialGradient>
    <linearGradient id="sqGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6366f1" />
      <stop offset="50%" stop-color="#8b5cf6" />
      <stop offset="100%" stop-color="#ec4899" />
    </linearGradient>
    <linearGradient id="barGrad" x1="0%" y1="100%" x2="0%" y2="0%">
      <stop offset="0%" stop-color="#4f46e5" />
      <stop offset="60%" stop-color="#818cf8" />
      <stop offset="100%" stop-color="#38bdf8" />
    </linearGradient>
    <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="16" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="512" height="512" rx="112" fill="url(#bgGlow)" />
  <rect x="6" y="6" width="500" height="500" rx="106" fill="none" stroke="url(#sqGrad)" stroke-width="4" stroke-opacity="0.4" />

  <!-- Inner Soft Card Glow -->
  <rect x="40" y="40" width="432" height="432" rx="90" fill="#0c1120" stroke="#1f2942" stroke-width="3" />

  <!-- Neon Equalizer & Play Glyphs -->
  <g filter="url(#neonGlow)">
    <!-- Play Triangle Symbol in Center-Left Accent -->
    <path d="M140 180 L220 256 L140 332 Z" fill="#6366f1" opacity="0.3" />

    <!-- Soundwave Bars (5 Bars of Equalizer) -->
    <!-- Bar 1 -->
    <rect x="136" y="226" width="28" height="60" rx="14" fill="url(#barGrad)" />
    <!-- Bar 2 -->
    <rect x="184" y="170" width="28" height="172" rx="14" fill="url(#barGrad)" />
    <!-- Bar 3 (Center) -->
    <rect x="232" y="120" width="28" height="272" rx="14" fill="url(#barGrad)" />
    <!-- Bar 4 -->
    <rect x="280" y="160" width="28" height="192" rx="14" fill="url(#barGrad)" />
    <!-- Bar 5 -->
    <rect x="328" y="200" width="28" height="112" rx="14" fill="url(#barGrad)" />

    <!-- Pulse live dot on top right -->
    <circle cx="380" cy="132" r="14" fill="#22d3ee" />
    <circle cx="380" cy="132" r="24" fill="none" stroke="#22d3ee" stroke-width="3" opacity="0.6" />
  </g>

  <!-- Wordmark Accent "PLAY" underneath -->
  <text x="256" y="430" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="28" letter-spacing="6" fill="#c7d2fe">PONELEPLAY</text>
</svg>`;

// Maskable Icon (Android Adaptive Icon with 80% safe zone)
const svgMaskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="mBgGlow" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#182035" />
      <stop offset="100%" stop-color="#070a12" />
    </radialGradient>
    <linearGradient id="mBarGrad" x1="0%" y1="100%" x2="0%" y2="0%">
      <stop offset="0%" stop-color="#4f46e5" />
      <stop offset="60%" stop-color="#818cf8" />
      <stop offset="100%" stop-color="#38bdf8" />
    </linearGradient>
  </defs>

  <!-- Full bleed background for adaptive clipping -->
  <rect width="512" height="512" fill="url(#mBgGlow)" />

  <!-- Centered Graphic inside 80% safe zone (center 400x400) -->
  <g transform="translate(256, 256) scale(0.78) translate(-256, -256)">
    <!-- Equalizer Bars -->
    <rect x="136" y="226" width="28" height="60" rx="14" fill="url(#mBarGrad)" />
    <rect x="184" y="170" width="28" height="172" rx="14" fill="url(#mBarGrad)" />
    <rect x="232" y="120" width="28" height="272" rx="14" fill="url(#mBarGrad)" />
    <rect x="280" y="160" width="28" height="192" rx="14" fill="url(#mBarGrad)" />
    <rect x="328" y="200" width="28" height="112" rx="14" fill="url(#mBarGrad)" />

    <circle cx="380" cy="132" r="16" fill="#22d3ee" />
    <text x="256" y="435" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="32" letter-spacing="6" fill="#c7d2fe">PONELEPLAY</text>
  </g>
</svg>`;

async function main() {
  const svgPath = path.join(iconsDir, "icon.svg");
  fs.writeFileSync(svgPath, svgStandard, "utf8");

  // Generate 512x512 standard
  await sharp(Buffer.from(svgStandard))
    .resize(512, 512)
    .png()
    .toFile(path.join(iconsDir, "icon-512.png"));

  // Generate 192x192 standard
  await sharp(Buffer.from(svgStandard))
    .resize(192, 192)
    .png()
    .toFile(path.join(iconsDir, "icon-192.png"));

  // Apple touch icon 180x180
  await sharp(Buffer.from(svgStandard))
    .resize(180, 180)
    .png()
    .toFile(path.join(iconsDir, "apple-touch-icon.png"));

  // Generate 512x512 maskable
  await sharp(Buffer.from(svgMaskable))
    .resize(512, 512)
    .png()
    .toFile(path.join(iconsDir, "icon-maskable-512.png"));

  // Generate 192x192 maskable
  await sharp(Buffer.from(svgMaskable))
    .resize(192, 192)
    .png()
    .toFile(path.join(iconsDir, "icon-maskable-192.png"));

  // Also put apple-touch-icon directly in public for default Safari fallback
  await sharp(Buffer.from(svgStandard))
    .resize(180, 180)
    .png()
    .toFile(path.join(process.cwd(), "public", "apple-touch-icon.png"));

  // Favicon 48x48
  await sharp(Buffer.from(svgStandard))
    .resize(48, 48)
    .png()
    .toFile(path.join(process.cwd(), "public", "favicon.png"));

  console.log("✅ Íconos PWA generados con éxito en public/icons y public/");
}

main().catch(console.error);

