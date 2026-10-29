/* Rig as a character (shared/rig, 2026-10-27): the classes the fitter, the vendored Mesh2Motion weight passes and the rig stage use, loosely
   typed like the rest of three here (three ships no types). The type names let the vendored files keep their `type Bone` annotations. */
declare module 'three' {
  export const Bone: any; export const Skeleton: any; export const SkinnedMesh: any; export const Uint16BufferAttribute: any; export const Clock: any;
  export const AmbientLight: any; export const InterleavedBufferAttribute: any;
  export type Bone = any; export type Skeleton = any; export type Object3D = any; export type BufferGeometry = any; export type BufferAttribute = any; export type InterleavedBufferAttribute = any;
  export type Vector3 = any; export type Vector2 = any; export type Quaternion = any; export type Matrix4 = any; export type Mesh = any; export type Material = any; export type AnimationClip = any; export type Group = any; export type WebGLRenderer = any; export type LineSegments = any; export type AnimationMixer = any; export type Plane = any;
}
declare module 'three/examples/jsm/utils/BufferGeometryUtils.js' { export function mergeVertices(g: any, tolerance?: number): any; }
declare module 'three/examples/jsm/exporters/GLTFExporter.js' { export const GLTFExporter: any; }
