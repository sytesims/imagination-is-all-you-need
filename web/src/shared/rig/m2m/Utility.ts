/*
 * Vendored from Mesh2Motion (https://github.com/Mesh2Motion/mesh2motion-app, commit eef2de9, src/lib/Utilities.ts), MIT licence:
 * Copyright (c) 2025 Scott Petrovic. Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial
 * portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND (full text: licenses/mesh2motion-LICENSE-MIT.md).
 * Changed for this app: only the five helpers the weight solvers use.
 */
import { Vector3, Bone, type Object3D } from 'three'

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class Utility {
  static world_position_from_object (object: Object3D): Vector3 {
    const position: Vector3 = new Vector3()
    return object.getWorldPosition(position)
  }

  static direction_between_points (point_1: Vector3, point_2: Vector3): Vector3 {
    const direction: Vector3 = new Vector3()
    direction.subVectors(point_2, point_1).normalize()
    return direction
  }

  /**
   * A "leaf" bone is an orientation-only tip at the end of a chain (finger/toe
   * tips, head top, tail/ear/wing tips). These are not meant to be animated, so
   * the skinning algorithm ignores them. Identified as childless AND name-marked.
   * Human rigs mark them with `_leaf`; the animal rigs mark them with `tip`.
   */
  static is_leaf_bone (bone: Bone): boolean {
    if (bone.children.length > 0) return false
    const name = bone.name.toLowerCase()
    return name.includes('leaf') || name.includes('tip')
  }

  /**
   * The point halfway between a bone's start joint and its first child's joint.
   * Childless bones fall back to their own world position.
   */
  static bone_midpoint_to_child (bone: Bone): Vector3 {
    const bone_position = Utility.world_position_from_object(bone)
    if (bone.children.length === 0) {
      return bone_position.clone()
    }
    const child = bone.children[0] as Bone
    const child_position = Utility.world_position_from_object(child)
    return new Vector3().lerpVectors(bone_position, child_position, 0.5)
  }

  static bone_list_from_hierarchy (bone_hierarchy: Object3D): Bone[] {
    const bones: Bone[] = []
    bone_hierarchy.traverse((bone: Object3D) => {
      if (bone instanceof Bone) {
        bones.push(bone)
      }
    })
    return bones
  }
}
