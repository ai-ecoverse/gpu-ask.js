/** Curated agent turns for the browser demo (from public gold labels). */

export type Example = {
  id: string;
  title: string;
  blurb: string;
  text: string;
};

export const EXAMPLES: Example[] = [
  {
    id: "merge",
    title: "Merge or wait",
    blurb: "Classic either/or propose",
    text: "The branch is green and review is in. Want me to merge it now, or wait for CI on main?",
  },
  {
    id: "remove",
    title: "Remove example",
    blurb: "Short either/or",
    text: "Should I also remove it from the examples folder in the repo, or keep it there as a reference for others?",
  },
  {
    id: "search",
    title: "Search repos",
    blurb: "Offer after a miss",
    text: `No matches found for "buildwithpi.com" in this repo. Want me to search other related repos or update a specific file/path?`,
  },
  {
    id: "phase",
    title: "Phase 1",
    blurb: "Plan gate",
    text: "Do you want me to proceed with Phase 1 (creating the test case directory structure), or would you like to discuss any aspects of the plan first?",
  },
  {
    id: "axes",
    title: "Which axis",
    blurb: "Multi-choice with context",
    text: `Status of the 4-axis plan:

| # | Axis | Status |
|---|---|---|
| 1 | Frontend bundle / startup | Done — main bundle 508 KB → 301 KB |
| 2 | Backend cold start (Alembic at import time) | Pending |
| 3 | DB / API hot paths (N+1, missing indexes) | Pending |
| 4 | Build pipeline (no shallow clone / cache) | Pending |

Which one next — #2, #3, or #4?`,
  },
  {
    id: "clarify",
    title: "Clarify chat CLI",
    blurb: "Bullet options",
    text: `I noticed that \`transformers chat\` already exists in the codebase (implemented in \`src/transformers/cli/chat.py\`). It currently allows connecting to a \`base_url\` (defaulting to a local server).

Could you clarify what specific functionality you'd like to add or change? For example:
- Do you want a different way to specify the local server?
- Are there specific API features (like specific headers or different endpoints) you need to support?
- Do you want a different UI or interaction style?`,
  },
  {
    id: "rb-tree",
    title: "Red-black tree",
    blurb: "Technical either/or",
    text: `Red-black trees have O(log n) insert by definition — finding the insertion point requires traversing from root to leaf, which is O(log n) in a balanced tree. O(1) insert is impossible for any balanced BST.

Would you like me to implement a standard red-black tree with O(log n) insert, or are you thinking of a different data structure (e.g., a skip list, or an unsorted structure)?`,
  },
  {
    id: "push",
    title: "Push drifted",
    blurb: "Yes/no propose",
    text: `Here's the package status for the monorepo:

Synced: pi-mcp, pi-ollama, pi-orchestration
Drifted: pi-gateway (10 files), pi-suggest (7 files), pi-wallet (3 files)
No repo: mission-control, pi-task, pi-web

Want me to push the drifted packages to sync them up?`,
  },
  {
    id: "open",
    title: "Open ask",
    blurb: "Information request",
    text: "Hi! I'm ready to help. What would you like to do? I can run commands, inspect or edit files, run tests, or dig into a bug in this workspace — just point me at the task.",
  },
];
