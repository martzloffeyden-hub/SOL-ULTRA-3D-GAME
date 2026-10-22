import * as THREE from "./vendor/three.module.js";
import { createWorld } from "./world.js";
import { AudioGarden } from "./audio.js";
import { LEVELS } from "./levels.js";
import { crossing, sphereContact } from "./physics.js";
import { createMouseLook } from "./mouse-look.js";

const $ = (id) => document.getElementById(id),
  V = (a) => new THREE.Vector3(...a);
const canvas = $("game"),
  sound = new AudioGarden(),
  keys = new Set();
const GOLD = new THREE.Color("#ffc879"),
  BLUE = new THREE.Color("#8be4eb");
let renderer, scene, camera, world;
let mode = "menu",
  chapter = 0,
  gateIndex = 0,
  carrying = false,
  phase = 0,
  elapsed = 0,
  impacts = 0,
  totalGates = 0;
let yaw = 0,
  pitch = -0.3,
  time = 0,
  messageUntil = 0,
  impactCooldown = 0,
  interactReady = false,
  exploring = false;
let player = new THREE.Vector3(0, 7, 16),
  velocity = new THREE.Vector3(),
  seedPos = new THREE.Vector3(),
  seedVelocity = new THREE.Vector3(),
  checkpoint = player.clone();
let previousSeed = new THREE.Vector3(),
  forward = new THREE.Vector3(0, 0, -1),
  right = new THREE.Vector3(1, 0, 0),
  lastFlight = new THREE.Vector3(0, 0, -1);
let drone,
  droneBody,
  wings = [],
  seed,
  seedCore,
  seedHalo,
  tether,
  tetherPositions,
  seedGlow,
  trailPoints = [],
  trail,
  trailPositions;
let gateMeshes = [],
  altars = [],
  hazardMeshes = [],
  decorGroup,
  guide,
  guidePositions,
  burstParticles = [],
  burstPositions,
  burstColors,
  burstGeometry,
  burstPoints;
const cameraAnchor = new THREE.Vector3();
let sensitivity = 1,
  invertLook = false;
try {
  sensitivity = Math.max(
    0.4,
    Math.min(2, Number(localStorage.getItem("helio-look-sensitivity")) || 1),
  );
  invertLook = localStorage.getItem("helio-look-invert") === "1";
} catch {}
let perfFrames = 0,
  perfTime = 0,
  measuredFPS = 60,
  qualityReduced = false;
let missedGateHintUntil = 0;
let muted = false;
try {
  muted = localStorage.getItem("helio-muted") === "1";
} catch {}
sound.setMuted(muted);
updateSoundButton();

function mesh(geo, mat, parent, pos) {
  const m = new THREE.Mesh(geo, mat);
  if (pos) m.position.set(...pos);
  parent.add(m);
  return m;
}
const std = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({
    color,
    roughness: 0.42,
    metalness: 0.35,
    ...extra,
  });
const basic = (color, extra = {}) =>
  new THREE.MeshBasicMaterial({ color, ...extra });
