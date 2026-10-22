import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../dist/vendor/three.module.js";
import { createWorld } from "../dist/world.js";
import { LEVELS } from "../dist/levels.js";

const scene = new THREE.Scene();
const world = createWorld(scene);

test("solid terrace contacts are finite, outward, and resolve at the top", () => {
  const p = new THREE.Vector3(-24, -0.35, -8);
  const original = p.clone();
  const contact = world.collide(p, 0.6);
  assert.ok(contact);
  assert.ok(Math.abs(contact.normal.length() - 1) < 1e-8);
  assert.ok(contact.penetration > 0);
  assert.ok(contact.normal.y > 0.99);
  assert.ok(p.equals(original));
  p.addScaledVector(contact.normal, contact.penetration + 0.002);
  assert.equal(world.collide(p, 0.6), null);
});

test("every segment connecting the complete authored journey stays clear of terraces", () => {
  let samples = 0;
  for (const level of LEVELS) {
    const route = [
      level.start,
      level.seed,
      ...level.gates.map((g) => g.pos),
      level.altar,
    ].map((p) => new THREE.Vector3(...p));
    for (let segment = 1; segment < route.length; segment++) {
      for (let i = 0; i <= 100; i++) {
        const p = route[segment - 1].clone().lerp(route[segment], i / 100);
        assert.equal(
          world.collide(p, 0.8),
          null,
          `Blocked route ${level.name} at ${p.toArray()}`,
        );
        samples++;
      }
    }
  }
  assert.equal(samples, 1818);
});

test("final sunrise advances and resets for replay", () => {
  const sky = world.root.children.find((m) => m.material?.uniforms?.awakening);
  assert.ok(sky);
  world.awaken();
  for (let i = 0; i < 720; i++)
    world.update(i / 60, 1 / 60, 2, new THREE.Vector3());
  assert.ok(sky.material.uniforms.awakening.value > 0.99);
  world.resetAwakening();
  assert.equal(sky.material.uniforms.awakening.value, 0);
});
