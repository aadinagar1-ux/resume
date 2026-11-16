// small extras that css can't do on its own:
// 1. smooth scrolling with the mouse wheel
// 2. a ring that follows the mouse
// 3. buttons that pull towards the mouse
// 4. live bengaluru time in the top corner
// 5-8. heading scramble, section tracker, top of page follows the mouse, section wipe

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

// 2. trailing cursor ring
const ring = document.querySelector(".cursor");
if (ring && finePointer) {
  let mouseX = 0, mouseY = 0, ringX = 0, ringY = 0;
  document.documentElement.classList.add("has-cursor");

  window.addEventListener("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  (function follow() {
    ringX += (mouseX - ringX) * 0.18;
    ringY += (mouseY - ringY) * 0.18;
    ring.style.transform = `translate(${ringX}px, ${ringY}px)`;
    requestAnimationFrame(follow);
  })();

  // ring gets bigger over anything clickable
  document.querySelectorAll("a, button, select, .card").forEach((el) => {
    el.addEventListener("mouseenter", () => ring.classList.add("is-big"));
    el.addEventListener("mouseleave", () => ring.classList.remove("is-big"));
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

// 5. headings scramble through random letters, then settle on the real word
const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function scramble(heading) {
  // only change the text, so <br> and the outlined <span> stay in place
  const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
  const parts = [];
  while (walker.nextNode()) {
    parts.push({ node: walker.currentNode, real: walker.currentNode.textContent });
  }
  let frame = 0;
  const total = 18;
  const timer = setInterval(() => {
    frame++;
    for (const part of parts) {
      let out = "";
      for (let i = 0; i < part.real.length; i++) {
        const ch = part.real[i];
        const settled = i < (frame / total) * part.real.length;
        out += settled || ch.trim() === "" ? ch : letters[Math.floor(Math.random() * letters.length)];
      }
      part.node.textContent = out;
    }
    if (frame >= total) clearInterval(timer);
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
  document.querySelectorAll("main h2").forEach((h) => seen.observe(h));
}

// 6. section tracker: light up the dot of the section on screen
const dots = document.querySelectorAll(".tracker a");
const watch = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    dots.forEach((dot) => {
      dot.classList.toggle("is-here", dot.getAttribute("href") === "#" + entry.target.id);
    });
  });
}, { rootMargin: "-45% 0px -45% 0px" });
dots.forEach((dot) => {
  const section = document.querySelector(dot.getAttribute("href"));
  if (section) watch.observe(section);
});
// the top of the page has no dot, so watching it switches them all off (and the tracker hides)
const heroSection = document.getElementById("hero");
if (heroSection) watch.observe(heroSection);

if (finePointer && !calm) {
  // 7. the top of the page follows the mouse wherever it is on screen:
  // the photo turns to face it, and the name and lime block shift a little (layers)
  const hero = document.getElementById("hero");
  const photo = document.querySelector(".hero-photo img");
  if (hero && photo) {
    let aimX = 0, aimY = 0, nowX = 0, nowY = 0;
    window.addEventListener("mousemove", (e) => {
      aimX = e.clientX / window.innerWidth - 0.5;
      aimY = e.clientY / window.innerHeight - 0.5;
    });
    (function look() {
      nowX += (aimX - nowX) * 0.08;
      nowY += (aimY - nowY) * 0.08;
      const moving = Math.abs(aimX - nowX) > 0.001 || Math.abs(aimY - nowY) > 0.001;
      if (moving && window.scrollY < window.innerHeight) {
        photo.style.transform = `perspective(900px) rotateY(${nowX * 22}deg) rotateX(${-nowY * 16}deg)`;
        hero.style.setProperty("--px", nowX.toFixed(3));
        hero.style.setProperty("--py", nowY.toFixed(3));
      }
      requestAnimationFrame(look);
    })();
  }
}

// 8. section links: a lime panel with the section's name wipes across, the page jumps, the panel wipes away
const wipe = document.querySelector(".wipe");
if (wipe && !calm) {
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (e) => {
      const target = document.querySelector(link.getAttribute("href"));
      if (!target) return;
      e.preventDefault();
      wipe.textContent = link.dataset.text || link.dataset.label || link.textContent.trim();
      wipe.className = "wipe wipe-in";
      setTimeout(() => {
        window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY, behavior: "instant" });
        wipe.className = "wipe wipe-out";
      }, 550);
    });
  });
}
