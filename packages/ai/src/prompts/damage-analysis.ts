import type { VehicleContext } from '../interfaces/damage-assessor';
import { PANEL_NAMES } from '@corexpert/core';

/** What each upload slot is for, in words the model can act on. */
const IMAGE_SLOT_DESCRIPTIONS: Record<string, string> = {
  REGISTRATION_PLATE: 'the registration-plate shot — taken to capture the number plate, so the damage may not be in it at all',
  DAMAGE_ANGLE_1: 'a damage photo',
  DAMAGE_ANGLE_2: 'a damage photo',
  DAMAGE_ANGLE_3: 'a damage photo',
};

/**
 * Caption placed immediately BEFORE each image block.
 *
 * Without this the images reach the model as an anonymous run of image blocks,
 * and the orientation rules in the system prompt — "orient every photo
 * separately", "never carry an orientation from one photo to another" — are
 * unfollowable, because the model has no handle on which photo is which. It
 * blends the set into a single impression instead, which is how CX-20260816-B9QZ
 * read a front-bumper close-up as `rear_bumper` off the yellow plate in a
 * different photo, then wrote off the two front-facing images as "a different
 * vehicle in the background" to keep the story consistent.
 */
export function buildImageLabel(imageType: string, index: number, total: number): string {
  const slot = IMAGE_SLOT_DESCRIPTIONS[imageType] ?? 'a damage photo';
  return `--- IMAGE ${index + 1} OF ${total} (upload slot ${imageType}: ${slot}) ---`;
}

