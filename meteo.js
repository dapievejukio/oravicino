/* ==========================================
   ORAVICINO · METEO
   Trento
   ========================================== */

(() => {
  const LAT = 46.0679;
  const LNG = 11.1211;

  const CITY = "Trento";
  const HOURS_TO_SHOW = 7;

  const API =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${LAT}` +
    `&longitude=${LNG}` +
    "&current=temperature_2m,weather_code" +
    "&hourly=temperature_2m,precipitation_probability,weather_code" +
    "&timezone=Europe%2FRome" +
    "&forecast_days=2";

  function weatherInfo(code) {
    if (code === 0) {
      return {
        icon: "☀️",
        text: "Sereno"
      };
    }

    if ([1, 2].includes(code)) {
      return {
        icon: "🌤️",
        text: "Poco nuvoloso"
      };
    }

    if (code === 3) {
      return {
        icon: "☁️",
        text: "Nuvoloso"
      };
    }

    if ([45, 48].includes(code)) {
      return {
        icon: "🌫️",
        text: "Nebbia"
      };
    }

    if ([51, 53, 55, 56, 57].includes(code)) {
      return {
        icon: "🌦️",
        text: "Pioviggine"
      };
    }

    if ([61, 63, 65, 66, 67].includes(code)) {
      return {
        icon: "🌧️",
        text: "Pioggia"
      };
    }

    if ([71, 73, 75, 77].includes(code)) {
      return {
        icon: "❄️",
        text: "Neve"
      };
    }

    if ([80, 81, 82].includes(code)) {
      return {
        icon: "🌧️",
        text: "Rovesci"
      };
    }

    if ([85, 86].includes(code)) {
      return {
        icon: "🌨️",
        text: "Neve"
      };
    }

    if ([95, 96, 99].includes(code)) {
      return {
        icon: "⛈️",
        text: "Temporale"
      };
    }

    return {
      icon: "🌤️",
      text: "Meteo"
    };
  }

  function escapeHTML(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function hourLabel(value) {
    const date = new Date(value);

    return new Intl.DateTimeFormat("it-IT", {
      timeZone: "Europe/Rome",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function findStartingIndex(times) {
    const now = Date.now();

    for (let i = 0; i < times.length; i++) {
      const timestamp = new Date(times[i]).getTime();

      if (timestamp >= now) {
        return i;
      }
    }

    return 0;
  }

  function createContainer() {
    let container =
      document.getElementById("oravicino-meteo");

    if (container) {
      return container;
    }

    container =
      document.createElement("section");

    container.id = "oravicino-meteo";
    container.className = "ov-meteo";

    const header =
      document.querySelector("header");

    if (header) {
      header.insertAdjacentElement(
        "afterend",
        container
      );
    } else {
      document.body.prepend(container);
    }

    return container;
  }

  function renderLoading(container) {
    container.innerHTML =
      '<div class="ov-meteo-loading">' +
      "Caricamento meteo di Trento…" +
      "</div>";
  }

  function renderError(container) {
    container.innerHTML =
      '<div class="ov-meteo-error">' +
      "Meteo temporaneamente non disponibile." +
      "</div>";
  }

  function renderWeather(container, data) {
    const current =
      data.current || {};

    const hourly =
      data.hourly || {};

    const times =
      hourly.time || [];

    const temperatures =
      hourly.temperature_2m || [];

    const rain =
      hourly.precipitation_probability || [];

    const codes =
      hourly.weather_code || [];

    const currentWeather =
      weatherInfo(
        Number(current.weather_code)
      );

    const startIndex =
      findStartingIndex(times);

    const hours = [];

    for (
      let i = startIndex;
      i < Math.min(
        startIndex + HOURS_TO_SHOW,
        times.length
      );
      i++
    ) {
      const info =
        weatherInfo(
          Number(codes[i])
        );

      const rainChance =
        Number(rain[i] || 0);

      const rainClass =
        rainChance >= 35
          ? " rain"
          : "";

      hours.push(`
        <div class="ov-meteo-hour${rainClass}">
          <div class="ov-meteo-hour-time">
            ${escapeHTML(hourLabel(times[i]))}
          </div>

          <div class="ov-meteo-hour-main">
            <span>${info.icon}</span>
            <span>${Math.round(temperatures[i])}°</span>
          </div>

          <div class="ov-meteo-hour-rain">
            ${
              rainChance >= 20
                ? `☔ ${rainChance}%`
                : ""
            }
          </div>
        </div>
      `);
    }

    container.innerHTML = `
      <div class="ov-meteo-inner">

        <div class="ov-meteo-now">

          <div class="ov-meteo-now-icon">
            ${currentWeather.icon}
          </div>

          <div>
            <div class="ov-meteo-city">
              ${CITY} · ADESSO
            </div>

            <div class="ov-meteo-current">
              <span class="ov-meteo-temp">
                ${Math.round(current.temperature_2m)}°
              </span>

              <span class="ov-meteo-description">
                ${escapeHTML(currentWeather.text)}
              </span>
            </div>
          </div>

        </div>

        <div class="ov-meteo-hours">
          ${hours.join("")}
        </div>

        <button
          class="ov-meteo-more"
          type="button"
          title="Previsioni dettagliate"
        >
          PREVISIONI ›
        </button>

      </div>
    `;
  }

  async function loadWeather() {
    const container =
      createContainer();

    renderLoading(container);

    try {
      const response =
        await fetch(API, {
          cache: "no-store"
        });

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        );
      }

      const data =
        await response.json();

      if (
        !data.current ||
        !data.hourly
      ) {
        throw new Error(
          "Risposta meteo incompleta"
        );
      }

      renderWeather(
        container,
        data
      );
    } catch (error) {
      console.error(
        "OraVicino Meteo:",
        error
      );

      renderError(container);
    }
  }

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      loadWeather
    );
  } else {
    loadWeather();
  }
})();
