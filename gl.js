// the building drawn in dots, behind my photo in the lobby, using webgl.
// it is the same building as the site: 4 floors with the same rooms, and the lift on the right.
// the dots fly in after the loading screen, drift a little, and move out of the way of the mouse.
// on phones, with motion switched off, or if webgl isn't there, none of this runs.
(function () {
  const hero = document.getElementById("hero");
  const calm = document.documentElement.classList.contains("still"); // the motion button is off
  if (!hero || calm || !window.matchMedia("(pointer: fine)").matches || window.innerWidth < 700) return;

  const canvas = document.createElement("canvas");
  canvas.className = "hero-gl";
  const gl = canvas.getContext("webgl", { antialias: true });
  if (!gl) return;

  // 1. the drawing, on a 100 by 70 grid. each line is [x1, y1, x2, y2]
  const lines = [];
  const floors = [2, 5, 3, 5]; // rooms on the ground, first, second and third floor
  const left = 6, right = 80, ground = 66, storey = 14;
  for (let f = 0; f <= floors.length; f++) {
    lines.push([left, ground - f * storey, right, ground - f * storey]); // each floor slab
  }
  lines.push([left, ground, left, ground - 4 * storey]); // outside walls
  lines.push([right, ground, right, ground - 4 * storey]);
  floors.forEach((count, f) => {
    for (let r = 1; r < count; r++) {
      const x = left + ((right - left) * r) / count;
      lines.push([x, ground - f * storey, x, ground - f * storey - storey * 0.72]); // walls between rooms, with a gap for the door
    }
  });
  // the lift shaft on the right, and the car standing at the ground floor
  lines.push([right, ground, right + 12, ground], [right + 12, ground, right + 12, ground - 4 * storey - 6], [right, ground - 4 * storey - 6, right + 12, ground - 4 * storey - 6]);
  lines.push([right + 2, ground - 1, right + 10, ground - 1], [right + 2, ground - 1, right + 2, ground - 11], [right + 10, ground - 1, right + 10, ground - 11], [right + 2, ground - 11, right + 10, ground - 11]);
  // the ground, running off both sides
  lines.push([-20, ground, 120, ground]);

  // 2. dots along every line, about one per unit
  const dots = [];
  for (const [x1, y1, x2, y2] of lines) {
    const steps = Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1) * 1.6));
    for (let i = 0; i <= steps; i++) {
      dots.push(x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps, Math.random());
    }
  }
  const count = dots.length / 3;

  // 3. shaders: the vertex one decides where each dot goes, the fragment one draws it as a soft circle
  const vertex = `
    attribute vec3 a;
    uniform vec2 view;
    uniform vec2 mouse;
    uniform float scale;
    uniform float time;
    uniform float intro;
    varying float glow;
    void main() {
      vec2 home = vec2(view.x * 0.5 + (a.x - 50.0) * scale, view.y * 0.5 + (a.y - 38.0) * scale);
      float seed = a.z;
      vec2 away = vec2(sin(seed * 91.0), cos(seed * 57.0)) * view;
      vec2 p = mix(home + away, home, intro);
      p += vec2(sin(time * 0.7 + seed * 6.28), cos(time * 0.5 + seed * 9.0)) * 1.2;
      vec2 d = p - mouse;
      float near = max(0.0, 1.0 - length(d) / 150.0);
      p += normalize(d + 0.001) * near * near * 46.0;
      glow = near;
      vec2 clip = p / view * 2.0 - 1.0;
      gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
      gl_PointSize = (3.2 + near * 2.6) * ${window.devicePixelRatio.toFixed(1)};
    }`;
  const fragment = `
    precision mediump float;
    varying float glow;
    void main() {
      float r = length(gl_PointCoord - 0.5);
      if (r > 0.5) discard;
      vec3 grey = vec3(0.62, 0.64, 0.58);
      vec3 lime = vec3(0.82, 1.0, 0.23);
      gl_FragColor = vec4(mix(grey, lime, glow), (1.0 - r * 2.0) * (0.75 + glow * 0.25));
    }`;

  function compile(type, code) {
    const s = gl.createShader(type);
    gl.shaderSource(s, code);
    gl.compileShader(s);
    return s;
  }
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
  gl.useProgram(program);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(dots), gl.STATIC_DRAW);
  const a = gl.getAttribLocation(program, "a");
  gl.enableVertexAttribArray(a);
  gl.vertexAttribPointer(a, 3, gl.FLOAT, false, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const u = {};
  ["view", "mouse", "scale", "time", "intro"].forEach((n) => (u[n] = gl.getUniformLocation(program, n)));

  // 4. the canvas covers the lobby. the drawing is scaled to fit its width
  let w = 0, h = 0;
  function fit() {
    w = hero.offsetWidth;
    h = hero.offsetHeight;
    canvas.width = w * devicePixelRatio;
    canvas.height = h * devicePixelRatio;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  hero.prepend(canvas);
  fit();
  window.addEventListener("resize", fit);

  // the mouse, relative to the lobby. it starts far away so nothing is pushed until it moves
  let mouseX = -9999, mouseY = -9999, aimX = -9999, aimY = -9999;
  window.addEventListener("mousemove", (e) => {
    const box = canvas.getBoundingClientRect();
    aimX = e.clientX - box.left;
    aimY = e.clientY - box.top;
    if (mouseX < -999) {
      mouseX = aimX;
      mouseY = aimY;
    }
  });

  // 5. draw every frame, but only while the lobby is on screen
  const begin = performance.now();
  function draw(now) {
    requestAnimationFrame(draw);
    const box = canvas.getBoundingClientRect();
    if (box.right < 0 || box.left > window.innerWidth || box.bottom < 0) return;
    const t = (now - begin) / 1000;
    const intro = Math.min(1, Math.max(0, (t - 2.2) / 1.6));
    mouseX += (aimX - mouseX) * 0.15;
    mouseY += (aimY - mouseY) * 0.15;

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(u.view, w, h);
    gl.uniform2f(u.mouse, mouseX, mouseY);
    gl.uniform1f(u.scale, Math.min(w / 92, h / 62));
    gl.uniform1f(u.time, t);
    gl.uniform1f(u.intro, 1 - Math.pow(1 - intro, 3));
    gl.drawArrays(gl.POINTS, 0, count);
  }
  requestAnimationFrame(draw);
})();
