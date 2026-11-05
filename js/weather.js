/* ─────────────────────────────────────────────────────────
   Weather widget with IP-based location + smooth crossfade.

   On load:
   - Sypex Geo resolves the visitor's city (already in Russian);
   - wttr.in returns the current weather; Open-Meteo is a backup;
   - until both are ready the widget shimmers "Узнаем погоду";
   - the background crossfades from the default sun to the
     matching one (cloud / rain / snow / fog / thunderstorm).

   All services are keyless and send CORS headers.
   ───────────────────────────────────────────────────────── */

(() => {
  "use strict";

  const OPEN_METEO_API = "https://api.open-meteo.com/v1/forecast";
  const WTTR_API = "https://wttr.in";
  const MET_API = "https://api.met.no/weatherapi/locationforecast/2.0/compact";
  const GEO_API = "https://api.bigdatacloud.net/data/reverse-geocode-client";
  const NOMINATIM_API = "https://nominatim.openstreetmap.org/reverse";

  const FALLBACK_PLACE = {
    city: "Москва",
    lat: 55.7558,
    lon: 37.6173,
    localized: true,
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

  function stateForBg(bg) {
    return (
      Object.values(WEATHER).find((item) => item.bg === bg) ||
      FALLBACK_WEATHER
    );
  }

  /* WWO codes (wttr.in) → the same six visual states. */
  const WWO_GROUPS = {
    sun: [113],
    cloud: [116, 119, 122],
    fog: [143, 248, 260],
    rain: [
      176, 182, 185, 263, 266, 281, 284, 293, 296, 299, 302, 305, 308,
      311, 314, 353, 356, 359,
    ],
    snow: [
      179, 227, 230, 317, 320, 323, 326, 329, 332, 335, 338, 350, 362,
      365, 368, 371, 374, 377,
    ],
    thunderstorm: [200, 386, 389, 392, 395],
  };

  const WWO_WEATHER = {};
  Object.entries(WWO_GROUPS).forEach(([bg, codes]) => {
    const state = stateForBg(bg);
    codes.forEach((code) => {
      WWO_WEATHER[code] = state;
    });
  });

  const CACHE_KEY = "portfolio.weather.v2";
  const BG_KEYS = ["sun", "cloud", "rain", "snow", "fog", "thunderstorm"];
  const ICON_KEYS = ["sun", "cloud", "rain", "snow", "fog", "thunderstorm"];

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

  /* Random tilt for the pill on load: -5°..+5°, never 0.
     The carousel loop reads this value and animates the pill. */
  if (widget) {
    let tilt;
    do {
      tilt = (Math.random() * 2 - 1) * 5;
    } while (Math.abs(tilt) < 0.05);

    widget.dataset.tilt = tilt.toFixed(3);
    widget.style.transform = `rotate(${tilt.toFixed(2)}deg)`;
  }

  /* Preload all backgrounds so the crossfade can start at once. */
  BG_KEYS.forEach((key) => {
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

  function makePlace(city, lat, lon, localized = false) {
    const place = {
      city: typeof city === "string" ? city.trim() : "",
      lat: Number(lat),
      lon: Number(lon),
      localized: Boolean(localized && city),
    };

    if (!validPlace(place.lat, place.lon)) {
      throw new Error("IP lookup returned no coordinates");
    }

    return place;
  }

  const hasCyrillic = (value) => /[А-Яа-яЁё]/.test(value || "");

  /* Last painted weather state; lets a refresh open on the same
     city, weather, icon and background instead of the default. */
  function readCache() {
    try {
      const data = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (
        !data ||
        !BG_KEYS.includes(data.bg) ||
        !ICON_KEYS.includes(data.icon) ||
        typeof data.label !== "string" ||
        !data.label.trim() ||
        typeof data.city !== "string" ||
        !data.city.trim() ||
        !hasCyrillic(data.city)
      ) {
        return null;
      }

      const lat = Number(data.lat);
      const lon = Number(data.lon);

      return {
        bg: data.bg,
        label: data.label,
        icon: data.icon,
        city: data.city,
        lat: validPlace(lat, lon) ? lat : null,
        lon: validPlace(lat, lon) ? lon : null,
      };
    } catch {
      return null;
    }
  }

  function writeCache(info, place, city) {
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          bg: info.bg,
          label: info.label,
          icon: info.icon,
          city,
          lat: place?.lat ?? null,
          lon: place?.lon ?? null,
          savedAt: Date.now(),
        }),
      );
    } catch {
      /* Storage may be unavailable in private mode. */
    }
  }

  /* Primary IP lookup: a Russian service that returns the city in
     Russian, so the widget never shows an English name. */
  async function locationFromSypex() {
    const data = await fetchJson("https://api.sypexgeo.net/json/", 6000);
    const city = data?.city;
    if (!city) throw new Error("Sypex returned no city");

    return makePlace(
      city.name_ru || city.name_en,
      city.lat,
      city.lon,
      Boolean(city.name_ru),
    );
  }

  /* Fallback IP lookup. */
  async function locationFromGeoJs() {
    const data = await fetchJson("https://get.geojs.io/v1/ip/geo.json", 6000);
    if (!data) throw new Error("GeoJS returned no data");
    return makePlace(data.city, data.latitude, data.longitude);
  }

  /* Backup IP lookup in case the first ones are blocked/rate-limited. */
  async function locationFromIpApi() {
    const data = await fetchJson("https://ipapi.co/json/", 6000);
    if (!data || data.error) {
      throw new Error(data?.reason || "ipapi.co failed");
    }
    return makePlace(data.city, data.latitude, data.longitude);
  }

  async function locate(fallback) {
    for (const lookup of [locationFromGeoJs, locationFromSypex, locationFromIpApi]) {
      try {
        const place = await lookup();
        return place;
      } catch (error) {
        console.warn("IP location unavailable:", error);
      }
    }

    return { ...(fallback || FALLBACK_PLACE) };
  }

  /* Localize the city name when the IP provider returned English. */
  async function localizeWithBigDataCloud(place) {
    const url =
      `${GEO_API}?latitude=${place.lat}&longitude=${place.lon}` +
      "&localityLanguage=ru";

    const data = await fetchJson(url, 5000);
    return (
      data?.city ||
      data?.locality ||
      data?.principalSubdivision ||
      ""
    );
  }

  async function localizeWithNominatim(place) {
    const url =
      `${NOMINATIM_API}?format=jsonv2` +
      `&lat=${place.lat}&lon=${place.lon}&accept-language=ru`;

    const data = await fetchJson(url, 6000);
    const address = data?.address || {};

    return (
      address.city ||
      address.town ||
      address.village ||
      address.municipality ||
      address.state ||
      data?.name ||
      ""
    );
  }

  async function localizeCity(place) {
    if (place.localized && hasCyrillic(place.city)) return place.city;

    /* Nominatim works from Russia; BigDataCloud is the backup. */
    for (const localize of [localizeWithNominatim, localizeWithBigDataCloud]) {
      try {
        const city = await localize(place);
        if (typeof city === "string" && hasCyrillic(city)) return city;
      } catch {
        /* try the next localizer */
      }
    }

    return "";
  }

  function stateFromMetSymbol(symbol) {
    const code = String(symbol || "").replace(/_(day|night|polartwilight)$/, "");

    if (code.includes("thunder")) return stateForBg("thunderstorm");
    if (code.includes("snow") || code.includes("sleet")) return stateForBg("snow");
    if (code.includes("rain") || code.includes("drizzle")) return stateForBg("rain");
    if (code.includes("fog")) return stateForBg("fog");
    if (code.includes("cloud")) return stateForBg("cloud");
    if (code.includes("clear") || code.includes("fair")) return stateForBg("sun");

    return stateForBg("cloud");
  }

  /* MET Norway: keyless, CORS-enabled and reachable in Russia. */
  async function fetchWeatherMet(place) {
    const url =
      `${MET_API}?lat=${place.lat.toFixed(4)}&lon=${place.lon.toFixed(4)}`;

    const data = await fetchJson(url, 7000);
    const current = data?.properties?.timeseries?.[0]?.data;
    const symbol =
      current?.next_1_hours?.summary?.symbol_code ||
      current?.next_6_hours?.summary?.symbol_code ||
      current?.next_12_hours?.summary?.symbol_code;

    if (!symbol) throw new Error("MET Norway returned no weather symbol");
    return stateFromMetSymbol(symbol);
  }

  /* wttr.in is a second keyless source. */
  async function fetchWeatherWttr(place) {
    const url =
      `${WTTR_API}/${place.lat.toFixed(4)},${place.lon.toFixed(4)}` +
      "?format=j1";

    const data = await fetchJson(url, 7000);
    const code = Number(data?.current_condition?.[0]?.weatherCode);
    const info = WWO_WEATHER[code];

    if (!info) throw new Error("wttr.in returned an unknown weather code");
    return info;
  }

  async function fetchWeatherOpenMeteo(place) {
    const url =
      `${OPEN_METEO_API}?latitude=${place.lat}&longitude=${place.lon}` +
      "&current=temperature_2m,weather_code&timezone=auto";

    const data = await fetchJson(url, 8000);
    if (typeof data?.current?.weather_code !== "number") {
      throw new Error("Weather response has no current code");
    }

    return WEATHER[data.current.weather_code] || FALLBACK_WEATHER;
  }

  async function fetchWeather(place) {
    let lastError;

    for (const provider of [
      fetchWeatherMet,
      fetchWeatherWttr,
      fetchWeatherOpenMeteo,
    ]) {
      try {
        return await provider(place);
      } catch (error) {
        lastError = error;
        console.warn("Weather provider unavailable:", error);
      }
    }

    throw lastError || new Error("No weather provider available");
  }

  function setCity(city) {
    const clean = city?.trim();
    if (!cityEl || !clean || cityEl.textContent === clean) return;

    cityEl.textContent = clean;
    cityEl.title = clean;
  }

  /* Paint the stored state immediately, before the network runs. */
  function showCached(cache) {
    if (!cache) return;

    currentBg = cache.bg;

    if (bgBase) {
      bgBase.src = `bg/${cache.bg}.jpg?v=${BG_VERSION}`;
    }
    if (bgOverlay) {
      bgOverlay.style.opacity = "0";
    }
    if (iconEl) {
      iconEl.src = `weatherIcon/${cache.icon}.svg?v=${ICON_VERSION}`;
      iconEl.style.opacity = "1";
    }
    if (descEl) {
      descEl.classList.remove("weather__state--loading");
      descEl.textContent = cache.label;
      descEl.style.opacity = "1";
    }

    setCity(cache.city);
    widget?.classList.remove("is-loading");
    widget?.setAttribute("aria-busy", "false");
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

  /* Console diagnostics: weatherCheck() tests every external
     service and prints a table with OK / error and latency. */
  async function checkService(test) {
    const started = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);

    try {
      const res = await fetch(test.url, {
        signal: controller.signal,
        cache: "no-store",
      });
      const text = await res.text();
      const ms = Math.round(performance.now() - started);

      if (!res.ok) {
        return { service: test.name, ok: false, http: res.status, ms, detail: `HTTP ${res.status}` };
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        return { service: test.name, ok: false, http: res.status, ms, detail: "Ответ не JSON" };
      }

      let detail = "ответ получен";
      try {
        detail = test.parse(data) || detail;
      } catch {
        /* shape is still a valid response */
      }

      return { service: test.name, ok: true, http: res.status, ms, detail };
    } catch (error) {
      return {
        service: test.name,
        ok: false,
        http: "—",
        ms: Math.round(performance.now() - started),
        detail: error?.name === "AbortError" ? "таймаут" : "сеть / CORS",
      };
    } finally {
      clearTimeout(timer);
    }
  }

  window.weatherCheck = async function weatherCheck() {
    const lat = 55.7558;
    const lon = 37.6173;
    const services = [
      {
        name: "Sypex Geo — город",
        url: "https://api.sypexgeo.net/json/",
        parse: (data) => data?.city?.name_ru || data?.city?.name_en,
      },
      {
        name: "GeoJS — город",
        url: "https://get.geojs.io/v1/ip/geo.json",
        parse: (data) => data?.city,
      },
      {
        name: "ipapi.co — город",
        url: "https://ipapi.co/json/",
        parse: (data) => data?.city,
      },
      {
        name: "MET Norway — погода",
        url:
          `https://api.met.no/weatherapi/locationforecast/2.0/compact` +
          `?lat=${lat}&lon=${lon}`,
        parse: (data) =>
          data?.properties?.timeseries?.[0]?.data?.next_1_hours?.summary?.symbol_code,
      },
      {
        name: "wttr.in — погода",
        url: `https://wttr.in/${lat},${lon}?format=j1`,
        parse: (data) => {
          const current = data?.current_condition?.[0];
          return current ? `${current.temp_C}°C, код ${current.weatherCode}` : "";
        },
      },
      {
        name: "Open-Meteo — погода",
        url:
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}` +
          `&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`,
        parse: (data) =>
          typeof data?.current?.weather_code === "number"
            ? `код ${data.current.weather_code}`
            : "",
      },
      {
        name: "BigDataCloud — город",
        url:
          `https://api.bigdatacloud.net/data/reverse-geocode-client` +
          `?latitude=${lat}&longitude=${lon}&localityLanguage=ru`,
        parse: (data) => data?.city || data?.locality,
      },
      {
        name: "Nominatim — город",
        url:
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
          `&lat=${lat}&lon=${lon}&accept-language=ru`,
        parse: (data) =>
          data?.address?.city ||
          data?.address?.town ||
          data?.address?.village,
      },
    ];

    console.log("Проверяю внешние сервисы, подожди…");
    const results = await Promise.all(services.map(checkService));

    console.table(
      results.map((item) => ({
        Сервис: item.service,
        Статус: item.ok ? "OK" : "ОШИБКА",
        HTTP: item.http,
        "мс": item.ms,
        Результат: item.detail,
      })),
    );

    const failed = results.filter((item) => !item.ok).map((item) => item.service);
    console.log(
      failed.length
        ? `Недоступны: ${failed.join(", ")}`
        : "Все сервисы доступны",
    );

    return results;
  };

  async function load(cached) {
    const cachedPlace =
      cached && validPlace(cached.lat, cached.lon)
        ? {
            city: cached.city,
            lat: cached.lat,
            lon: cached.lon,
            localized: true,
          }
        : null;
    const place = await locate(cachedPlace || FALLBACK_PLACE);

    /* If the city is already Russian, show it right away while
       the weather request is still running. */
    if (!cached && place.localized && hasCyrillic(place.city)) {
      setCity(place.city);
    }

    try {
      const [localized, info] = await Promise.all([
        localizeCity(place).catch(() => ""),
        fetchWeather(place),
      ]);

      const city =
        localized ||
        (place.localized && hasCyrillic(place.city) ? place.city : "") ||
        cached?.city ||
        "Ваш город";

      setCity(city);
      apply(info);
      writeCache(info, place, city);
    } catch (error) {
      console.warn("Weather unavailable:", error);

      /* Offline / API failure: keep the remembered state if there
         is one. Only the very first visit shows "Нет данных". */
      if (!cached) {
        setCity(
          place.localized && hasCyrillic(place.city)
            ? place.city
            : "Ваш город",
        );
        showWeatherError();
      }
    }
  }

  const cachedState = readCache();
  if (cachedState) showCached(cachedState);

  load(cachedState);
})();
