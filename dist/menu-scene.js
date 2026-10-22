import * as THREE from "./vendor/three.module.js";
import { FontLoader } from "./vendor/FontLoader.js";
import { TextGeometry } from "./vendor/TextGeometry.js";

// This is an independent, spatial menu stage: all architecture, title lettering
// and selectable plaques are lit 3D objects. The DOM supplies semantic controls.
export async function createMenuScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#061b25");
  scene.fog = new THREE.FogExp2("#071e29", 0.025);
  const camera = new THREE.PerspectiveCamera(
    38,
    innerWidth / innerHeight,
    0.1,
    120,
  );
  const cameraHome = new THREE.Vector3(0, 3.5, 25);
  const aimHome = new THREE.Vector3(0, 0.8, 0);
  camera.position.copy(cameraHome);
  camera.lookAt(aimHome);
  camera.updateMatrixWorld();
  const root = new THREE.Group();
  scene.add(root);
  const hero = new THREE.Group();
  root.add(hero);
  const front = new THREE.Group();
  root.add(front);
  const dustRoot = new THREE.Group();
  scene.add(dustRoot);
  const materials = {
    brass: new THREE.MeshStandardMaterial({
      color: "#b89155",
      metalness: 0.77,
      roughness: 0.3,
    }),
    edge: new THREE.MeshStandardMaterial({
      color: "#dfbb7c",
      metalness: 0.66,
      roughness: 0.27,
    }),
    etched: new THREE.MeshStandardMaterial({
      color: "#736853",
      metalness: 0.68,
      roughness: 0.48,
    }),
    stone: new THREE.MeshStandardMaterial({
      color: "#b8b9a5",
      metalness: 0.12,
      roughness: 0.74,
    }),
    pale: new THREE.MeshStandardMaterial({
      color: "#e7deba",
      metalness: 0.3,
      roughness: 0.46,
    }),
    dark: new THREE.MeshStandardMaterial({
      color: "#10353c",
      metalness: 0.4,
      roughness: 0.52,
    }),
    clay: new THREE.MeshStandardMaterial({
      color: "#684b41",
      metalness: 0.13,
      roughness: 0.9,
      flatShading: true,
    }),
    ink: new THREE.MeshStandardMaterial({
      color: "#10272d",
      metalness: 0.4,
      roughness: 0.4,
    }),
    glow: new THREE.MeshBasicMaterial({ color: "#f2d49a" }),
    cyan: new THREE.MeshBasicMaterial({ color: "#7accc5" }),
    leaf: new THREE.MeshStandardMaterial({
      color: "#4d978d",
      emissive: "#174d4e",
      emissiveIntensity: 0.35,
      metalness: 0.2,
      roughness: 0.6,
    }),
  };
  scene.add(new THREE.HemisphereLight("#9eb8b1", "#091b28", 1.8));
  const key = new THREE.DirectionalLight("#ffe1a8", 4.2);
  key.position.set(-8, 14, 14);
  scene.add(key);
  const rim = new THREE.DirectionalLight("#4ca6b1", 3.4);
  rim.position.set(12, 6, -9);
  scene.add(rim);
  const lower = new THREE.PointLight("#f0a762", 18, 30, 2);
  lower.position.set(4, -1, 8);
  scene.add(lower);
  const coreLight = new THREE.PointLight("#ffd88f", 14, 14, 2);
  hero.add(coreLight);
  const goldTint = new THREE.Color("#ffe0a2"),
    moonTint = new THREE.Color("#8dded8");
  let currentMode = "menu",
    currentChapter = 0,
    saved = false,
    hovered = null,
    modeAmount = 0,
    departure = 0;
  let aspect = 0,
    reducedMotion = false,
    frozenTime = 0;
  const random = (() => {
    let value = 80631;
    return () =>
      ((value = (Math.imul(value, 1664525) + 1013904223) | 0) >>> 0) /
      4294967296;
  })();
  const rand = (min, max) => min + random() * (max - min);
  const add = (geo, mat, parent = hero, position) => {
    const object = new THREE.Mesh(geo, mat);
    if (position) object.position.set(...position);
    parent.add(object);
    return object;
  };
  const lineMaterial = new THREE.LineBasicMaterial({
    color: "#96b5a6",
    transparent: true,
    opacity: 0.2,
  });
  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = glowCanvas.height = 128;
  const gc = glowCanvas.getContext("2d"),
    gradient = gc.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,255,255,.95)");
  gradient.addColorStop(0.12, "rgba(255,255,255,.65)");
  gradient.addColorStop(0.35, "rgba(255,255,255,.12)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  gc.fillStyle = gradient;
  gc.fillRect(0, 0, 128, 128);
  const glowMap = new THREE.CanvasTexture(glowCanvas);
  function glow(parent, color, size, opacity = 1) {
    const object = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowMap,
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    object.scale.setScalar(size);
    parent.add(object);
    return object;
  }

  // Broad atmospheric disc and an offset eclipsing body frame the metalwork.
  const backdrop = new THREE.Group();
  backdrop.position.set(6, 3, -18);
  scene.add(backdrop);
  const eclipse = add(
    new THREE.CircleGeometry(8.4, 96),
    new THREE.MeshBasicMaterial({
      color: "#b99569",
      transparent: true,
      opacity: 0.13,
      depthWrite: false,
    }),
    backdrop,
  );
  add(
    new THREE.CircleGeometry(7.7, 96),
    new THREE.MeshBasicMaterial({ color: "#092432" }),
    backdrop,
    [0.36, 0.4, 0.02],
  );
  const backgroundHalo = glow(backdrop, "#d1ac71", 29, 0.16);
  backgroundHalo.position.z = -0.1;
  const stars = new Float32Array(260 * 3);
  for (let i = 0; i < 260; i++)
    stars.set([rand(-35, 35), rand(-11, 26), rand(-38, -16)], i * 3);
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(stars, 3));
  const starField = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({
      color: "#99c5bb",
      size: 0.055,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    }),
  );
  scene.add(starField);
  // Sparse constellations keep the left side quiet enough to read.
  for (let i = 0; i < 3; i++) {
    const points = [];
    const bx = 8 + i * 4,
      by = 6 + i * 0.8;
    for (let j = 0; j < 5; j++)
      points.push(
        new THREE.Vector3(
          bx + Math.sin(j * 2 + i) * 2,
          by + j * 1.25,
          -16 - i * 3,
        ),
      );
    const constellation = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      lineMaterial,
    );
    scene.add(constellation);
  }

  // The astrolabe's concentric gimbals have separate axes and real thickness.
  const gimbals = [];
  const tickGeometry = new THREE.BoxGeometry(0.028, 0.19, 0.044);
  const crystalGeometry = new THREE.OctahedronGeometry(0.14, 0);
  const matrixObject = new THREE.Object3D();
  const ringSpecs = [
    { r: 4.18, thickness: 0.15, tilt: [0.18, -0.22, 0.1], speed: 0.055 },
    { r: 3.54, thickness: 0.095, tilt: [0.62, 0.52, -0.16], speed: -0.085 },
    { r: 2.77, thickness: 0.075, tilt: [-0.32, 1.02, 0.33], speed: 0.12 },
  ];
  ringSpecs.forEach((spec, index) => {
    const gimbal = new THREE.Group();
    gimbal.rotation.set(...spec.tilt);
    hero.add(gimbal);
    add(
      new THREE.TorusGeometry(spec.r, spec.thickness, 8, 112),
      index === 0 ? materials.pale : materials.brass,
      gimbal,
    );
    add(
      new THREE.TorusGeometry(spec.r + 0.2, 0.026, 5, 112),
      materials.edge,
      gimbal,
    );
    const inner = add(
      new THREE.TorusGeometry(spec.r - 0.17, 0.018, 4, 112),
      index === 1 ? materials.cyan : materials.glow,
      gimbal,
    );
    const ticks = new THREE.InstancedMesh(
      tickGeometry,
      materials.edge,
      index === 0 ? 96 : 64,
    );
    for (let j = 0; j < ticks.count; j++) {
      const a = (j / ticks.count) * Math.PI * 2;
      matrixObject.position.set(
        Math.cos(a) * spec.r,
        Math.sin(a) * spec.r,
        0.13,
      );
      matrixObject.rotation.set(0, 0, a - Math.PI / 2);
      matrixObject.scale.set(1, j % 8 === 0 ? 1.75 : 1, 1);
      matrixObject.updateMatrix();
      ticks.setMatrixAt(j, matrixObject.matrix);
    }
    gimbal.add(ticks);
    const studs = new THREE.InstancedMesh(
      crystalGeometry,
      index === 1 ? materials.cyan : materials.edge,
      8,
    );
    for (let j = 0; j < 8; j++) {
      const a = (j / 8) * Math.PI * 2;
      matrixObject.position.set(
        Math.cos(a) * (spec.r + 0.2),
        Math.sin(a) * (spec.r + 0.2),
        0,
      );
      matrixObject.rotation.set(0, 0, a);
      matrixObject.scale.setScalar(j % 2 ? 1 : 1.4);
      matrixObject.updateMatrix();
      studs.setMatrixAt(j, matrixObject.matrix);
    }
    gimbal.add(studs);
    gimbals.push({
      object: gimbal,
      speed: spec.speed,
      base: spec.tilt.slice(),
      inner,
    });
  });
  const central = new THREE.Group();
  hero.add(central);
  const seedMaterial = new THREE.MeshStandardMaterial({
    color: "#fff2bd",
    emissive: "#ffc16e",
    emissiveIntensity: 2.5,
    metalness: 0.36,
    roughness: 0.18,
    flatShading: true,
  });
  const seed = add(
    new THREE.IcosahedronGeometry(0.62, 1),
    seedMaterial,
    central,
  );
  seed.scale.set(0.72, 1.25, 0.72);
  const seedHalo = glow(central, "#ffdca0", 5.5, 0.9);
  const innerOrbit = add(
    new THREE.TorusGeometry(1.12, 0.028, 5, 64),
    materials.glow,
    central,
  );
  innerOrbit.rotation.x = 0.8;
  const innerOrbit2 = add(
    new THREE.TorusGeometry(1.52, 0.02, 5, 64),
    materials.cyan,
    central,
  );
  innerOrbit2.rotation.set(1.2, 0.6, 0.5);
  const coreCrown = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.075, 0.45, 4),
    materials.edge,
    12,
  );
  for (let j = 0; j < 12; j++) {
    const a = (j / 12) * Math.PI * 2;
    matrixObject.position.set(Math.sin(a) * 0.98, Math.cos(a) * 0.98, 0);
    matrixObject.rotation.set(0, 0, -a);
    matrixObject.scale.setScalar(1);
    matrixObject.updateMatrix();
    coreCrown.setMatrixAt(j, matrixObject.matrix);
  }
  central.add(coreCrown);
  // Pivot caps and the vertical spindle make the instrument feel functional.
  add(new THREE.CylinderGeometry(0.12, 0.12, 9.2, 12), materials.brass, hero);
  for (const side of [-1, 1]) {
    add(new THREE.SphereGeometry(0.32, 12, 8), materials.edge, hero, [
      0,
      side * 4.55,
      0,
    ]);
    const finial = add(
      new THREE.ConeGeometry(0.23, 0.65, 6),
      materials.pale,
      hero,
      [0, side * 4.9, 0],
    );
    finial.rotation.z = side === 1 ? 0 : Math.PI;
  }

  // The hanging pedestal is a stack of stepped, carved stone and brass.
  const dais = new THREE.Group();
  hero.add(dais);
  dais.position.y = -5.2;
  add(new THREE.CylinderGeometry(3.72, 3.9, 0.22, 72), materials.pale, dais);
  add(
    new THREE.CylinderGeometry(3.87, 3.45, 0.25, 72),
    materials.brass,
    dais,
    [0, -0.2, 0],
  );
  add(
    new THREE.CylinderGeometry(3.45, 2.9, 0.65, 12),
    materials.dark,
    dais,
    [0, -0.65, 0],
  );
  add(
    new THREE.CylinderGeometry(2.9, 2.1, 0.8, 9),
    materials.clay,
    dais,
    [0, -1.35, 0],
  );
  add(
    new THREE.CylinderGeometry(2.12, 0.8, 1.1, 8),
    materials.dark,
    dais,
    [0, -2.25, 0],
  );
  const floorRing = add(
    new THREE.TorusGeometry(3.2, 0.025, 5, 96),
    materials.edge,
    dais,
    [0, 0.13, 0],
  );
  floorRing.rotation.x = Math.PI / 2;
  const innerFloorRing = add(
    new THREE.TorusGeometry(2.65, 0.016, 5, 96),
    materials.etched,
    dais,
    [0, 0.135, 0],
  );
  innerFloorRing.rotation.x = Math.PI / 2;
  const petalGeometry = new THREE.ConeGeometry(0.22, 0.9, 3);
  const leaves = new THREE.InstancedMesh(petalGeometry, materials.leaf, 48);
  const plants = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.022, 0.03, 0.65, 5),
    materials.brass,
    16,
  );
  for (let j = 0; j < 16; j++) {
    const a = (j / 16) * Math.PI * 2,
      rr = 3.3;
    matrixObject.position.set(Math.sin(a) * rr, 0.4, Math.cos(a) * rr);
    matrixObject.rotation.set(0, a, 0);
    matrixObject.scale.setScalar(0.7 + random() * 0.4);
    matrixObject.updateMatrix();
    plants.setMatrixAt(j, matrixObject.matrix);
    for (let k = 0; k < 3; k++) {
      matrixObject.position.set(
        Math.sin(a) * rr,
        0.4 + k * 0.16,
        Math.cos(a) * rr,
      );
      matrixObject.rotation.set(0.6 + k * 0.3, a + k * 2.1, 0.7);
      matrixObject.scale.setScalar(0.6 + k * 0.12);
      matrixObject.updateMatrix();
      leaves.setMatrixAt(j * 3 + k, matrixObject.matrix);
    }
  }
  dais.add(leaves, plants);
  const rootPositions = [];
  for (let j = 0; j < 12; j++) {
    const a = (j / 12) * Math.PI * 2;
    const x = Math.cos(a) * 2.1,
      z = Math.sin(a) * 2.1;
    for (let k = 0; k < 4; k++)
      rootPositions.push(x + Math.sin(k + j) * 0.16, -2 - k * 0.5, z);
  }
  const rootGeo = new THREE.BufferGeometry();
  rootGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(rootPositions, 3),
  );
  dais.add(
    new THREE.LineSegments(
      rootGeo,
      new THREE.LineBasicMaterial({
        color: "#729a8c",
        transparent: true,
        opacity: 0.34,
      }),
    ),
  );

  // A cropped observatory arch behind the hero gives the stage human scale.
  const architecture = new THREE.Group();
  architecture.position.set(6, -4, -6);
  scene.add(architecture);
  const arch = add(
    new THREE.TorusGeometry(8.8, 0.11, 6, 128, Math.PI * 1.65),
    materials.etched,
    architecture,
  );
  arch.rotation.z = -0.34;
  const archInner = add(
    new THREE.TorusGeometry(8.25, 0.024, 4, 128, Math.PI * 1.75),
    materials.brass,
    architecture,
  );
  archInner.rotation.z = -0.48;
  const pillars = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.18, 0.24, 7, 8),
    materials.dark,
    4,
  );
  for (let j = 0; j < 4; j++) {
    const x = j < 2 ? -7.6 : 7.6,
      z = j % 2 ? 1 : -1;
    matrixObject.position.set(x, 0, z);
    matrixObject.rotation.set(0, 0, 0);
    matrixObject.scale.setScalar(1);
    matrixObject.updateMatrix();
    pillars.setMatrixAt(j, matrixObject.matrix);
  }
  architecture.add(pillars);
  const terraces = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(1, 0.68, 1, 8),
    materials.dark,
    10,
  );
  for (let j = 0; j < 10; j++) {
    matrixObject.position.set(rand(-28, 28), rand(-15, -7), rand(-30, -8));
    matrixObject.rotation.set(0, rand(0, 6), 0);
    matrixObject.scale.set(rand(2.5, 6), rand(0.6, 2), rand(2.5, 6));
    matrixObject.updateMatrix();
    terraces.setMatrixAt(j, matrixObject.matrix);
  }
  scene.add(terraces);

  const motes = new Float32Array(180 * 3),
    moteBase = [];
  for (let j = 0; j < 180; j++) {
    const p = [rand(-5.5, 5.5), rand(-6, 6), rand(-3.5, 3.5)];
    motes.set(p, j * 3);
    moteBase.push(p);
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute("position", new THREE.BufferAttribute(motes, 3));
  const moteCloud = new THREE.Points(
    moteGeo,
    new THREE.PointsMaterial({
      color: "#c9c398",
      map: glowMap,
      size: 0.08,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  hero.add(moteCloud);

  // Deep plaque bodies, bevels, dividers and engraved indicators exist in space.
  const plaques = {};
  const plaqueGeometry = new THREE.BoxGeometry(7.15, 1.15, 0.2);
  for (const id of ["start", "continue", "settings", "guide"]) {
    const object = new THREE.Group();
    front.add(object);
    const material = materials.ink.clone();
    const body = add(plaqueGeometry, material, object);
    const border = new THREE.LineSegments(
      new THREE.EdgesGeometry(plaqueGeometry),
      new THREE.LineBasicMaterial({
        color: "#bba46f",
        transparent: true,
        opacity: 0.65,
      }),
    );
    object.add(border);
    const accent = add(
      new THREE.BoxGeometry(0.035, 0.36, 0.03),
      materials.edge,
      object,
      [-3.27, 0, 0.13],
    );
    const rightMarker = add(
      new THREE.TorusGeometry(0.12, 0.012, 4, 24),
      materials.edge,
      object,
      [3.12, 0, 0.13],
    );
    const glowLine = add(
      new THREE.BoxGeometry(6.5, 0.014, 0.015),
      new THREE.MeshBasicMaterial({
        color: "#a4c1ad",
        transparent: true,
        opacity: 0.25,
      }),
      object,
      [0, -0.565, 0.12],
    );
    const nodeGlow = glow(object, "#eac68b", 1.2, 0);
    nodeGlow.position.set(-3.1, 0, 0.2);
    plaques[id] = {
      object,
      material,
      border,
      accent,
      rightMarker,
      glowLine,
      nodeGlow,
      hover: 0,
      y: 0,
    };
  }
  const titleGroup = new THREE.Group();
  front.add(titleGroup);
  let titleMesh = null,
    titleReady = false;
  try {
    const response = await fetch(
      new URL("./vendor/optimer_regular.typeface.json", import.meta.url),
    );
    if (!response.ok) throw new Error("font unavailable");
    const font = new FontLoader().parse(await response.json());
    const label = font.data.glyphs["É"] ? "HÉLIO" : "HELIO";
    const geometry = new TextGeometry(label, {
      font,
      size: 2.45,
      depth: 0.16,
      curveSegments: 7,
      bevelEnabled: true,
      bevelThickness: 0.018,
      bevelSize: 0.018,
      bevelSegments: 2,
    });
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    geometry.translate(-(bounds.min.x + bounds.max.x) / 2, -bounds.min.y, 0);
    titleMesh = add(geometry, [materials.pale, materials.brass], titleGroup);
    titleReady = true;
  } catch {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 256;
    const x = c.getContext("2d");
    x.fillStyle = "#e6d8b6";
    x.font = "190px Georgia";
    x.textAlign = "center";
    x.fillText("HÉLIO", 512, 208);
    titleMesh = add(
      new THREE.PlaneGeometry(8.3, 2.075),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(c),
        transparent: true,
        depthWrite: false,
      }),
      titleGroup,
      [0, 1, 0],
    );
  }
  const titleUnderline = add(
    new THREE.BoxGeometry(7.7, 0.018, 0.025),
    materials.brass,
    titleGroup,
    [0, -0.38, 0.08],
  );
  const titleSeal = add(
    new THREE.TorusGeometry(0.18, 0.018, 5, 40),
    materials.edge,
    titleGroup,
    [-4.3, 0.75, 0.1],
  );
  const titleSealLine = add(
    new THREE.BoxGeometry(0.65, 0.012, 0.02),
    materials.edge,
    titleGroup,
    [-4.3, 0.75, 0.09],
  );

  function layout(width, height) {
    const next = width / height;
    if (Math.abs(aspect - next) < 0.0001) return;
    aspect = next;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    // The world layout, not just the hit regions, adapts to the viewport.
    const span =
      Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 25 * aspect;
    const uiScale = Math.min(1, Math.max(0.63, (span * 0.84) / 8.3));
    front.scale.setScalar(uiScale);
    front.position.x = -span * 0.49;
    titleGroup.position.set(0, 3.85, 0);
    titleGroup.rotation.y = 0.045;
    hero.position.set(span * 0.43, 1.1, -0.5);
    const heroScale = Math.min(1, Math.max(0.7, (span * 0.42) / 4.5));
    hero.scale.setScalar(heroScale);
    architecture.position.x = hero.position.x + 1;
    backdrop.position.x = hero.position.x + 1;
    positionPlaques();
  }
  function positionPlaques() {
    const order = saved
      ? ["continue", "start", "settings", "guide"]
      : ["start", "settings", "guide"];
    for (const [id, p] of Object.entries(plaques)) {
      const index = order.indexOf(id);
      p.y = 0.72 - index * 1.4;
      p.object.visible = currentMode === "menu" && index >= 0;
      p.object.position.set(0, p.y, 0);
      p.object.rotation.set(-0.025, 0.045, 0);
    }
    titleGroup.visible = currentMode === "menu";
  }
  function setMode(mode, chapter = 0, hasSave = false) {
    if (mode === currentMode && chapter === currentChapter && hasSave === saved) return;
    currentMode = mode;
    currentChapter = chapter;
    saved = hasSave;
    departure = 0;
    positionPlaques();
  }
  function setHovered(id) {
    hovered = id;
  }
  function setDeparture(value) {
    departure = THREE.MathUtils.clamp(value, 0, 1);
  }
  function setReducedMotion(value) {
    reducedMotion = Boolean(value);
  }
  function boundsFor(object, w, h, width = 7.15, height = 1.15) {
    object.updateWorldMatrix(true, false);
    const corners = [
      [-width / 2, height / 2, 0.14],
      [width / 2, height / 2, 0.14],
      [width / 2, -height / 2, 0.14],
      [-width / 2, -height / 2, 0.14],
    ].map((p) => {
      const point = new THREE.Vector3(...p)
        .applyMatrix4(object.matrixWorld)
        .project(camera);
      return { x: (point.x * 0.5 + 0.5) * w, y: (-0.5 * point.y + 0.5) * h };
    });
    const xs = corners.map((p) => p.x),
      ys = corners.map((p) => p.y);
    const left = Math.min(...xs),
      top = Math.min(...ys),
      right = Math.max(...xs),
      bottom = Math.max(...ys);
    return {
      x: left,
      y: top,
      left,
      top,
      width: right - left,
      height: bottom - top,
      centerX: (left + right) / 2,
      centerY: (top + bottom) / 2,
      corners,
      visible: object.visible,
    };
  }
  function getScreenAnchors(width, height) {
    layout(width, height);
    scene.updateMatrixWorld();
    camera.updateMatrixWorld();
    const anchors = {};
    for (const [id, p] of Object.entries(plaques))
      anchors[id] = boundsFor(p.object, width, height);
    const titleBox = new THREE.Box3().setFromObject(titleGroup);
    const titlePoints = [];
    for (const x of [titleBox.min.x, titleBox.max.x])
      for (const y of [titleBox.min.y, titleBox.max.y])
        for (const z of [titleBox.min.z, titleBox.max.z]) {
          const point = new THREE.Vector3(x, y, z).project(camera);
          titlePoints.push({
            x: (point.x * 0.5 + 0.5) * width,
            y: (-0.5 * point.y + 0.5) * height,
          });
        }
    const titleX = Math.min(...titlePoints.map((p) => p.x)),
      titleY = Math.min(...titlePoints.map((p) => p.y));
    const titleW = Math.max(...titlePoints.map((p) => p.x)) - titleX,
      titleH = Math.max(...titlePoints.map((p) => p.y)) - titleY;
    const titleBounds = {
      x: titleX,
      y: titleY,
      left: titleX,
      top: titleY,
      width: titleW,
      height: titleH,
      centerX: titleX + titleW / 2,
      centerY: titleY + titleH / 2,
      visible: titleGroup.visible,
    };
    // Text geometry baseline differs from a rectangle center; expose a subtitle
    // anchor under the actual engraved underline, separately from the title.
    const sub = new THREE.Vector3(0, -0.75, 0.1)
      .applyMatrix4(titleGroup.matrixWorld)
      .project(camera);
    anchors.title = titleBounds;
    anchors.subtitle = {
      x: (sub.x * 0.5 + 0.5) * width,
      y: (-0.5 * sub.y + 0.5) * height,
    };
    return anchors;
  }
  function update(time, dt, pointer = { x: 0, y: 0 }) {
    if (reducedMotion) time = frozenTime;
    else frozenTime = time;
    if (reducedMotion) pointer = { x: 0, y: 0 };
    layout(innerWidth, innerHeight);
    const px = THREE.MathUtils.clamp(pointer.x || 0, -1, 1),
      py = THREE.MathUtils.clamp(pointer.y || 0, -1, 1);
    const targetX = px * 0.22,
      targetY = py * 0.11;
    camera.position.x = THREE.MathUtils.lerp(
      camera.position.x,
      targetX,
      1 - Math.exp(-dt * 3),
    );
    camera.position.y = THREE.MathUtils.lerp(
      camera.position.y,
      cameraHome.y - targetY,
      1 - Math.exp(-dt * 3),
    );
    camera.position.z = cameraHome.z - departure * 4;
    camera.position.x += departure * hero.position.x * 0.08;
    camera.lookAt(aimHome.clone().lerp(hero.position, departure * 0.3));
    camera.updateMatrixWorld();
    const awakened = currentMode === "won" || currentMode === "chapter";
    modeAmount = THREE.MathUtils.lerp(
      modeAmount,
      awakened ? 1 : 0,
      1 - Math.exp(-dt * 1.5),
    );
    hero.rotation.z = Math.sin(time * 0.13) * 0.025;
    hero.position.y = 1.1 + Math.sin(time * 0.4) * 0.09;
    gimbals.forEach((g, i) => {
      g.object.rotation.z = g.base[2] + time * g.speed * (1 + modeAmount * 0.8);
      g.object.rotation.x =
        g.base[0] + Math.sin(time * 0.17 + i) * 0.1 + departure * (i - 1) * 0.6;
    });
    seed.rotation.set(time * 0.16, time * 0.34, time * 0.13);
    central.rotation.z = Math.sin(time * 0.4) * 0.06;
    central.position.y = Math.sin(time * 0.9) * 0.09;
    innerOrbit.rotation.z = time * 0.25;
    innerOrbit2.rotation.y = time * 0.2;
    seedMaterial.emissiveIntensity =
      2.2 + Math.sin(time * 1.6) * 0.2 + modeAmount * 1.3;
    seedHalo.scale.setScalar(
      5.1 + Math.sin(time * 1.5) * 0.25 + modeAmount * 2 + departure * 5,
    );
    seedHalo.material.color
      .copy(goldTint)
      .lerp(moonTint, currentChapter === 1 ? 0.38 : 0);
    coreLight.intensity = 14 + modeAmount * 8;
    eclipse.material.opacity = 0.13 + modeAmount * 0.05;
    dustRoot.rotation.y = time * 0.01;
    starField.rotation.z = Math.sin(time * 0.02) * 0.008;
    for (let i = 0; i < moteBase.length; i++) {
      const p = moteBase[i];
      motes[i * 3] = p[0] + Math.sin(time * 0.2 + i) * 0.06;
      motes[i * 3 + 1] =
        ((p[1] + time * (0.08 + modeAmount * 0.08) + 6) % 12) - 6;
      motes[i * 3 + 2] = p[2];
    }
    moteGeo.attributes.position.needsUpdate = true;
    for (const [id, p] of Object.entries(plaques)) {
      p.hover = THREE.MathUtils.lerp(
        p.hover,
        hovered === id ? 1 : 0,
        1 - Math.exp(-dt * 10),
      );
      p.object.position.z = p.hover * 0.32;
      p.object.position.y = p.y + p.hover * 0.035;
      p.object.rotation.y = 0.045 - p.hover * 0.025;
      p.material.color
        .set("#10272d")
        .lerp(new THREE.Color("#31504f"), p.hover * 0.65);
      p.border.material.opacity = 0.45 + p.hover * 0.5;
      p.nodeGlow.material.opacity = p.hover * 0.4;
      p.rightMarker.rotation.z = time * 0.12 + p.hover * 0.45;
      p.accent.scale.y = 1 + p.hover * 0.45;
    }
  }
  layout(innerWidth, innerHeight);
  setMode("menu");
  return {
    scene,
    camera,
    update,
    setMode,
    getScreenAnchors,
    setHovered,
    setDeparture,
    setReducedMotion,
    titleReady,
    dispose() {
      const geometries = new Set(),
        mats = new Set(),
        textures = new Set();
      scene.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        for (const mat of Array.isArray(object.material)
          ? object.material
          : [object.material]) {
          if (mat) {
            mats.add(mat);
            if (mat.map) textures.add(mat.map);
          }
        }
      });
      geometries.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}
