(function () {
  "use strict";

  var framesData = Array.isArray(window.FRAMES) ? window.FRAMES : [];
  var links = window.FRAME_LINKS || {};
  var framesRoot = document.querySelector("[data-frames]");
  var wordList = document.querySelector("[data-word-list]");

  if (!framesRoot || framesData.length === 0) return;

  var FRAME_VERSION = "20261125-1";
  var frames = [];
  var frameHits = [];
  var max = Math.max(0, framesData.length - 1);
  var current = 0;
  var target = 0;
  var running = false;
  var snapTimer = 0;
  var touchY = null;
  var wheelAccum = 0;
  var wheelLocked = false;

  function labelFor(item, index) {
    return item.label || "Frame " + (index + 1);
  }

  function preload(src) {
    if (!src) return;
    var link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.type = "image/svg+xml";
    link.href = src;
    link.setAttribute("fetchpriority", "high");
    document.head.appendChild(link);
  }

  function build() {
    preload(framesData[0].primary);
    preload(framesData[0].badge);
    preload(framesData[0].outline);

    framesData.forEach(function (item, index) {
      var label = labelFor(item, index);

      var frame = document.createElement("div");
      frame.className = "frame";
      frame.setAttribute("data-frame", "");
      frame.style.height = index === 0 ? "100svh" : "0";

      var query = new URLSearchParams();
      query.set("v", FRAME_VERSION);
      query.set("primary", item.primary);
      query.set("label", label);
      if (item.badge) {
        query.set("badge", item.badge);
        if (item.badgeWidth) query.set("badgeW", String(item.badgeWidth));
        if (item.badgeHeight) query.set("badgeH", String(item.badgeHeight));
      }
      if (item.outline) {
        query.set("outline", item.outline);
        if (item.outlineWidth) query.set("outlineW", String(item.outlineWidth));
        if (item.outlineHeight) query.set("outlineH", String(item.outlineHeight));
      }

      var iframe = document.createElement("iframe");
      iframe.src = "frame.html?" + query.toString();
      iframe.title = label;
      iframe.setAttribute("scrolling", "no");
      iframe.tabIndex = -1;
      iframe.setAttribute("allowtransparency", "true");
      frame.appendChild(iframe);
      framesRoot.appendChild(frame);
      frames.push(frame);

      var link = links[item.id] || "";
      var hit = null;
      if (link) {
        hit = document.createElement("button");
        hit.type = "button";
        hit.className = "frame-hit";
        hit.setAttribute("aria-label", label + " — открыть");
        hit.addEventListener("click", function () {
          window.open(link, "_blank", "noopener,noreferrer");
        });
        document.body.appendChild(hit);
      }
      frameHits.push(hit);
    });

    if (wordList) {
      wordList.textContent =
        framesData.map(function (item, index) { return labelFor(item, index); }).join(", ") +
        " — айдентика Twitch-ивентов, баннеры и веб-дизайн.";
    }

    frames.forEach(function (frame) {
      var iframe = frame.querySelector("iframe");
      if (iframe) {
        iframe.addEventListener("load", function () {
          applySizes(current);
        });
      }
    });
  }

  function clamp(value, min, maxValue) {
    return Math.min(maxValue, Math.max(min, value));
  }

  function applySizes(progress) {
    var viewport = window.innerHeight;
    var base = Math.floor(progress);
    var fraction = progress - base;
    var offset = 0;

    frames.forEach(function (frame, index) {
      var height = 0;

      if (index === base) {
        height = viewport * (1 - fraction);
      } else if (index === base + 1) {
        height = viewport * fraction;
      }

      frame.style.height = height + "px";

      var hit = frameHits[index];
      if (hit) {
        hit.style.top = offset + "px";
        hit.style.height = height + "px";
        hit.style.pointerEvents = height > 0 ? "auto" : "none";
        hit.tabIndex = height > 0 ? 0 : -1;
        hit.setAttribute("aria-hidden", height > 0 ? "false" : "true");
      }

      var iframe = frame.querySelector("iframe");
      if (iframe && iframe.contentDocument) {
        var badge = iframe.contentDocument.querySelector(".badge");
        if (badge) {
          badge.style.setProperty(
            "--badge-scale",
            String(viewport > 0 ? height / viewport : 0)
          );
        }
      }

      offset += height;
    });
  }

  function tick() {
    var difference = target - current;

    if (Math.abs(difference) < 0.0008) {
      current = target;
      applySizes(current);
      running = false;
      return;
    }

    current += difference * 0.24;
    applySizes(current);
    window.requestAnimationFrame(tick);
  }

  function start() {
    if (running) return;
    running = true;
    window.requestAnimationFrame(tick);
  }

  function scheduleSnap() {
    window.clearTimeout(snapTimer);
    snapTimer = window.setTimeout(function () {
      target = clamp(Math.round(target), 0, max);
      start();
    }, 160);
  }

  function onWheel(event) {
    if (event.ctrlKey) return;

    event.preventDefault();

    var delta = event.deltaY;
    if (event.deltaMode === 1) delta *= 16;
    else if (event.deltaMode === 2) delta *= window.innerHeight;

    if (Math.abs(delta) < 1) return;

    wheelAccum += delta;
    if (Math.abs(wheelAccum) < 30) return;

    var direction = wheelAccum > 0 ? 1 : -1;
    wheelAccum = 0;

    if (wheelLocked) return;

    wheelLocked = true;
    window.setTimeout(function () {
      wheelLocked = false;
    }, 320);

    target = clamp(Math.round(target) + direction, 0, max);
    start();
  }

  function onKeydown(event) {
    if (event.key === "ArrowDown" || event.key === "PageDown" || event.key === " ") {
      event.preventDefault();
      target = clamp(Math.ceil(target + 0.001), 0, max);
      start();
    } else if (event.key === "ArrowUp" || event.key === "PageUp") {
      event.preventDefault();
      target = clamp(Math.floor(target - 0.001), 0, max);
      start();
    }
  }

  function onTouchStart(event) {
    touchY = event.touches[0].clientY;
  }

  function onTouchMove(event) {
    if (touchY === null) return;

    event.preventDefault();

    var nextY = event.touches[0].clientY;
    var viewport = window.innerHeight || 1;
    target = clamp(target + (touchY - nextY) / (viewport * 0.5), 0, max);
    touchY = nextY;

    scheduleSnap();
    start();
  }

  function onTouchEnd() {
    touchY = null;
    scheduleSnap();
  }

  window.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("keydown", onKeydown);
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: false });
  window.addEventListener("touchend", onTouchEnd, { passive: true });

  window.addEventListener("resize", function () {
    applySizes(current);
  });

  var video = document.querySelector(".stage__video");
  if (video && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    video.pause();
  }

  build();
  applySizes(0);
})();
