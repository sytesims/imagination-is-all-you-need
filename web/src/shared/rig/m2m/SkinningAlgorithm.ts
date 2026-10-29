/*
 * Vendored from Mesh2Motion (https://github.com/Mesh2Motion/mesh2motion-app, commit eef2de9, src/lib/solvers), MIT licence:
 * Copyright (c) 2025 Scott Petrovic. Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial
 * portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND (full text: licenses/mesh2motion-LICENSE-MIT.md).
 * Changed for this app: the skeleton type and its position bone are passed in; no head corrector (the app's Phase A never turns it on); no
 * console output; imports point at the vendored files; an optional progress callback between the passes.
 */
import {
  type Bone,
  BufferGeometry,
  type Object3D
} from 'three'

import { Utility } from './Utility'
import { ArmWeightCorrector } from './ArmWeightCorrector'
import { WeightCalculator } from './WeightCalculator'
import { ExtremityWeightCorrector } from './ExtremityWeightCorrector'
import { WeightSmoother } from './WeightSmoother'
import { WeightNormalizer } from './WeightNormalizer'

/**
 * SkinningAlgorithm
 * Orchestrates the bone weight calculation pipeline:
 * 1. Calculate initial bone weights (WeightCalculator)
 * 2. Smooth boundary weights (WeightSmoother)
 * 3. Normalize weights to sum to 1.0 (WeightNormalizer)
 */
export default class SkinningAlgorithm {
  private bones_master_data: Bone[] = []
  private geometry: BufferGeometry = new BufferGeometry()
  private skeleton_type: string | null = null
  private readonly position_tracking_bone_name: string

  // Arm plane correction properties. The offset is relative to the shoulder
  // joint's X, which the corrector reads off the bones itself.
  private use_arm_plane_correction: boolean = false
  private arm_plane_offset: number = 0.0

  constructor (bone_hier: Object3D, skeleton_type: string, position_tracking_bone_name: string) {
    this.skeleton_type = skeleton_type
    this.position_tracking_bone_name = position_tracking_bone_name
    this.bones_master_data = Utility.bone_list_from_hierarchy(bone_hier)
  }

  public set_geometry (geom: BufferGeometry): void {
    this.geometry = geom
  }

  public set_arm_plane_correction_enabled (enabled: boolean): void {
    this.use_arm_plane_correction = enabled
  }

  public set_arm_plane_offset (offset: number): void {
    this.arm_plane_offset = offset
  }

  public calculate_indexes_and_weights (on_step?: (step: number, of: number) => void): number[][] {
    const skin_indices: number[] = []
    const skin_weights: number[] = []

    // Step 1: Calculate initial bone-to-vertex weight assignments
    const weight_calculator = new WeightCalculator(this.bones_master_data, this.geometry, this.skeleton_type, this.position_tracking_bone_name)
    weight_calculator.initialize_caches()
    weight_calculator.calculate_median_bone_weights(skin_indices, skin_weights)
    on_step?.(1, 4)

    // Step 1b: Pull parent-side vertices off extremity bones (e.g. knuckle
    // vertices grabbed by a finger). Runs before smoothing so the corrected
    // assignments are what the smoother sees.
    const extremity_corrector = new ExtremityWeightCorrector(this.geometry, this.bones_master_data)
    extremity_corrector.apply_extremity_weight_correction(skin_indices, skin_weights)

    // Step 1c: Hand torso vertices back from the arm bones. Arms that hang down
    // (A-pose or lower) run close to the ribcage, so the closest-bone pass gives
    // them chest vertices.
    if (this.use_arm_plane_correction) {
      const arm_weight_corrector = new ArmWeightCorrector(
        this.geometry,
        this.bones_master_data,
        this.arm_plane_offset
      )
      arm_weight_corrector.apply_arm_weight_correction(skin_indices, skin_weights)
    }
    on_step?.(2, 4)

    // Step 2: Smooth weight boundaries between adjacent bones
    const weight_smoother = new WeightSmoother(this.geometry, this.bones_master_data)
    weight_smoother.smooth_bone_weight_boundaries(skin_indices, skin_weights)
    on_step?.(3, 4)

    // Step 3: Normalize weights so all vertices sum to 1.0
    const weight_normalizer = new WeightNormalizer(this.geometry)
    weight_normalizer.normalize_weights(skin_weights)
    on_step?.(4, 4)

    return [skin_indices, skin_weights]
  }
}
