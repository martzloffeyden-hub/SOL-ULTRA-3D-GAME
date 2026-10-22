import * as THREE from "./vendor/three.module.js";

// All the scenery is generated locally. The central flight volume stays open.
export function createWorld(scene) {
  const root = new THREE.Group();
  root.name = "The hanging gardens";
  scene.add(root);
  const rng = (() => {
    let s = 47031;
    return () =>
      ((s = (Math.imul(s, 1664525) + 1013904223) | 0) >>> 0) / 4294967296;
  })();
  const rand = (a, b) => a + rng() * (b - a);
  const colors = {
    fog: new THREE.Color("#316c73"),
    low: new THREE.Color("#173e4b"),
    high: new THREE.Color("#174b59"),
    horizon: new THREE.Color("#9e9c7c"),
    sun: new THREE.Color("#ffc683"),
    flora: new THREE.Color("#8df5d4"),
  };
  scene.fog = new THREE.FogExp2(colors.fog, 0.0094);
  const mats = {
    rock: new THREE.MeshStandardMaterial({
      color: "#ad6548",
      emissive: "#a34523",
      emissiveIntensity: 0.13,
      roughness: 0.98,
      flatShading: true,
    }),
    rockDark: new THREE.MeshStandardMaterial({
      color: "#603d39",
      emissive: "#793b28",
      emissiveIntensity: 0.08,
      roughness: 1,
      flatShading: true,
    }),
    rockLight: new THREE.MeshStandardMaterial({
      color: "#d9915f",
      emissive: "#a8562c",
      emissiveIntensity: 0.04,
      roughness: 0.94,
      flatShading: true,
    }),
    ivory: new THREE.MeshStandardMaterial({
      color: "#eadab7",
      roughness: 0.7,
      metalness: 0.08,
    }),
    gold: new THREE.MeshStandardMaterial({
      color: "#c5964f",
      roughness: 0.38,
      metalness: 0.72,
    }),
    darkGold: new THREE.MeshStandardMaterial({
      color: "#68716a",
      roughness: 0.56,
      metalness: 0.45,
    }),
    teal: new THREE.MeshStandardMaterial({
      color: "#579e8d",
      roughness: 0.7,
      metalness: 0.18,
    }),
    plant: new THREE.MeshStandardMaterial({
      color: "#7fd6bd",
      emissive: "#25867e",
      emissiveIntensity: 0.34,
      roughness: 0.65,
      metalness: 0.15,
      flatShading: true,
    }),
    pearl: new THREE.MeshStandardMaterial({
      color: "#c9ffe0",
      emissive: "#76e7bb",
      emissiveIntensity: 1.15,
      roughness: 0.4,
    }),
  };
  const uniforms = {
    time: { value: 0 },
    awakening: { value: 0 },
    low: { value: colors.low },
    high: { value: colors.high },
    horizon: { value: colors.horizon },
    sunColor: { value: colors.sun },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(480, 32, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms,
      vertexShader:
        "varying vec3 vP; void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader: `precision highp float;
      varying vec3 vP; uniform vec3 low; uniform vec3 high; uniform vec3 horizon; uniform vec3 sunColor; uniform float time; uniform float awakening;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
      void main(){
        vec3 d=normalize(vP); float h=max(d.y,0.);
        vec3 col=mix(horizon,high,smoothstep(-.07,.7,d.y)); col=mix(low,col,smoothstep(-.40,.025,d.y));
        vec3 sunDir=normalize(vec3(-.48,.32,-.86)); float angle=acos(clamp(dot(d,sunDir),-1.,1.));
        float glow=exp(-angle*5.5); col+=sunColor*glow*(.35+awakening*.3);
        float disk=1.-smoothstep(.145,.149,angle); col=mix(col,sunColor*(1.1+awakening*.3),disk);
        vec3 moonDir=normalize(sunDir+vec3(.009+awakening*.34,.011+awakening*.18,0)); float moonAngle=acos(clamp(dot(d,moonDir),-1.,1.));
        float moon=(1.-smoothstep(.126,.129,moonAngle))*(1.-smoothstep(.8,1.,awakening)); col=mix(col,high*.48,moon);
        float band=pow(max(0.,sin(d.y*85.+d.x*13.)),15.)*.024; col+=sunColor*band*glow;
        float wisps=noise(d.xz*5.+vec2(time*.002,0))+noise(d.xz*15.-vec2(time*.003,0))*.4;
        col=mix(col,horizon,(smoothstep(.65,1.1,wisps))*.14*(1.-smoothstep(.02,.4,d.y)));
        gl_FragColor=vec4(col,1.);
      }`,
    }),
  );
  sky.renderOrder = -10;
  root.add(sky);

  const d = new THREE.Object3D();
  const stoneGeo = new THREE.CylinderGeometry(1, 0.75, 1, 7, 1);
  const capGeo = new THREE.CylinderGeometry(1, 1.03, 1, 48, 1);
  const rodGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
  const leafGeo = new THREE.ConeGeometry(1, 1, 3);
  const crystalGeo = new THREE.OctahedronGeometry(1, 0);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const instances = [];
  function batch(geo, mat, entries) {
    if (!entries.length) return;
    const mesh = new THREE.InstancedMesh(geo, mat, entries.length);
    entries.forEach((e, i) => {
      d.position.set(...e.p);
      d.rotation.set(...(e.r || [0, 0, 0]));
      d.scale.set(...e.s);
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
      if (e.c) mesh.setColorAt(i, new THREE.Color(e.c));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    root.add(mesh);
    instances.push(mesh);
    return mesh;
  }
  const rocks = [[], [], []],
    caps = [],
    plants = [],
    stems = [],
    pearls = [],
    pylons = [],
    slabs = [],
    roots = [];
  const islands = [
    [-24, -1, -8, 10.5],
    [26, 2, -19, 11],
    [-30, 5, -40, 13],
    [25, 4, -56, 9],
    [-27, 8, -76, 12],
    [29, 10, -97, 13],
    [-32, 8, -118, 10],
    [4, 0, -146, 19],
    [-57, -3, -21, 15],
    [61, 1, -61, 14],
    [-60, 10, -105, 17],
    [57, 14, -141, 20],
    [-13, -14, 16, 9],
    [28, -12, 14, 10],
  ];
  const rootColor = new THREE.Color("#74927f");
  for (let k = 0; k < islands.length; k++) {
    const [x, y, z, radius] = islands[k];
    for (let j = 0; j < 5; j++) {
      const shrink = Math.pow(1 - j / 6, 0.8);
      rocks[j % 3].push({
        p: [x + rand(-0.5, 0.5), y - j * 2 - 1, z + rand(-0.5, 0.5)],
        s: [radius * shrink, 2.1 + rand(0, 0.8), radius * shrink * 0.83],
        r: [0, j * 0.22 + k, rand(-0.03, 0.03)],
      });
    }
    caps.push({
      p: [x, y + 0.22, z],
      s: [radius * 0.93, 0.4, radius * 0.78],
      r: [0, k, 0],
    });
    caps.push({
      p: [x, y + 0.5, z],
      s: [radius * 0.87, 0.15, radius * 0.72],
      r: [0, k, 0],
    });
    // Thin brass inlays make the sanctuaries feel built, rather than random rocks.
    const inlay = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 0.69, 0.055, 5, 64),
      mats.gold,
    );
    inlay.rotation.x = Math.PI / 2;
    inlay.position.set(x, y + 0.62, z);
    inlay.scale.y = 0.86;
    root.add(inlay);
    const floraCount = k < 8 ? 24 : 13;
    for (let j = 0; j < floraCount; j++) {
      const a = rand(0, Math.PI * 2),
        rr = Math.sqrt(rand(0.12, 0.88)) * radius * 0.8;
      const px = x + Math.cos(a) * rr,
        pz = z + Math.sin(a) * rr * 0.8;
      const height = rand(0.7, 2.6);
      stems.push({
        p: [px, y + height * 0.5 + 0.65, pz],
        s: [0.035, height, 0.035],
        r: [rand(-0.13, 0.13), a, rand(-0.13, 0.13)],
      });
      for (let l = 0; l < 3; l++) {
        const aa = a + l * 2.09,
          hh = height * (0.45 + l * 0.21);
        plants.push({
          p: [
            px + Math.cos(aa) * height * 0.21,
            y + 0.7 + hh,
            pz + Math.sin(aa) * height * 0.21,
          ],
          s: [height * 0.23, height * 0.65, height * 0.09],
          r: [Math.cos(aa) * 0.7, aa, Math.sin(aa) * 0.7],
        });
      }
      if (j % 3 === 0)
        pearls.push({
          p: [px, y + height + 0.8, pz],
          s: [0.12, 0.21, 0.12],
          r: [0, a, 0.4],
        });
    }
    for (let j = 0; j < 10; j++) {
      const a = rand(0, 6.283),
        rr = radius * rand(0.4, 0.95),
        len = rand(3, 12);
      const px = x + Math.cos(a) * rr,
        pz = z + Math.sin(a) * rr * 0.85;
      let prev = new THREE.Vector3(px, y - 2, pz);
      for (let n = 1; n < 8; n++) {
        const t = n / 7,
          next = new THREE.Vector3(
            px + Math.sin(t * 4 + j) * t * 1.8,
            y - 2 - len * t,
            pz + Math.cos(t * 3 + j) * t,
          );
        roots.push(prev.x, prev.y, prev.z, next.x, next.y, next.z);
        prev = next;
      }
    }
    // Weathered radial stones and little ornamental spires at the edge.
    for (let j = 0; j < 10; j++) {
      const a = (j / 10) * 6.283 + k;
      const px = x + Math.cos(a) * radius * 0.88,
        pz = z + Math.sin(a) * radius * 0.72;
      slabs.push({
        p: [px, y + 0.8, pz],
        s: [rand(0.6, 1.4), rand(0.35, 0.8), rand(0.8, 1.8)],
        r: [0, -a, 0],
      });
      if (j % 3 === 0)
        pylons.push({
          p: [px, y + 1.6, pz],
          s: [0.13, 2.5, 0.13],
          r: [0, 0, 0],
        });
    }
  }
  batch(stoneGeo, mats.rock, rocks[0]);
  batch(stoneGeo, mats.rockDark, rocks[1]);
  batch(stoneGeo, mats.rockLight, rocks[2]);
  batch(capGeo, mats.ivory, caps);
  batch(leafGeo, mats.plant, plants);
  batch(rodGeo, mats.teal, stems);
  batch(crystalGeo, mats.pearl, pearls);
  batch(boxGeo, mats.ivory, slabs);
  batch(rodGeo, mats.gold, pylons);
  const rootGeo = new THREE.BufferGeometry();
  rootGeo.setAttribute("position", new THREE.Float32BufferAttribute(roots, 3));
  root.add(
    new THREE.LineSegments(
      rootGeo,
      new THREE.LineBasicMaterial({
        color: rootColor,
        transparent: true,
        opacity: 0.55,
      }),
    ),
  );

  const moving = [];
  function arch(x, y, z, r, rx = 0, ry = 0, rz = 0, arc = Math.PI * 1.7) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.set(rx, ry, rz);
    root.add(group);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.18, 7, 80, arc),
      mats.ivory,
    );
    group.add(rim);
    const rim2 = new THREE.Mesh(
      new THREE.TorusGeometry(r + 0.3, 0.035, 5, 80, arc),
      mats.gold,
    );
    group.add(rim2);
    const ticks = [];
    for (let i = 0; i < 35; i++) {
      const a = (i / 34) * arc;
      ticks.push({
        p: [Math.cos(a) * r, Math.sin(a) * r, 0],
        s: [0.04, i % 5 === 0 ? 0.6 : 0.24, 0.35],
        r: [0, 0, a + Math.PI / 2],
      });
    }
    const markMesh = new THREE.InstancedMesh(boxGeo, mats.gold, ticks.length);
    ticks.forEach((t, i) => {
      d.position.set(...t.p);
      d.rotation.set(...t.r);
      d.scale.set(...t.s);
      d.updateMatrix();
      markMesh.setMatrixAt(i, d.matrix);
    });
    group.add(markMesh);
    return group;
  }
  arch(-24, 7, -10, 7, 0, 0.35, -0.4);
  arch(26, 10, -20, 8, 0, -0.6, 0.4);
  arch(-31, 15, -40, 10, 0.3, 0.2, -0.3);
  arch(27, 14, -58, 7, -0.2, -0.6, 0.1);
  arch(-28, 20, -78, 10, 0.15, 0.4, -0.5);
  arch(31, 25, -99, 12, -0.1, -0.5, 0.2);
  arch(0, 22, -151, 22, 0, 0, 0.2, Math.PI * 2);
  const orrery = arch(0, 22, -151, 17, 0.6, 0.4, 0, Math.PI * 2);
  moving.push({ mesh: orrery, axis: "y", speed: 0.035, base: 0.4 });
  const orrery2 = arch(0, 22, -151, 13, -0.4, 0.9, 0.4, Math.PI * 2);
  moving.push({ mesh: orrery2, axis: "z", speed: -0.045, base: 0.4 });
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(3.8, 1),
    mats.ivory,
  );
  core.position.set(0, 22, -151);
  root.add(core);
  moving.push({ mesh: core, axis: "y", speed: 0.08, base: 0 });
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(5.5, 0.055, 5, 100),
    mats.gold,
  );
  halo.position.copy(core.position);
  halo.rotation.x = 1;
  root.add(halo);

  // Ribbon-like architecture high above the route, framing the long views.
  const ribs = [];
  for (let i = 0; i < 14; i++) {
    const z = -8 - i * 10.7;
    const rr = 45 + Math.sin(i * 0.5) * 3;
    const rib = new THREE.Mesh(
      new THREE.TorusGeometry(rr, 0.08, 5, 70, Math.PI * 0.76),
      mats.darkGold,
    );
    rib.position.set(0, 1 + i * 0.075, z);
    rib.rotation.z = 0.12 * Math.sin(i * 0.3);
    root.add(rib);
    ribs.push(rib);
  }

  // Distant hanging terraces give the horizon depth at almost no cost.
  const farRocks = [];
  for (let i = 0; i < 35; i++) {
    const side = i % 2 ? 1 : -1;
    const z = rand(-250, -30),
      x = side * rand(80, 170),
      y = rand(-25, 30),
      r = rand(4, 17);
    farRocks.push({
      p: [x, y, z],
      s: [r, r * 1.2, r * 0.8],
      r: [0, rand(0, 6), 0.1],
    });
  }
  batch(new THREE.CylinderGeometry(1, 0.12, 1, 6), mats.rockDark, farRocks);

  // A broad cloud shelf, with fine contours instead of a flat empty void.
  const cloudUniforms = {
    time: uniforms.time,
    tint: { value: new THREE.Color("#4d8380") },
  };
  const cloud = new THREE.Mesh(
    new THREE.PlaneGeometry(850, 850, 1, 1),
    new THREE.ShaderMaterial({
      uniforms: cloudUniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader:
        "varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader: `varying vec2 vUv;uniform float time;uniform vec3 tint;
      void main(){vec2 p=(vUv-.5)*24.;float wave=sin(p.x*.62+sin(p.y*.4+time*.025)*2.)+sin(p.y*.8-p.x*.25+time*.03);
      float line=pow(.5+.5*sin(wave*13.),18.);float a=(.22+wave*.025+line*.08)*(1.-smoothstep(.1,.7,length(vUv-.5)));
      gl_FragColor=vec4(tint+line*.08,a);}`,
    }),
  );
  cloud.rotation.x = -Math.PI / 2;
  cloud.position.set(0, -16, -80);
  root.add(cloud);

  const dustPositions = new Float32Array(420 * 3);
  for (let i = 0; i < 420; i++) {
    dustPositions[i * 3] = rand(-65, 65);
    dustPositions[i * 3 + 1] = rand(-4, 47);
    dustPositions[i * 3 + 2] = rand(-175, 30);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({
      color: "#d8e9bd",
      size: 0.065,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
    }),
  );
  root.add(dust);
  const motes = new THREE.Group();
  root.add(motes);
  const moteGeo = new THREE.SphereGeometry(0.12, 5, 4);
  for (let i = 0; i < 16; i++) {
    const mesh = new THREE.Mesh(moteGeo, mats.pearl);
    mesh.userData.phase = rand(0, 6.283);
    mesh.userData.center = new THREE.Vector3(
      rand(-35, 35),
      rand(6, 25),
      rand(-145, 5),
    );
    motes.add(mesh);
  }

  const palettes = [
    ["#316c73", "#173e4b", "#174b59", "#9e9c7c", "#ffc683", "#7fd6bd"],
    ["#46556b", "#282d49", "#343b61", "#a88689", "#f4baae", "#b39be5"],
    ["#527b7a", "#264d57", "#366370", "#cbc49b", "#ffe8ad", "#b4f8d6"],
  ];
  let currentChapter = 0,
    awakening = 0,
    awakeningTarget = 0;
  const warmHorizon = new THREE.Color("#efcba0"),
    warmSun = new THREE.Color("#fff0be"),
    warmFog = new THREE.Color("#96a68d"),
    tintScratch = new THREE.Color();
  const target = {
    fog: colors.fog.clone(),
    low: colors.low.clone(),
    high: colors.high.clone(),
    horizon: colors.horizon.clone(),
    sun: colors.sun.clone(),
    plant: new THREE.Color("#7fd6bd"),
  };
  function setChapter(index) {
    currentChapter = Math.max(0, Math.min(2, index));
    const p = palettes[currentChapter];
    target.fog.set(p[0]);
    target.low.set(p[1]);
    target.high.set(p[2]);
    target.horizon.set(p[3]);
    target.sun.set(p[4]);
    target.plant.set(p[5]);
  }

  // The solid terraces share their transforms with the instanced scenery.
  // Cylindrical ellipses conservatively enclose the low-poly rock layers;
  // the broad phase avoids ellipse work everywhere along the flight route.
  const colliders = [...rocks.flat(), ...caps].map((entry) => {
    const angle = entry.r?.[1] || 0;
    const margin = caps.includes(entry) ? 1.03 : 1;
    return {
      x: entry.p[0],
      y: entry.p[1],
      z: entry.p[2],
      a: entry.s[0] * margin,
      b: entry.s[2] * margin,
      h: entry.s[1] * 0.5,
      cos: Math.cos(angle),
      sin: Math.sin(angle),
      bound: Math.max(entry.s[0], entry.s[2]) * margin,
    };
  });
  function collide(position, radius = 0.6) {
    let contact = null;
    for (const c of colliders) {
      const dx = position.x - c.x,
        dy = position.y - c.y,
        dz = position.z - c.z;
      if (
        Math.abs(dy) > c.h + radius ||
        dx * dx + dz * dz > (c.bound + radius) ** 2
      )
        continue;
      const x = c.cos * dx - c.sin * dz,
        z = c.sin * dx + c.cos * dz;
      const q = Math.hypot(x / c.a, z / c.b);
      let nx = 0,
        ny = 0,
        nz = 0,
        penetration = 0;
      if (q < 1 && Math.abs(dy) < c.h) {
        // Interior points leave through their nearest cap or side.
        const capDistance = c.h - Math.abs(dy);
        const sideDistance =
          q > 1e-9 ? Math.hypot(x / q - x, z / q - z) : Math.min(c.a, c.b);
        if (capDistance <= sideDistance) {
          ny = dy < 0 ? -1 : 1;
          penetration = radius + capDistance;
        } else {
          nx = q > 1e-9 ? x / (c.a * c.a) : 0;
          nz = q > 1e-9 ? z / (c.b * c.b) : 1;
          const length = Math.hypot(nx, nz);
          nx /= length;
          nz /= length;
          penetration = radius + sideDistance;
        }
      } else {
        let nearestX = x,
          nearestZ = z;
        if (q > 1) {
          // Closest point on an ellipse, solved monotonically outside it.
          const aa = c.a * c.a,
            bb = c.b * c.b;
          let lo = 0,
            hi = c.bound * Math.hypot(x, z);
          for (let step = 0; step < 18; step++) {
            const mid = (lo + hi) * 0.5;
            const equation =
              (x * x * aa) / (mid + aa) ** 2 + (z * z * bb) / (mid + bb) ** 2;
            if (equation > 1) lo = mid;
            else hi = mid;
          }
          const lambda = (lo + hi) * 0.5;
          nearestX = (x * aa) / (lambda + aa);
          nearestZ = (z * bb) / (lambda + bb);
        }
        nx = x - nearestX;
        ny = dy - Math.max(-c.h, Math.min(c.h, dy));
        nz = z - nearestZ;
        const distance = Math.hypot(nx, ny, nz);
        if (distance >= radius) continue;
        if (distance > 1e-9) {
          nx /= distance;
          ny /= distance;
          nz /= distance;
        } else {
          nx = 0;
          ny = dy < 0 ? -1 : 1;
          nz = 0;
        }
        penetration = radius - distance;
      }
      if (!contact || penetration > contact.penetration) {
        contact = {
          normal: new THREE.Vector3(
            c.cos * nx + c.sin * nz,
            ny,
            -c.sin * nx + c.cos * nz,
          ),
          penetration,
        };
      }
    }
    return contact;
  }
  return {
    root,
    setChapter,
    collide,
    awaken() {
      awakeningTarget = 1;
    },
    resetAwakening() {
      awakening = 0;
      awakeningTarget = 0;
      uniforms.awakening.value = 0;
    },
    update(time, dt, chapter, playerPosition) {
      uniforms.time.value = time;
      if (chapter !== undefined && chapter !== currentChapter)
        setChapter(chapter);
      const t = 1 - Math.exp(-Math.min(dt || 0.016, 0.1) * 0.5);
      awakening = THREE.MathUtils.clamp(
        awakening +
          (awakeningTarget - awakening) * Math.min(dt || 0.016, 0.1) * 0.42,
        0,
        1,
      );
      uniforms.awakening.value = awakening;
      colors.fog.lerp(
        tintScratch.copy(target.fog).lerp(warmFog, awakening * 0.34),
        t,
      );
      colors.low.lerp(target.low, t);
      colors.high.lerp(target.high, t);
      colors.horizon.lerp(
        tintScratch.copy(target.horizon).lerp(warmHorizon, awakening * 0.7),
        t,
      );
      colors.sun.lerp(tintScratch.copy(target.sun).lerp(warmSun, awakening), t);
      if (scene.fog) scene.fog.color.copy(colors.fog);
      mats.plant.color.lerp(target.plant, t);
      cloudUniforms.tint.value.copy(colors.fog).multiplyScalar(1.3);
      if (playerPosition) {
        sky.position.copy(playerPosition);
      }
      moving.forEach((o) => {
        o.mesh.rotation[o.axis] = o.base + time * o.speed;
      });
      dust.rotation.y = Math.sin(time * 0.011) * 0.035;
      dust.position.y = Math.sin(time * 0.13) * 0.3 + awakening * 2;
      dust.material.opacity = 0.62 + awakening * 0.3;
      dust.material.size = 0.065 + awakening * 0.045;
      mats.pearl.emissiveIntensity = 1.15 + awakening;
      motes.children.forEach((m, i) => {
        const p = m.userData.phase;
        m.position.copy(m.userData.center);
        m.position.x += Math.cos(time * 0.15 + p) * 2;
        m.position.y +=
          Math.sin(time * 0.4 + p) * 0.8 + awakening * (2 + Math.sin(p));
        m.position.z += Math.sin(time * 0.11 + p) * 2;
      });
    },
    dispose() {
      scene.remove(root);
      root.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
      });
      Object.values(mats).forEach((m) => m.dispose());
      sky.material.dispose();
      cloud.material.dispose();
      dust.material.dispose();
    },
  };
}
