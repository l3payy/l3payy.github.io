/* ─────────────────────────────────────────────────────────
   The shelf.

   A horizontal row of large 440×345 frosted cards with a real
   gap between them. The row is endless: as you drag, cards
   slide off one screen edge and come back from the other.

   Movement: drag follows with a short ease; card-to-card moves
   use a quick ease-out that finishes exactly on target, so the
   row never ends with a visible pixel jump.

   Depth: the centred card is full size, cards further from the
   centre shrink down to MIN_SCALE.

   Glass is a plain `backdrop-filter: blur(6px)` (css/style.css)
   plus a 2px 8% white border. Each card gets its own random
   tilt (-7°..+7°, never 0) when the page loads.
   ───────────────────────────────────────────────────────── */

(() => {
  "use strict";

  /* Bump when replacing card images (cache-busting). */
  const IMG_VERSION = "20261106-03";

  const CARDS = [
    {
      image: `cardImages/arenda.webp?v=${IMG_VERSION}`,
      alt: "Баннеры для Мир Аренды",
      href: "https://www.behance.net/gallery/246954043/banery-dlja-mir-arendy",
    },
    {
      image: `cardImages/aukus4.webp?v=${IMG_VERSION}`,
      alt: "Aukus 2024 Twitch Event",
      href: "https://www.behance.net/gallery/207948175/AUKUS-2024-Twitch-Event",
    },
    {
      image: `cardImages/aukus5.png?v=${IMG_VERSION}`,
      alt: "Aukus 5",
      href: "https://www.behance.net/gallery/251106079/aukus-5",
    },
    {
      image: `cardImages/gonkus.webp?v=${IMG_VERSION}`,
      alt: "Gonkus",
      href: "https://www.behance.net/gallery/246950545/GONKUS",
    },
    {
      image: `cardImages/igropolius.webp?v=${IMG_VERSION}`,
      alt: "Igropolius Twitch Event",
      href: "https://www.behance.net/gallery/224537291/igropolius-tvich-ivent",
    },
    {
      image: `cardImages/reyohoho.webp?v=${IMG_VERSION}`,
      alt: "Альманах ReYohoho",
      href: "https://www.behance.net/gallery/254336243/almanah-ReYohoho",
    },
    {
      image: `cardImages/sport.webp?v=${IMG_VERSION}`,
      alt: "Сайт пошива спортивной одежды",
      href: "https://www.behance.net/gallery/225411105/sajt-poshiva-sportivnoj-odezhdy-(2021)",
    },
  ];

  /* Shuffle the row on every page load (Fisher–Yates). */
  for (let i = CARDS.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [CARDS[i], CARDS[j]] = [CARDS[j], CARDS[i]];
  }

  const CARD_W = 440;
  const CARD_H = 345;
  const GAP = 16;
  const STEP = CARD_W + GAP;

  /* Only the outer cards are pulled inward. The centred card and
     its immediate neighbours keep their original spacing. */
  const WARP_EASE = 200;
  const WARP_COMPRESS = 0.75;
  const N = CARDS.length;
  const PERIOD = STEP * N;
  const IMAGE_INDEX = 0;

  /* ── motion ───────────────────────────────────────────── */
  const DRAG_SCALE = 1;
  const TOSS = 120;     // release look-ahead, in ms of travel
  const MOST = 1;       // max cards a flick can skip
  const SMOOTH = 0.16;  // per-frame ease toward the target

  /* Programmatic card-to-card travel: a slower ease-out that
     comes to rest exactly on the target. */
  const MOVE_MS_BASE = 280;
  const MOVE_MS_PER_PX = 0.22;
  const MOVE_MS_MAX = 620;

  /* Wheel needs several notches per card. */
  const WHEEL_STEP = 300;
  const WHEEL_GAP = 140;

  /* Strong depth shrink: centred card 1.0 → sides MIN_SCALE. */
  const MIN_SCALE = 0.58;
  const SCALE_FALLOFF = STEP * 1.6;

  /* Very small, slow vertical drift. */
  const BOB_AMPLITUDE = 6; // px
  const BOB_PERIODS = [6.3, 7.1, 6.7, 7.7, 6.9, 7.4, 6.5, 7.9, 6.1, 7.2];

  /* Rock at the same slow angular speed for every card; the
     amplitude stays the card's own tilt (e.g. -5° → ±5°). */
  const ROCK_SPEED = 1.2;     // deg per second (max angular speed)
  const ROCK_MIN_PERIOD = 10; // seconds

  /* Hover enlargement for the cards (grows toward the screen centre). */
  const HOVER_SCALE = 1.1;
  const HOVER_MS = 300;

  const root = document.getElementById("root");
  const weatherEl = document.getElementById("weather");
  const profileEl = document.getElementById("profile");
  const socialEls = [...document.querySelectorAll(".social-btn")];
  const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const startTime = 0;

  const cards = [];
  const hoverScale = new Array(N).fill(1);
  const hoverTarget = new Array(N).fill(1);
  const hoverFrom = new Array(N).fill(1);
  const hoverStart = new Array(N).fill(0);
  const hoverDir = new Array(N).fill(1);
  let position = IMAGE_INDEX * STEP + CARD_W / 2;
  let target = position;
  let motion = null;
  let drag = null;
  let raf = 0;
  let animTime = 0;
  let lastFrameTime = 0;
  let windowFocused = true;
  let heldAnimations = [];
  let wheelAccum = 0;
  let wheelLast = 0;
  let pointerX = 0;
  let pointerY = 0;
  let pointerInside = false;
  let hoveredIndex = -1;
  let weatherTilt = null;

  /* Profile pill: same -5°..+5° tilt as the weather pill. */
  let profileTilt = null;
  if (profileEl) {
    do {
      profileTilt = (Math.random() * 2 - 1) * 5;
    } while (Math.abs(profileTilt) < 0.05);
    profileEl.dataset.tilt = profileTilt.toFixed(3);
    profileEl.style.transform = `rotate(${profileTilt.toFixed(2)}deg)`;
  }

  /* Each social button gets its own tilt (-3°..+3°, never 0),
     just like the weather pill gets -5°..+5°. */
  const socialTilts = socialEls.map(() => {
    let a;
    do {
      a = (Math.random() * 2 - 1) * 3;
    } while (Math.abs(a) < 0.05);
    return a;
  });
  socialEls.forEach((el, i) => {
    el.dataset.tilt = socialTilts[i].toFixed(3);
    el.style.transform = `rotate(${socialTilts[i].toFixed(2)}deg)`;
  });

  /* Different bob periods + phase offsets so the three buttons
     never float up-down in sync. */
  const SOCIAL_BOB_PERIODS = [7.1, 8.3, 6.4];

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const mod = (v, n) => ((v % n) + n) % n;

  /* Open a card's link in a new tab (works inside a pointerup
     user gesture, unlike a bare window.open in some browsers). */
  function openCard(href) {
    if (!href) return;
    const a = document.createElement("a");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /* A random tilt per card, generated once per page load:
     [-7°..+7°], never 0, and no two adjacent cards within
     2° of each other (the row wraps, so last vs first too). */
  const MIN_TILT_GAP = 2;

  const randomTilt = () => {
    let a;
    do {
      a = (Math.random() * 2 - 1) * 7;
    } while (Math.abs(a) < 0.05);
    return a;
  };

  function makeAngles(count) {
    for (let attempt = 0; attempt < 2000; attempt += 1) {
      const angles = Array.from({ length: count }, randomTilt);

      let ok = true;
      for (let i = 0; i < count; i += 1) {
        if (Math.abs(angles[i] - angles[(i + 1) % count]) < MIN_TILT_GAP) {
          ok = false;
          break;
        }
      }
      if (ok) return angles;
    }

    // Extremely unlikely: alternate steep angles.
    return Array.from({ length: count }, (_, i) => (i % 2 ? 5 : -5));
  }

  const ANGLES = makeAngles(N);

  /* ── build the cards ──────────────────────────────────── */

  CARDS.forEach((data, i) => {
    const el = document.createElement("div");
    el.className = "card glass-effect";
    el.setAttribute("aria-label", data.image ? data.alt : `${i + 1} of ${N}`);

    if (data.href) {
      el.setAttribute("role", "link");
      el.dataset.href = data.href;
      el.tabIndex = 0;
      el.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openCard(data.href);
        }
      });
    } else {
      el.setAttribute("role", "group");
      el.setAttribute("aria-roledescription", "slide");
    }

    if (data.image) {
      el.innerHTML = `<img class="card__image" src="${data.image}" alt="${data.alt}" draggable="false">`;
    }

    root.appendChild(el);
    cards.push(el);
  });

  /* ── geometry ─────────────────────────────────────────── */

  const centerOf = (i) => i * STEP + CARD_W / 2;

  /* Pull only cards beyond the immediate neighbours toward the
     centre, so the next pair peeks in at the screen edges. */
  function visualX(x) {
    const a = Math.abs(x);
    if (a <= STEP) return x;

    const d = a - STEP;
    const t = clamp(d / WARP_EASE, 0, 1);
    const ease = t * t * (3 - 2 * t);
    const k = 1 + (WARP_COMPRESS - 1) * ease;

    return Math.sign(x) * (STEP + d * k);
  }

  function scaleFor(x) {
    const t = clamp(Math.abs(x) / SCALE_FALLOFF, 0, 1);
    const eased = t * t * (3 - 2 * t); // smoothstep
    return 1 - (1 - MIN_SCALE) * eased;
  }

  /* Remember which way each card's hover grows, so a moving row
     does not flip it when a card crosses the centre. */
  function freezeHoverDir() {
    for (let i = 0; i < N; i += 1) {
      let x = centerOf(i) - position;
      x = mod(x + PERIOD / 2, PERIOD) - PERIOD / 2;
      hoverDir[i] = Math.abs(x) < 1 ? 0 : Math.sign(x);
    }
  }

  /* Ease every card's hover zoom back to 1. */
  function clearHover() {
    const at = animTime;
    for (let i = 0; i < N; i += 1) {
      hoverFrom[i] = hoverScale[i];
      hoverTarget[i] = 1;
      hoverStart[i] = at;
    }
  }

  /* The weather pill uses the same clock as the carousel, so it
     freezes and resumes together with the cards. */
  function paintWeather(now) {
    if (!weatherEl || still) return;

    if (weatherTilt === null) {
      const raw = weatherEl.dataset.tilt;
      if (raw === undefined) return;
      const value = Number(raw);
      weatherTilt = Number.isFinite(value) ? value : 0;
    }

    const amp = Math.abs(weatherTilt);
    const maxOmega = (Math.PI * 2) / ROCK_MIN_PERIOD;
    const omega = amp > 0.0001 ? Math.min(ROCK_SPEED / amp, maxOmega) : 0;
    const phaseOffset = weatherTilt > 0 ? Math.PI / 2 : -Math.PI / 2;
    const rock = Math.sin((now / 1000) * omega + phaseOffset) * amp;
    const bob = Math.sin((now / 1000) * ((Math.PI * 2) / 8)) * 2;

    weatherEl.style.transform =
      `translateY(${bob.toFixed(2)}px) ` +
      `rotate(${rock.toFixed(3)}deg)`;
  }

  /* Social buttons rock within their own tilt, same slow angular
     speed as cards/weather, and bob with different periods. */
  function paintSocials(now) {
    if (!socialEls.length || still) return;

    for (let i = 0; i < socialEls.length; i += 1) {
      const tilt = socialTilts[i];
      const amp = Math.abs(tilt);
      const maxOmega = (Math.PI * 2) / ROCK_MIN_PERIOD;
      const omega = amp > 0.0001 ? Math.min(ROCK_SPEED / amp, maxOmega) : 0;
      const phaseOffset = tilt > 0 ? Math.PI / 2 : -Math.PI / 2;
      const rock = Math.sin((now / 1000) * omega + phaseOffset) * amp;

      const period = SOCIAL_BOB_PERIODS[i % SOCIAL_BOB_PERIODS.length];
      const phase = (i * Math.PI * 2) / 3;
      const bob = Math.sin((now / 1000) * ((Math.PI * 2) / period) + phase) * 2;

      socialEls[i].style.transform =
        `translateY(${bob.toFixed(2)}px) ` +
        `rotate(${rock.toFixed(3)}deg)`;
    }
  }

  /* Profile pill: same motion as the weather pill. */
  function paintProfile(now) {
    if (!profileEl || still || profileTilt === null) return;

    const amp = Math.abs(profileTilt);
    const maxOmega = (Math.PI * 2) / ROCK_MIN_PERIOD;
    const omega = amp > 0.0001 ? Math.min(ROCK_SPEED / amp, maxOmega) : 0;
    const phaseOffset = profileTilt > 0 ? Math.PI / 2 : -Math.PI / 2;
    const rock = Math.sin((now / 1000) * omega + phaseOffset) * amp;
    const bob = Math.sin((now / 1000) * ((Math.PI * 2) / 8)) * 2;

    profileEl.style.transform =
      `translateY(${bob.toFixed(2)}px) ` +
      `rotate(${rock.toFixed(3)}deg)`;
  }

  function paint(now) {
    paintWeather(now);
    paintSocials(now);
    paintProfile(now);

    for (let i = 0; i < N; i += 1) {
      let x = centerOf(i) - position;
      x = mod(x + PERIOD / 2, PERIOD) - PERIOD / 2;
      x = visualX(x);

      const base = scaleFor(x);

      const baseTilt = ANGLES[i % ANGLES.length];
      let bobY = 0;
      let rockAngle = baseTilt;

      if (!still) {
        const period = BOB_PERIODS[i % BOB_PERIODS.length] * 1000;
        const phase = (now / period) * Math.PI * 2;
        bobY = Math.sin(phase) * BOB_AMPLITUDE;

        /* Same slow angular speed for all; amplitude = own tilt. */
        const amp = Math.abs(baseTilt);
        const maxOmega = (Math.PI * 2) / ROCK_MIN_PERIOD;
        const omega = amp > 0.0001 ? Math.min(ROCK_SPEED / amp, maxOmega) : 0;
        const phaseOffset = baseTilt > 0 ? Math.PI / 2 : -Math.PI / 2;
        const rockPhase = ((now - startTime) / 1000) * omega + phaseOffset;
        rockAngle = Math.sin(rockPhase) * amp;
      }

      const hp = clamp((now - hoverStart[i]) / HOVER_MS, 0, 1);
      const he = 1 - Math.pow(1 - hp, 3);
      hoverScale[i] = hoverFrom[i] + (hoverTarget[i] - hoverFrom[i]) * he;
      const h = hoverScale[i];

      /* Keep the frozen direction until the hover zoom is fully
         gone, so the centre crossing never flips it. */
      const moving = drag !== null || Math.abs(target - position) > 0.5;
      const frozen = moving || h > 1.0005;
      const dir = frozen
        ? hoverDir[i]
        : (Math.abs(x) < 1 ? 0 : Math.sign(x));
      const half = (CARD_W * base) / 2;
      const nx = x + dir * half * (1 - h);
      const ns = base * h;

      cards[i].style.transform =
        `translate(-50%, -50%) ` +
        `translate(${nx.toFixed(2)}px, ${bobY.toFixed(2)}px) ` +
        `rotate(${rockAngle.toFixed(3)}deg) ` +
        `scale(${ns.toFixed(4)})`;
    }
  }

  function nearestCard(pos) {
    let best = { index: 0, center: 0, dist: Infinity };
    for (let i = 0; i < N; i += 1) {
      const c = centerOf(i);
      const turns = Math.round((pos - c) / PERIOD);
      const center = c + turns * PERIOD;
      const dist = Math.abs(center - pos);
      if (dist < best.dist) best = { index: i, center, dist };
    }
    return best;
  }

  /* The nearest instance of card `index` to the given scroll
     position (the row wraps, so a card has many centres). */
  function centerForIndex(index, near) {
    const c = centerOf(index);
    return c + Math.round((near - c) / PERIOD) * PERIOD;
  }

  /* Card whose centre is closest to a screen point, among those
     containing it. More reliable than topmost hit-testing when a
     scaled card slightly overlaps its neighbour near the edge. */
  function cardAtPoint(x, y) {
    let best = null;
    let bestD = Infinity;

    for (const card of cards) {
      const r = card.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;

      const dx = x - (r.left + r.width / 2);
      const dy = y - (r.top + r.height / 2);
      const d = dx * dx + dy * dy;

      if (d < bestD) {
        bestD = d;
        best = card;
      }
    }

    return best;
  }

  /* Which card is under the pointer, computed from the current
     layout math — this keeps working when the cards move under a
     still cursor (enter/leave events do not fire then). */
  function hoveredCardIndex(px, py) {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    let best = -1;
    let bestD = Infinity;

    for (let i = 0; i < N; i += 1) {
      let x = centerOf(i) - position;
      x = mod(x + PERIOD / 2, PERIOD) - PERIOD / 2;
      x = visualX(x);

      const base = scaleFor(x);
      const sx = cx + x;
      const hw = (CARD_W * base) / 2;
      const hh = (CARD_H * base) / 2;

      if (px < sx - hw || px > sx + hw || py < cy - hh || py > cy + hh) continue;

      const d = (px - sx) ** 2 + (py - cy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }

    return best;
  }

  /* ── motion loop (+ slow vertical drift) ──────────────── */

  function frame(rawNow) {
    if (document.hidden || !windowFocused) {
      raf = 0;
      return;
    }

    const delta = Math.min(64, Math.max(0, rawNow - lastFrameTime));
    lastFrameTime = rawNow;
    animTime += delta;
    const now = animTime;

    if (motion) {
      const p = clamp((now - motion.start) / motion.duration, 0, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      position = motion.from + (motion.to - motion.from) * eased;

      if (p >= 1) {
        position = motion.to;
        motion = null;
      }
    } else if (drag) {
      const diff = target - position;
      if (Math.abs(diff) > 0.01) position += diff * SMOOTH;
      else position = target;
    } else {
      position = target;
    }

    /* Keep the hover on the card actually under the pointer. */
    if (!drag && !motion && pointerInside) {
      const idx = hoveredCardIndex(pointerX, pointerY);

      if (idx !== hoveredIndex) {
        hoveredIndex = idx;
        freezeHoverDir();

        const at = now;
        for (let i = 0; i < N; i += 1) {
          hoverFrom[i] = hoverScale[i];
          hoverTarget[i] = i === idx ? HOVER_SCALE : 1;
          hoverStart[i] = at;
        }
      }
    }

    paint(now);
    raf = requestAnimationFrame(frame);
  }

  function startLoop() {
    if (still || raf || document.hidden || !windowFocused) return;
    lastFrameTime = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function pageIsPaused() {
    return document.hidden || !windowFocused;
  }

  function pauseAnimations() {
    if (!heldAnimations.length) {
      heldAnimations = document.getAnimations().filter(
        (animation) => animation.playState === "running",
      );
    }

    document.documentElement.classList.add("is-paused");

    if (raf) cancelAnimationFrame(raf);
    raf = 0;

    heldAnimations.forEach((animation) => {
      try {
        animation.pause();
      } catch {
        /* animation may have finished */
      }
    });
  }

  function resumeAnimations() {
    if (pageIsPaused()) return;

    document.documentElement.classList.remove("is-paused");

    heldAnimations.forEach((animation) => {
      try {
        if (animation.playState === "paused") animation.play();
      } catch {
        /* animation may be gone */
      }
    });
    heldAnimations = [];

    startLoop();
  }

  function syncPause() {
    if (pageIsPaused()) pauseAnimations();
    else resumeAnimations();
  }

  function setTarget(next) {
    target = next;

    if (still) {
      position = target;
      motion = null;
      paint(animTime);
      return;
    }

    /* While dragging the card follows the finger; the smooth
       arrival starts on release. */
    if (drag) {
      motion = null;
      return;
    }

    const now = animTime;
    const distance = Math.abs(target - position);
    const duration = clamp(
      MOVE_MS_BASE + distance * MOVE_MS_PER_PX,
      MOVE_MS_BASE,
      MOVE_MS_MAX,
    );

    motion = { from: position, to: target, start: now, duration };
  }

  function go(direction) {
    const current = nearestCard(target);
    setTarget(current.center + direction * STEP);
  }

  /* ── drag ─────────────────────────────────────────────── */

  root.addEventListener("pointerenter", () => {
    pointerInside = true;
  });

  root.addEventListener("pointerleave", () => {
    pointerInside = false;
    hoveredIndex = -1;
    clearHover();
  });

  root.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.target.closest?.(".socials")) return;

    pointerX = event.clientX;
    pointerY = event.clientY;
    pointerInside = true;
    hoveredIndex = -1;

    /* Ease the hover zoom down smoothly, but freeze its direction
       for the whole gesture so the centre crossing stays smooth. */
    freezeHoverDir();
    clearHover();

    drag = {
      id: event.pointerId,
      x0: event.clientX,
      start: position,
      last: event.clientX,
      t: event.timeStamp,
      vx: 0,
      moved: false,
      card: event.target.closest ? event.target.closest(".card") : null,
    };

    root.dataset.held = "true";
    try {
      root.setPointerCapture(event.pointerId);
    } catch {
      /* pointer gone */
    }
  });

  root.addEventListener("pointermove", (event) => {
    pointerX = event.clientX;
    pointerY = event.clientY;
    pointerInside = true;

    if (!drag || event.pointerId !== drag.id) return;

    const dx = event.clientX - drag.x0;
    if (!drag.moved && Math.abs(dx) > 4) drag.moved = true;

    const dt = Math.max(1, event.timeStamp - drag.t);
    drag.vx = (drag.vx + (event.clientX - drag.last) / dt) / 2;
    drag.last = event.clientX;
    drag.t = event.timeStamp;

    setTarget(drag.start - dx * DRAG_SCALE);
  });

  function endDrag(event, cancelled = false) {
    if (!drag || (event && event.pointerId !== drag.id)) return;

    const finished = drag;
    drag = null;
    delete root.dataset.held;

    try {
      root.releasePointerCapture(finished.id);
    } catch {
      /* capture already gone */
    }

    if (cancelled) {
      setTarget(nearestCard(target).center);
      return;
    }

    /* A tap (no drag): use the card actually under the pointer at
       release. Only the centred card opens its link, and only once
       the row has settled. */
    if (!finished.moved) {
      const card = event
        ? cardAtPoint(event.clientX, event.clientY)
        : finished.card;
      const index = card ? cards.indexOf(card) : -1;

      if (index >= 0 && nearestCard(position).index !== index) {
        setTarget(centerForIndex(index, position));
        return;
      }

      const settled = Math.abs(target - position) < 0.5;
      if (card && settled) {
        const href = card.dataset.href;
        if (href) {
          openCard(href);
          return;
        }
      }
    }

    const carry = clamp(
      -finished.vx * TOSS * DRAG_SCALE,
      -MOST * STEP,
      MOST * STEP,
    );

    setTarget(nearestCard(target + carry).center);
  }

  root.addEventListener("pointerup", (event) => endDrag(event, false));
  root.addEventListener("pointercancel", (event) => endDrag(event, true));
  root.addEventListener("lostpointercapture", () => {
    if (drag) endDrag(null, true);
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      go(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(-1);
    }
  });

  /* Mouse wheel / trackpad: several notches per card, slow glide. */
  root.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();

      const delta =
        Math.abs(event.deltaY) >= Math.abs(event.deltaX)
          ? event.deltaY
          : event.deltaX;
      if (!delta) return;

      const dir = Math.sign(delta);

      /* Reversing the wheel must reverse the row at once. */
      if (wheelAccum !== 0 && Math.sign(wheelAccum) !== dir) wheelAccum = 0;
      wheelAccum += delta;

      const now = performance.now();
      if (Math.abs(wheelAccum) < WHEEL_STEP || now - wheelLast < WHEEL_GAP) return;

      wheelAccum = 0;
      wheelLast = now;

      if (Math.abs(target - position) < 1) freezeHoverDir();
      hoveredIndex = -1;
      clearHover();
      go(dir);
    },
    { passive: false },
  );

  window.addEventListener("resize", () => paint(animTime), { passive: true });

  document.addEventListener("visibilitychange", syncPause);

  window.addEventListener("blur", () => {
    windowFocused = false;
    syncPause();
  });

  window.addEventListener("focus", () => {
    windowFocused = true;
    syncPause();
  });

  paint(animTime);
  syncPause();
})();
