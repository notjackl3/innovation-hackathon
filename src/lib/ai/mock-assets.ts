function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

function hslFromSeed(seed: string, sOffset = 0): string {
  const h = hash(seed + ":h") % 360;
  const s = 60 + ((hash(seed + ":s") + sOffset) % 30);
  const l = 50 + ((hash(seed + ":l") + sOffset) % 25);
  return `hsl(${h}, ${s}%, ${l}%)`;
}

/**
 * Returns a small, deterministic SVG image as a Buffer. Used in MOCK_AI mode
 * so the whole pipeline (storage, serving, display) can be exercised without
 * a network call.
 */
export function mockSketchPng(seed: string): Buffer {
  const c1 = hslFromSeed(seed, 0);
  const c2 = hslFromSeed(seed, 90);
  const c3 = hslFromSeed(seed, 180);
  const label = seed.slice(0, 40).replace(/[<>&"']/g, " ");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${c1}"/>
        <stop offset="50%" stop-color="${c2}"/>
        <stop offset="100%" stop-color="${c3}"/>
      </linearGradient>
      <radialGradient id="r" cx="50%" cy="40%" r="60%">
        <stop offset="0%" stop-color="white" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="white" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1024" height="1024" fill="url(#g)"/>
    <rect width="1024" height="1024" fill="url(#r)"/>
    <g fill="none" stroke="white" stroke-opacity="0.55" stroke-width="3">
      <circle cx="512" cy="512" r="220"/>
      <rect x="312" y="312" width="400" height="400" rx="32"/>
      <path d="M312 712 L512 312 L712 712 Z"/>
    </g>
    <text x="50%" y="92%" text-anchor="middle" font-family="ui-sans-serif, system-ui" font-size="32" fill="white" fill-opacity="0.9">${label}</text>
  </svg>`;
  return Buffer.from(svg, "utf8");
}

export function mockFramePng(seed: string): Buffer {
  return mockSketchPng("frame:" + seed);
}
