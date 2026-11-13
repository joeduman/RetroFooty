import {RULES} from './customize.mjs';
export const BUILD = '15.1';
export const VERSION = '15.1';
export const STEP = 1 / 120;
export const MATCH_SECONDS = Object.freeze({1:180,2:240,3:300,4:360,5:480});
export const TUNING = Object.freeze({
  playerRadius: 18, ballRadius: 8, playerMass: 2.2, ballMass: 0.4,
  walkSpeed: 170, sprintSpeed: 330, acceleration: 3800, braking: 4600, turning: 4700,
  staminaDrain: 42, staminaRecovery: 20, recoveryDelay: 0.45,
  ballDrag: 0.72, ballMaxSpeed: 650, ballRestitution: 0.32,
  wallRestitution: 0.68, shotSpeed: 410, shotMomentum: 0.50, shotAimWeight: 0.12, passiveRestitution: 0.20,
  shotCooldown: 0.22, shotReach: 6, shotBuffer: 0.12, spinDecay: 1.15, spinCurve: 0.106,
  kickoffSeconds: RULES.kickoffSeconds, celebrationSeconds: RULES.celebrationSeconds, sprintDrive: 1.4, contactFriction: 0.24,
});
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const unit = (x, y, fallbackX = 1, fallbackY = 0) => {
  const length = Math.hypot(x, y);
  return length > 1e-6 ? { x: x / length, y: y / length } : { x: fallbackX, y: fallbackY };
};
export function createPitch(size = 4) {
  const sizes = { 1: [1080, 660], 2: [1230, 740], 3: [1360, 820], 4: [1490, 910], 5: [1630, 980] };
  const [baseWidth, baseHeight] = sizes[size] || sizes[4];
  // Grow the current Build 15 dimensions: 1v1 +5%, 2v2 +10%, 3v3–5v5 +15%.
  // Preserve the earlier 7% enlargement before applying this additional change.
  const larger = Number(size) >= 3 && Number(size) <= 5;
  const growth=Number(size)===1?1.05:Number(size)===2?1.10:1.15;
  const width = Math.round(Math.round(baseWidth * (larger ? 1.07 : 1))*growth);
  const height = Math.round(Math.round(baseHeight * (larger ? 1.07 : 1))*growth);
  const margin = 88, goalWidth = ({1:168,2:192,3:216,4:238,5:260})[size] || 238;
  return { width, height, left: margin, right: width - margin, top: margin,
    bottom: height - margin, goalTop: (height - goalWidth) / 2,
    goalBottom: (height + goalWidth) / 2, goalDepth: 52, goalWidth, postRadius: 7, runoff: 96 };
}
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => { state += 0x6D2B79F5; let n = state; n = Math.imul(n ^ n >>> 15, n | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61); return ((n ^ n >>> 14) >>> 0) / 4294967296; };
}
