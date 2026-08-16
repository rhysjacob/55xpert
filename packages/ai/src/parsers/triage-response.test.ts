import { describe, it, expect } from 'vitest';
import { parseTriageResponse } from './triage-response';

const panel = (panelName: string, fromImageNumber: number, extra: Record<string, unknown> = {}) => ({
  panelName,
  fromImageNumber,
  damageType: 'SCRATCH',
  severity: 'MODERATE',
  repairMethod: 'REPAIR',
  confidenceScore: 0.8,
  description: 'scuffing',
  sizeEstimateCm: 25,
  sizeConfidence: 0.6,
  ...extra,
});

const parse = (body: Record<string, unknown>) =>
  parseTriageResponse(JSON.stringify(body), 'test-model', 0.7);

describe('parseTriageResponse — panels contradicted by the image findings', () => {
  // The shape of CX-20260816-FPE2: the only REAR photo is the plate shot and it
  // is undamaged, both FRONT photos show the damage, and the close-up the model
  // could not orient is nonetheless returned as a rear bumper.
  const FPE2 = {
    imageFindings: [
      { imageNumber: 1, end: 'REAR', showsDamage: false, visibleCues: 'yellow plate' },
      { imageNumber: 2, end: 'FRONT', showsDamage: false, visibleCues: 'white plate, grille' },
      { imageNumber: 3, end: 'UNCLEAR', showsDamage: true, visibleCues: 'dark bumper, no plate' },
      { imageNumber: 4, end: 'FRONT', showsDamage: true, visibleCues: 'grille, front bumper' },
    ],
    panels: [panel('front_bumper', 4), panel('rear_bumper', 3, { sizeEstimateCm: 35 })],
    overallConfidence: 'MEDIUM',
    summary: 'damage',
    requiresHumanReview: false,
  };

  it('drops an end the photographs do not support', () => {
    const result = parse(FPE2);
    expect(result.panels.map((p) => p.panelName)).toEqual(['front_bumper']);
  });

  it('forces human review when it drops one', () => {
    expect(parse(FPE2).requiresHumanReview).toBe(true);
  });

  it('keeps the raw response intact for audit', () => {
    const raw = parse(FPE2).rawResponse as { panels: unknown[] };
    expect(raw.panels).toHaveLength(2);
  });

  it('keeps a panel cited from an image the model did orient', () => {
    // Same contradiction on the face of it, but image 3 is a definite REAR, so
    // this is the model reading a photograph rather than guessing past one.
    const result = parse({
      ...FPE2,
      imageFindings: FPE2.imageFindings.map((f) =>
        f.imageNumber === 3 ? { ...f, end: 'REAR' } : f,
      ),
    });
    expect(result.panels.map((p) => p.panelName)).toEqual(['front_bumper', 'rear_bumper']);
  });

  it('keeps an unclear-cited panel when that end does have damage elsewhere', () => {
    const result = parse({
      ...FPE2,
      imageFindings: FPE2.imageFindings.map((f) =>
        f.imageNumber === 1 ? { ...f, showsDamage: true } : f,
      ),
    });
    expect(result.panels.map((p) => p.panelName)).toEqual(['front_bumper', 'rear_bumper']);
  });

  it('leaves panels alone when the model returned no findings', () => {
    const { imageFindings: _omitted, ...noFindings } = FPE2;
    const result = parse(noFindings);
    expect(result.panels.map((p) => p.panelName)).toEqual(['front_bumper', 'rear_bumper']);
    expect(result.requiresHumanReview).toBe(false);
  });

  it('never drops a panel with no front/rear in its name', () => {
    const result = parse({
      ...FPE2,
      panels: [panel('bonnet', 3), panel('rear_bumper', 3)],
    });
    expect(result.panels.map((p) => p.panelName)).toEqual(['bonnet']);
  });

  it('matches raw panels by index after invalid ones are discarded', () => {
    // The malformed first entry is dropped before reconciliation; if the two
    // arrays fell out of step, `rear_bumper` would read image 4's finding.
    const result = parse({
      ...FPE2,
      panels: [{ panelName: 'front_wing' }, panel('rear_bumper', 3)],
    });
    expect(result.panels).toHaveLength(0);
  });
});

describe('end detection covers the whole panel vocabulary', () => {
  const findings = [
    { imageNumber: 1, end: 'REAR', showsDamage: false },
    { imageNumber: 2, end: 'FRONT', showsDamage: true },
    { imageNumber: 3, end: 'UNCLEAR', showsDamage: true },
  ];
  const run = (panelName: string) =>
    parse({
      imageFindings: findings,
      panels: [panel(panelName, 3)],
      overallConfidence: 'MEDIUM',
      summary: 's',
      requiresHumanReview: false,
    }).panels.map((p) => p.panelName);

  // Rear-of-vehicle panels named off an unorientable close-up, with no rear
  // photo showing damage — every one of these must be dropped, not just the
  // ones that happen to start with "rear_".
  it.each(['rear_bumper', 'nearside_rear_quarter', 'offside_rear_door', 'tailgate', 'boot_lid', 'nearside_tail_light'])(
    'drops unsupported %s',
    (name) => expect(run(name)).toEqual([]),
  );

  // Front-of-vehicle panels agree with where the damage actually is, so they stay.
  it.each(['front_bumper', 'nearside_front_wing', 'grille', 'offside_headlight'])(
    'keeps supported %s',
    (name) => expect(run(name)).toEqual([name]),
  );

  // No end in the name at all — never our call to drop.
  it.each(['roof', 'nearside_sill', 'offside_mirror'])(
    'never judges %s',
    (name) => expect(run(name)).toEqual([name]),
  );
});
