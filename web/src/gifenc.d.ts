declare module 'gifenc' {
  export function GIFEncoder(): { writeFrame(idx: Uint8Array, w: number, h: number, o?: { palette?: number[][]; delay?: number }): void; finish(): void; bytes(): Uint8Array };
  export function quantize(rgba: Uint8ClampedArray, max: number): number[][];
  export function applyPalette(rgba: Uint8ClampedArray, pal: number[][]): Uint8Array;
}
