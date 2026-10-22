import test from "node:test";
import assert from "node:assert/strict";
import { crossing, sphereContact, constrainTether } from "../dist/physics.js";
import { LEVELS } from "../dist/levels.js";

const gate = { pos: [0, 0, 0], normal: [0, 0, 1], radius: 3 };
const near = (actual, expected, tolerance = 1e-10) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} ≠ ${expected}`,
  );
};

test("a fast segment is judged at the plane, even when its endpoint is outside the ring", () => {
  assert.equal(crossing([0, 0, 20], [4, 0, -20], gate), true);
  assert.equal(crossing([8, 0, 20], [0, 0, -20], gate), false);
});

test("only an approach-side crossing completes a ring", () => {
  assert.equal(crossing([0, 0, -2], [0, 0, 2], gate), false);
  assert.equal(crossing([0, 0, 2], [0, 0, 1], gate), false);
  assert.equal(crossing([0, 0, -1], [0, 0, -2], gate), false);
  assert.equal(crossing([0, 0, 2], [0, 0, -2], gate), true);
});

test("the quarter-unit collision margin excludes the ring rim", () => {
  assert.equal(crossing([2.75, 0, 2], [2.75, 0, -2], gate), true);
  assert.equal(crossing([2.751, 0, 2], [2.751, 0, -2], gate), false);
  assert.equal(crossing([0, 2.9, 2], [0, 2.9, -2], gate), false);
});

test("landing exactly on the plane counts once", () => {
  assert.equal(crossing([0, 0, 2], [0, 0, 0], gate), true);
  assert.equal(crossing([0, 0, 0], [0, 0, -2], gate), false);
  assert.equal(crossing([0, 0, 0], [0, 0, 0], gate), false);
});

test("translated, tilted gates use their own plane", () => {
  const s = Math.SQRT1_2;
  const tilted = { pos: [3, 2, -1], normal: [s, 0, s], radius: 3 };
  const point = (depth, lateral) => [
    3 + depth * s + lateral * s,
    2,
    -1 + depth * s - lateral * s,
  ];
  assert.equal(crossing(point(9, 2), point(-9, 2), tilted), true);
  assert.equal(crossing(point(9, 3), point(-9, 3), tilted), false);
});

test("sphere contact gives an outward unit normal and exact penetration", () => {
  const contact = sphereContact([4, 6, 3], [1, 2, 3], 7);
  assert.deepEqual(contact.normal, [0.6, 0.8, 0]);
  assert.equal(contact.penetration, 2);
  near(Math.hypot(...contact.normal), 1);
  const separated = [4, 6, 3].map(
    (value, axis) => value + contact.normal[axis] * contact.penetration,
  );
  near(
    Math.hypot(...separated.map((value, axis) => value - [1, 2, 3][axis])),
    7,
  );
});

test("coincident sphere centers remain finite and deterministic", () => {
  assert.deepEqual(sphereContact([1, 2, 3], [1, 2, 3], 4), {
    normal: [0, 1, 0],
    penetration: 4,
  });
  assert.equal(sphereContact([5, 2, 3], [1, 2, 3], 4), null);
  assert.equal(sphereContact([6, 2, 3], [1, 2, 3], 4), null);
});

test("tether clamps its length without changing direction or mutating inputs", () => {
  const player = [1, 2, 3];
  const seed = [7, 10, 3];
  assert.deepEqual(constrainTether(player, seed, 5), [4, 6, 3]);
  assert.deepEqual(player, [1, 2, 3]);
  assert.deepEqual(seed, [7, 10, 3]);
  const free = constrainTether(player, seed, 12);
  assert.deepEqual(free, seed);
  assert.notEqual(free, seed);
  assert.deepEqual(constrainTether(player, seed, 0), player);
  assert.deepEqual(constrainTether(player, player, 0), player);
});

test("every authored gate faces its approach and leaves room for the seed tether", () => {
  for (const level of LEVELS) {
    let previous = level.seed;
    for (const current of level.gates) {
      near(Math.hypot(...current.normal), 1);
      const segment = current.pos.map((value, axis) => value - previous[axis]);
      assert.ok(
        Math.hypot(...segment) > current.radius * 2,
        `${level.name}: gates too close`,
      );
      const beyond = current.pos.map(
        (value, axis) => value - current.normal[axis],
      );
      assert.equal(
        crossing(previous, beyond, current),
        true,
        `${level.name}: unreachable aperture`,
      );
      previous = current.pos;
    }
    assert.ok(
      Math.hypot(...level.altar.map((value, axis) => value - previous[axis])) >=
        9,
    );
  }
});
