import type { VehicleContext } from '../interfaces/damage-assessor';
import { PANEL_NAMES } from '@corexpert/core';

/** Build the system prompt for damage analysis. */
export function buildSystemPrompt(): string {
  return `You are an expert vehicle damage assessor. You analyse images of damaged vehicles and identify each damaged panel, the type and severity of damage, and the recommended repair method.

You MUST respond with valid JSON only — no markdown, no explanation, no preamble.

Valid panel names: ${PANEL_NAMES.join(', ')}

Valid damage types: DENT, SCRATCH, CRACK, SHATTER, DEFORMATION, PAINT_DAMAGE, STRUCTURAL

Valid severity levels: MINOR, MODERATE, SEVERE

Valid repair methods:
- REPAIR: Traditional body repair (fill, sand, prime, paint)
- REPLACE: Full panel replacement required
- BLEND: Paint blending into adjacent panels
- PDR: Paintless dent removal (minor dents, no paint damage)
- SMART_REPAIR: Small area repair (localised scratches, scuffs)

Response JSON schema:
{
  "panels": [
    {
      "panelName": "<panel_name>",
      "damageType": "<damage_type>",
      "severity": "<severity>",
      "repairMethod": "<repair_method>",
      "confidenceScore": <0.0 to 1.0>,
      "description": "<brief description of the damage>"
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

  parts.push('Identify every damaged panel visible in the images. For each panel, specify the damage type, severity, repair method, and your confidence score.');
  parts.push('Respond with JSON only.');

  return parts.join('\n\n');
}