function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.1, "rgba(255,255,255,.85)");
  g.addColorStop(0.28, "rgba(255,255,255,.22)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const glowMap = glowTexture();
function glow(parent, color, size) {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowMap,
      color,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  s.scale.setScalar(size);
  parent.add(s);
  return s;
}

function init() {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.info.autoReset = false;
  const debugGL = renderer
    .getContext()
    .getExtension("WEBGL_debug_renderer_info");
  const softwareGPU =
    debugGL &&
    /swiftshader|llvmpipe|software/i.test(
      renderer.getContext().getParameter(debugGL.UNMASKED_RENDERER_WEBGL),
    );
  renderer.setPixelRatio(softwareGPU ? 0.65 : Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(53, innerWidth / innerHeight, 0.15, 700);
  scene.add(new THREE.HemisphereLight("#c3e6d5", "#293b4b", 2.4));
  const sun = new THREE.DirectionalLight("#ffe1a4", 3.7);
  sun.position.set(-24, 70, -55);
  scene.add(sun);
  const rim = new THREE.DirectionalLight("#64ddd5", 2.2);
  rim.position.set(30, 10, 20);
  scene.add(rim);
  world = createWorld(scene);
  decorGroup = new THREE.Group();
  scene.add(decorGroup);
  createDrone();
  createSeed();
  createCourse();
  createParticles();
  loadChapter(0, false);
  camera.position.set(23, 14, 32);
  camera.lookAt(0, 7, -5);
  $("loading").classList.add("hidden");
  $("menu").classList.remove("hidden");
  try {
    if (Number(localStorage.getItem("helio-chapter")) > 0)
      $("continue").classList.remove("hidden");
  } catch {}
  requestAnimationFrame(loop);
}
function createDrone() {
  drone = new THREE.Group();
  scene.add(drone);
  droneBody = new THREE.Group();
  drone.add(droneBody);
  const ivory = std("#fff0c9", { metalness: 0.6 }),
    gold = std("#c99548", { metalness: 0.8 }),
    dark = std("#193f45", { metalness: 0.7 });
  mesh(new THREE.SphereGeometry(1, 24, 16), ivory, droneBody).scale.set(
    0.39,
    0.29,
    0.95,
  );
  mesh(
    new THREE.ConeGeometry(0.3, 0.85, 5),
    gold,
    droneBody,
    [0, 0, -0.88],
  ).rotation.x = -Math.PI / 2;
  mesh(
    new THREE.TorusGeometry(0.34, 0.045, 8, 36),
    gold,
    droneBody,
    [0, 0, 0.4],
  ).rotation.y = Math.PI / 2;
  const eye = mesh(
    new THREE.SphereGeometry(0.1, 12, 10),
    basic("#a2ffef"),
    droneBody,
    [0, 0.18, -0.69],
  );
  glow(eye, "#adffeb", 0.8);
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.position.set(side * 0.22, 0, 0);
    droneBody.add(wing);
    wings.push(wing);
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.3);
    shape.lineTo(side * 2.35, 0.15);
    shape.quadraticCurveTo(side * 2.55, 0.45, side * 1.75, 0.75);
    shape.lineTo(side * 0.65, 1.15);
    shape.lineTo(0, 0.5);
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    const wingMat = std("#e7bc77", {
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.88,
      metalness: 0.65,
      roughness: 0.32,
    });
    mesh(geo, wingMat, wing);
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({
        color: "#ffe6b2",
        transparent: true,
        opacity: 0.85,
      }),
    );
    wing.add(edge);
    for (let i = 0; i < 3; i++) {
      const points = [
        new THREE.Vector3(0, 0.015, 0.1),
        new THREE.Vector3(side * (0.8 + i * 0.5), 0.015, -0.65 + i * 0.2),
      ];
      wing.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({
            color: "#fff0c8",
            transparent: true,
            opacity: 0.4,
          }),
        ),
      );
    }
    const tail = mesh(new THREE.ConeGeometry(0.12, 0.9, 4), gold, droneBody, [
      side * 0.25,
      0,
      0.95,
    ]);
    tail.rotation.set(-0.45, 0, side * 0.45);
  }
  glow(droneBody, "#ffc575", 2.8).position.set(0, 0, 0.65);
  trailPositions = new Float32Array(60 * 3);
  const tg = new THREE.BufferGeometry();
  tg.setAttribute("position", new THREE.BufferAttribute(trailPositions, 3));
  trail = new THREE.Line(
    tg,
    new THREE.LineBasicMaterial({
      color: "#d2f3df",
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  trail.frustumCulled = false;
  scene.add(trail);
}
function createSeed() {
  seed = new THREE.Group();
  scene.add(seed);
  seedCore = mesh(
    new THREE.IcosahedronGeometry(0.32, 1),
    std("#fff0ae", {
      emissive: "#ffbd52",
      emissiveIntensity: 2.4,
      metalness: 0.2,
    }),
    seed,
  );
  seedHalo = mesh(
    new THREE.TorusGeometry(0.63, 0.022, 6, 64),
    basic("#ffe8a9"),
    seed,
  );
  const ring = mesh(
    new THREE.TorusGeometry(0.53, 0.018, 6, 64),
    basic("#aaf9e1"),
    seed,
  );
  ring.rotation.x = Math.PI / 2;
  seedGlow = glow(seed, "#ffd27a", 4);
  seed.add(new THREE.PointLight("#ffd593", 5, 8, 2));
  tetherPositions = new Float32Array(33 * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(tetherPositions, 3));
  tether = new THREE.Line(
    g,
    new THREE.LineBasicMaterial({
      color: "#ffe2a7",
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  tether.frustumCulled = false;
  scene.add(tether);
}
function createCourse() {
  const ivory = std("#e9d9b5"),
    brass = std("#b0874d", { metalness: 0.8, roughness: 0.28 });
  LEVELS.forEach((level, ci) => {
    const gates = [];
    level.gates.forEach((data, i) => {
      const group = new THREE.Group();
      group.position.set(...data.pos);
      group.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        V(data.normal),
      );
      decorGroup.add(group);
      const tint = data.phase === 1 ? BLUE : GOLD;
      mesh(
        new THREE.TorusGeometry(data.radius + 0.2, 0.14, 10, 96),
        ivory,
        group,
      );
      mesh(
        new THREE.TorusGeometry(data.radius + 0.42, 0.036, 6, 96),
        brass,
        group,
      );
      const light = mesh(
        new THREE.TorusGeometry(data.radius, 0.045, 6, 96),
        basic(tint),
        group,
      );
      const orbit = mesh(
        new THREE.TorusGeometry(
          data.radius + 0.66,
          0.025,
          5,
          96,
          Math.PI * 1.65,
        ),
        brass,
        group,
      );
      orbit.rotation.z = i;
      for (let a = 0; a < 8; a++) {
        const ang = (a * Math.PI) / 4;
        const r = data.radius + 0.22;
        const m = mesh(new THREE.BoxGeometry(0.25, 0.38, 0.29), brass, group, [
          Math.cos(ang) * r,
          Math.sin(ang) * r,
          0,
        ]);
        m.rotation.z = ang - Math.PI / 2;
      }
      const jewel = mesh(
        new THREE.OctahedronGeometry(0.28),
        basic(tint),
        group,
        [0, data.radius + 0.95, 0],
      );
      glow(jewel, tint, 1.6);
      const membrane = mesh(
        new THREE.CircleGeometry(data.radius - 0.1, 64),
        new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          uniforms: {
            time: { value: 0 },
            color: { value: tint.clone() },
            opacity: { value: 0.08 },
            radius: { value: data.radius },
          },
          vertexShader:
            "varying vec2 v;void main(){v=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
          fragmentShader:
            "varying vec2 v;uniform float time;uniform vec3 color;uniform float opacity;void main(){float d=length(v);float w=pow(max(0.,sin(d*38.-time*2.)),12.);float lines=pow(max(0.,cos((v.x+v.y)*35.)),16.);gl_FragColor=vec4(color,opacity*(.12+w*.35+lines*.5)*(1.-smoothstep(.9,1.,d)));}",
        }),
        group,
      );
      const labelCanvas = document.createElement("canvas");
      labelCanvas.width = 128;
      labelCanvas.height = 128;
      const ctx = labelCanvas.getContext("2d");
      ctx.font = "42px Georgia";
      ctx.fillStyle = "#f8e8c5";
      ctx.textAlign = "center";
      ctx.fillText(String(i + 1).padStart(2, "0"), 64, 73);
      const label = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: new THREE.CanvasTexture(labelCanvas),
          transparent: true,
          depthWrite: false,
        }),
      );
      label.scale.set(1.4, 1.4, 1);
      label.position.set(0, -data.radius - 1.15, 0.1);
      group.add(label);
      gates.push({ group, light, membrane, orbit, jewel, data, pulse: 0 });
    });
    gateMeshes.push(gates);
    const altar = new THREE.Group();
    altar.position.set(...level.altar);
    decorGroup.add(altar);
    mesh(
      new THREE.CylinderGeometry(3.4, 2.5, 0.6, 48),
      ivory,
      altar,
      [0, -2.1, 0],
    );
    mesh(
      new THREE.CylinderGeometry(2.8, 3.1, 0.5, 48),
      brass,
      altar,
      [0, -1.6, 0],
    );
    const bowl = mesh(
      new THREE.TorusGeometry(2.35, 0.15, 10, 64),
      ivory,
      altar,
      [0, -1.2, 0],
    );
    bowl.rotation.x = Math.PI / 2;
    const petals = [];
    for (let j = 0; j < 12; j++) {
      const a = (j * Math.PI) / 6;
      const petal = mesh(
        new THREE.SphereGeometry(1, 12, 8),
        std("#e1c184", { metalness: 0.6 }),
        altar,
        [Math.sin(a) * 1.8, -0.75, Math.cos(a) * 1.8],
      );
      petal.scale.set(0.32, 0.09, 1.4);
      petal.rotation.y = a;
      petals.push(petal);
    }
    const flower = mesh(
      new THREE.IcosahedronGeometry(0.65, 1),
      std("#fff5bf", { emissive: "#edbf72", emissiveIntensity: 0.5 }),
      altar,
    );
    const halo = glow(altar, "#ffd689", 7);
    halo.material.opacity = 0.3;
    const beam = mesh(
      new THREE.CylinderGeometry(0.18, 1.3, 36, 24, 1, true),
      basic("#ffe9b2", {
        transparent: true,
        opacity: 0.035,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
      altar,
      [0, 17, 0],
    );
    altars.push({ group: altar, flower, petals, halo, beam, awakened: false });
    const hazards = [];
    level.hazards.forEach((h, i) => {
      const group = new THREE.Group();
      group.position.set(...h.pos);
      decorGroup.add(group);
      const core = mesh(
        new THREE.IcosahedronGeometry(h.radius * 0.72, 0),
        std("#383e48", {
          emissive: "#834b57",
          emissiveIntensity: 0.15,
          roughness: 0.8,
        }),
        group,
      );
      for (let j = 0; j < 12; j++) {
        const angle = j * 2.39996,
          vy = 1 - j / 5.5;
        const direction = new THREE.Vector3(
          Math.cos(angle) * Math.sqrt(1 - vy * vy),
          vy,
          Math.sin(angle) * Math.sqrt(1 - vy * vy),
        );
        const thorn = mesh(
          new THREE.ConeGeometry(0.22, h.radius * 0.9, 4),
          std("#806d6b", { metalness: 0.65 }),
          group,
          direction
            .clone()
            .multiplyScalar(h.radius * 0.75)
            .toArray(),
        );
        thorn.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          direction,
        );
      }
      const halo = glow(group, "#d37a73", h.radius * 3);
      halo.material.opacity = 0.3;
      hazards.push({ group, core, data: h });
    });
    hazardMeshes.push(hazards);
  });
  guidePositions = new Float32Array(45 * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(guidePositions, 3));
  guide = new THREE.Points(
    g,
    new THREE.PointsMaterial({
      color: "#ffdb9c",
      map: glowMap,
      size: 0.3,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  guide.frustumCulled = false;
  scene.add(guide);
}
function createParticles() {
  burstPositions = new Float32Array(360 * 3);
  burstColors = new Float32Array(360 * 3);
  burstGeometry = new THREE.BufferGeometry();
  burstGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(burstPositions, 3),
  );
  burstGeometry.setAttribute(
    "color",
    new THREE.BufferAttribute(burstColors, 3),
  );
  burstPoints = new THREE.Points(
    burstGeometry,
    new THREE.PointsMaterial({
      vertexColors: true,
      map: glowMap,
      size: 0.32,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  burstPoints.frustumCulled = false;
  scene.add(burstPoints);
}
function burst(pos, color, count = 45) {
  for (let i = 0; i < count; i++) {
    if (burstParticles.length >= 360) burstParticles.shift();
    const v = new THREE.Vector3(
      Math.random() - 0.5,
      Math.random() - 0.2,
      Math.random() - 0.5,
    )
      .normalize()
      .multiplyScalar(1 + Math.random() * 4);
    burstParticles.push({
      pos: pos.clone(),
      v,
      life: 1.1 + Math.random(),
      max: 2.1,
      color: color.clone(),
    });
  }
}
function loadChapter(index, persist = true) {
  chapter = index;
  gateIndex = 0;
  carrying = false;
  phase = 0;
  player.copy(V(LEVELS[index].start));
  velocity.set(0, 0, 0);
  seedPos.copy(V(LEVELS[index].seed));
  seedVelocity.set(0, 0, 0);
  previousSeed.copy(seedPos);
  checkpoint.copy(player);
  yaw = 0;
  pitch = -0.3;
  lastFlight.set(0, 0, -1);
  trailPoints = [];
  world.setChapter(index);
  sound.setChapter(index);
  impactCooldown = 0;
  altars.forEach((a, ci) => (a.group.visible = ci <= index));
  gateMeshes.forEach((gates, ci) =>
    gates.forEach((g) => {
      g.group.visible = ci === index;
      g.pulse = 0;
    }),
  );
  hazardMeshes.forEach((hs, ci) =>
    hs.forEach((h) => (h.group.visible = ci === index)),
  );
  updateUI();
  updatePhase();
  updateDrone(0);
  updateCamera(0, true);
  if (persist) saveCheckpoint();
}
function startGame(resume = false) {
  elapsed = 0;
  impacts = 0;
  totalGates = 0;
  exploring = false;
  world.resetAwakening?.();
  let idx = 0;
  if (resume) {
    try {
      idx = Math.max(
        0,
        Math.min(2, Number(localStorage.getItem("helio-chapter")) || 0),
      );
    } catch {}
  }
  altars.forEach((a, i) => (a.awakened = i < idx));
  totalGates = LEVELS.slice(0, idx).reduce((s, l) => s + l.gates.length, 0);
  loadChapter(idx);
  setMode("play");
  sound.start();
  sound.pause(false);
  showMessage(LEVELS[idx].hint, 8);
  mouseLook.capture();
}
function setMode(next) {
  mode = next;
  keys.clear();
  mouseLook.release();
  $("look-hint").textContent = "CLIC DANS LE JEU · VUE À LA SOURIS";
  for (const id of ["menu", "pause", "chapter-screen", "victory"])
    $(id).classList.add("hidden");
  $("hud").classList.toggle("hidden", next !== "play");
  $("pause-button").classList.toggle("hidden", next !== "play");
  if (next === "menu") $("menu").classList.remove("hidden");
  if (next === "pause") $("pause").classList.remove("hidden");
  if (next === "chapter") $("chapter-screen").classList.remove("hidden");
  if (next === "won") $("victory").classList.remove("hidden");
  sound.pause(next === "pause");
}
function updateUI() {
  const l = LEVELS[chapter];
  $("chapter-number").textContent = l.subtitle;
  $("chapter-name").textContent = l.name;
  $("route-progress").innerHTML = l.gates
    .map(
      (g, i) =>
        `<div class="progress-dot ${i < gateIndex ? "done" : i === gateIndex ? "current" : ""} ${g.phase === 1 ? "lunar" : ""}" title="Anneau ${i + 1}"></div>`,
    )
    .join("");
  $("seed-status").classList.toggle("carrying", carrying);
  $("seed-status").querySelector("span").textContent = carrying
    ? "GRAINE RELIÉE · F RESSERRE LE LIEN"
    : "GRAINE EN ATTENTE";
  if (!carrying) {
    $("objective-text").textContent = "Recueillez la graine de lumière.";
    $("objective-icon").textContent = "◈";
  } else if (gateIndex < l.gates.length) {
    const g = l.gates[gateIndex];
    $("objective-text").textContent =
      `Guidez la graine dans l’anneau ${gateIndex + 1} / ${l.gates.length}${g.phase === null ? "" : g.phase === 0 ? " · solaire ☀" : " · lunaire ☽"}.`;
    $("objective-icon").textContent = "◎";
  } else {
    $("objective-text").textContent = "Offrez la graine au cœur du jardin.";
    $("objective-icon").textContent = "✳";
  }
}
function updatePhase() {
  const color = phase === 0 ? GOLD : BLUE;
  $("phase-symbol").textContent = phase === 0 ? "☀" : "☽";
  $("phase-name").textContent = phase === 0 ? "SOLAIRE" : "LUNAIRE";
  $("phase-symbol").style.color = "#" + color.getHexString();
  $("phase-name").style.color = "#" + color.getHexString();
  seedCore.material.emissive.copy(color);
  seedGlow.material.color.copy(color);
  tether.material.color.copy(color);
}
function showMessage(msg, duration = 4) {
  $("message").textContent = msg;
  $("message").classList.add("visible");
  messageUntil = time + duration;
}
function saveCheckpoint() {
  try {
    localStorage.setItem("helio-chapter", String(chapter));
  } catch {}
}
function needsApproach() {
  const g = LEVELS[chapter].gates[gateIndex];
  return carrying && g && seedPos.clone().sub(V(g.pos)).dot(V(g.normal)) < -1.1;
}
function target() {
  const l = LEVELS[chapter];
  if (!carrying) return V(l.seed);
  if (gateIndex >= l.gates.length) return V(l.altar);
  const g = l.gates[gateIndex];
  return needsApproach() ? V(g.pos).addScaledVector(V(g.normal), 5) : V(g.pos);
}
function interact() {
  if (mode !== "play" || exploring) return;
  const l = LEVELS[chapter];
  if (!carrying && player.distanceTo(V(l.seed)) < 4.3) {
    carrying = true;
    seedVelocity.set(0, 0, 0);
    previousSeed.copy(seedPos);
    sound.play("pickup");
    burst(seedPos, GOLD, 65);
    showMessage(
      chapter === 0
        ? "La graine vous suit. Traversez le premier anneau."
        : "Accordez votre résonance avec X, puis guidez la graine.",
      6,
    );
    updateUI();
  } else if (
    carrying &&
    gateIndex === l.gates.length &&
    player.distanceTo(V(l.altar)) < 5.5
  ) {
    deliver();
  }
}
function deliver() {
  carrying = false;
  altars[chapter].awakened = true;
  seedPos.copy(V(LEVELS[chapter].altar));
  burst(seedPos, GOLD, 180);
  sound.play("deliver");
  if (chapter < 2) {
    $("chapter-title").textContent =
      chapter === 0
        ? "La lumière prend racine."
        : "Deux voix, un même souffle.";
    $("chapter-story").textContent = LEVELS[chapter + 1].description;
    $("chapter-overline").textContent =
      `JARDIN ${chapter + 1} ÉVEILLÉ · ${chapter + 1} / 3`;
    setMode("chapter");
    try {
      localStorage.setItem("helio-chapter", String(chapter + 1));
    } catch {}
  } else {
    world.awaken?.();
    sound.play("win");
    $("stats").innerHTML =
      `<div>${Math.floor(elapsed / 60)}:${String(Math.floor(elapsed % 60)).padStart(2, "0")}<small>TEMPS DE VOYAGE</small></div><div>${totalGates}<small>ANNEAUX TISSÉS</small></div><div>${impacts}<small>RENCONTRES D’ÉPINES</small></div>`;
    setMode("won");
    try {
      localStorage.removeItem("helio-chapter");
    } catch {}
  }
}
function resetToCheckpoint() {
  if (mode !== "play") return;
  player.copy(checkpoint);
  velocity.set(0, 0, 0);
  seedVelocity.set(0, 0, 0);
  if (carrying) seedPos.copy(player).addScaledVector(lastFlight, -1.9);
  else seedPos.copy(V(LEVELS[chapter].seed));
  previousSeed.copy(seedPos);
  trailPoints = [];
  updateCamera(0, true);
  impactCooldown = 1;
  showMessage("Le lien se retisse au dernier point de reprise.", 3);
}
function obstacleHit(normal, penetration) {
  player.addScaledVector(normal, penetration + 0.05);
  const inward = velocity.dot(normal);
  if (inward < 0) velocity.addScaledVector(normal, -inward * 1.5);
  if (impactCooldown <= 0) {
    impacts++;
    sound.play("impact");
    burst(player, new THREE.Color("#df9890"), 24);
    showMessage("Les épines repoussent. Approchez plus doucement.", 3);
    impactCooldown = 2;
  }
}
function step(dt) {
  elapsed += exploring ? 0 : dt;
  impactCooldown = Math.max(0, impactCooldown - dt);
  if (keys.has("ArrowLeft")) yaw -= dt * 1.35;
  if (keys.has("ArrowRight")) yaw += dt * 1.35;
  forward.set(Math.sin(yaw), 0, -Math.cos(yaw));
  right.set(Math.cos(yaw), 0, Math.sin(yaw));
  const move = new THREE.Vector3();
  if (keys.has("KeyW") || keys.has("KeyZ") || keys.has("ArrowUp"))
    move.add(forward);
  if (keys.has("KeyS") || keys.has("ArrowDown")) move.sub(forward);
  if (keys.has("KeyA") || keys.has("KeyQ")) move.sub(right);
  if (keys.has("KeyD")) move.add(right);
  if (keys.has("Space")) move.y++;
  if (keys.has("KeyC")) move.y--;
  const folded = keys.has("KeyF"),
    boost = keys.has("ShiftLeft") || keys.has("ShiftRight");
  const maxSpeed = folded ? 5.2 : boost ? 13 : 7.5;
  if (move.lengthSq() > 0) move.normalize();
  const desired = move.multiplyScalar(maxSpeed);
  velocity.lerp(desired, 1 - Math.exp(-dt * 4.2));
  if (velocity.lengthSq() > 0.2)
    lastFlight
      .lerp(velocity.clone().normalize(), 1 - Math.exp(-dt * 4))
      .normalize();
  const oldPlayer = player.clone();
  player.addScaledVector(velocity, dt);
  // Solid terrace contacts remain separate from the thorns' feedback.
  for (let pass = 0; pass < 2; pass++) {
    const contact = world.collide(player, 0.6);
    if (!contact) break;
    player.addScaledVector(contact.normal, contact.penetration + 0.002);
    const inward = velocity.dot(contact.normal);
    if (inward < 0) velocity.addScaledVector(contact.normal, -inward);
  }
  if (!exploring) {
    for (const h of LEVELS[chapter].hazards) {
      const hit = sphereContact(player.toArray(), h.pos, h.radius + 0.6);
      if (hit) obstacleHit(V(hit.normal), hit.penetration);
    }
    const g = LEVELS[chapter].gates[gateIndex];
    if (carrying && g) {
      const p = player.clone().sub(V(g.pos)),
        n = V(g.normal),
        signed = p.dot(n),
        old = oldPlayer.clone().sub(V(g.pos)).dot(n),
        radial = p.addScaledVector(n, -signed).length();
      if (
        Math.abs(signed) < 0.65 &&
        radial < g.radius &&
        g.phase !== null &&
        phase !== g.phase
      ) {
        const side = old >= 0 ? 1 : -1;
        player.addScaledVector(n, side * 0.7 - signed);
        velocity.addScaledVector(n, -velocity.dot(n) * 1.6);
        if (impactCooldown <= 0) {
          sound.play("impact");
          showMessage(
            `X · Accordez la résonance ${g.phase === 0 ? "solaire ☀" : "lunaire ☽"} à cet anneau.`,
            4,
          );
          impactCooldown = 1;
        }
      } else if (Math.abs(signed) < 0.5 && Math.abs(radial - g.radius) < 0.46) {
        const radialNormal = player
          .clone()
          .sub(V(g.pos))
          .addScaledVector(n, -signed)
          .normalize();
        const sign = radial > g.radius ? 1 : -1;
        player.addScaledVector(radialNormal, sign * 0.22);
        velocity.multiplyScalar(0.65);
      }
    }
  }
  if (player.y < 1.5) {
    player.y = 1.5;
    velocity.y = Math.max(0, velocity.y);
  }
  if (player.y > 55) {
    player.y = 55;
    velocity.y = Math.min(0, velocity.y);
  }
  if (Math.abs(player.x) > 90 || player.z > 65 || player.z < -185) {
    resetToCheckpoint();
  }
  previousSeed.copy(seedPos);
  if (carrying) {
    const desiredSeed = player
      .clone()
      .addScaledVector(lastFlight, folded ? -1.05 : -2.5);
    desiredSeed.y += 0.15 + Math.sin(time * 2) * 0.07;
    seedVelocity.addScaledVector(desiredSeed.sub(seedPos), dt * 24);
    seedVelocity.multiplyScalar(Math.exp(-dt * 7));
    seedPos.addScaledVector(seedVelocity, dt);
    const distance = seedPos.distanceTo(player);
    if (distance > 3.8) seedPos.sub(player).setLength(3.8).add(player);
    const gate = LEVELS[chapter].gates[gateIndex];
    if (
      gate &&
      (gate.phase === null || phase === gate.phase) &&
      crossing(previousSeed.toArray(), seedPos.toArray(), gate)
    ) {
      const gm = gateMeshes[chapter][gateIndex];
      gm.pulse = 1;
      sound.play("gate");
      burst(V(gate.pos), gate.phase === 1 ? BLUE : GOLD, 75);
      gateIndex++;
      totalGates++;
      checkpoint.copy(player);
      updateUI();
      showMessage(
        gateIndex === LEVELS[chapter].gates.length
          ? "Le jardin peut s’éveiller. Rejoignez son cœur."
          : gateIndex === 1 && chapter === 0
            ? "La graine a traversé. Le prochain anneau est plus haut."
            : "Le lien résonne.",
        gateIndex === 1 ? 4 : 2,
      );
    }
  } else if (!exploring) {
    seedPos.copy(V(LEVELS[chapter].seed));
    seedPos.y += Math.sin(time * 1.5) * 0.25;
  }
  if (needsApproach() && time > missedGateHintUntil) {
    showMessage(
      "Anneau manqué : revenez devant lui, ou R pour reprendre votre approche.",
      5,
    );
    missedGateHintUntil = time + 12;
  }
  sound.update(dt, velocity.length(), carrying);
  updatePrompt();
}
function updatePrompt() {
  const l = LEVELS[chapter];
  let text = "";
  if (!exploring && !carrying && player.distanceTo(V(l.seed)) < 4.3)
    text = "Accueillir la graine";
  else if (
    !exploring &&
    carrying &&
    gateIndex === l.gates.length &&
    player.distanceTo(V(l.altar)) < 5.5
  )
    text = "Faire fleurir le jardin";
  $("prompt").classList.toggle("hidden", !text);
  $("prompt").querySelector("span").textContent = text;
  interactReady = !!text;
}
function updateMarker() {
  const p = target();
  const distance = player.distanceTo(p);
  p.project(camera);
  const behind = p.z > 1;
  let x = (p.x * 0.5 + 0.5) * innerWidth,
    y = (-p.y * 0.5 + 0.5) * innerHeight;
  if (behind) {
    x = p.x > 0 ? innerWidth - 55 : 55;
    y = innerHeight * 0.45;
  }
  x = Math.max(45, Math.min(innerWidth - 45, x));
  y = Math.max(100, Math.min(innerHeight - 145, y));
  $("target-marker").style.left = x + "px";
  $("target-marker").style.top = y + "px";
  $("target-marker").style.opacity = exploring ? "0" : ".9";
  $("target-label").textContent = !carrying
    ? "GRAINE"
    : gateIndex < LEVELS[chapter].gates.length
      ? needsApproach()
        ? "REPRENDRE L’APPROCHE"
        : "ANNEAU " + (gateIndex + 1)
      : "CŒUR DU JARDIN";
  $("target-distance").textContent = Math.round(distance) + " m";
  $("speed").textContent = Math.round(velocity.length());
  $("speed-fill").style.width =
    Math.min(100, (velocity.length() / 13) * 100) + "%";
}
function updateDrone(dt) {
  drone.position.copy(player);
  const heading = Math.atan2(-lastFlight.x, -lastFlight.z);
  const desiredQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(-velocity.y * 0.035, heading, -velocity.dot(right) * 0.05),
  );
  droneBody.quaternion.slerp(desiredQuat, 1 - Math.exp(-dt * 8));
  wings.forEach((w, i) => {
    w.rotation.z =
      (i === 0 ? -1 : 1) *
      (0.12 + Math.sin(time * 8) * 0.045 + velocity.length() * 0.01);
  });
  seed.position.copy(seedPos);
  seedCore.rotation.set(time * 0.7, time * 0.8, 0);
  seedHalo.rotation.set(time * 0.45, time * 0.3, time * 0.2);
  seedGlow.scale.setScalar(3.8 + Math.sin(time * 3) * 0.3);
  tether.visible = carrying;
  for (let i = 0; i < 33; i++) {
    const t = i / 32;
    const p = player.clone().lerp(seedPos, t);
    p.y -= Math.sin(t * Math.PI) * 0.3;
    p.x += Math.sin(t * 6 + time * 3) * 0.04 * Math.sin(t * Math.PI);
    tetherPositions.set(p.toArray(), i * 3);
  }
  tether.geometry.attributes.position.needsUpdate = true;
  if (mode === "play") {
    trailPoints.unshift(player.clone());
    if (trailPoints.length > 60) trailPoints.pop();
  }
  for (let i = 0; i < 60; i++) {
    const p = trailPoints[Math.min(i, trailPoints.length - 1)] || player;
    trailPositions.set(p.toArray(), i * 3);
  }
  trail.geometry.attributes.position.needsUpdate = true;
}
function visuals(dt) {
  world.update(time, dt, chapter, player);
  gateMeshes.forEach((gates, ci) =>
    gates.forEach((g, i) => {
      g.orbit.rotation.z += dt * 0.08;
      g.jewel.rotation.y += dt;
      g.membrane.material.uniforms.time.value = time;
      const active = ci === chapter && i === gateIndex && carrying;
      g.light.material.color
        .copy(
          i < gateIndex && ci === chapter
            ? new THREE.Color("#baf4c9")
            : g.data.phase === 1
              ? BLUE
              : GOLD,
        )
        .multiplyScalar(active ? 1.7 : 1);
      g.membrane.material.uniforms.opacity.value = active
        ? g.data.phase !== null && g.data.phase !== phase
          ? 0.48
          : 0.12
        : 0.04;
      g.pulse = Math.max(0, g.pulse - dt * 0.65);
      g.light.scale.setScalar(1 + g.pulse * 0.15);
    }),
  );
  altars.forEach((a, i) => {
    a.flower.rotation.y = time * 0.35;
    const wake = a.awakened ? 1 : 0;
    a.flower.material.emissiveIntensity = THREE.MathUtils.lerp(
      a.flower.material.emissiveIntensity,
      wake ? 3 : 0.35,
      dt * 2,
    );
    a.halo.material.opacity = THREE.MathUtils.lerp(
      a.halo.material.opacity,
      wake ? 0.85 : 0.2,
      dt * 2,
    );
    a.beam.material.opacity = THREE.MathUtils.lerp(
      a.beam.material.opacity,
      wake ? 0.1 : 0.025,
      dt,
    );
    a.petals.forEach((p, j) => {
      p.rotation.z = Math.sin((j * Math.PI) / 6) * (wake ? 0.45 : 0.08);
      p.position.y = -0.7 + (wake ? 0.3 : 0) + Math.sin(time * 0.8 + j) * 0.04;
    });
  });
  hazardMeshes[chapter].forEach((h, i) => {
    h.core.rotation.y = time * 0.18 + i;
    h.group.rotation.y = time * 0.06;
  });
  const to = target(),
    from = carrying ? seedPos : player;
  for (let i = 0; i < 45; i++) {
    const t = (i / 45 + time * 0.025) % 1;
    const p = from.clone().lerp(to, t);
    p.y += Math.sin(t * Math.PI) * 0.6;
    guidePositions.set(p.toArray(), i * 3);
  }
  guide.geometry.attributes.position.needsUpdate = true;
  guide.visible = mode === "play" && !exploring;
  burstParticles = burstParticles.filter((p) => p.life > 0);
  for (let i = 0; i < 360; i++) {
    const p = burstParticles[i];
    if (p) {
      p.life -= dt;
      p.pos.addScaledVector(p.v, dt);
      p.v.multiplyScalar(Math.exp(-dt * 0.7));
      p.v.y += dt * 0.4;
      burstPositions.set(p.pos.toArray(), i * 3);
      const c = p.color.clone().multiplyScalar(Math.max(0, p.life / p.max));
      burstColors.set(c.toArray(), i * 3);
    } else {
      burstPositions.set([0, -1000, 0], i * 3);
    }
  }
  burstGeometry.attributes.position.needsUpdate = true;
  burstGeometry.attributes.color.needsUpdate = true;
  if (messageUntil < time) $("message").classList.remove("visible");
}
function updateCamera(dt, snap = false) {
  const anchor = player.clone().add(new THREE.Vector3(0, 0.85, 0));
  if (snap) cameraAnchor.copy(anchor);
  else cameraAnchor.lerp(anchor, 1 - Math.exp(-dt * 12));
  const direction = new THREE.Vector3(
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch),
  );
  camera.position.copy(cameraAnchor).addScaledVector(direction, -11.6);
  camera.lookAt(
    cameraAnchor
      .clone()
      .addScaledVector(direction, 3.5)
      .add(new THREE.Vector3(0, 1, 0)),
  );
  camera.updateMatrixWorld();
}
let last = performance.now();
function loop(now) {
  const realDT = Math.max(0.001, (now - last) / 1000);
  last = now;
  const dt = Math.min(realDT, 0.1);
  time += dt;
  if (mode === "play") {
    const steps = Math.max(1, Math.ceil(dt / 0.016));
    for (let i = 0; i < steps; i++) step(dt / steps);
    updateCamera(dt);
  } else if (mode === "menu") {
    player.set(3.5, 7.5 + Math.sin(time * 0.6) * 0.4, 7);
    seedPos.set(2, 8 + Math.sin(time) * 0.2, 10);
    const t = time * 0.045;
    camera.position.set(22 + Math.sin(t) * 4, 14 + Math.sin(t * 0.7), 32);
    camera.lookAt(0, 7, -5);
  }
  camera.updateMatrixWorld();
  if (mode === "play") updateMarker();
  updateDrone(dt);
  visuals(dt);
  renderer.info.reset();
  renderer.render(scene, camera);
  perfFrames++;
  perfTime += realDT;
  if (perfTime > 2) {
    measuredFPS = Math.round(perfFrames / perfTime);
    perfFrames = 0;
    perfTime = 0;
    if (time > 6 && measuredFPS < 28 && !qualityReduced) {
      qualityReduced = true;
      renderer.setPixelRatio(Math.min(renderer.getPixelRatio(), 0.65));
      resize();
    }
  }
  requestAnimationFrame(loop);
}
function resize() {
  if (!renderer) return;
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
function updateSoundButton() {
  $("sound").textContent = muted ? "♩" : "♫";
  $("sound").style.opacity = muted ? ".5" : "1";
  $("sound").setAttribute(
    "aria-label",
    muted ? "Activer le son" : "Couper le son",
  );
}
$("start").onclick = () => startGame();
$("continue").onclick = () => startGame(true);
$("resume").onclick = () => {
  setMode("play");
  mouseLook.capture();
};
$("restart").onclick = () => startGame();
$("replay").onclick = () => startGame();
$("next").onclick = () => {
  loadChapter(chapter + 1);
  setMode("play");
  showMessage(LEVELS[chapter].hint, 8);
  mouseLook.capture();
};
$("pause-button").onclick = () => setMode("pause");
$("help-toggle").onclick = () => $("help").classList.toggle("hidden");
$("sound").onclick = () => {
  muted = !muted;
  sound.setMuted(muted);
  if (!muted) sound.start();
  updateSoundButton();
  try {
    localStorage.setItem("helio-muted", muted ? "1" : "0");
  } catch {}
};
$("explore").onclick = () => {
  exploring = true;
  carrying = false;
  $("seed-status").classList.remove("carrying");
  $("seed-status").querySelector("span").textContent =
    "LES TROIS JARDINS SONT ÉVEILLÉS";
  setMode("play");
  $("objective-text").textContent =
    "Le jardin est à vous. Échap pour recommencer.";
  showMessage("Prenez le temps. Le ciel est vivant.", 5);
  mouseLook.capture();
};
window.addEventListener("keydown", (e) => {
  if (
    [
      "Space",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Tab",
      "KeyW",
      "KeyZ",
      "KeyA",
      "KeyQ",
      "KeyS",
      "KeyD",
      "KeyC",
      "KeyE",
      "KeyF",
      "KeyR",
      "KeyX",
    ].includes(e.code) &&
    mode === "play" &&
    !e.ctrlKey &&
    !e.metaKey
  )
    e.preventDefault();
  if (e.code === "Escape") {
    if (mode === "play") setMode("pause");
    return;
  }
  if (mode !== "play") return;
  keys.add(e.code);
  if (e.repeat) return;
  if (e.code === "KeyE") interact();
  if (e.code === "KeyX") {
    phase = 1 - phase;
    updatePhase();
    sound.play("switch");
    burst(player, phase === 0 ? GOLD : BLUE, 15);
  }
  if (e.code === "KeyR") resetToCheckpoint();
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => {
  keys.clear();
  mouseLook.release();
  if (mode === "play") setMode("pause");
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && mode === "play") setMode("pause");
});
const mouseLook = createMouseLook(canvas, {
  isPlaying: () => mode === "play",
  onLook: (dx, dy) => {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const scale = 0.0022 * sensitivity;
    yaw =
      THREE.MathUtils.euclideanModulo(yaw + dx * scale + Math.PI, Math.PI * 2) -
      Math.PI;
    pitch = THREE.MathUtils.clamp(
      pitch + dy * scale * (invertLook ? 1 : -1),
      -1.05,
      1.05,
    );
  },
  onLockChange: (active, lost) => {
    $("look-hint").textContent = active
      ? "VUE SOURIS ACTIVE · ÉCHAP POUR LIBÉRER"
      : "CLIC DANS LE JEU · VUE À LA SOURIS";
    if (lost && mode === "play") setMode("pause");
  },
  onFallback: (firstNotice) => {
    $("look-hint").textContent = "MAINTENIR UN CLIC ET GLISSER · REGARDER";
    if (firstNotice)
      showMessage(
        "Maintenez un clic et glissez pour regarder autour de vous.",
        4,
      );
  },
});
$("look-sensitivity").value = sensitivity;
$("look-sensitivity-value").value =
  sensitivity.toFixed(1).replace(".", ",") + "×";
$("look-invert").checked = invertLook;
$("look-sensitivity").addEventListener("input", (event) => {
  sensitivity = Number(event.target.value);
  $("look-sensitivity-value").value =
    sensitivity.toFixed(1).replace(".", ",") + "×";
  try {
    localStorage.setItem("helio-look-sensitivity", String(sensitivity));
  } catch {}
});
$("look-invert").addEventListener("change", (event) => {
  invertLook = event.target.checked;
  try {
    localStorage.setItem("helio-look-invert", invertLook ? "1" : "0");
  } catch {}
});
window.addEventListener("resize", resize);
canvas.addEventListener("webglcontextlost", (e) => {
  e.preventDefault();
  setMode("pause");
  $("fatal").classList.remove("hidden");
});
// Read-only telemetry supports reproducible browser checks without affecting a normal game.
window.__HELIO__ = {
  getState: () => ({
    mode,
    chapter,
    gateIndex,
    carrying,
    phase,
    player: player.toArray(),
    seed: seedPos.toArray(),
    velocity: velocity.toArray(),
    elapsed,
    impacts,
    totalGates,
    fps: measuredFPS,
    drawCalls: renderer?.info.render.calls,
    triangles: renderer?.info.render.triangles,
    interactReady,
    checkpoint: checkpoint.toArray(),
    target: target().toArray(),
    view: {
      yaw,
      pitch,
      locked: mouseLook.locked(),
      sensitivity,
      inverted: invertLook,
      direction: camera?.getWorldDirection(new THREE.Vector3()).toArray(),
      position: camera?.position.toArray(),
      anchor: cameraAnchor.toArray(),
    },
  }),
  levels: LEVELS,
};
// QA controls are deliberately available only on localhost with ?qa=1.
if (
  new URLSearchParams(location.search).has("qa") &&
  ["localhost", "127.0.0.1"].includes(location.hostname)
) {
  window.__HELIO__.qa = {
    setPosition: (p) => {
      player.copy(V(p));
      velocity.set(0, 0, 0);
    },
    setSeed: (p) => {
      seedPos.copy(V(p));
      previousSeed.copy(seedPos);
      seedVelocity.set(0, 0, 0);
    },
    setYaw: (v) => (yaw = v),
    setPhase: (v) => {
      phase = v;
      updatePhase();
    },
    step: (dt) => step(dt),
    loadChapter,
    interact,
    freeze: () => setMode("pause"),
  };
}
try {
  init();
} catch (e) {
  console.error(e);
  $("loading").classList.add("hidden");
  $("fatal").classList.remove("hidden");
}
