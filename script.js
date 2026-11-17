// the things css can't do on its own:
// 1. smooth scrolling with the mouse wheel
// 2. the ring that trails the mouse
// 3. buttons that lean towards the mouse
// 4. the bengaluru clock
// 5. headings that start as random letters and settle
// 6. the map in the bottom corner and the room links
// 7. my name leaning away from the mouse
// 8. the lime wipe when you jump to a room
// 9. the small simulation in the research lab

const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = window.matchMedia("(pointer: fine)").matches;

// 1. smooth scroll: the wheel sets a target and the page eases towards it
if (!calm && finePointer) {
  let target = window.scrollY;
  let current = window.scrollY;
  let moving = false;

  window.addEventListener("wheel", (e) => {
    if (e.ctrlKey) return; // let pinch-zoom work normally
    e.preventDefault();
    const max = document.documentElement.scrollHeight - window.innerHeight;
    target = Math.min(Math.max(target + e.deltaY, 0), max);
    if (!moving) {
      moving = true;
      requestAnimationFrame(glide);
    }
  }, { passive: false });

  function glide() {
    current += (target - current) * 0.1;
    if (Math.abs(target - current) < 0.5) {
      current = target;
      moving = false;
    }
    window.scrollTo(0, current);
    if (moving) requestAnimationFrame(glide);
  }

  // if the page moves some other way (nav links, keyboard, scrollbar), start from there
  window.addEventListener("scroll", () => {
    if (!moving) {
      target = window.scrollY;
      current = window.scrollY;
    }
  });
}

// 2. trailing ring. it grows over anything you can click, and a few things give it a word
const ring = document.querySelector(".cursor");
if (ring && finePointer) {
  let mouseX = 0, mouseY = 0, ringX = 0, ringY = 0;

  window.addEventListener("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    document.documentElement.classList.add("has-cursor"); // only show the ring once the mouse has moved
  });

  (function follow() {
    ringX += (mouseX - ringX) * 0.18;
    ringY += (mouseY - ringY) * 0.18;
    ring.style.transform = `translate(${ringX}px, ${ringY}px)`;
    requestAnimationFrame(follow);
  })();

  document.querySelectorAll("a, button, select, textarea, .flip").forEach((el) => {
    el.addEventListener("mouseenter", () => {
      ring.classList.add("is-big");
      if (el.dataset.cursor) {
        ring.dataset.word = el.dataset.cursor;
        ring.classList.add("has-word");
      }
    });
    el.addEventListener("mouseleave", () => {
      ring.classList.remove("is-big", "has-word");
    });
  });
}

// 3. magnetic buttons
if (!calm && finePointer) {
  document.querySelectorAll(".btn").forEach((btn) => {
    btn.addEventListener("mousemove", (e) => {
      const box = btn.getBoundingClientRect();
      const x = e.clientX - box.left - box.width / 2;
      const y = e.clientY - box.top - box.height / 2;
      btn.style.transform = `translate(${x * 0.25}px, ${y * 0.35}px)`;
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.transform = "";
    });
  });
}

// 4. clock
const clock = document.getElementById("clock");
if (clock) {
  const tick = () => {
    clock.textContent = new Date().toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
    });
  };
  tick();
  setInterval(tick, 10000);
}

// 5. text runs through random letters, then settles on the real word from left to right
const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function scramble(el) {
  clearInterval(el.timer); // in case it's still settling from last time
  const real = el.dataset.real || el.textContent;
  el.dataset.real = real;
  let frame = 0;
  const total = 18;
  el.timer = setInterval(() => {
    frame++;
    let out = "";
    for (let i = 0; i < real.length; i++) {
      const settled = i < (frame / total) * real.length;
      out += settled || real[i] === " " ? real[i] : letters[Math.floor(Math.random() * letters.length)];
    }
    el.textContent = out;
    if (frame >= total) clearInterval(el.timer);
  }, 45);
}

if (!calm) {
  const seen = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        scramble(entry.target);
        seen.unobserve(entry.target); // only once per heading
      }
    });
  }, { threshold: 0.6 });
  document.querySelectorAll("[data-decode]").forEach((h) => seen.observe(h));
}

// 6. the floor plan. every room has a css variable --at: how far through the scroll (in %)
// the camera reaches it. this reads those numbers once and uses them for two things:
// the room name next to the corner map, and jumping to a room from a link
const plan = document.querySelector(".plan");
const stage = document.querySelector(".stage");
const where = document.getElementById("where");
const rooms = [];

document.querySelectorAll(".room").forEach((room) => {
  const title = room.querySelector(".plate h2");
  rooms.push({
    id: room.id,
    name: title ? title.textContent.toLowerCase() : room.id === "hero" ? "lobby" : "corridor",
    at: parseFloat(getComputedStyle(room).getPropertyValue("--at")) / 100,
  });
});

// true when the camera version is running (big screen, browser supports it)
function pinned() {
  return getComputedStyle(stage).position === "sticky";
}

