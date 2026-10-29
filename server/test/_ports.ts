// Test ports. Each test file names its ports by a fixed "home" number (e.g. testPort(8957)), so a test run on its own uses
// exactly the port it always did. The parallel runner (scripts/test-all.mjs) gives every worker its own TEST_PORT_OFFSET
// (2000, 3000, 4000, ...: ports from 10700 up), so two tests running at the same time never share a port, and nothing lands on the app's own
// ports (8787 / 8788) or ComfyUI (8188). Home ports live in 8700-9699; one worker's block is 1000 wide.
const OFFSET = Number(process.env.TEST_PORT_OFFSET) || 0;
export const testPort = (home: number): number => home + OFFSET;
