/** Token roles — must match gq/labels.py */

export const LABELS = ["O", "Q_B", "Q_I", "OPT_B", "OPT_I", "REC"] as const;
export type Label = (typeof LABELS)[number];
export const NUM_LABELS = LABELS.length;
export const LABEL_ID: Record<Label, number> = Object.fromEntries(LABELS.map((n, i) => [n, i])) as Record<Label, number>;
