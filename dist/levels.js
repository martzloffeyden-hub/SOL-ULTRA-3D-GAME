// HÉLIO: hand-authored flight lines. Gate normals face the approach;
// completing a gate means crossing its plane from positive to negative.
function flightLine(seed, specifications) {
  let previous = seed;
  return specifications.map(([pos, radius, phase]) => {
    const direction = previous.map((value, axis) => value - pos[axis]);
    const length = Math.hypot(...direction);
    previous = pos;
    return {
      pos,
      normal: direction.map((value) => value / length),
      radius,
      phase,
    };
  });
}

export const LEVELS = [
  {
    name: "L’Éveil",
    subtitle: "I · LES TERRASSES DU MATIN",
    description:
      "Le jardin attend son premier souffle. Ramenez la lumière à sa source.",
    start: [0, 7, 16],
    seed: [0, 7, 9],
    gates: flightLine(
      [0, 7, 9],
      [
        [[0, 7, 0], 4.0, null],
        [[2, 10, -9], 3.8, null],
        [[0, 13, -18], 3.6, 0],
      ],
    ),
    altar: [0, 13, -28],
    hazards: [
      { pos: [-6.7, 8.7, -4.5], radius: 1.5 },
      { pos: [7.2, 12, -13], radius: 1.6 },
    ],
    hint: "Approchez la graine. Espace monte, C descend. Traversez les anneaux dans l’ordre.",
    color: "#ffc879",
  },
  {
    name: "Le Dialogue",
    subtitle: "II · LES JARDINS JUMEAUX",
    description:
      "Deux lumières se répondent. Changez de résonance pour franchir leurs couronnes.",
    start: [0, 13, -28],
    seed: [0, 13, -31],
    gates: flightLine(
      [0, 13, -31],
      [
        [[-7, 14, -39], 3.7, 1],
        [[-14, 18, -49], 3.5, 0],
        [[-5, 21, -60], 3.4, 1],
        [[7, 18, -69], 3.3, 0],
      ],
    ),
    altar: [7, 18, -79],
    hazards: [
      { pos: [-3, 14.5, -42], radius: 1.4 },
      { pos: [-13, 15, -56], radius: 1.5 },
      { pos: [3.5, 24.5, -64], radius: 1.5 },
    ],
    hint: "X alterne ambre et azur. Accordez votre lumière à celle de l’anneau.",
    color: "#8be4eb",
  },
  {
    name: "L’Envol",
    subtitle: "III · LA COURONNE CÉLESTE",
    description:
      "Au-dessus des dernières pierres, tissez le chemin qui réveillera le soleil.",
    start: [7, 18, -79],
    seed: [7, 18, -82],
    gates: flightLine(
      [7, 18, -82],
      [
        [[11, 21, -91], 3.6, 1],
        [[0, 27, -102], 3.3, 0],
        [[-14, 28, -113], 3.2, 1],
        [[-4, 22, -124], 3.2, 0],
        [[9, 30, -135], 3.1, 1],
      ],
    ),
    altar: [9, 30, -146],
    hazards: [
      { pos: [11.5, 25.5, -97], radius: 1.5 },
      { pos: [-6.5, 23.5, -107], radius: 1.6 },
      { pos: [-12.5, 20.5, -120], radius: 1.6 },
      { pos: [4.8, 31.8, -128], radius: 1.6 },
    ],
    hint: "Freinez avant chaque virage. La graine suit votre trajectoire, pas votre regard.",
    color: "#ffe7ac",
  },
];
