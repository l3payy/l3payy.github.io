/* ─────────────────────────────────────────────────────────
   Weather widget with IP-based location + smooth crossfade.

   On load:
   - the visitor's approximate city is resolved from their IP;
   - Open-Meteo returns the current weather for those coordinates;
   - until both are ready the widget shimmers "Узнаем погоду";
   - the background crossfades from the default sun to the
     matching one (cloud / rain / snow / fog / thunderstorm).

   All services are free, keyless and send CORS headers.
   ───────────────────────────────────────────────────────── */

(() => {
  "use strict";

  const WEATHER_API = "https://api.open-meteo.com/v1/forecast";
  const GEO_API = "https://api.bigdatacloud.net/data/reverse-geocode-client";

  const FALLBACK_PLACE = {
    city: "Москва",
    lat: 55.7558,
    lon: 37.6173,
  };

  /* WMO code → background / short state / icon file. */
  const WEATHER = {
    0:  { bg: "sun",   label: "Ясно",    icon: "sun" },
    1:  { bg: "sun",   label: "Ясно",    icon: "sun" },
    2:  { bg: "cloud", label: "Облачно", icon: "cloud" },
    3:  { bg: "cloud", label: "Облачно", icon: "cloud" },
    45: { bg: "fog",   label: "Туман",   icon: "fog" },
    48: { bg: "fog",   label: "Туман",   icon: "fog" },
    51: { bg: "rain",  label: "Дождь",   icon: "rain" },
    53: { bg: "rain",  label: "Дождь",   icon: "rain" },
    55: { bg: "rain",  label: "Дождь",   icon: "rain" },
    56: { bg: "rain",  label: "Дождь",   icon: "rain" },
    57: { bg: "rain",  label: "Дождь",   icon: "rain" },
    61: { bg: "rain",  label: "Дождь",   icon: "rain" },
    63: { bg: "rain",  label: "Дождь",   icon: "rain" },
    65: { bg: "rain",  label: "Дождь",   icon: "rain" },
    66: { bg: "rain",  label: "Дождь",   icon: "rain" },
    67: { bg: "rain",  label: "Дождь",   icon: "rain" },
    71: { bg: "snow",  label: "Снег",    icon: "snow" },
    73: { bg: "snow",  label: "Снег",    icon: "snow" },
    75: { bg: "snow",  label: "Снег",    icon: "snow" },
    77: { bg: "snow",  label: "Снег",    icon: "snow" },
    80: { bg: "rain",  label: "Дождь",   icon: "rain" },
    81: { bg: "rain",  label: "Дождь",   icon: "rain" },
    82: { bg: "rain",  label: "Дождь",   icon: "rain" },
    85: { bg: "snow",  label: "Снег",    icon: "snow" },
    86: { bg: "snow",  label: "Снег",    icon: "snow" },
    95: { bg: "thunderstorm", label: "Гроза", icon: "thunderstorm" },
    96: { bg: "thunderstorm", label: "Гроза", icon: "thunderstorm" },
    99: { bg: "thunderstorm", label: "Гроза", icon: "thunderstorm" },
  };

  const FALLBACK_WEATHER = { bg: "sun", label: "Ясно", icon: "sun" };

  /* Bump when replacing background files (cache-busting). */
  const BG_VERSION = "6";

  /* Bump when any weather icon changes. */
  const ICON_VERSION = "20261104-59";

  const widget = document.getElementById("weather");
  const iconEl = document.getElementById("weatherIcon");
  const cityEl = document.getElementById("weatherCity");
  const descEl = document.getElementById("weatherDesc");
  const bgBase = document.querySelector(".bg");
  const bgOverlay = document.querySelector(".bg--overlay");
  const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  let currentBg = "sun";

  /* Random tilt for the pill on load: -5°..+5°, never 0. */
  if (widget) {
    let tilt;
    do {
      tilt = (Math.random() * 2 - 1) * 5;
    } while (Math.abs(tilt) < 0.05);
    widget.style.setProperty("--tilt", `${tilt.toFixed(2)}deg`);

    /* Same slow angular speed as the cards (1.2 deg/s); the
       duration grows with the amplitude so large tilts are slow. */
    const amp = Math.abs(tilt);
    const duration = Math.max(10, (Math.PI * 2 * amp) / 1.2);
    widget.style.setProperty("--rock-dur", `${duration.toFixed(2)}s`);
  }

  /* Preload all backgrounds so the crossfade can start at once. */
  ["sun", "cloud", "rain", "snow", "fog", "thunderstorm"].forEach((key) => {
    const img = new Image();
    img.src = `bg/${key}.jpg?v=${BG_VERSION}`;
  });

  function fetchJson(url, timeout) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    return fetch(url, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .finally(() => clearTimeout(timer));
  }

  function validPlace(lat, lon) {
    return (
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lon) <= 180 &&
      !(lat === 0 && lon === 0)
    );
  }

  function makePlace(city, lat, lon) {
    const place = {
      city: typeof city === "string" ? city.trim() : "",
      lat: Number(lat),
      lon: Number(lon),
    };

    if (!validPlace(place.lat, place.lon)) {
      throw new Error("IP lookup returned no coordinates");
    }

    return place;
  }

  /* Primary IP lookup. */
  async function locationFromGeoJs() {
    const data = await fetchJson("https://get.geojs.io/v1/ip/geo.json", 6000);
    if (!data) throw new Error("GeoJS returned no data");
    return makePlace(data.city, data.latitude, data.longitude);
  }

  /* Backup IP lookup in case the first one is blocked/rate-limited. */
  async function locationFromIpApi() {
    const data = await fetchJson("https://ipapi.co/json/", 6000);
    if (!data || data.error) {
      throw new Error(data?.reason || "ipapi.co failed");
    }
    return makePlace(data.city, data.latitude, data.longitude);
  }

  async function locate() {
    for (const lookup of [locationFromGeoJs, locationFromIpApi]) {
      try {
        const place = await lookup();
        return place;
      } catch (error) {
        console.warn("IP location unavailable:", error);
      }
    }

    return { ...FALLBACK_PLACE };
  }

  /* Localize the city name (Amsterdam → Амстердам). */
  async function localizeCity(place) {
    const url =
      `${GEO_API}?latitude=${place.lat}&longitude=${place.lon}` +
      "&localityLanguage=ru";

    const data = await fetchJson(url, 5000);
    return (
      data?.city ||
      data?.locality ||
      data?.principalSubdivision ||
      place.city ||
      ""
    );
  }

  async function fetchWeather(place) {
    const url =
      `${WEATHER_API}?latitude=${place.lat}&longitude=${place.lon}` +
      "&current=temperature_2m,weather_code&timezone=auto";

    const data = await fetchJson(url, 8000);
    if (typeof data?.current?.weather_code !== "number") {
      throw new Error("Weather response has no current code");
    }

    return WEATHER[data.current.weather_code] || FALLBACK_WEATHER;
  }

  function setCity(city) {
    const clean = city?.trim();
    if (!cityEl || !clean || cityEl.textContent === clean) return;

    cityEl.textContent = clean;
    cityEl.title = clean;
  }

  /* Fade the icon + state text out, swap, fade back in. */
  function setWeatherUi(info) {
    const iconSrc = `weatherIcon/${info.icon}.svg?v=${ICON_VERSION}`;
    const same =
      descEl?.textContent === info.label &&
      iconEl?.getAttribute("src") === iconSrc &&
      !widget?.classList.contains("is-loading") &&
      !descEl?.classList.contains("weather__state--loading");
    if (same) return;

    if (still) {
      if (iconEl) {
        iconEl.src = iconSrc;
        iconEl.style.opacity = "1";
      }
      if (descEl) {
        descEl.classList.remove("weather__state--loading");
        descEl.textContent = info.label;
        descEl.style.opacity = "1";
      }
      widget?.classList.remove("is-loading");
      widget?.setAttribute("aria-busy", "false");
      return;
    }

    if (iconEl) iconEl.style.opacity = "0";
    if (descEl) descEl.style.opacity = "0";

    setTimeout(() => {
      if (iconEl) {
        iconEl.src = iconSrc;
        iconEl.style.opacity = "1";
      }
      if (descEl) {
        descEl.classList.remove("weather__state--loading");
        descEl.textContent = info.label;
        descEl.style.opacity = "1";
      }
      widget?.classList.remove("is-loading");
      widget?.setAttribute("aria-busy", "false");
    }, 350);
  }

  /* Crossfade the base background to `next` (sun → rain etc.). */
  function setBackground(next) {
    if (!bgBase || !bgOverlay) return;
    if (next === currentBg) return;

    const src = `bg/${next}.jpg?v=${BG_VERSION}`;
    const pre = new Image();

    pre.onload = () => {
      if (still) {
        bgBase.src = src;
        currentBg = next;
        return;
      }

      bgOverlay.src = src;

      /* Next frame, so the opacity transition actually runs. */
      requestAnimationFrame(() => {
        bgOverlay.style.opacity = "1";
      });

      /* After the fade-in, make the new image the base and
         hide the overlay again. */
      setTimeout(() => {
        bgBase.src = src;
        bgOverlay.style.opacity = "0";
        currentBg = next;
      }, 1150);
    };

    pre.src = src;
  }

  function apply(info) {
    setWeatherUi(info);
    setBackground(info.bg);
  }

  function showWeatherError() {
    if (iconEl) iconEl.style.opacity = "0";
    if (descEl) {
      descEl.style.opacity = "0";

      setTimeout(() => {
        descEl.classList.remove("weather__state--loading");
        descEl.textContent = "Нет данных";
        descEl.style.opacity = "1";
        widget?.classList.remove("is-loading");
        widget?.setAttribute("aria-busy", "false");
      }, 350);
    } else {
      widget?.classList.remove("is-loading");
      widget?.setAttribute("aria-busy", "false");
    }
  }

  /* Console test hook, e.g. weatherPreview("rain"). */
  const PREVIEW = {
    sun:   { bg: "sun",   label: "Ясно",    icon: "sun" },
    cloud: { bg: "cloud", label: "Облачно", icon: "cloud" },
    rain:  { bg: "rain",  label: "Дождь",   icon: "rain" },
    snow:  { bg: "snow",  label: "Снег",    icon: "snow" },
    fog:   { bg: "fog",   label: "Туман",   icon: "fog" },
    thunderstorm: { bg: "thunderstorm", label: "Гроза", icon: "thunderstorm" },
  };

  window.weatherPreview = (key) => apply(PREVIEW[key] || FALLBACK_WEATHER);

  async function load() {
    const place = await locate();
    setCity(place.city || "Ваш город");

    /* Don't make the weather wait for the prettier city name. */
    localizeCity(place)
      .then(setCity)
      .catch(() => {
        /* Keep the name returned by the IP service. */
      });

    try {
      apply(await fetchWeather(place));
    } catch (error) {
      console.warn("Weather unavailable:", error);
      showWeatherError();
    }
  }

  load();
})();
