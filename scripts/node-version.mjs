// The Node.js versions Imagination runs on: the long-term support lines 22 (from 22.12), 24 and 26 (package.json engines
// ">=22.12 <27"). 20, 23 and 25 are past their end of life; 27+ is untested. server/src/doctor/doctor.ts has the same rule.
// Plain JavaScript with no imports, so it works on any old Node.js that gets this far.

export const NODE_STEPS = 'Mac: brew install node@24 · Windows: winget install OpenJS.NodeJS.LTS · or with nvm: nvm install 24 && nvm use 24';

/** Why this Node.js version can't run the app, in one sentence; null when it can. */
export function nodeProblem(version) {
  const v = String(version).replace(/^v/, ''); const [major, minor] = v.split('.').map((x) => Number(x) || 0);
  const use = 'Install Node.js 22, 24 or 26 (24 recommended).';
  if (major > 26) return `Node.js ${v} is newer than Imagination supports yet. Use Node.js 22, 24 or 26 (24 recommended).`;
  if (major === 23 || major === 25) return `Node.js ${v} reached its end of life and no longer gets security fixes. ${use}`;
  if (major === 22 && minor < 12) return `Node.js ${v} is too old: Imagination needs 22.12 or newer. ${use}`;
  if (major < 22) return `Node.js ${v} is too old. It reached its end of life and no longer gets security fixes. ${use}`;
  return null;
}
