// my photo at the top, redrawn as a few thousand dots with webgl.
// the dots fly in to form my face.
// a round window follows the mouse and the real photo shows through it.
// on phones, or if webgl isn't there, none of this runs and the normal photo stays.
(function () {
  const hero = document.getElementById("hero");
  const box = document.querySelector(".hero-photo");
  const img = box && box.querySelector("img");
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!hero || !img || calm || !window.matchMedia("(pointer: fine)").matches || window.innerWidth < 700) return;

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
      return; // happens when the page is opened as a file instead of from a website
    }

    // 2. one dot per dark-enough pixel. darker pixel = bigger, brighter dot
    const dots = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 4;
        const light = (data[i] + data[i + 1] + data[i + 2]) / 765;
        if (light > 0.78) continue; // skip the plain wall behind me
        dots.push(x / cols, y / rows, 1 - light, Math.random());
      }
    }
    const count = dots.length / 4;

    // 3. shaders: the vertex one decides where each dot goes, the fragment one draws it as a soft circle
    const vertex = `
      attribute vec4 a;
      uniform vec2 view;
      uniform vec2 corner;
      uniform vec2 size;
      uniform vec3 lens;
      uniform float time;
      uniform float intro;
      varying float shade;
      void main() {
        vec2 home = corner + a.xy * size;
        float seed = a.w;
        vec2 away = vec2(sin(seed * 91.0), cos(seed * 57.0)) * view * 0.8;
        vec2 p = mix(home + away, home, intro);
        p += vec2(sin(time * 0.8 + seed * 6.28), cos(time * 0.6 + seed * 9.0)) * 1.5;
        vec2 d = p - lens.xy;
        p += normalize(d + 0.001) * max(0.0, lens.z + 28.0 - length(d)) * 0.7;
        vec2 clip = p / view * 2.0 - 1.0;
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
    ["view", "corner", "size", "lens", "time", "intro"].forEach((n) => (u[n] = gl.getUniformLocation(program, n)));

    // 4. the canvas covers the whole top of the page so the dots have room to fly.
    // left, top, w and h are where the photo sits inside it
    let left = 0, top = 0, w = 0, h = 0;
    // the window's centre: (aimX, aimY) is where it's heading, (lensX, lensY) is where it is now
    let aimX = 0, aimY = 0, lensX = 0, lensY = 0;

    // offsetLeft and friends ignore the camera's zooming and turning, which is what we want here.
    // the photo is centred with translate(-50%, -50%), so half its size comes off
    function fit() {
      w = box.offsetWidth;
      h = box.offsetHeight;
      left = box.offsetLeft - w / 2;
      top = box.offsetTop - h / 2;
      canvas.width = hero.offsetWidth * devicePixelRatio;
      canvas.height = hero.offsetHeight * devicePixelRatio;
      gl.viewport(0, 0, canvas.width, canvas.height);
      rest();
    }

    // with no mouse around, the window rests over my eyes
    function rest() {
      aimX = left + w * 0.5;
      aimY = top + h * 0.4;
    }

    hero.appendChild(canvas);
    hero.classList.add("has-gl");
    fit();
    lensX = aimX;
    lensY = aimY;
    window.addEventListener("resize", fit);
    document.addEventListener("mouseleave", rest);

    // the window follows the mouse but never leaves the photo.
    // once the camera has started to move it goes back to its resting place
    window.addEventListener("mousemove", (e) => {
      if (window.scrollY > 20) return rest();
      const outer = hero.getBoundingClientRect();
      aimX = Math.min(Math.max(e.clientX - outer.left, left), left + w);
      aimY = Math.min(Math.max(e.clientY - outer.top, top), top + h);
    });

    // 5. draw every frame
    const begin = performance.now();
    function draw(now) {
      requestAnimationFrame(draw);
      // the lobby is only on screen near the top of the page, so stop drawing after that
      if (window.scrollY > window.innerHeight * 4) return;
      const t = (now - begin) / 1000;
      const intro = Math.min(1, Math.max(0, (t - 1.7) / 1.7));
      const eased = 1 - Math.pow(1 - intro, 3);

      // the window opens once the dots have landed and closes again as the camera leaves
      lensX += (aimX - lensX) * 0.12;
      lensY += (aimY - lensY) * 0.12;
      const radius = w * 0.2 * eased * Math.max(0, 1 - window.scrollY / (window.innerHeight * 0.35));
      hero.style.setProperty("--lx", lensX + "px");
      hero.style.setProperty("--ly", lensY + "px");
      hero.style.setProperty("--lens", radius + "px");

      gl.clearColor(0.055, 0.059, 0.047, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(u.view, canvas.width / devicePixelRatio, canvas.height / devicePixelRatio);
      gl.uniform2f(u.corner, left, top);
      gl.uniform2f(u.size, w, h);
      gl.uniform3f(u.lens, lensX, lensY, radius);
      gl.uniform1f(u.time, t);
      gl.uniform1f(u.intro, eased);
      gl.drawArrays(gl.POINTS, 0, count);
    }
    requestAnimationFrame(draw);
  }
})();