// how far through the plan the page is scrolled, from 0 to 1
function progress() {
  const span = plan.offsetHeight - window.innerHeight;
  return Math.min(1, Math.max(0, (window.scrollY - plan.offsetTop) / span));
}

if (where) {
  let current = "";
  window.addEventListener("scroll", () => {
    if (!pinned()) return;
    const now = progress() + 0.012; // name the room a moment before the camera stops
    let room = rooms[0];
    for (let i = 0; i < rooms.length; i++) {
      if (rooms[i].at <= now) room = rooms[i];
    }
    if (room.name !== current) {
      current = room.name;
      where.parentElement.classList.toggle("is-on", room.id !== "hero"); // no map over my name in the lobby
      where.dataset.real = room.name;
      if (calm) where.textContent = room.name;
      else scramble(where);
    }
  });
}

// where to scroll to for a room: its place on the route when the camera is running,
// or just the top of the room when the rooms are stacked
function scrollSpot(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  if (!pinned()) return el.getBoundingClientRect().top + window.scrollY;
  const room = rooms.find((r) => r.id === id);
  const span = plan.offsetHeight - window.innerHeight;
  // a little past the room's own mark, so the camera has fully stopped (the lobby is just the top)
  return plan.offsetTop + (room.at ? room.at + 0.006 : 0) * span;
}

// 7. the mouse position goes into two css variables (-0.5 to 0.5) and the css moves my name with them
const hero = document.getElementById("hero");
if (hero && finePointer && !calm) {
  let aimX = 0, aimY = 0, nowX = 0, nowY = 0;
  window.addEventListener("mousemove", (e) => {
    aimX = e.clientX / window.innerWidth - 0.5;
    aimY = e.clientY / window.innerHeight - 0.5;
  });
  (function lean() {
    nowX += (aimX - nowX) * 0.06;
    nowY += (aimY - nowY) * 0.06;
    if (window.scrollY < window.innerHeight) {
      hero.style.setProperty("--px", nowX.toFixed(3));
      hero.style.setProperty("--py", nowY.toFixed(3));
    }
    requestAnimationFrame(lean);
  })();
}

// 8. room links: the lime panel comes up with the room's name on it,
// the page jumps behind it, and the panel carries on up and away
const wipe = document.querySelector(".wipe");
document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (e) => {
    const spot = scrollSpot(link.getAttribute("href").slice(1));
    if (spot === null) return;
    e.preventDefault();
    if (calm || !wipe) {
      window.scrollTo(0, spot);
      return;
    }
    wipe.textContent = link.dataset.text || link.textContent.trim();
    wipe.className = "wipe wipe-in";
    setTimeout(() => {
      window.scrollTo({ top: spot, behavior: "instant" });
      wipe.className = "wipe wipe-out";
    }, 600);
  });
});

// 9. a small monte carlo run for the research lab.
// each run picks a random answer from the range in our abstract (47 to 140, middle 84)
// and drops a dot on that spot of the axis, so the dots pile up where answers are most likely.
// it's only a picture of the idea. the real model ran in python
const sim = document.getElementById("sim");
if (sim) {
  const pen = sim.getContext("2d");
  const slots = 60; // the axis goes from 0 to 150, cut into 60 slots
  let run = 0;

  // one random number from a bell curve (box-muller method)
  function bell() {
    return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
  }

  function runSim() {
    run++;
    const mine = run;
    const piles = new Array(slots).fill(0);
    const dots = [];

    for (let i = 0; i < 400; i++) {
      const litres = 84 * Math.exp(0.33 * bell());
      if (litres >= 150) continue;
      const slot = Math.floor((litres / 150) * slots);
      dots.push({
        slot: slot,
        level: piles[slot],
        start: i * 0.4, // each dot starts falling a little after the one before
        inside: litres >= 47 && litres <= 140,
      });
      piles[slot]++;
    }

    let frame = calm ? 999 : 0;
    function draw() {
      if (mine !== run) return; // a newer run has started, so this one stops
      pen.clearRect(0, 0, sim.width, sim.height);
      for (const dot of dots) {
        const fall = Math.min(1, (frame - dot.start) / 28);
        if (fall <= 0) continue;
        const x = ((dot.slot + 0.5) * sim.width) / slots;
        const rest = sim.height - 9 - dot.level * 15;
        pen.fillStyle = dot.inside ? "#d2ff3a" : "#8f9186";
        pen.beginPath();
        pen.arc(x, rest * fall * fall, 6, 0, Math.PI * 2);
        pen.fill();
      }
      frame++;
      if (frame < 200) requestAnimationFrame(draw);
    }
    draw();
  }

  // first run when the chart scrolls into view, then whenever the button is pressed
  const ready = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      runSim();
      ready.disconnect();
    }
  }, { threshold: 0.5 });
  ready.observe(sim);

  document.getElementById("again").addEventListener("click", runSim);
}
