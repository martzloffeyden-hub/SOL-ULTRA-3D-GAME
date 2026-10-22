/** True once a movement segment crosses the usable aperture from its approach side. */
export function crossing(previous, current, gate) {
  const { pos, normal, radius } = gate;
  const before =
    (previous[0] - pos[0]) * normal[0] +
    (previous[1] - pos[1]) * normal[1] +
    (previous[2] - pos[2]) * normal[2];
  const after =
    (current[0] - pos[0]) * normal[0] +
    (current[1] - pos[1]) * normal[1] +
    (current[2] - pos[2]) * normal[2];
  // Starting on the plane does not count again on the next simulation step.
  if (before <= 0 || after > 0) return false;
  const fraction = before / (before - after);
  const dx = previous[0] + (current[0] - previous[0]) * fraction - pos[0];
  const dy = previous[1] + (current[1] - previous[1]) * fraction - pos[1];
  const dz = previous[2] + (current[2] - previous[2]) * fraction - pos[2];
  const aperture = Math.max(0, radius - 0.25);
  return dx * dx + dy * dy + dz * dz <= aperture * aperture;
}

/** Outward contact normal and minimum separation distance for a point inside a sphere. */
export function sphereContact(position, center, radius) {
  const dx = position[0] - center[0];
  const dy = position[1] - center[1];
  const dz = position[2] - center[2];
  const distance = Math.hypot(dx, dy, dz);
  if (distance >= radius) return null;
  // Deterministic upward ejection avoids NaNs at the exact obstacle center.
  const normal =
    distance > 0 ? [dx / distance, dy / distance, dz / distance] : [0, 1, 0];
  return { normal, penetration: radius - distance };
}

/** Return a fresh seed position, preserving its direction while limiting the tether. */
export function constrainTether(player, seed, maxLength) {
  const delta = seed.map((value, axis) => value - player[axis]);
  const distance = Math.hypot(...delta);
  const limit = Math.max(0, maxLength);
  if (distance <= limit) return [...seed];
  const ratio = limit / distance;
  return player.map((value, axis) => value + delta[axis] * ratio);
}