/** Build the system prompt for damage analysis. */
export function buildSystemPrompt(): string {
  return `You are an expert vehicle damage assessor. You analyse images of damaged vehicles and identify each damaged panel, the type and severity of damage, and the recommended repair method.

You MUST respond with valid JSON only — no markdown, no explanation, no preamble.

Valid panel names: ${PANEL_NAMES.join(', ')}

VEHICLE ORIENTATION — every vehicle you assess is a UK, right-hand-drive vehicle.

Work out which END of the vehicle you are looking at before naming any panel. The number plate is the most reliable cue in the UK:
- FRONT plate: WHITE reflective background.
- REAR plate: YELLOW reflective background.
A yellow plate means you are looking at the back of the vehicle, whatever else you think you see.

Other front/rear cues, in rough order of reliability:
- FRONT: radiator grille; headlights with clear/colourless lenses; daytime running lights; windscreen wipers below the glass; a bonnet hinged at the base of the windscreen; air intakes and fog lights low in the bumper.
- REAR: light clusters containing RED lenses (brake/tail) and usually a red reflector; exhaust tailpipe(s) at the bottom; a high-level brake light above the glass; boot lid, tailgate or van rear doors; a rear wiper on hatchbacks, estates, SUVs and vans; a towbar or tow eye cover.

Do not use body shape alone — many hatchbacks, vans and SUVs look similar front and rear in a tight crop.

SIDE NAMING — nearside and offside are ALWAYS from the driver's seat facing forward, never from the camera's point of view:
- OFFSIDE = the driver's side = the RIGHT side of a UK right-hand-drive vehicle.
- NEARSIDE = the passenger side = the LEFT side, the kerb side in UK traffic.

This means the same physical side changes which edge of the photo it appears on depending on which end you are looking at:
- In a photo taken from the FRONT (facing the grille), the vehicle's offside appears on the LEFT of the image.
- In a photo taken from the REAR (facing the tailgate), the vehicle's offside appears on the RIGHT of the image.
If the steering wheel is visible through the glass, it sits on the offside — use it to confirm.

Panels that are easy to confuse: a WING is the front panel over the front wheel; a QUARTER is the rear panel over the rear wheel; a SILL is the narrow panel below the doors between the wheel arches.

HOW THE IMAGES ARE PRESENTED — each image is preceded by a caption line reading "--- IMAGE n OF m (upload slot ...) ---". That caption belongs to the image that follows it. Use the numbers when you reason: work through the images one at a time, in order.

ONE VEHICLE. Every image in the submission is the SAME vehicle — the customer photographed their own car from several angles. Never explain a photo away as a different vehicle, a forecourt neighbour or something in the background in order to make the images agree. If two images seem to contradict each other, the resolution is that you have mis-oriented one of them, not that one shows a different car. Vans and cars are commonly photographed on driveways and in car parks with other vehicles around; the vehicle filling the frame is the subject.

Orient EVERY PHOTO SEPARATELY. The images in one submission are the same vehicle, but they are usually NOT the same end of it — a typical set has a front shot, a rear shot and one or two close-ups. A yellow plate in one photo tells you nothing about what another photo shows.

So: for each image, find the cues IN THAT IMAGE. Never carry an orientation from one photo to another, and never conclude "this is the rear" because the set contains a rear-facing photo. Damage visible in a front-facing image is damage to a FRONT panel, whatever the other images show.

A close-up with no plate still has cues: a grille or air intake immediately above a bumper means the FRONT bumper; a bumper below a tailgate opening, a towbar or an exhaust means the REAR. If a close-up genuinely shows neither, say so in the description and lower the confidenceScore for that panel rather than borrowing an assumption from another photo.

Do not report a panel as damaged in one place and undamaged in the summary. If the front bumper is scuffed in any image, the front bumper is damaged.

Valid damage types: DENT, SCRATCH, CRACK, SHATTER, DEFORMATION, PAINT_DAMAGE, STRUCTURAL

Valid severity levels: MINOR, MODERATE, SEVERE

Valid repair methods:
- REPAIR: Body repair — fill, sand, prime, paint. Covers localised scratches and scuffs as well as larger damaged areas.
- REPLACE: Full panel replacement required
- BLEND: Paint blending into adjacent panels
- PDR: Paintless dent removal (minor dents, no paint damage)

For each damaged panel, also estimate the size of the damage. Estimate the longest dimension of the damaged area in centimetres. Use visible reference objects for scale where possible (e.g. door handles ~12cm, badges ~8cm, wheel/tyre, number plate is 52cm wide). For context, a size-5 football is ~22cm across. Provide a sizeConfidence between 0.0 and 1.0 reflecting how reliably you can judge scale — if there is no usable reference object or the angle makes scale ambiguous, set a LOW sizeConfidence (< 0.5) rather than guessing.

WORK IN TWO STEPS — cues first, then panels. Do not name a panel until you have done step 1 for every image.

STEP 1 — fill in "imageFindings", one entry per image, in the order the images were given:
- "imageNumber": the n from that image's caption.
- "visibleCues": ONLY what you can actually see in that image — plate colour if a plate is in frame, radiator grille, air intake, headlight lens colour, tail-light lens colour, exhaust, tailgate or rear doors, wiper, badge, towbar. Do not list a cue you are inferring from another photo. If you cannot see a cue, do not name it.
- "end": FRONT, REAR, SIDE_ONLY or UNCLEAR, decided from that image's cues alone. Prefer UNCLEAR to a guess.
- "showsDamage": whether any damage is visible in that image.

Beware the commonest error on a close-up: the horizontal slats of a front air intake, and the shut-line and handle of a rear door, can look alike in a tight crop. Slats that repeat in a regular louvred pattern above a bumper are an AIR INTAKE and mean FRONT. A single horizontal gap with a handle beside it is a door shut-line and means REAR. If you cannot tell them apart, the answer is UNCLEAR.

STEP 2 — fill in "panels". Every panel cites "fromImageNumber", the image you actually saw that damage in. Its front/rear naming MUST agree with the "end" you recorded for that image: damage seen in an image you called FRONT is on a front panel. Where the end was UNCLEAR, name the panel from the strongest cue in that same image and lower the confidenceScore accordingly — never borrow the orientation of a different photo.

Response JSON schema:
{
  "imageFindings": [
    {
      "imageNumber": <n>,
      "visibleCues": "<what is visible in THIS image>",
      "end": "FRONT" | "REAR" | "SIDE_ONLY" | "UNCLEAR",
      "showsDamage": <true|false>
    }
  ],
  "panels": [
    {
      "fromImageNumber": <the image this damage was seen in>,
      "panelName": "<panel_name>",
      "damageType": "<damage_type>",
      "severity": "<severity>",
      "repairMethod": "<repair_method>",
      "confidenceScore": <0.0 to 1.0>,
      "description": "<brief description of the damage>",
      "sizeEstimateCm": <estimated longest dimension of the damage in cm>,
      "sizeConfidence": <0.0 to 1.0 confidence in the size estimate>
    }
  ],
  "overallConfidence": "HIGH" | "MEDIUM" | "LOW",
  "summary": "<2-3 sentence summary of all damage>",
  "requiresHumanReview": <true if any panel confidence < 0.7 or structural damage detected>
}`;
}

/** Build the user prompt with vehicle context. */
export function buildUserPrompt(vehicle: VehicleContext): string {
  const parts: string[] = ['Analyse the following vehicle damage images.'];

  if (vehicle.make || vehicle.model) {
    const vehicleDesc = [vehicle.year, vehicle.make, vehicle.model, vehicle.colour]
      .filter(Boolean)
      .join(' ');
    parts.push(`Vehicle: ${vehicleDesc}.`);
  }

  if (vehicle.vehicleSize) {
    parts.push(`Vehicle size category: ${vehicle.vehicleSize}.`);
  }

  parts.push('This is a UK right-hand-drive vehicle. Establish which end of the vehicle each photo shows before naming panels — the front number plate is white, the rear is yellow — and remember nearside/offside are from the driver\'s seat, not the camera.');
  parts.push('The vehicle details above come from a registration lookup and describe the SUBJECT of every photo. If they appear to disagree with what you see — a different make, body style or colour — the lookup is what is wrong, not the photographs. Assess the vehicle in the images and do not treat any photo as showing a second vehicle.');
  parts.push('Identify every damaged panel visible in the images. For each panel, specify the damage type, severity, repair method, and your confidence score.');
  parts.push('Respond with JSON only.');

  return parts.join('\n\n');
}
