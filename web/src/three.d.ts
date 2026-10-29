/* three ships no types and @types/three isn't installed: the few classes the light sphere (shared/LightSphere.tsx) uses, loosely typed. */
declare module 'three' {
  export const WebGLRenderer: any; export const Scene: any; export const PerspectiveCamera: any; export const Vector3: any; export const Quaternion: any;
  export const BufferGeometry: any; export const Float32BufferAttribute: any; export const LineSegments: any; export const Line: any; export const LineBasicMaterial: any;
  export const LineDashedMaterial: any; export const Mesh: any; export const PlaneGeometry: any; export const ConeGeometry: any; export const ShaderMaterial: any;
  export const Sprite: any; export const SpriteMaterial: any; export const CanvasTexture: any; export const TextureLoader: any; export const Color: any; export const Group: any;
  export const AdditiveBlending: any; export const DoubleSide: any; export const LinearFilter: any; export const SRGBColorSpace: any;
}
/* Direct a Shot (shared/previz/engine.ts): the extra classes its scenes use, loosely typed like the rest. */
declare module 'three' {
  export const BoxGeometry: any; export const CylinderGeometry: any; export const SphereGeometry: any; export const CapsuleGeometry: any; export const TorusGeometry: any; export const CircleGeometry: any;
  export const MeshLambertMaterial: any; export const MeshBasicMaterial: any; export const MeshDepthMaterial: any; export const HemisphereLight: any; export const DirectionalLight: any;
  export const Fog: any; export const ACESFilmicToneMapping: any; export const NoToneMapping: any; export const BasicDepthPacking: any; export const BackSide: any; export const Object3D: any; export const PCFShadowMap: any;
}
/* Play the actor (shared/previz/actor.ts): the animated mannequin, loosely typed like the rest. */
declare module 'three' { export const AnimationMixer: any; export const Euler: any; }
declare module 'three/examples/jsm/loaders/GLTFLoader.js' { export const GLTFLoader: any; }
declare module 'three/examples/jsm/libs/meshopt_decoder.module.js' { export const MeshoptDecoder: any; }
declare module 'three/examples/jsm/utils/SkeletonUtils.js' { export function clone(o: any): any; }
/* Open city (shared/previz/world/assemble.ts): instancing, merging and night lights, loosely typed like the rest. */
declare module 'three' {
  export const InstancedMesh: any; export const Matrix4: any; export const MeshPhongMaterial: any; export const PointLight: any; export const BufferAttribute: any;
  export const FrontSide: any; export const Uint32BufferAttribute: any; export const DynamicDrawUsage: any; export const Sphere: any;
}
declare module 'three/examples/jsm/utils/BufferGeometryUtils.js' { export function mergeGeometries(g: any[], groups?: boolean): any; }
/* Direct a Shot look + Add props (previz/theme.ts, previz/kits.ts, engine picking and piece thumbnails) */
declare module 'three' { export const RingGeometry: any; export const Raycaster: any; export const Vector2: any; export const Plane: any; export const Box3: any; }
// Direct a Shot graphics quality (previz/quality.ts, post.ts, world/cityLook.ts, 2026-10-27)
declare module 'three' { export const PMREMGenerator: any; export const DepthTexture: any; export const UnsignedIntType: any; export const WebGLRenderTarget: any; export const HalfFloatType: any; }
declare module 'three/examples/jsm/objects/Sky.js' { export const Sky: any; }
declare module 'three/examples/jsm/postprocessing/GTAOPass.js' { export const GTAOPass: any; }
declare module 'three/examples/jsm/postprocessing/UnrealBloomPass.js' { export const UnrealBloomPass: any; }
declare module 'three/examples/jsm/postprocessing/OutputPass.js' { export const OutputPass: any; }
