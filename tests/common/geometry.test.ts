import { describe, expect, it } from "vitest";
import { angle, dihedral, distance } from "../../src/common/model/Geometry.js";
import { Rotation3 } from "../../src/common/model/Rotation3.js";
import { packCell, parseSymmetryOperator, UnitCell } from "../../src/common/model/UnitCell.js";

describe("measurements", () => {
  it("computes distance, angle and dihedral", () => {
    expect(distance([0, 0, 0], [3, 4, 0])).toBeCloseTo(5);
    expect(angle([1, 0, 0], [0, 0, 0], [0, 1, 0])).toBeCloseTo(90);
    expect(dihedral([1, 0, 0], [0, 0, 0], [0, 0, 1], [0, 1, 1])).toBeCloseTo(90);
    expect(dihedral([1, 0, 0], [0, 0, 0], [0, 0, 1], [-1, 0, 1])).toBeCloseTo(180);
  });
});

describe("Rotation3", () => {
  it("rotates and stays orthonormal under composition", () => {
    let r = Rotation3.IDENTITY;
    for (let i = 0; i < 360; i++) {
      r = r.rotatedAboutScreenAxis([0.6, 0.8, 0], 1);
    }
    const out: [number, number, number] = [0, 0, 0];
    r.apply(1, 0, 0, out);
    expect(Math.hypot(...out)).toBeCloseTo(1, 10);
    expect(out[0]).toBeCloseTo(1, 6);
  });
});

describe("UnitCell", () => {
  it("orthogonalises a hexagonal cell", () => {
    const cell = new UnitCell({ a: 4.9, b: 4.9, c: 5.4, alpha: 90, beta: 90, gamma: 120 });
    const b = cell.toCartesian([0, 1, 0]);
    expect(b[0]).toBeCloseTo(-2.45);
    const f = cell.toFractional(cell.toCartesian([0.25, 0.5, 0.75]));
    expect(f[0]).toBeCloseTo(0.25);
    expect(f[1]).toBeCloseTo(0.5);
    expect(f[2]).toBeCloseTo(0.75);
  });

  it("parses symmetry operators", () => {
    const op = parseSymmetryOperator("-y,x-y,1/3+z")!;
    expect(op.rotation).toEqual([0, -1, 0, 1, -1, 0, 0, 0, 1]);
    expect(op.translation[2]).toBeCloseTo(1 / 3);
    expect(parseSymmetryOperator("1/2+x, 1/2-y, -z")?.translation).toEqual([0.5, 0.5, 0]);
    expect(parseSymmetryOperator("nonsense")).toBeNull();
  });

  it("packs a simple cubic site onto all eight corners", () => {
    const packed = packCell([{ fractional: [0, 0, 0], data: 1 }], [], [1, 1, 1]);
    expect(packed).toHaveLength(8);
  });
});
