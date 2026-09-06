(() => {
  "use strict";

  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");

  const ui = {
    types: document.getElementById("types"),
    typesVal: document.getElementById("typesVal"),
    count: document.getElementById("count"),
    countVal: document.getElementById("countVal"),
    force: document.getElementById("force"),
    forceVal: document.getElementById("forceVal"),
    radius: document.getElementById("radius"),
    radiusVal: document.getElementById("radiusVal"),
    friction: document.getElementById("friction"),
    frictionVal: document.getElementById("frictionVal"),
    trails: document.getElementById("trails"),
    randomizeMatrix: document.getElementById("randomizeMatrix"),
    randomizePositions: document.getElementById("randomizePositions"),
    pause: document.getElementById("pause"),
    matrix: document.getElementById("matrix"),
    fps: document.getElementById("fps"),
    panel: document.getElementById("panel"),
    toggleUI: document.getElementById("toggleUI"),
  };

  const state = {
    typeCount: parseInt(ui.types.value, 10),
    particleCount: parseInt(ui.count.value, 10),
    forceStrength: parseFloat(ui.force.value),
    radius: parseFloat(ui.radius.value),
    friction: parseFloat(ui.friction.value),
    trails: ui.trails.checked,
    paused: false,
    matrix: [],
    particles: [],
    colors: [],
  };

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener("resize", resize);
  resize();

  function hslColor(i, n) {
    const hue = (360 * i) / n;
    return `hsl(${hue.toFixed(0)}, 85%, 62%)`;
  }

  function buildColors() {
    state.colors = Array.from({ length: state.typeCount }, (_, i) =>
      hslColor(i, state.typeCount)
    );
  }

  function randomizeMatrix() {
    state.matrix = Array.from({ length: state.typeCount }, () =>
      Array.from({ length: state.typeCount }, () => Math.random() * 2 - 1)
    );
    renderMatrixUI();
  }

  function renderMatrixUI() {
    ui.matrix.style.gridTemplateColumns = `repeat(${state.typeCount}, 1fr)`;
    ui.matrix.innerHTML = "";
    for (let i = 0; i < state.typeCount; i++) {
      for (let j = 0; j < state.typeCount; j++) {
        const v = state.matrix[i][j];
        const cell = document.createElement("div");
        cell.className = "cell";
        const intensity = Math.min(1, Math.abs(v));
        cell.style.background =
          v >= 0
            ? `rgba(90, 200, 120, ${0.15 + intensity * 0.7})`
            : `rgba(230, 80, 90, ${0.15 + intensity * 0.7})`;
        cell.title = `${state.colors[i]} -> ${state.colors[j]}: ${v.toFixed(2)}`;
        ui.matrix.appendChild(cell);
      }
    }
  }

  function spawnParticles() {
    state.particles = Array.from({ length: state.particleCount }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: 0,
      vy: 0,
      type: Math.floor(Math.random() * state.typeCount),
    }));
  }

  function scatterPositions() {
    for (const p of state.particles) {
      p.x = Math.random() * canvas.width;
      p.y = Math.random() * canvas.height;
      p.vx = 0;
      p.vy = 0;
    }
  }

  // Uniform spatial grid so force lookups stay roughly O(n) instead of O(n^2).
  class Grid {
    constructor(width, height, cellSize) {
      this.cellSize = cellSize;
      this.cols = Math.max(1, Math.ceil(width / cellSize));
      this.rows = Math.max(1, Math.ceil(height / cellSize));
      this.buckets = new Map();
    }
    key(cx, cy) {
      return cy * this.cols + cx;
    }
    clear() {
      this.buckets.clear();
    }
    insert(p, index) {
      const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(p.x / this.cellSize)));
      const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(p.y / this.cellSize)));
      const k = this.key(cx, cy);
      let bucket = this.buckets.get(k);
      if (!bucket) {
        bucket = [];
        this.buckets.set(k, bucket);
      }
      bucket.push(index);
    }
    forNeighbors(p, callback) {
      const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(p.x / this.cellSize)));
      const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(p.y / this.cellSize)));
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
          const bucket = this.buckets.get(this.key(nx, ny));
          if (!bucket) continue;
          for (const idx of bucket) callback(idx);
        }
      }
    }
  }

  let grid = new Grid(canvas.width, canvas.height, state.radius);

  function step() {
    const { particles, matrix, radius, forceStrength, friction } = state;
    if (grid.cellSize !== radius || grid.cols !== Math.ceil(canvas.width / radius)) {
      grid = new Grid(canvas.width, canvas.height, radius);
    }
    grid.clear();
    for (let i = 0; i < particles.length; i++) grid.insert(particles[i], i);

    const r2 = radius * radius;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      let fx = 0;
      let fy = 0;

      grid.forNeighbors(p, (j) => {
        if (j === i) return;
        const q = particles[j];
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 1 || d2 > r2) return;
        const d = Math.sqrt(d2);
        const g = matrix[p.type][q.type];

        // Short-range repulsion everyone shares, plus the type-pair
        // attraction/repulsion from the matrix at medium range.
        const minDist = radius * 0.25;
        let force;
        if (d < minDist) {
          force = (d / minDist - 1) * 1.2;
        } else {
          force = g * (1 - Math.abs(2 * (d - minDist) / (radius - minDist) - 1));
        }
        fx += (dx / d) * force;
        fy += (dy / d) * force;
      });

      p.vx = (p.vx + fx * forceStrength * 0.35) * friction;
      p.vy = (p.vy + fy * forceStrength * 0.35) * friction;
    }

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x += canvas.width;
      if (p.x >= canvas.width) p.x -= canvas.width;
      if (p.y < 0) p.y += canvas.height;
      if (p.y >= canvas.height) p.y -= canvas.height;
    }
  }

  function draw() {
    if (state.trails) {
      ctx.fillStyle = "rgba(5, 5, 10, 0.18)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = "#05050a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    for (const p of state.particles) {
      ctx.fillStyle = state.colors[p.type];
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  let lastFrame = performance.now();
  let frames = 0;
  let fpsAccum = 0;

  function loop(now) {
    requestAnimationFrame(loop);
    const dt = now - lastFrame;
    lastFrame = now;
    frames++;
    fpsAccum += dt;
    if (fpsAccum >= 500) {
      ui.fps.textContent = Math.round((frames * 1000) / fpsAccum);
      frames = 0;
      fpsAccum = 0;
    }
    if (state.paused) return;
    step();
    draw();
  }

  function init() {
    buildColors();
    randomizeMatrix();
    spawnParticles();
    requestAnimationFrame(loop);
  }

  ui.types.addEventListener("input", () => {
    state.typeCount = parseInt(ui.types.value, 10);
    ui.typesVal.textContent = state.typeCount;
    buildColors();
    randomizeMatrix();
    for (const p of state.particles) p.type = Math.floor(Math.random() * state.typeCount);
  });

  ui.count.addEventListener("input", () => {
    state.particleCount = parseInt(ui.count.value, 10);
    ui.countVal.textContent = state.particleCount;
    spawnParticles();
  });

  ui.force.addEventListener("input", () => {
    state.forceStrength = parseFloat(ui.force.value);
    ui.forceVal.textContent = state.forceStrength.toFixed(1);
  });

  ui.radius.addEventListener("input", () => {
    state.radius = parseFloat(ui.radius.value);
    ui.radiusVal.textContent = state.radius;
  });

  ui.friction.addEventListener("input", () => {
    state.friction = parseFloat(ui.friction.value);
    ui.frictionVal.textContent = state.friction.toFixed(2);
  });

  ui.trails.addEventListener("change", () => {
    state.trails = ui.trails.checked;
  });

  ui.randomizeMatrix.addEventListener("click", randomizeMatrix);
  ui.randomizePositions.addEventListener("click", scatterPositions);
  ui.pause.addEventListener("click", () => {
    state.paused = !state.paused;
    ui.pause.textContent = state.paused ? "Resume" : "Pause";
  });
  ui.toggleUI.addEventListener("click", () => {
    ui.panel.classList.toggle("hidden");
  });

  canvas.addEventListener("pointerdown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    for (const p of state.particles) {
      const dx = p.x - x;
      const dy = p.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 40000) {
        const d = Math.sqrt(d2) || 1;
        p.vx += (dx / d) * 6;
        p.vy += (dy / d) * 6;
      }
    }
  });

  init();
})();
