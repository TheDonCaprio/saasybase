export const THEME_HEX_6_OR_8_RE = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
export const THEME_HEX_EDITING_RE = /^#[0-9a-fA-F]{0,8}$/;

export const hasHexAlpha = (hex: string): boolean => {
  const v = (hex || '').trim();
  return THEME_HEX_6_OR_8_RE.test(v) && v.length === 9;
};

export const stripHexAlpha = (hex: string, fallback = '#000000'): string => {
  const v = (hex || '').trim();
  if (!THEME_HEX_6_OR_8_RE.test(v)) return fallback;
  return `#${v.slice(1, 7)}`;
};

export const getHexAlpha01 = (hex: string): number => {
  const v = (hex || '').trim();
  if (!THEME_HEX_6_OR_8_RE.test(v)) return 1;
  if (v.length !== 9) return 1;
  const a = Number.parseInt(v.slice(7, 9), 16) / 255;
  return Number.isFinite(a) ? Math.max(0, Math.min(1, a)) : 1;
};

export const setHexAlpha01 = (hex: string, alpha01: number): string => {
  const a = Math.max(0, Math.min(1, alpha01));
  const rgb6 = stripHexAlpha(hex, '#000000');
  if (a >= 0.999) {
    return hasHexAlpha(hex) ? `${rgb6}ff` : rgb6;
  }
  const aHex = Math.round(a * 255)
    .toString(16)
    .padStart(2, '0');
  return `${rgb6}${aHex}`;
};

export const replaceHexRgbPreserveAlpha = (existingHex: string, nextRgbHex: string): string => {
  if (!hasHexAlpha(existingHex)) return stripHexAlpha(nextRgbHex, '#000000');
  const aHex = existingHex.trim().slice(7, 9);
  return `${stripHexAlpha(nextRgbHex, stripHexAlpha(existingHex))}${aHex}`;
};

export type HSV = { h: number; s: number; v: number };

export function hexToRgb(hex: string): [number, number, number] {
  const h = stripHexAlpha(hex, '#000000').replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const f = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  return `#${f(r)}${f(g)}${f(b)}`;
}

export function rgbToHsv(r: number, g: number, b: number): HSV {
  const rr = r / 255,
    gg = g / 255,
    bb = b / 255;
  const max = Math.max(rr, gg, bb),
    min = Math.min(rr, gg, bb);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rr) h = ((gg - bb) / d + 6) % 6;
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h *= 60;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s,
    hp = h / 60,
    x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0,
    g1 = 0,
    b1 = 0;
  if (hp < 1) {
    r1 = c;
    g1 = x;
  } else if (hp < 2) {
    r1 = x;
    g1 = c;
  } else if (hp < 3) {
    g1 = c;
    b1 = x;
  } else if (hp < 4) {
    g1 = x;
    b1 = c;
  } else if (hp < 5) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }
  const m = v - c;
  return [(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255];
}
