// Stable mirrored curriculum: every ten matches include each of 1v1–5v5
// twice, once per team color. No match engine or physics modifications.
export const TRAINING_SIZES = Object.freeze([1,2,3,4,5]);
export function trainingAssignment(index, seed=0) {
  if (!Number.isInteger(index) || index < 0) throw new RangeError('Match index must be nonnegative integer');
  // Each pair shares a seed and map size, to reduce side-advantage noise.
  const pair = Math.floor(index/2);
  return {size:TRAINING_SIZES[pair%TRAINING_SIZES.length], side:index%2===0?'red':'blue', pair};
}
