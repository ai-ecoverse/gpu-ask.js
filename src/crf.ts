/** Linear-chain CRF Viterbi. Matches gq/model.py Tagger.decode. */

import { NUM_LABELS } from "./labels.ts";

export function viterbi(
  emissions: Float32Array,
  steps: number,
  start: number[],
  transition: number[][],
): number[] {
  if (steps <= 0) return [];
  const best = new Float32Array(NUM_LABELS);
  const pointers: Int32Array[] = [];
  for (let j = 0; j < NUM_LABELS; j++) {
    best[j] = start[j]! + emissions[j]!;
  }
  for (let t = 1; t < steps; t++) {
    const prev = new Int32Array(NUM_LABELS);
    const next = new Float32Array(NUM_LABELS);
    for (let j = 0; j < NUM_LABELS; j++) {
      let bestScore = -Infinity;
      let bestPrev = 0;
      for (let i = 0; i < NUM_LABELS; i++) {
        const s = best[i]! + transition[i]![j]!;
        if (s > bestScore) {
          bestScore = s;
          bestPrev = i;
        }
      }
      next[j] = bestScore + emissions[t * NUM_LABELS + j]!;
      prev[j] = bestPrev;
    }
    best.set(next);
    pointers.push(prev);
  }
  let label = 0;
  for (let j = 1; j < NUM_LABELS; j++) {
    if (best[j]! > best[label]!) label = j;
  }
  const path = [label];
  for (let t = steps - 1; t > 0; t--) {
    label = pointers[t - 1]![label]!;
    path.push(label);
  }
  return path.reverse();
}
