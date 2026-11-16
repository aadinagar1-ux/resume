// the top photo, redrawn as a few thousand glowing dots with webgl.
// the dots fly in to form my face, move away from the mouse, and drift apart as you scroll down.
// if webgl isn't available (or on phones) nothing happens and the normal photo stays.
(function () {
  const box = document.querySelector(".hero-photo");
  const img = box && box.querySelector("img");
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!box || !img || calm || !window.matchMedia("(pointer: fine)").matches || window.innerWidth < 700) return;

  const canvas = document.createElement("canvas");
  canvas.className = "hero-gl";
  const gl = canvas.getContext("webgl", { antialias: true, premultipliedAlpha: false });
  if (!gl) return;

  const source = new Image();
  source.src = img.getAttribute("src");
  source.onload = start;

  function start() {
    // 1. read the photo's pixels from a small copy of it
    const cols = 150;
    const rows = Math.round(cols * source.height / source.width);
    const sample = document.createElement("canvas");
    sample.width = cols;
    sample.height = rows;
    const ctx = sample.getContext("2d");
    ctx.drawImage(source, 0, 0, cols, rows);
    let data;
    try {
      data = ctx.getImageData(0, 0, cols, rows).data;
    } catch (e) {
      return; // happens when opened as a file, not from a website
    }

    // 2. one dot per dark-enough pixel. darker pixel = bigger, brighter dot
    const dots = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 4;
        const light = (data[i] + data[i + 1] + data[i + 2]) / 765;
        if (light > 0.78) continue; // skip the plain background
        const dark = 1 - light;
        dots.push(x / cols, y / rows, dark, Math.random());
      }
    }
    const count = dots.length / 4;

    // 3. shaders: the vertex one moves each dot, the fragment one draws it as a soft circle
    const vertex = `
      attribute vec4 a;
      uniform vec2 size;
      uniform vec2 mouse;
      uniform float time;
      uniform float intro;
      uniform float scatter;
      varying float shade;
      void main() {
        vec2 home = a.xy * size;
        float seed = a.w;
        vec2 away = vec2(sin(seed * 91.0), cos(seed * 57.0)) * size * 1.4;
        vec2 p = mix(home + away, home, intro);
        p += vec2(sin(time * 0.8 + seed * 6.28), cos(time * 0.6 + seed * 9.0)) * 1.5;
        vec2 d = p - mouse;
        float dist = length(d);
        p += normalize(d + 0.001) * max(0.0, 90.0 - dist) * 0.6;
        p += vec2(sin(seed * 40.0), -1.0 - seed) * scatter * size.y * 0.6;
        vec2 clip = p / size * 2.0 - 1.0;
        gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
        gl_PointSize = (1.2 + a.z * 3.2) * ${window.devicePixelRatio.toFixed(1)};
        shade = a.z;
      }`;
    const fragment = `
      precision mediump float;
      varying float shade;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        if (r > 0.5) discard;
        vec3 lime = vec3(0.82, 1.0, 0.23);
        vec3 paper = vec3(0.95, 0.95, 0.93);
        vec3 c = mix(paper, lime, smoothstep(0.55, 0.9, shade));
        gl_FragColor = vec4(c, (1.0 - r * 2.0) * (0.35 + shade * 0.65));
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
    gl.vertexAttribPointer(a, 4, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    const u = {};
    ["size", "mouse", "time", "intro", "scatter"].forEach((n) => (u[n] = gl.getUniformLocation(program, n)));

    // 4. size the canvas to the photo box, sharp on retina screens
    let w = 0, h = 0;
    function fit() {
      w = box.clientWidth;
      h = box.clientHeight;
      canvas.width = w * devicePixelRatio;
      canvas.height = h * devicePixelRatio;
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    box.appendChild(canvas);
    box.classList.add("has-gl");
    fit();
    window.addEventListener("resize", fit);

    let mx = -999, my = -999;
    window.addEventListener("mousemove", (e) => {
      const r = canvas.getBoundingClientRect();
      mx = (e.clientX - r.left) * (w / r.width);
      my = (e.clientY - r.top) * (h / r.height);
    });

    // 5. draw every frame
    const begin = performance.now();
    function draw(now) {
      requestAnimationFrame(draw);
      // nothing to draw once the top of the page is scrolled away
      if (window.scrollY > window.innerHeight * 1.2) return;
      const t = (now - begin) / 1000;
      const intro = Math.min(1, Math.max(0, (t - 0.9) / 1.6));
      const eased = 1 - Math.pow(1 - intro, 3);
      const scatter = Math.min(1, window.scrollY / window.innerHeight);
      gl.clearColor(0.055, 0.059, 0.047, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(u.size, w, h);
      gl.uniform2f(u.mouse, mx, my);
      gl.uniform1f(u.time, t);
      gl.uniform1f(u.intro, eased);
      gl.uniform1f(u.scatter, scatter);
      gl.drawArrays(gl.POINTS, 0, count);
    }
    requestAnimationFrame(draw);
  }
})();
