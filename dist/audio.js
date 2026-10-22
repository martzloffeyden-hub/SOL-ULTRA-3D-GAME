// HÉLIO's entire score and sound palette are synthesized locally.
// No AudioContext is created until the player presses the launch button.
export class AudioGarden {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.paused = false;
    this.chapter = 0;
    this.step = 0;
    this.nextNote = 0;
    this.nextChord = 0;
    this.pad = [];
    this.lastEvent = Object.create(null);
    this.harmonies = [
      [
        [50, 57, 62, 64],
        [46, 53, 60, 65],
        [48, 55, 62, 67],
        [53, 57, 60, 64],
      ],
      [
        [47, 54, 61, 66],
        [43, 50, 57, 62],
        [45, 52, 59, 64],
        [42, 49, 56, 61],
      ],
      [
        [50, 57, 64, 69],
        [53, 60, 65, 69],
        [55, 62, 67, 74],
        [57, 64, 69, 74],
      ],
    ];
  }

  async start() {
    try {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Context) return;
      if (!this.ctx) {
        this.ctx = new Context({ latencyHint: "interactive" });
        const c = this.ctx;
        this.master = c.createGain();
        this.master.gain.value = 0;
        const limiter = c.createDynamicsCompressor();
        limiter.threshold.value = -13;
        limiter.knee.value = 22;
        limiter.ratio.value = 5;
        limiter.attack.value = 0.008;
        limiter.release.value = 0.35;
        this.master.connect(limiter).connect(c.destination);
        this.bus = c.createGain();
        this.bus.gain.value = 1;
        this.bus.connect(this.master);
        this.reverb = c.createConvolver();
        const length = Math.floor(c.sampleRate * 2.8);
        const impulse = c.createBuffer(2, length, c.sampleRate);
        for (let channel = 0; channel < 2; channel++) {
          const samples = impulse.getChannelData(channel);
          for (let i = 0; i < length; i++) {
            const envelope = Math.pow(1 - i / length, 3.4);
            samples[i] = (Math.random() * 2 - 1) * envelope * 0.5;
          }
        }
        this.reverb.buffer = impulse;
        this.wet = c.createGain();
        this.wet.gain.value = 0.33;
        this.reverb.connect(this.wet).connect(this.bus);
        this._createAir();
        this.nextChord = c.currentTime;
        this.nextNote = c.currentTime + 0.9;
      }
      if (this.ctx.state === "suspended") await this.ctx.resume();
      this.paused = false;
      this._ramp(this.bus.gain, 1, 0.4);
      this._ramp(this.master.gain, this.muted ? 0 : 0.7, 0.65);
    } catch (_) {
      // A browser denying audio must never prevent the game from starting.
    }
  }

  _ramp(parameter, value, duration = 0.2) {
    if (!this.ctx || !parameter) return;
    const now = this.ctx.currentTime;
    parameter.cancelScheduledValues(now);
    parameter.setTargetAtTime(value, now, Math.max(0.015, duration / 3));
  }

  _createAir() {
    const c = this.ctx;
    const buffer = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
    const data = buffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < data.length; i++) {
      brown = (brown + 0.025 * (Math.random() * 2 - 1)) / 1.025;
      data[i] = brown * 3.5;
    }
    this.air = c.createBufferSource();
    this.air.buffer = buffer;
    this.air.loop = true;
    this.airFilter = c.createBiquadFilter();
    this.airFilter.type = "bandpass";
    this.airFilter.frequency.value = 500;
    this.airFilter.Q.value = 0.35;
    this.airGain = c.createGain();
    this.airGain.gain.value = 0.014;
    this.air.connect(this.airFilter).connect(this.airGain).connect(this.bus);
    this.air.start();
    this.engine = c.createOscillator();
    this.engine.type = "sine";
    this.engine.frequency.value = 68;
    this.engineGain = c.createGain();
    this.engineGain.gain.value = 0.002;
    this.engine.connect(this.engineGain).connect(this.bus);
    this.engine.start();
  }

  setMuted(value) {
    this.muted = Boolean(value);
    if (this.master) this._ramp(this.master.gain, this.muted ? 0 : 0.7, 0.18);
  }

  setChapter(index) {
    this.chapter = Math.max(0, Math.min(2, Number(index) || 0));
    this.step = 0;
    if (this.ctx) {
      this.nextChord = this.ctx.currentTime + 0.15;
      this.nextNote = this.ctx.currentTime + 1.5;
    }
  }

  pause(value) {
    this.paused = Boolean(value);
    if (this.bus) this._ramp(this.bus.gain, this.paused ? 0.08 : 1, 0.35);
    if (!this.paused && this.ctx) {
      this.nextNote = Math.max(this.nextNote, this.ctx.currentTime + 0.3);
      this.nextChord = Math.max(this.nextChord, this.ctx.currentTime + 0.2);
    }
  }

  _tone(midi, at, duration, volume, type = "sine", pan = 0) {
    const c = this.ctx;
    const osc = c.createOscillator();
    const gain = c.createGain();
    const stereo = c.createStereoPanner
      ? c.createStereoPanner()
      : c.createGain();
    if (stereo.pan) stereo.pan.value = pan;
    osc.type = type;
    osc.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(gain).connect(stereo);
    stereo.connect(this.bus);
    stereo.connect(this.reverb);
    osc.start(at);
    osc.stop(at + duration + 0.03);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
      stereo.disconnect();
    };
  }

  _chord(at) {
    const c = this.ctx;
    const progression = this.harmonies[this.chapter];
    const chord = progression[Math.floor(this.step / 8) % progression.length];
    // Slow attack keeps the garden's harmony a soft physical presence.
    chord.slice(0, 3).forEach((note, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "sine";
      osc.frequency.value = 440 * Math.pow(2, (note - 12 - 69) / 12);
      osc.detune.value = (i - 1) * 4;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.026, at + 2.2);
      gain.gain.setValueAtTime(0.026, at + 5.5);
      gain.gain.linearRampToValueAtTime(0, at + 9);
      osc.connect(gain);
      gain.connect(this.bus);
      gain.connect(this.reverb);
      osc.start(at);
      osc.stop(at + 9.05);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    });
  }

  update(dt, speed = 0, carrying = false) {
    const c = this.ctx;
    if (!c || c.state !== "running" || this.paused) return;
    const now = c.currentTime;
    const movement = Math.max(0, Math.min(1, Math.abs(speed) / 14));
    this.airGain.gain.setTargetAtTime(0.012 + movement * 0.075, now, 0.25);
    this.airFilter.frequency.setTargetAtTime(350 + movement * 1250, now, 0.3);
    this.engineGain.gain.setTargetAtTime(0.002 + movement * 0.012, now, 0.3);
    this.engine.frequency.setTargetAtTime(67 + movement * 28, now, 0.4);
    if (now >= this.nextChord) {
      this._chord(now + 0.02);
      this.nextChord = now + 7.8;
    }
    if (now >= this.nextNote) {
      const chord = this.harmonies[this.chapter][Math.floor(this.step / 8) % 4];
      const pattern = [0, 2, 1, 3, 2, 1, 3, 2];
      const note = chord[pattern[this.step % 8]] + (carrying ? 12 : 0);
      this._tone(
        note,
        now + 0.015,
        2.4,
        carrying ? 0.04 : 0.026,
        "sine",
        Math.sin(this.step * 1.7) * 0.4,
      );
      if (this.step % 4 === 2) this._tone(note + 12, now + 0.2, 1.8, 0.008);
      this.step++;
      this.nextNote = now + [1.25, 1.7, 1.25, 2.1][this.step % 4];
    }
  }

  play(name) {
    if (!this.ctx || this.ctx.state !== "running") return;
    const now = this.ctx.currentTime;
    // Collision contacts can fire every frame; sounds should remain intentional.
    if (now - (this.lastEvent[name] ?? -100) < (name === "impact" ? 0.5 : 0.1))
      return;
    this.lastEvent[name] = now;
    const phrases = {
      gate: [74, 81, 86],
      pickup: [62, 69, 74, 81],
      switch: [69, 76],
      deliver: [62, 66, 69, 74, 81, 86],
      win: [62, 69, 74, 78, 81, 86, 90, 93],
      menu: [69, 74],
      boost: [50, 57],
    };
    if (name === "impact") {
      this._tone(38, now, 0.3, 0.12, "triangle");
      this._tone(43, now + 0.02, 0.45, 0.045, "sine", -0.2);
      return;
    }
    const phrase = phrases[name];
    if (!phrase) return;
    const spacing = name === "win" ? 0.17 : name === "deliver" ? 0.11 : 0.075;
    phrase.forEach((note, i) => {
      const at = now + i * spacing;
      this._tone(
        note,
        at,
        name === "win" ? 3.2 : 1.8,
        name === "boost" ? 0.035 : 0.105,
        "sine",
        ((i % 3) - 1) * 0.22,
      );
      if (name !== "boost") this._tone(note + 12, at + 0.012, 0.7, 0.018);
    });
  }
}
