// Test ports. Each test file names its ports by a fixed "home" number (e.g. testPort(8957)), so a test run on its own uses
// exactly the port it always did. The parallel runner (scripts/test-all.mjs) gives every worker its own TEST_PORT_OFFSET
// (2000, 3000, 4000, ...: ports from 10700 up), so two tests running at the same time never share a port, and nothing lands on the app's own
// ports (8787 / 8788) or ComfyUI (8188). Home ports live in 8700-9699; one worker's block is 1000 wide.
const OFFSET = Number(process.env.TEST_PORT_OFFSET) || 0;
// Out-of-range homes fail fast: 9701 + a worker's offset is the next worker's block, and that worker's port sweep (test-all.mjs sweepSlot)
// killed this test's server mid-run (canvas-chain-run, listing-real-job on CI). 5xxx homes landed in a block four workers away.
export const testPort = (home: number): number => {
  if (!Number.isInteger(home) || home < 8700 || home > 9699) throw new Error(`testPort(${home}): home ports must be 8700-9699 (see server/test/_ports.ts)`);
  return home + OFFSET;
};
