import { describe, it, expect } from 'vitest';
import { calculateMatrixQuote, deriveMatrixInput, quoteFromPanels } from './matrix-calculator';
import { getActiveScheme } from '../schemes';
import { MatrixPaintCategory } from '../constants/matrix-prices';

const scheme = getActiveScheme('company-2025');
const M = scheme.matrix;

describe('calculateMatrixQuote', () => {
  it('prices a single standard panel with VAT', () => {
    const q = calculateMatrixQuote(
      { panelCount: 1, panelCategory: MatrixPaintCategory.REPAIR_PAINT },
      M,
    );
    const base = M.panelMatrix[1][MatrixPaintCategory.REPAIR_PAINT]!;
    expect(q.subtotal).toBe(base);
    expect(q.vat).toBe(Math.round(base * M.vatRate));
    expect(q.total).toBe(q.subtotal + q.vat);
  });

  it('charges two bumpers as twice the bumper price (double-bumper fix)', () => {
    const one = calculateMatrixQuote(
      { panelCount: 0, bumper: MatrixPaintCategory.REPAIR_PAINT, bumperCount: 1 },
      M,
    );
    const two = calculateMatrixQuote(
      { panelCount: 0, bumper: MatrixPaintCategory.REPAIR_PAINT, bumperCount: 2 },
      M,
    );
    const bumperPrice = M.bumperMatrix[MatrixPaintCategory.REPAIR_PAINT]!;
    expect(one.subtotal).toBe(bumperPrice);
    expect(two.subtotal).toBe(bumperPrice * 2);
    const twoLine = two.lineItems.find((li) => li.code.startsWith('BUMPER_'));
    expect(twoLine?.label).toContain('2×');
  });

  it('charges two mirrors as twice the mirror price', () => {
    const q = calculateMatrixQuote({ panelCount: 0, mirrorCover: true, mirrorCount: 2 }, M);
    expect(q.subtotal).toBe(M.mirrorCoverPrice * 2);
  });

  it('defaults bumper/mirror count to 1 when unset', () => {
    const q = calculateMatrixQuote(
      { panelCount: 0, bumper: MatrixPaintCategory.REPAIR_PAINT },
      M,
    );
    expect(q.subtotal).toBe(M.bumperMatrix[MatrixPaintCategory.REPAIR_PAINT]!);
  });

  it('applies the ADAS uplift to the ex-VAT subtotal', () => {
    const q = calculateMatrixQuote(
      { panelCount: 1, panelCategory: MatrixPaintCategory.REPAIR_PAINT, adasCalibration: true },
      M,
    );
    const base = M.panelMatrix[1][MatrixPaintCategory.REPAIR_PAINT]!;
    expect(q.subtotal).toBe(base + Math.round(base * M.adasCalibrationUplift));
  });

  it('throws when panelCount > 0 but no category is given', () => {
    expect(() => calculateMatrixQuote({ panelCount: 2 }, M)).toThrow();
  });
});

describe('deriveMatrixInput', () => {
  // A real case (CX-20260814-KE53) came back with two rear_bumper entries — a
  // scuff and a crack on the one bumper — and was quoted "2× Bumper — Repair &
  // Paint", £916 too much, then auto-published at that price.
  it('prices one bumper once when the assessment lists it twice', () => {
    const input = deriveMatrixInput([
      { panelName: 'rear_bumper' },
      { panelName: 'rear_bumper' },
    ]);
    expect(input.bumperCount).toBe(1);
    expect(input.panelCount).toBe(0);
  });

  it('still charges for two bumpers when both ends are damaged', () => {
    const input = deriveMatrixInput([
      { panelName: 'front_bumper' },
      { panelName: 'rear_bumper' },
    ]);
    expect(input.bumperCount).toBe(2);
  });

  it('counts a repeated standard panel once', () => {
    const input = deriveMatrixInput([
      { panelName: 'offside_front_door' },
      { panelName: 'offside_front_door' },
      { panelName: 'offside_rear_door' },
    ]);
    expect(input.panelCount).toBe(2);
  });

  it('counts a repeated mirror once', () => {
    const input = deriveMatrixInput([
      { panelName: 'nearside_mirror' },
      { panelName: 'nearside_mirror' },
    ]);
    expect(input.mirrorCount).toBe(1);
  });

  it('maps standard panels to the panel grid and bumpers to the bumper row', () => {
    const input = deriveMatrixInput([
      { panelName: 'nearside_front_wing' },
      { panelName: 'front_bumper' },
    ]);
    expect(input.panelCount).toBe(1);
    expect(input.panelCategory).toBe(MatrixPaintCategory.REPAIR_PAINT);
    expect(input.bumper).toBe(MatrixPaintCategory.REPAIR_PAINT);
    expect(input.bumperCount).toBe(1);
  });

  it('counts front + rear bumper as two bumpers', () => {
    const input = deriveMatrixInput([
      { panelName: 'front_bumper' },
      { panelName: 'rear_bumper' },
    ]);
    expect(input.panelCount).toBe(0);
    expect(input.bumperCount).toBe(2);
  });

  it('a two-bumper case is priced as two bumpers end to end', () => {
    const q = quoteFromPanels(
      [{ panelName: 'front_bumper' }, { panelName: 'rear_bumper' }],
      M,
    );
    expect(q.subtotal).toBe(M.bumperMatrix[MatrixPaintCategory.REPAIR_PAINT]! * 2);
  });
});
