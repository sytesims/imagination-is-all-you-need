/** Page 11 Camera Moves catalogue: 65 entries (own names and wording). Camera Moves lists 48 of them on their own; the rest are the classic moves or
 *  aliases of them (tools/apps.ts CAMERA_ALIASES), so Camera Moves has 82 presets in all (20 classic + 7 LTX + 7 H3 + 48 catalogue).
 *  prompt = the camera instruction the server puts FIRST in the job prompt ('' for free camera). */
export interface CameraCatalogEntry { id: string; label: string; category: string; order: number; prompt: string; description: string;
  camera: { verb: string; direction: string | null; speed: string | null; framing: string | null } | null; note: string | null; loraRecommended: boolean }
export const CAMERA_CATEGORIES = ['General', 'Basic', 'Zoom', 'Close', 'Lens', 'Framing', 'Orbit', 'Crane', 'Aerial', 'Transition', 'Vehicle', 'Rig', 'LTX camera', 'H3 camera', 'Style', 'Timelapse'] as const;
export const CAMERA_CATALOG: CameraCatalogEntry[] = [
{
"id": "free",
"label": "Free camera",
"category": "General",
"order": 1,
"prompt": "",
"description": "Free camera: no preset move, the prompt decides.",
"camera": null,
"note": null,
"loraRecommended": false
},
{
"id": "locked",
"label": "Locked tripod",
"category": "Basic",
"order": 2,
"prompt": "static locked-off camera, no camera movement, subtle subject motion only",
"description": "Static locked-off camera, no camera movement, subtle subject motion only.",
"camera": {
"verb": "static",
"direction": "–",
"speed": "–",
"framing": "as framed"
},
"note": "LTX static LoRA helps stop drift",
"loraRecommended": true
},
{
"id": "push-slow",
"label": "Slow push",
"category": "Basic",
"order": 3,
"prompt": "camera slowly dollies forward toward the subject",
"description": "Camera slowly dollies forward toward the subject.",
"camera": {
"verb": "dolly",
"direction": "forward",
"speed": "slow",
"framing": "medium → close"
},
"note": "LTX dolly-in LoRA / Wan Fun Camera 'zoom in' better",
"loraRecommended": true
},
{
"id": "pull-slow",
"label": "Slow pull",
"category": "Basic",
"order": 4,
"prompt": "camera slowly dollies backward away from the subject",
"description": "Camera slowly dollies backward away from the subject.",
"camera": {
"verb": "dolly",
"direction": "back",
"speed": "slow",
"framing": "close → wide"
},
"note": "LTX dolly-out LoRA",
"loraRecommended": true
},
{
"id": "track-left",
"label": "Track left",
"category": "Basic",
"order": 5,
"prompt": "camera trucks sideways to the left, parallel to the subject",
"description": "Camera trucks sideways to the left, parallel to the subject.",
"camera": {
"verb": "truck",
"direction": "left",
"speed": "medium",
"framing": "medium"
},
"note": "LTX dolly-left LoRA",
"loraRecommended": true
},
{
"id": "track-right",
"label": "Track right",
"category": "Basic",
"order": 6,
"prompt": "camera trucks sideways to the right, parallel to the subject",
"description": "Camera trucks sideways to the right, parallel to the subject.",
"camera": {
"verb": "truck",
"direction": "right",
"speed": "medium",
"framing": "medium"
},
"note": "LTX dolly-right LoRA",
"loraRecommended": true
},
{
"id": "pan-l",
"label": "Pan left",
"category": "Basic",
"order": 7,
"prompt": "camera pans left from a fixed position",
"description": "Camera pans left from a fixed position.",
"camera": {
"verb": "pan",
"direction": "left",
"speed": "medium",
"framing": "wide"
},
"note": "Fun Camera pan-left",
"loraRecommended": false
},
{
"id": "pan-r",
"label": "Pan right",
"category": "Basic",
"order": 8,
"prompt": "camera pans right from a fixed position",
"description": "Camera pans right from a fixed position.",
"camera": {
"verb": "pan",
"direction": "right",
"speed": "medium",
"framing": "wide"
},
"note": "Fun Camera pan-right",
"loraRecommended": false
},
{
"id": "tilt-u",
"label": "Tilt up",
"category": "Basic",
"order": 9,
"prompt": "camera tilts upward from the subject to the sky",
"description": "Camera tilts upward from the subject to the sky.",
"camera": {
"verb": "tilt",
"direction": "up",
"speed": "slow",
"framing": "medium"
},
"note": "Fun Camera tilt-up",
"loraRecommended": false
},
{
"id": "tilt-d",
"label": "Tilt down",
"category": "Basic",
"order": 10,
"prompt": "camera tilts downward from above to the subject",
"description": "Camera tilts downward from above to the subject.",
"camera": {
"verb": "tilt",
"direction": "down",
"speed": "slow",
"framing": "medium"
},
"note": "Fun Camera tilt-down",
"loraRecommended": false
},
{
"id": "zoom-in",
"label": "Lens zoom in",
"category": "Basic",
"order": 11,
"prompt": "optical zoom in, camera stays in place, background compresses",
"description": "Optical zoom in, camera stays in place, background compresses.",
"camera": {
"verb": "zoom",
"direction": "in",
"speed": "medium",
"framing": "wide → close"
},
"note": "prompt OK; LoRA keeps position fixed",
"loraRecommended": false
},
{
"id": "zoom-out",
"label": "Lens zoom out",
"category": "Basic",
"order": 12,
"prompt": "optical zoom out revealing surroundings, camera stays in place",
"description": "Optical zoom out revealing surroundings, camera stays in place.",
"camera": {
"verb": "zoom",
"direction": "out",
"speed": "medium",
"framing": "close → wide"
},
"note": "prompt OK",
"loraRecommended": false
},
{
"id": "handheld",
"label": "Handheld",
"category": "Basic",
"order": 13,
"prompt": "handheld camera with gentle natural sway and micro-shake",
"description": "Handheld camera with gentle natural sway and micro-shake.",
"camera": {
"verb": "handheld",
"direction": "–",
"speed": "slow",
"framing": "medium"
},
"note": "prompt OK",
"loraRecommended": false
},
{
"id": "jib-up",
"label": "Jib rise",
"category": "Basic",
"order": 14,
"prompt": "camera rises vertically on a jib while staying level",
"description": "Camera rises vertically on a jib while staying level.",
"camera": {
"verb": "pedestal",
"direction": "up",
"speed": "slow",
"framing": "medium"
},
"note": "LTX jib-up LoRA",
"loraRecommended": true
},
{
"id": "jib-down",
"label": "Jib lower",
"category": "Basic",
"order": 15,
"prompt": "camera lowers vertically on a jib while staying level",
"description": "Camera lowers vertically on a jib while staying level.",
"camera": {
"verb": "pedestal",
"direction": "down",
"speed": "slow",
"framing": "medium"
},
"note": "LTX jib-down LoRA",
"loraRecommended": true
},
{
"id": "crash-in",
"label": "Crash zoom",
"category": "Zoom",
"order": 16,
"prompt": "sudden fast zoom into the subject's face",
"description": "Sudden fast zoom into the subject's face.",
"camera": {
"verb": "zoom",
"direction": "in",
"speed": "very fast",
"framing": "wide → extreme close"
},
"note": "LoRA/control better (speed)",
"loraRecommended": true
},
{
"id": "snap-in",
"label": "Rapid push in",
"category": "Zoom",
"order": 17,
"prompt": "fast forward push toward the subject",
"description": "Fast forward push toward the subject.",
"camera": {
"verb": "dolly",
"direction": "forward",
"speed": "fast",
"framing": "medium → close"
},
"note": "LTX dolly-in + higher strength",
"loraRecommended": false
},
{
"id": "snap-out",
"label": "Rapid pull out",
"category": "Zoom",
"order": 18,
"prompt": "fast backward pull away from the subject",
"description": "Fast backward pull away from the subject.",
"camera": {
"verb": "dolly",
"direction": "back",
"speed": "fast",
"framing": "close → wide"
},
"note": "LTX dolly-out",
"loraRecommended": false
},
{
"id": "yoyo",
"label": "Yo-yo zoom",
"category": "Zoom",
"order": 19,
"prompt": "zoom in then back out in one smooth motion",
"description": "Zoom in then back out in one smooth motion.",
"camera": {
"verb": "zoom",
"direction": "in→out",
"speed": "medium",
"framing": "medium"
},
"note": "control/keyframes better; prompt unreliable",
"loraRecommended": false
},
{
"id": "vertigo-in",
"label": "Dolly-zoom in",
"category": "Zoom",
"order": 20,
"prompt": "dolly zoom: camera moves forward while zooming out, background stretches",
"description": "Dolly zoom: camera moves forward while zooming out, background stretches.",
"camera": {
"verb": "dolly+zoom",
"direction": "forward",
"speed": "slow",
"framing": "medium"
},
"note": "LoRA needed; prompts rarely nail it",
"loraRecommended": true
},
{
"id": "vertigo-out",
"label": "Dolly-zoom out",
"category": "Zoom",
"order": 21,
"prompt": "dolly zoom: camera moves back while zooming in, background compresses",
"description": "Dolly zoom: camera moves back while zooming in, background compresses.",
"camera": {
"verb": "dolly+zoom",
"direction": "back",
"speed": "slow",
"framing": "medium"
},
"note": "LoRA needed",
"loraRecommended": true
},
{
"id": "double-push",
"label": "Double push",
"category": "Zoom",
"order": 22,
"prompt": "two quick consecutive pushes forward",
"description": "Two quick consecutive pushes forward.",
"camera": {
"verb": "dolly",
"direction": "forward ×2",
"speed": "fast",
"framing": "medium → close"
},
"note": "keyframes better",
"loraRecommended": false
},
{
"id": "eye-push",
"label": "Eye close-in",
"category": "Close",
"order": 23,
"prompt": "camera slowly pushes into the character's eyes, ending on an extreme close-up of the eyes",
"description": "Camera slowly pushes into the character's eyes, ending on an extreme close-up of the eyes.",
"camera": {
"verb": "dolly",
"direction": "forward",
"speed": "slow",
"framing": "close → extreme close"
},
"note": "prompt OK with a face image",
"loraRecommended": false
},
{
"id": "mouth-push",
"label": "Mouth close-in",
"category": "Close",
"order": 24,
"prompt": "camera pushes into the character's mouth, extreme close-up",
"description": "Camera pushes into the character's mouth, extreme close-up.",
"camera": {
"verb": "dolly",
"direction": "forward",
"speed": "medium",
"framing": "close → extreme close"
},
"note": "prompt OK",
"loraRecommended": false
},
{
"id": "bite-zoom",
"label": "Bite close-in",
"category": "Close",
"order": 25,
"prompt": "quick push toward food as the subject takes a bite",
"description": "Quick push toward food as the subject takes a bite.",
"camera": {
"verb": "dolly",
"direction": "forward",
"speed": "fast",
"framing": "close"
},
"note": "prompt OK",
"loraRecommended": false
},
{
"id": "focus-rack",
"label": "Focus pull",
"category": "Lens",
"order": 26,
"prompt": "rack focus from foreground object to the subject behind",
"description": "Rack focus from foreground object to the subject behind.",
"camera": {
"verb": "focus",
"direction": "fg→bg",
"speed": "medium",
"framing": "medium"
},
"note": "prompt OK",
"loraRecommended": false
},
{
"id": "fisheye",
"label": "Fisheye",
"category": "Lens",
"order": 27,
"prompt": "ultra-wide fisheye lens, strong barrel distortion, slight forward drift",
"description": "Ultra-wide fisheye lens, strong barrel distortion, slight forward drift.",
"camera": {
"verb": "dolly",
"direction": "forward",
"speed": "slow",
"framing": "wide"
},
"note": "style LoRA better",
"loraRecommended": true
},
{
"id": "slow-shutter",
"label": "Long-exposure blur",
"category": "Lens",
"order": 28,
"prompt": "slow shutter look with motion blur trails while the camera drifts",
"description": "Slow shutter look with motion blur trails while the camera drifts.",
"camera": {
"verb": "drift",
"direction": "–",
"speed": "slow",
"framing": "medium"
},
"note": "prompt OK",
"loraRecommended": false
},
{
"id": "dutch",
"label": "Dutch tilt",
"category": "Framing",
"order": 29,
"prompt": "camera rolls into a tilted Dutch angle",
"description": "Camera rolls into a tilted Dutch angle.",
"camera": {
"verb": "roll",
"direction": "clockwise",
"speed": "slow",
"framing": "medium"
},
"note": "prompt OK",
"loraRecommended": false
},
{
"id": "overhead",
"label": "Top-down",
"category": "Framing",
"order": 30,
"prompt": "overhead top-down view looking straight down, slow drift",
"description": "Overhead top-down view looking straight down, slow drift.",
"camera": {
"verb": "crane",
"direction": "top-down",
"speed": "slow",
"framing": "wide"
},
"note": "prompt OK",
"loraRecommended": false
},
{
"id": "pov",
"label": "Object POV",
"category": "Framing",
"order": 31,
"prompt": "point of view from an object or the subject's eyes, moving forward",
"description": "Point of view from an object or the subject's eyes, moving forward.",
"camera": {
"verb": "pov",
"direction": "forward",
"speed": "medium",
"framing": "first-person"
},
"note": "prompt OK",
"loraRecommended": false
},
{
"id": "low-hero",
"label": "Low hero angle",
"category": "Framing",
"order": 32,
"prompt": "low angle looking up at the subject, slow push",
"description": "Low angle looking up at the subject, slow push.",
"camera": {
"verb": "dolly",
"direction": "forward",
"speed": "slow",
"framing": "low angle"
},
"note": "prompt OK",
"loraRecommended": false
},
{
"id": "high-down",
"label": "High angle",
"category": "Framing",
"order": 33,
"prompt": "high angle looking down on the subject, slow descent",
"description": "High angle looking down on the subject, slow descent.",
"camera": {
"verb": "pedestal",
"direction": "down",
"speed": "slow",
"framing": "high angle"
},
"note": "prompt OK",
"loraRecommended": false
},
{
"id": "ots",
"label": "Over the shoulder",
"category": "Framing",
"order": 34,
"prompt": "over-the-shoulder framing, slight drift sideways",
"description": "Over-the-shoulder framing, slight drift sideways.",
"camera": {
"verb": "truck",
"direction": "side",
"speed": "slow",
"framing": "OTS"
},
"note": "prompt OK",
"loraRecommended": false
},
{
"id": "orbit-l",
"label": "Arc left",
"category": "Orbit",
"order": 35,
"prompt": "camera arcs to the left around the subject, keeping it centred",
"description": "Camera arcs to the left around the subject, keeping it centred.",
"camera": {
"verb": "arc",
"direction": "left",
"speed": "medium",
"framing": "medium"
},
"note": "Fun Camera / orbit LoRA better",
"loraRecommended": true
},
{
"id": "orbit-r",
"label": "Arc right",
"category": "Orbit",
"order": 36,
"prompt": "camera arcs to the right around the subject, keeping it centred",
"description": "Camera arcs to the right around the subject, keeping it centred.",
"camera": {
"verb": "arc",
"direction": "right",
"speed": "medium",
"framing": "medium"
},
"note": "orbit LoRA better",
"loraRecommended": true
},
{
"id": "orbit-360",
"label": "Full orbit",
"category": "Orbit",
"order": 37,
"prompt": "camera circles 360 degrees around the subject",
"description": "Camera circles 360 degrees around the subject.",
"camera": {
"verb": "arc",
"direction": "full circle",
"speed": "medium",
"framing": "medium"
},
"note": "LoRA strongly recommended",
"loraRecommended": true
},
{
"id": "spin-3d",
"label": "Object spin",
"category": "Orbit",
"order": 38,
"prompt": "subject rotates on its axis as if on a turntable, camera fixed",
"description": "Subject rotates on its axis as if on a turntable, camera fixed.",
"camera": {
"verb": "rotate (subject)",
"direction": "–",
"speed": "medium",
"framing": "medium"
},
"note": "prompt OK",
"loraRecommended": false
},
{
"id": "time-freeze",
"label": "Frozen-time orbit",
"category": "Orbit",
"order": 39,
"prompt": "time freezes while the camera orbits around the frozen subject",
"description": "Time freezes while the camera orbits around the frozen subject.",
"camera": {
"verb": "arc",
"direction": "around",
"speed": "medium",
"framing": "medium"
},
"note": "LoRA better",
"loraRecommended": true
},
{
"id": "crane-up",
"label": "Crane up",
"category": "Crane",
"order": 40,
"prompt": "camera cranes up and back revealing the wide scene",
"description": "Camera cranes up and back revealing the wide scene.",
"camera": {
"verb": "crane",
"direction": "up+back",
"speed": "slow",
"framing": "medium → wide"
},
"note": "prompt OK; LoRA better",
"loraRecommended": false
},
{
"id": "crane-down",
"label": "Crane down",
"category": "Crane",
"order": 41,
"prompt": "camera cranes down from high to eye level on the subject",
"description": "Camera cranes down from high to eye level on the subject.",
"camera": {
"verb": "crane",
"direction": "down",
"speed": "slow",
"framing": "wide → medium"
},
"note": "prompt OK",
"loraRecommended": false
},
{
"id": "crane-over",
"label": "Over-head crane",
"category": "Crane",
"order": 42,
"prompt": "camera cranes up and over the subject's head to the other side",
"description": "Camera cranes up and over the subject's head to the other side.",
"camera": {
"verb": "crane",
"direction": "up+over",
"speed": "medium",
"framing": "medium"
},
"note": "control better",
"loraRecommended": false
},
{
"id": "aerial-pull",
"label": "Drone pull-back",
"category": "Aerial",
"order": 43,
"prompt": "aerial drone pulls back and up, revealing the landscape",
"description": "Aerial drone pulls back and up, revealing the landscape.",
"camera": {
"verb": "drone",
"direction": "back+up",
"speed": "slow",
"framing": "medium → extreme wide"
},
"note": "prompt OK",
"loraRecommended": false
},
{
"id": "fpv",
"label": "FPV dive",
"category": "Aerial",
"order": 44,
"prompt": "fast FPV drone flight diving and weaving through the scene",
"description": "Fast FPV drone flight diving and weaving through the scene.",
"camera": {
"verb": "fpv",
"direction": "forward+down",
"speed": "very fast",
"framing": "wide"
},
"note": "LoRA better",
"loraRecommended": true
},
{
"id": "flyover",
"label": "Flyover",
"category": "Aerial",
"order": 45,
"prompt": "high aerial flyover moving forward over the scene",
"description": "High aerial flyover moving forward over the scene.",
"camera": {
"verb": "drone",
"direction": "forward",
"speed": "medium",
"framing": "extreme wide"
},
"note": "prompt OK",
"loraRecommended": false
},
{
"id": "pass-in",
"label": "Through-object in",
"category": "Transition",
"order": 46,
"prompt": "camera moves forward through a gap or object into the next space",
"description": "Camera moves forward through a gap or object into the next space.",
"camera": {
"verb": "dolly",
"direction": "forward",
"speed": "medium",
"framing": "wide"
},
"note": "prompt OK; control better",
"loraRecommended": false
},
{
"id": "pass-out",
"label": "Through-object out",
"category": "Transition",
"order": 47,
"prompt": "camera pulls back out through a gap or object",
"description": "Camera pulls back out through a gap or object.",
"camera": {
"verb": "dolly",
"direction": "back",
"speed": "medium",
"framing": "wide"
},
"note": "control better",
"loraRecommended": false
},
{
"id": "fly-transition",
"label": "Fly-through transition",
"category": "Transition",
"order": 48,
"prompt": "floating camera glides through the scene into a new location",
"description": "Floating camera glides through the scene into a new location.",
"camera": {
"verb": "glide",
"direction": "forward",
"speed": "medium",
"framing": "wide"
},
"note": "two-keyframe I2V better",
"loraRecommended": false
},
{
"id": "whip",
"label": "Whip pan",
"category": "Transition",
"order": 49,
"prompt": "fast whip pan with motion blur",
"description": "Fast whip pan with motion blur.",
"camera": {
"verb": "pan",
"direction": "left or right",
"speed": "very fast",
"framing": "medium"
},
"note": "prompt OK",
"loraRecommended": false
},
{
"id": "car-mount",
"label": "Car side mount",
"category": "Vehicle",
"order": 50,
"prompt": "camera rigidly mounted on the side of a moving car, road blur behind",
"description": "Camera rigidly mounted on the side of a moving car, road blur behind.",
"camera": {
"verb": "mount",
"direction": "with vehicle",
"speed": "fast",
"framing": "medium"
},
"note": "prompt OK",
"loraRecommended": false
},
{
"id": "car-chase",
"label": "Chase cam",
"category": "Vehicle",
"order": 51,
"prompt": "camera follows a speeding car from behind and low",
"description": "Camera follows a speeding car from behind and low.",
"camera": {
"verb": "follow",
"direction": "forward",
"speed": "fast",
"framing": "wide"
},
"note": "prompt OK",
"loraRecommended": false
},
{
"id": "road-rush",
"label": "Road rush",
"category": "Vehicle",
"order": 52,
"prompt": "low camera rushing forward just above the road surface",
"description": "Low camera rushing forward just above the road surface.",
"camera": {
"verb": "dolly",
"direction": "forward",
"speed": "very fast",
"framing": "low wide"
},
"note": "prompt OK",
"loraRecommended": false
},
{
"id": "body-rig",
"label": "Body-mounted rig",
"category": "Rig",
"order": 53,
"prompt": "camera rigidly attached to the subject's body facing them; background moves, face stays fixed",
"description": "Camera rigidly attached to the subject's body facing them; background moves, face stays fixed.",
"camera": {
"verb": "mount",
"direction": "with subject",
"speed": "medium",
"framing": "close"
},
"note": "LoRA/control better",
"loraRecommended": true
},
{
"id": "robot-arm",
"label": "Robotic arm sweep",
"category": "Rig",
"order": 54,
"prompt": "precise fast robotic-arm move sweeping around the subject",
"description": "Precise fast robotic-arm move sweeping around the subject.",
"camera": {
"verb": "arc+dolly",
"direction": "sweep",
"speed": "fast",
"framing": "medium"
},
"note": "control better",
"loraRecommended": false
},
{
"id": "follow",
"label": "Follow behind",
"category": "Rig",
"order": 55,
"prompt": "camera follows the subject from behind as they walk",
"description": "Camera follows the subject from behind as they walk.",
"camera": {
"verb": "follow",
"direction": "forward",
"speed": "medium",
"framing": "medium"
},
"note": "prompt OK",
"loraRecommended": false
},
{
"id": "lead",
"label": "Lead in front",
"category": "Rig",
"order": 56,
"prompt": "camera moves backward in front of the walking subject",
"description": "Camera moves backward in front of the walking subject.",
"camera": {
"verb": "dolly",
"direction": "back",
"speed": "medium",
"framing": "medium"
},
"note": "prompt OK",
"loraRecommended": false
},
{
"id": "bts",
"label": "Behind-the-scenes",
"category": "Style",
"order": 57,
"prompt": "behind-the-scenes look: handheld, crew and lights visible at the edges",
"description": "Behind-the-scenes look: handheld, crew and lights visible at the edges.",
"camera": {
"verb": "handheld",
"direction": "–",
"speed": "slow",
"framing": "wide"
},
"note": "prompt OK",
"loraRecommended": false
},
{
"id": "glam",
"label": "Glam beauty",
"category": "Style",
"order": 58,
"prompt": "slow beauty push with soft light and slight arc",
"description": "Slow beauty push with soft light and slight arc.",
"camera": {
"verb": "dolly+arc",
"direction": "forward",
"speed": "slow",
"framing": "close"
},
"note": "prompt OK",
"loraRecommended": false
},
{
"id": "wiggle",
"label": "Wiggle shake",
"category": "Style",
"order": 59,
"prompt": "rhythmic small camera shakes",
"description": "Rhythmic small camera shakes.",
"camera": {
"verb": "shake",
"direction": "–",
"speed": "fast",
"framing": "medium"
},
"note": "prompt OK",
"loraRecommended": false
},
{
"id": "impact-shake",
"label": "Impact shake",
"category": "Style",
"order": 60,
"prompt": "sudden camera shake on impact",
"description": "Sudden camera shake on impact.",
"camera": {
"verb": "shake",
"direction": "–",
"speed": "burst",
"framing": "medium"
},
"note": "prompt OK",
"loraRecommended": false
},
{
"id": "timelapse-city",
"label": "City timelapse",
"category": "Timelapse",
"order": 61,
"prompt": "timelapse of the landscape or city, clouds and light changing fast, camera steady",
"description": "Timelapse of the landscape or city, clouds and light changing fast, camera steady.",
"camera": {
"verb": "static",
"direction": "–",
"speed": "timelapse",
"framing": "wide"
},
"note": "prompt OK",
"loraRecommended": false
},
{
"id": "timelapse-people",
"label": "Crowd timelapse",
"category": "Timelapse",
"order": 62,
"prompt": "timelapse of people moving quickly around a still subject",
"description": "Timelapse of people moving quickly around a still subject.",
"camera": {
"verb": "static",
"direction": "–",
"speed": "timelapse",
"framing": "medium"
},
"note": "prompt OK",
"loraRecommended": false
},
{
"id": "timelapse-glam",
"label": "Beauty timelapse",
"category": "Timelapse",
"order": 63,
"prompt": "fast timelapse of styling changes on a still subject",
"description": "Fast timelapse of styling changes on a still subject.",
"camera": {
"verb": "static",
"direction": "–",
"speed": "timelapse",
"framing": "close"
},
"note": "prompt OK",
"loraRecommended": false
},
{
"id": "bullet",
"label": "Bullet freeze",
"category": "Orbit",
"order": 64,
"prompt": "slow-motion action frozen while the camera sweeps around it",
"description": "Slow-motion action frozen while the camera sweeps around it.",
"camera": {
"verb": "arc",
"direction": "around",
"speed": "slow-mo",
"framing": "medium"
},
"note": "LoRA better",
"loraRecommended": true
},
{
"id": "buckle",
"label": "Buckle-up shake",
"category": "Vehicle",
"order": 65,
"prompt": "violent shake as if strapped in a vehicle taking off",
"description": "Violent shake as if strapped in a vehicle taking off.",
"camera": {
"verb": "shake",
"direction": "–",
"speed": "fast",
"framing": "close"
},
"note": "prompt OK",
"loraRecommended": false
}
];
