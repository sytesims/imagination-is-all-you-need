/**
 * The default showcase on /workflows (2026-10-23): Imagination Is All You Need's own generations, hand-picked by the maintainer, made in this app on a local GPU
 * (ComfyUI). Each entry names the model that made it, the full prompt and settings, the run time and (for photo workflows) the photo it started from.
 * The images live in web/public/showcase/: <id>.webp (long side ≤ 1600) and <id>-640.webp (grid thumb). Generated from the picks list; edit by hand.
 * Web imports this file (Workflows page). Test: server/test/showcase.test.ts (every file exists, every pair resolves).
 */
export interface ShowcaseBefore { image: string; thumb: string; label: string; afterLabel: string; /** the showcase item this photo is (when it is one) */ from: string | null;
  /** a matching close-up of both (Upscale: the difference shows at tile size) */ crop?: { before: string; after: string } }
export interface ShowcaseItem {
  id: string; name: string; workflow: string; toolId: string; provider: string; model: string; prompt: string; settings: Record<string, string | number>;
  /** A workflow that composes its prompt (2026-10-25): the words that went in the subject box ('' = none). `prompt` is the full composed text the
   *  model got (shown in the viewer); opening the example fills the box with `subject` only, so the recipe is never composed twice. */
  subject?: string;
  width: number; height: number; image: string; thumb: string; runOn: 'local'; price: string; runMs: number | null;
  before?: ShowcaseBefore; /** the other run of the same prompt on another model */ pair?: string;
}
export const SHOWCASE: ShowcaseItem[] = [
 {
  "id": "d3c80885",
  "name": "Snow coat, low angle",
  "workflow": "create-image",
  "toolId": "create-image",
  "provider": "comfy-klein4b",
  "model": "FLUX.2 [klein] 4B",
  "prompt": "A low-angle medium shot captures a young adult Caucasian woman standing in a snowy mountainous landscape. She is wearing a textured ensemble featuring a brown cable-knit jacket over a faux fur coat, with form-fitting leggings and fluffy knee-high boots, all in matching earthy tones. A cream knitted cap and oversized sunglasses complete the look. She stands confidently, one hand on her hip, exuding a sense of fashion-forward poise. The background displays a snow-dusted mountain under a clear, vibrant blue sky. The lighting is bright, likely natural sunlight, creating sharp, crisp highlights and shadows. The scene's color palette includes warm browns and creams, contrasted by the cool whites and blues of the snow and sky. The image has a high-resolution quality, likely captured with a modern digital camera, conveying a dynamic and adventurous mood.",
  "settings": {
   "aspect": "1:1",
   "imageResolution": "1K",
   "quality": "med",
   "seed": 270723
  },
  "width": 1024,
  "height": 1024,
  "image": "/showcase/d3c80885.webp",
  "thumb": "/showcase/d3c80885-640.webp",
  "runOn": "local",
  "price": "Free · on your computer",
  "runMs": 260712,
  "pair": "17332836"
 },
 {
  "id": "17332836",
  "name": "Snow coat, low angle",
  "workflow": "create-image",
  "toolId": "create-image",
  "provider": "comfy-qwen21-turbo",
  "model": "Qwen Image 2.1 Turbo",
  "prompt": "A low-angle medium shot captures a young adult Caucasian woman standing in a snowy mountainous landscape. She is wearing a textured ensemble featuring a brown cable-knit jacket over a faux fur coat, with form-fitting leggings and fluffy knee-high boots, all in matching earthy tones. A cream knitted cap and oversized sunglasses complete the look. She stands confidently, one hand on her hip, exuding a sense of fashion-forward poise. The background displays a snow-dusted mountain under a clear, vibrant blue sky. The lighting is bright, likely natural sunlight, creating sharp, crisp highlights and shadows. The scene's color palette includes warm browns and creams, contrasted by the cool whites and blues of the snow and sky. The image has a high-resolution quality, likely captured with a modern digital camera, conveying a dynamic and adventurous mood.",
  "settings": {
   "aspect": "1:1",
   "imageResolution": "1K",
   "quality": "med",
   "seed": 270723
  },
  "width": 1024,
  "height": 1024,
  "image": "/showcase/17332836.webp",
  "thumb": "/showcase/17332836-640.webp",
  "runOn": "local",
  "price": "Free · on your computer",
  "runMs": 830695,
  "pair": "d3c80885"
 },
 {
  "id": "b718e875",
  "name": "Crosswalk candid",
  "workflow": "create-image",
  "toolId": "create-image",
  "provider": "comfy-qwen21",
  "model": "Qwen Image 2.1",
  "prompt": "A candid street portrait of a young woman in open space under bold daylight, standing on a sunlit city sidewalk with faint crosswalk paint and scattered asphalt grit, head slightly turned and eyes naturally squinting from the sun, jawline caught by side-light and direct on-camera flash, casual low-rise denim and snug pastel tank top, soft windblown hair, relaxed posture and playful energy, point-and-shoot wide angle shot from close range in the street, blue sky overhead and urban edges in the background, deep sidewalk shadow and flash fill highlights on her skin, slight film grain and blue-red color pop, bold Y2K daylight flash street-style portrait energy.",
  "settings": {
   "aspect": "1:1",
   "imageResolution": "1K",
   "quality": "med",
   "seed": 32129
  },
  "width": 1024,
  "height": 1024,
  "image": "/showcase/b718e875.webp",
  "thumb": "/showcase/b718e875-640.webp",
  "runOn": "local",
  "price": "Free · on your computer",
  "runMs": 835210,
  "pair": "e774ad5c"
 },
 {
  "id": "e774ad5c",
  "name": "Crosswalk candid",
  "workflow": "create-image",
  "toolId": "create-image",
  "provider": "comfy-qwen21-turbo",
  "model": "Qwen Image 2.1 Turbo",
  "prompt": "A candid street portrait of a young woman in open space under bold daylight, standing on a sunlit city sidewalk with faint crosswalk paint and scattered asphalt grit, head slightly turned and eyes naturally squinting from the sun, jawline caught by side-light and direct on-camera flash, casual low-rise denim and snug pastel tank top, soft windblown hair, relaxed posture and playful energy, point-and-shoot wide angle shot from close range in the street, blue sky overhead and urban edges in the background, deep sidewalk shadow and flash fill highlights on her skin, slight film grain and blue-red color pop, bold Y2K daylight flash street-style portrait energy.",
  "settings": {
   "aspect": "1:1",
   "imageResolution": "1K",
   "quality": "med",
   "seed": 32129
  },
  "width": 1024,
  "height": 1024,
  "image": "/showcase/e774ad5c.webp",
  "thumb": "/showcase/e774ad5c-640.webp",
  "runOn": "local",
  "price": "Free · on your computer",
  "runMs": 403362,
  "pair": "b718e875"
 },
 {
  "id": "b999b031",
  "name": "Painted petals",
  "workflow": "create-image",
  "toolId": "create-image",
  "provider": "comfy-zimage-turbo",
  "model": "Z-Image-Turbo",
  "prompt": "A straight-on, recumbent close-up of a young woman with lustrous, porcelain skin, her head turned delicately towards camera as her hand rest gently atop her collarbone, providing a subtle framing of the face. Her sharp, angular black dress is rendered in a slick matte satin, contrasting against luminous, translucent peony petals and a burned iridescent resin overlay that pools asymmetrically across her chest, creating a captivating duality between fashion and organic fantasy elements. Her makeup is artistic, with warm, rose-gold shimmer pressed on high points of her cheeks and collarbone, complemented by soft gloss lips and subtle smoke-gray shadow at the eyes. Hair is sleek, brushed out and splayed with dynamic tension. She appears atop a plush, minimal platform in a cyclorama studio, with an ethereal airbrushed cloud background and floating refractive light leaks, producing a faint, soft bloom. Light is diffuse, split-lit with an amber key and deep teal rim, casting low, fluid luminous shadows. The polarized palette contrasts shell pink and peachy skin tones against nightfall blue and cool gray. The symmetrical composition, with notably shallow DOF on her features and resin overlay, is polished; digital high-resolution editorial photography, enhanced with diffusion glows, iridescent overlay compositing, negative-space gradients, and iridescent filter effects. Mood is dreamy, intimate, and contemplative.",
  "settings": {
   "aspect": "1:1",
   "imageResolution": "1K",
   "quality": "med",
   "seed": 32129
  },
  "width": 1024,
  "height": 1024,
  "image": "/showcase/b999b031.webp",
  "thumb": "/showcase/b999b031-640.webp",
  "runOn": "local",
  "price": "Free · on your computer",
  "runMs": 343323
 },
 {
  "id": "fad0bbe6",
  "name": "Denim look, three views",
  "workflow": "character-sheet",
  "toolId": "app-character-sheet",
  "provider": "comfy-qwen21-turbo",
  "model": "Qwen Image 2.1 Turbo",
  "subject": "",
  "prompt": "Character reference sheet of the person in the photo, character sheet: one image split into three equal vertical panels side by side, separated by thin dark divider lines. Left panel: full-body front view from head to toe with the shoes fully in frame, standing straight, arms relaxed at the sides, facing the camera. Centre panel: full-body back view from head to toe in the same pose, facing away from the camera. Right panel: tight close-up of the face and shoulders, looking straight into the lens. Every panel has the same plain neutral grey seamless studio backdrop and soft, even, almost shadowless light, neutral 5600K white balance, natural skin texture with visible detail, catchlights in the eyes. Keep exactly one identical person in all three views: the same face, hair, skin tone, body proportions and the complete outfit and accessories from the photo; feet visible in both full-body panels; no extra people, no text, no props, no cropping of the body; sharp, realistic photo",
  "settings": {
   "aspect": "4:3",
   "imageResolution": "1K",
   "quality": "med",
   "seed": 619328
  },
  "width": 1024,
  "height": 1024,
  "image": "/showcase/fad0bbe6.webp",
  "thumb": "/showcase/fad0bbe6-640.webp",
  "runOn": "local",
  "price": "Free · on your computer",
  "runMs": 635668,
  "before": {
   "image": "/showcase/fa96f109.webp",
   "thumb": "/showcase/fa96f109-640.webp",
   "label": "Your photo",
   "afterLabel": "Sheet",
   "from": "fa96f109"
  }
 },
 {
  "id": "c091a7c3",
  "name": "Wall portrait, 2× sharper",
  "workflow": "upscale",
  "toolId": "image-upscale",
  "provider": "comfy-nomos2",
  "model": "4x Nomos2",
  "prompt": "",
  "settings": {
   "scale": "2x",
   "workflow": "image-upscale-nomos2-x2-api.json"
  },
  "width": 1600,
  "height": 1600,
  "image": "/showcase/c091a7c3.webp",
  "thumb": "/showcase/c091a7c3-640.webp",
  "runOn": "local",
  "price": "Free · on your computer",
  "runMs": 140478,
  "before": {
   "image": "/showcase/fa96f109.webp",
   "thumb": "/showcase/fa96f109-640.webp",
   "label": "Original",
   "afterLabel": "2×",
   "from": "fa96f109",
   "crop": {
    "before": "/showcase/fa96f109-crop.webp",
    "after": "/showcase/c091a7c3-crop.webp"
   }
  }
 },
 {
  "id": "fa96f109",
  "name": "Denim by the wall",
  "workflow": "create-image",
  "toolId": "create-image",
  "provider": "comfy-zimage-turbo",
  "model": "Z-Image-Turbo",
  "prompt": "A medium shot captures a young Asian woman in a stylized outfit, standing against a textured, weathered wall. She wears a form-fitted, light denim corset with dark accents and oversized metallic grommets, paired with a short, matching denim skirt. Her ensemble includes dramatic, oversized hoop earrings and a chunky necklace. Her arms are draped in a brown faux fur jacket with voluminous sleeves. She carries a small, cream-colored handbag with decorative holes and a dangling key charm. Her stockings are lace-trimmed, complementing her knee-high, black heeled boots. The setting features an urban, distressed wall with visible cracks and wires. The image employs natural daylight, creating a warm, muted color palette that enhances the bohemian, fashion-forward mood and commemorates an offbeat, eclectic style.",
  "settings": {
   "aspect": "1:1",
   "imageResolution": "1K",
   "quality": "med",
   "seed": 468196
  },
  "width": 1024,
  "height": 1024,
  "image": "/showcase/fa96f109.webp",
  "thumb": "/showcase/fa96f109-640.webp",
  "runOn": "local",
  "price": "Free · on your computer",
  "runMs": 215328
 },
 {
  "id": "310cde89",
  "name": "Petal macro",
  "workflow": "create-image",
  "toolId": "create-image",
  "provider": "comfy-zimage-turbo",
  "model": "Z-Image-Turbo",
  "prompt": "Extreme macro close-up photograph, documentary beauty photography, shot on medium format digital (Phase One XF IQ4 with 120mm macro lens). Tight detail shot of a real geisha's face during gentle spring rain in Gion district, Kyoto.\r\n\r\nCrop: extremely tight framing from just below the nose to just above the eyebrow, only ONE eye and the upper lip visible, cropping in even tighter than a typical beauty ad, filling the entire frame with skin texture and makeup detail.\r\n\r\nCritical macro details:\r\n\r\nEye (right side of frame): dark chocolate-brown iris with visible radial fiber texture, the pupil slightly dilated, a single catchlight from the overcast sky reflected as a soft rectangular shape, individual natural black eyelashes with mascara clumping slightly on two lashes, a real spider-web of fine skin lines at the outer corner (crow's feet barely visible — she's human not porcelain), kohl liner traced along the upper lash line with a precise upward flick at the outer corner, a pale pink cherry blossom petal caught between two lower lashes with a single tiny water droplet beading on its surface.\r\n\r\nSkin: authentic shironuri white makeup applied over real human skin — not flawless CGI skin, but real pores visible under the white foundation, tiny uneven spots where the makeup settled into a fine line or pore, a faint warm-pink blush ghosting the cheek that shows the actual skin tone bleeding through, one small imperfection near the temple where a rain drop has cut a thin translucent line through the white powder revealing the warm skin beneath, peach fuzz catching light along the jawline.\r\n\r\nLips (bottom of frame): the lower lip painted in deep crimson-red lacquer in the traditional small ochobo shape — lipstick applied only in the center third of the lip, the edges of the natural lip visible as pale pink beyond the red, vertical texture lines of the actual lip surface visible through the lipstick, slight slight imperfection where the lipstick line isn't perfectly sharp at one edge, a single pink cherry blossom petal stuck directly onto the wet red lip, a tiny water drop sitting on the petal.\r\n\r\nFalling petals (foreground blur): one or two pink petals motion-blurred streaking past the face creating soft pink streaks of bokeh.\r\n\r\nComposition: 1:1 square macro crop, extreme close-up, only a fragment of the face visible, the eye on the upper-third intersection, the lip on the lower-third, diagonal tension from lip to eye, massive negative space of skin filling the rest of the frame.\r\n\r\nLighting: soft overcast rainy daylight wrapping the face evenly, gentle directional light from camera-left, one subtle warm catchlight from a distant paper lantern reflected in the iris, no harsh shadows, preserving every pore and fiber detail.\r\n\r\nColor grading: muted painterly palette — soft pale porcelain white of makeup with warm pink undertones showing through, deep crimson lip, inky black lashes and liner, dusty pink petals, slight cool-blue cast from rainy ambient light, restrained saturation, realistic film rendering, Kodak Portra 400 film emulation, organic grain, matte natural finish, absolutely photorealistic skin.\r\n\r\nShot on Phase One XF IQ4 150MP with Schneider LS 120mm f/4.0 Macro Blue Ring lens at f/5.6 for critical sharpness. Paolo Roversi × Paolo Ventura × Mikiya Takimoto beauty editorial style, Vogue Japan / AnOther Beauty macro feature, hyperrealistic documentary beauty, authentic human texture not CGI perfection, real woman not digital fantasy, ultra-detailed pore-level rendering, film texture authenticity.",
  "settings": {
   "aspect": "1:1",
   "imageResolution": "1K",
   "quality": "med",
   "seed": 464526
  },
  "width": 1024,
  "height": 1024,
  "image": "/showcase/310cde89.webp",
  "thumb": "/showcase/310cde89-640.webp",
  "runOn": "local",
  "price": "Free · on your computer",
  "runMs": 160124
 },
 {
  "id": "98ba27ae",
  "name": "Chrome elevator",
  "workflow": "create-image",
  "toolId": "create-image",
  "provider": "comfy-zimage-turbo",
  "model": "Z-Image-Turbo",
  "prompt": "full-body outfit photo of a woman in a chrome-mirrored elevator, silver puffer jacket and cargo pants, reflections multiplying her into infinity, cool fluorescent light, high fashion streetwear editorial",
  "settings": {
   "aspect": "1:1",
   "imageResolution": "1K",
   "quality": "med",
   "seed": 829441
  },
  "width": 1024,
  "height": 1024,
  "image": "/showcase/98ba27ae.webp",
  "thumb": "/showcase/98ba27ae-640.webp",
  "runOn": "local",
  "price": "Free · on your computer",
  "runMs": 223775
 },
 {
  "id": "396554e1",
  "name": "House party flash",
  "workflow": "create-image",
  "toolId": "create-image",
  "provider": "comfy-zimage-turbo",
  "model": "Z-Image-Turbo",
  "prompt": "group of friends laughing at a house party, disposable camera flash, red-eye, slight color cast, Y2K outfits, low-rise jeans and tinted sunglasses, grainy, timestamp-free, authentic 2003 snapshot",
  "settings": {
   "aspect": "1:1",
   "imageResolution": "1K",
   "quality": "med",
   "seed": 829441
  },
  "width": 1024,
  "height": 1024,
  "image": "/showcase/396554e1.webp",
  "thumb": "/showcase/396554e1-640.webp",
  "runOn": "local",
  "price": "Free · on your computer",
  "runMs": 267296
 },
 {
  "id": "032054ec",
  "name": "Camel coat from below",
  "workflow": "create-image",
  "toolId": "create-image",
  "provider": "comfy-zimage-turbo",
  "model": "Z-Image-Turbo",
  "prompt": "extreme low-angle fashion shot of a tall man in a long camel coat against a clear cobalt sky, fisheye lens, hard midday sun, crisp shadows, minimal composition, high saturation, luxury campaign style",
  "settings": {
   "aspect": "1:1",
   "imageResolution": "1K",
   "quality": "med",
   "seed": 829441
  },
  "width": 1024,
  "height": 1024,
  "image": "/showcase/032054ec.webp",
  "thumb": "/showcase/032054ec-640.webp",
  "runOn": "local",
  "price": "Free · on your computer",
  "runMs": 142117
 },
 {
  "id": "973c88f8",
  "name": "Golden hour car selfie",
  "workflow": "create-image",
  "toolId": "create-image",
  "provider": "comfy-zimage-turbo",
  "model": "Z-Image-Turbo",
  "prompt": "close-up selfie of a woman with freckles in the driver's seat of a vintage car, golden hour sun flaring through the window, warm skin tones, messy hair, gold hoop earrings, shot on iPhone, natural imperfect framing",
  "settings": {
   "aspect": "16:9",
   "imageResolution": "1K",
   "quality": "med",
   "seed": 829441,
   "n": 4
  },
  "width": 1024,
  "height": 576,
  "image": "/showcase/973c88f8.webp",
  "thumb": "/showcase/973c88f8-640.webp",
  "runOn": "local",
  "price": "Free · on your computer",
  "runMs": 350694
 },
 {
  "id": "334bb02e",
  "name": "Yellow set at sunset",
  "workflow": "create-image",
  "toolId": "create-image",
  "provider": "comfy-zimage-turbo",
  "model": "Z-Image-Turbo",
  "prompt": "A straight-on, medium-long shot captures a young Caucasian woman in her twenties standing on an asphalt road at dusk against a flat landscape and a vibrant sunset sky. She wears a bright yellow two-piece outfit with a pleated miniskirt and a long-sleeved, cropped windbreaker-style jacket with visible zipper lines and subtle seam details, framing a white under-layered sports bra or crop top. She accessorizes with a thin, delicate necklace, a hair elastic bracelet, and translucent sunglasses, which she raises to her forehead with her left hand. Her long, straight blonde hair falls freely, catching a slight breeze. The scene is illuminated with briefly powerful flash photography that produces sharp shadows, crystalline skin highlights, and a warm halo effect around the subject, while the deep blacktop and surrounding landscape recede into a painterly blur with no visible detail. The color palette is dominated by the yellow of her outfit, set against the deepening blues and oranges of the twilight sky. The image is likely a high-resolution digital photo from a modern smartphone, creating a sharp subject and softly diffused background with barely visible digital compression, offering an energetic yet serene and nostalgic early summer evening mood. HEX VALUES: [\"#0b0707\", \"#18110e\", \"#4a607e\", \"#241b19\", \"#5f7289\", \"#ebc07d\", \"#cfa474\", \"#7b8592\", \"#b06e58\", \"#372b26\", \"#a09795\", \"#835244\"]",
  "settings": {
   "aspect": "16:9",
   "imageResolution": "2K",
   "quality": "med",
   "seed": 455830
  },
  "width": 1600,
  "height": 900,
  "image": "/showcase/334bb02e.webp",
  "thumb": "/showcase/334bb02e-640.webp",
  "runOn": "local",
  "price": "Free · on your computer",
  "runMs": 1732419
 },
 {
  "id": "4abeb5da",
  "name": "Seaside lounge",
  "workflow": "create-image",
  "toolId": "create-image",
  "provider": "comfy-zimage-turbo",
  "model": "Z-Image-Turbo",
  "prompt": "Wide shot taken from about 10 meters away showing a stylish Latina man sitting on sun-warmed, smooth whitewashed stones at the edge of the crystalline Mediterranean sea. He wears tailored swim shorts in a striking dusty lavender with a subtle abstract wavy stripe motif in muted coral and pale peach, crafted from lightweight swim fabric. A loosely draped, unbuttoned blush pink linen shirt adds softness and texture, sleeves rolled casually above the elbow. His sun-kissed skin glows naturally under the soft, clear daylight, complemented by a wide-brimmed boater hat made of woven straw and vintage minimalist gold-rim sunglasses perched slightly down on his nose. He reclines with legs partly submerged in the gently lapping turquoise water, one hand resting on a textured, handwoven canvas tote bag featuring delicate terracotta and sky-blue geometric embroidery. Nearby, a striped pastel towel lies draped over the rocks, while the shimmering sea dominates the foreground and background, reflecting scattered olive tree shadows above. The candid, three-quarter iPhone angle captures tactile textures—wet stone, linen, bronzed skin—and the serene, quietly stylish atmosphere of Mediterranean luxury summer leisure. —hyper-real texture fidelity, natural skin",
  "settings": {
   "aspect": "1:1",
   "imageResolution": "1K",
   "quality": "med",
   "seed": 246678193
  },
  "width": 1024,
  "height": 1024,
  "image": "/showcase/4abeb5da.webp",
  "thumb": "/showcase/4abeb5da-640.webp",
  "runOn": "local",
  "price": "Free · on your computer",
  "runMs": 190764
 },
 {
  "id": "d21b44c6",
  "name": "Shopping cart sprint",
  "workflow": "create-image",
  "toolId": "create-image",
  "provider": "comfy-klein4b",
  "model": "FLUX.2 [klein] 4B",
  "prompt": "Energetic city street scene with two young friends in the midst of a spontaneous shopping cart ride outdoors: the person in the black snapback laughs with knees up inside the cart while the friend in a red cap pushes from behind, caught mid-stride. Both faces are sharp, well-lit, expressive—long loose wavy hair, subtle winged liner, glossy lips, fun choker and chain details, crop tops, light-wash distressed jeans, chunky sneakers. Sidewalk, city asphalt, parked cars, and everyday urban background textures signal a carefree sunny day, with light bouncing off the pavement and subtle shadows melting into lifted blacks and a gentle hazy bloom. Shot at street level with slight tilt and off-center framing; direct on-camera flash and washed highlight give the image a sunlit, warm pink/mauve 2014-era filter. Casual snapshot composition, slight wide lens distortion, some natural motion blur in limbs but faces readable; contemporary clean finish, no visual grain or low-fi artifacts. Playful, energetic, carefree friendship frozen in time right outside the shops.",
  "settings": {
   "aspect": "1:1",
   "imageResolution": "1K",
   "quality": "med",
   "seed": 1787319226
  },
  "width": 1024,
  "height": 1024,
  "image": "/showcase/d21b44c6.webp",
  "thumb": "/showcase/d21b44c6-640.webp",
  "runOn": "local",
  "price": "Free · on your computer",
  "runMs": 71540
 },
 {
  "id": "016bdc27",
  "name": "Sheer dress, studio floor",
  "workflow": "create-image",
  "toolId": "create-image",
  "provider": "comfy-zimage-turbo",
  "model": "Z-Image-Turbo",
  "prompt": "A soft side-profile medium shot of a young Caucasian woman in her 20s with a slender build, fair skin, and long, wavy blonde hair. She is kneeling on the matte dark floor, leaning lightly against a plain off-white wall while her body faces forward and her head turns slightly toward the camera. She wears a sheer black pleated dress with ultra-fine ribbing and a loose swoop of voluminous fabric pooling beside her. The lighting is diffuse and gentle, casting a soft glow that accentuates the subtle highlights on the subject's skin and hair without harsh contrast or deep shadow, creating a filmic appearance. The muted color palette is dominated by the warm beige of the subject's skin, the pale off-white wall, and the semi-translucent charcoal of her dress. The composition is carefully arranged with a large expanse of negative space and minimalist surroundings, giving the frame an airy, clean, and ethereal quality. The visual softness suggests the image was captured on a digital camera with a wide aperture lens, producing shallow depth of field and velvety bokeh that adds to the tranquil, wistful, editorial fashion mood.",
  "settings": {
   "aspect": "1:1",
   "imageResolution": "1K",
   "quality": "med",
   "seed": 1942283913
  },
  "width": 1024,
  "height": 1024,
  "image": "/showcase/016bdc27.webp",
  "thumb": "/showcase/016bdc27-640.webp",
  "runOn": "local",
  "price": "Free · on your computer",
  "runMs": 157398
 },
 {
  "id": "baf606ef",
  "name": "Tulle in motion",
  "workflow": "create-image",
  "toolId": "create-image",
  "provider": "comfy-zimage-turbo",
  "model": "Z-Image-Turbo",
  "prompt": "A straight-on medium full-body editorial photograph of an ethereal adult fashion model with very fair skin and slicked-back hair, her elongated frame wrapped in translucent tulle and flowing organza fabric manipulated to sweep and billow dramatically in mid-air, freezing movement while suggesting ongoing motion; the model appears suspended between stillness and fluid dance, her eyes cast downward in somber focus and her angular pose sculpted to create elegant negative space around her. The shot is staged in a minimalist theatrical studio void with a concrete-gray mottled backdrop and hard-edged spotlight isolating the subject, producing chiaroscuro effects and softened edges from bloom in the highlights. The overall color palette is muted and editorial: icy blue and chalk white tulle, accented with cream and pale taupe, set against cool black and gray shadows. The medium-format look features carefully controlled focus (eyes, gesture, fabrics sharp, background softly blurred) with slight wide-angle lens behavior, subtle filmic grain, delicate halation, and a faint vignette. The mood is surreal, suspended, and contemplative, blurring a line between sculpture, dance, and fashion.",
  "settings": {
   "aspect": "1:1",
   "imageResolution": "1K",
   "quality": "med",
   "seed": 1818824150
  },
  "width": 1024,
  "height": 1024,
  "image": "/showcase/baf606ef.webp",
  "thumb": "/showcase/baf606ef-640.webp",
  "runOn": "local",
  "price": "Free · on your computer",
  "runMs": 160869,
  "pair": "fcfe713a"
 },
 {
  "id": "fcfe713a",
  "name": "Tulle in motion",
  "workflow": "create-image",
  "toolId": "create-image",
  "provider": "comfy-klein4b",
  "model": "FLUX.2 [klein] 4B",
  "prompt": "A straight-on medium full-body editorial photograph of an ethereal adult fashion model with very fair skin and slicked-back hair, her elongated frame wrapped in translucent tulle and flowing organza fabric manipulated to sweep and billow dramatically in mid-air, freezing movement while suggesting ongoing motion; the model appears suspended between stillness and fluid dance, her eyes cast downward in somber focus and her angular pose sculpted to create elegant negative space around her. The shot is staged in a minimalist theatrical studio void with a concrete-gray mottled backdrop and hard-edged spotlight isolating the subject, producing chiaroscuro effects and softened edges from bloom in the highlights. The overall color palette is muted and editorial: icy blue and chalk white tulle, accented with cream and pale taupe, set against cool black and gray shadows. The medium-format look features carefully controlled focus (eyes, gesture, fabrics sharp, background softly blurred) with slight wide-angle lens behavior, subtle filmic grain, delicate halation, and a faint vignette. The mood is surreal, suspended, and contemplative, blurring a line between sculpture, dance, and fashion.",
  "settings": {
   "aspect": "1:1",
   "imageResolution": "1K",
   "quality": "med",
   "seed": 1960095302
  },
  "width": 1024,
  "height": 1024,
  "image": "/showcase/fcfe713a.webp",
  "thumb": "/showcase/fcfe713a-640.webp",
  "runOn": "local",
  "price": "Free · on your computer",
  "runMs": 73072,
  "pair": "baf606ef"
 },
 {
  "id": "31465e96",
  "name": "Polka tights on the rug",
  "workflow": "create-image",
  "toolId": "create-image",
  "provider": "comfy-zimage-turbo",
  "model": "Z-Image-Turbo",
  "prompt": "High angle snapshot of a young woman with fair skin, sitting cross-legged atop a distressed blue-and-cream patterned rug, wearing an eclectic black and beige striped crop top, polka-dotted tights, and shiny black ballet shoes. Her expression is nonchalant and she gazes off-camera. The scene is set in a mundane living room, with a tightly cropped, centered perspective and household details in soft focus. Hard direct on-camera flash bathes the room in even, shadowless light reminiscent of a 2000s digicam, highlighting the fuzzy and smooth textures while giving the shot a washed-out, lo-fi editorial aesthetic. The color palette is desaturated pastel blue, cream, beige and black, conveying a cool, serene mood.",
  "settings": {
   "aspect": "1:1",
   "imageResolution": "1K",
   "quality": "med",
   "seed": 1943494983
  },
  "width": 1024,
  "height": 1024,
  "image": "/showcase/31465e96.webp",
  "thumb": "/showcase/31465e96-640.webp",
  "runOn": "local",
  "price": "Free · on your computer",
  "runMs": 160139
 },
 {
  "id": "5846d360",
  "name": "Double exposure",
  "workflow": "create-image",
  "toolId": "create-image",
  "provider": "comfy-zimage-turbo",
  "model": "Z-Image-Turbo",
  "prompt": "A surreal double exposure film photograph with a soft analog aesthetic. A dark, lone transparent silhouette of a young East Asian woman with pale skin, head tilted back and listening to music on oversized neon green headphones, is the main subject. The woman's black tousled hair and visible black tank strap add visual interest against the stark white minimalist background. Visible through the figure's transparent silhouette and woven into the deep foreground shadows is a rainy, illuminated city street lined with tall buildings, leafy trees, and wet reflective pavement catching light trails from red and white car lights. Diffused daylight blends softly with the vibrant night scene. The image features medium film grain, faded blacks, soft focus, gentle light leaks, and a blend of warm and cool vintage tones, imbuing the photograph with an introspective, dreamlike, and contemplative urban atmosphere.",
  "settings": {
   "aspect": "1:1",
   "imageResolution": "1K",
   "quality": "med",
   "seed": 584631799
  },
  "width": 1024,
  "height": 1024,
  "image": "/showcase/5846d360.webp",
  "thumb": "/showcase/5846d360-640.webp",
  "runOn": "local",
  "price": "Free · on your computer",
  "runMs": 160960
 },
 {
  "id": "212b7eec",
  "name": "Overhead café selfie",
  "workflow": "create-image",
  "toolId": "create-image",
  "provider": "comfy-zimage-turbo",
  "model": "Z-Image-Turbo",
  "prompt": "Overhead selfie of two young, stylish friends sitting on a wood bench outside a city cafe. One young woman with cropped dark hair, micro bangs, and angular black sunglasses wears a blue boxy t-shirt and holds an espresso cup near her mouth. A compact camera hangs from her neck. Next to her, a young man in a sage green bucket hat, white ribbed tank top, and faded jeans scrolls through his phone, deadpan expression. A speckled white ceramic plate with cafe pastries sits on the table. The city background blends neutral-toned brick buildings, parked cars, and street signage. Lo-fi '00s digital snapshot, overcast daylight flood with flat, direct on-camera flash and slight fisheye lens distortion. The colors are a cool, muted city palette: stone gray, lilac, navy, camel, and faded blue. The mood is candid, casual, and anti-glamorous urban streetwear editorial.",
  "settings": {
   "aspect": "1:1",
   "imageResolution": "1K",
   "quality": "med",
   "seed": 787478198
  },
  "width": 1024,
  "height": 1024,
  "image": "/showcase/212b7eec.webp",
  "thumb": "/showcase/212b7eec-640.webp",
  "runOn": "local",
  "price": "Free · on your computer",
  "runMs": 166317
 },
 {
  "id": "f7699cd4",
  "name": "Courier on the rooftop",
  "workflow": "create-image",
  "toolId": "create-image",
  "provider": "comfy-zimage-turbo",
  "model": "Z-Image-Turbo",
  "prompt": "A fictional courier in her early 30s, dark brown skin, freckles, shoulder-length box braids with one silver bead, olive bomber jacket, standing on a city rooftop at blue hour with neon signs glowing below, wind in her braids, waist-up, looking slightly off camera, cinematic rim light, 85mm f/1.4, creamy bokeh, photoreal. No text, letters, numbers, logos, watermarks or brand marks anywhere. No real people.",
  "settings": {
   "aspect": "1:1",
   "imageResolution": "1K",
   "quality": "med",
   "seed": 177139612
  },
  "width": 1024,
  "height": 1024,
  "image": "/showcase/f7699cd4.webp",
  "thumb": "/showcase/f7699cd4-640.webp",
  "runOn": "local",
  "price": "Free · on your computer",
  "runMs": 153121
 },
 {
  "id": "7205edb3",
  "name": "Wave by the lighthouse",
  "workflow": "create-image",
  "toolId": "create-image",
  "provider": "comfy-zimage-turbo",
  "model": "Z-Image-Turbo",
  "prompt": "A fictional elderly man in his late 60s, short and stocky, round friendly face, bushy white eyebrows, neat short white beard, round wire-rim glasses, mustard-yellow raincoat over a navy knit sweater, navy knit beanie, standing on a windswept stone pier beside a red-and-white lighthouse at golden hour, waves breaking behind him, editorial portrait, 50mm, shallow depth of field, photoreal, rich film colour. No text, letters, numbers, logos, watermarks or brand marks anywhere. No real people.",
  "settings": {
   "aspect": "1:1",
   "imageResolution": "1K",
   "quality": "med",
   "seed": 149377307
  },
  "width": 1024,
  "height": 1024,
  "image": "/showcase/7205edb3.webp",
  "thumb": "/showcase/7205edb3-640.webp",
  "runOn": "local",
  "price": "Free · on your computer",
  "runMs": 160298
 },
 {
  "id": "1492ccf1",
  "name": "Camel coat, 4× from 384 px",
  "workflow": "upscale",
  "toolId": "image-upscale",
  "provider": "comfy-seedvr2-image",
  "model": "SeedVR2 3B",
  "prompt": "",
  "settings": {
   "scale": "4x",
   "workflow": "image-upscale-seedvr2-3b-api.json"
  },
  "width": 1536,
  "height": 1536,
  "image": "/showcase/1492ccf1.webp",
  "thumb": "/showcase/1492ccf1-640.webp",
  "runOn": "local",
  "price": "Free · on your computer",
  "runMs": 205203,
  "before": {
   "image": "/showcase/1492ccf1-in.webp",
   "thumb": "/showcase/1492ccf1-in-640.webp",
   "label": "384 px",
   "afterLabel": "4×",
   "from": null,
   "crop": {
    "before": "/showcase/1492ccf1-in-crop.webp",
    "after": "/showcase/1492ccf1-crop.webp"
   }
  }
 },
 {
  "id": "0f1a0117",
  "name": "Golden hour on the street",
  "workflow": "relight",
  "toolId": "app-relight",
  "provider": "comfy-klein4b",
  "model": "FLUX.2 [klein] 4B",
  "subject": "",
  "prompt": "relight the scene; light from the right side of the frame; soft diffused light, gentle shadows; normal-strength warm amber light; keep the subject, pose and composition unchanged",
  "settings": {
   "direction": "right",
   "lightQuality": "soft",
   "brightness": 35,
   "color": "#FFC98A",
   "seed": 424242,
   "workflow": "create-image-klein4b-edit-api.json"
  },
  "width": 1024,
  "height": 1024,
  "image": "/showcase/0f1a0117.webp",
  "thumb": "/showcase/0f1a0117-640.webp",
  "runOn": "local",
  "price": "Free · on your computer",
  "runMs": 118177,
  "before": {
   "image": "/showcase/e774ad5c.webp",
   "thumb": "/showcase/e774ad5c-640.webp",
   "label": "Before",
   "afterLabel": "Golden hour",
   "from": "e774ad5c"
  }
 }
];
/** Same prompt, two models (the "Same prompt, different models" row), in show order. */
export const SHOWCASE_PAIRS: [string, string][] = [["baf606ef", "fcfe713a"], ["d3c80885", "17332836"], ["b718e875", "e774ad5c"]];
/** The hero row: left, centre (sweeps by itself), right. */
export const SHOWCASE_HERO: [string, string, string] = ['1492ccf1', 'fad0bbe6', '032054ec'];
/** The example a workflow's tiles show (stronger than its look covers); the first is the 2×2 feature tile when its section has one. */
export const SHOWCASE_FOR: Record<string, string> = { 'create-image': '032054ec', 'character-sheet': 'fad0bbe6', upscale: '1492ccf1', relight: '0f1a0117' };
export const showcaseById = (id: string): ShowcaseItem | undefined => SHOWCASE.find((s) => s.id === id);
/** "See how it was made" order: strongest first, and the two runs of a pair never side by side. The starter pack's images (user's picks, 2026-10-28):
 *  the rest of SHOWCASE stays only where Explore or Workflows show it (shared/featured.ts EXPLORE_ONLY_SHOWCASE, the pairs, the hero, the befores). */
export const SHOWCASE_GALLERY: string[] = ['334bb02e', '032054ec', '1492ccf1', '310cde89', '98ba27ae', '396554e1', 'b999b031', 'baf606ef', 'd21b44c6',
  '5846d360', '17332836', '212b7eec', 'fcfe713a', '4abeb5da', 'c091a7c3'];
