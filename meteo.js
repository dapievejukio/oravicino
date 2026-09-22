/* ==========================================
   ORAVICINO · METEO
   Trento
   ========================================== */

(() => {
  "use strict";

  const LAT = 46.0679;
  const LNG = 11.1211;

  const CITY = "Trento";

  const HOURS_BAR = 7;
  const HOURS_DETAIL = 12;

  const API =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${LAT}` +
    `&longitude=${LNG}` +
    "&current=temperature_2m,weather_code" +
    "&hourly=temperature_2m,precipitation_probability,weather_code" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
    "&timezone=Europe%2FRome" +
    "&forecast_days=7";


  /* ==========================================
     CÓDIGOS METEOROLÓGICOS
     ========================================== */

  function weatherInfo(code) {
    code = Number(code);

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


  /* ==========================================
     HELPERS
     ========================================== */

  function escapeHTML(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }


  function parseLocalTime(value) {
    if (!value || !value.includes("T")) {
      return "";
    }

    return value.split("T")[1].slice(0, 5);
  }


  function getRomeNowString() {
    const formatter = new Intl.DateTimeFormat(
      "sv-SE",
      {
        timeZone: "Europe/Rome",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }
    );

    const parts = formatter.formatToParts(new Date());

    const values = {};

    parts.forEach((part) => {
      if (part.type !== "literal") {
        values[part.type] = part.value;
      }
    });

    return (
      `${values.year}-` +
      `${values.month}-` +
      `${values.day}T` +
      `${values.hour}:` +
      `${values.minute}`
    );
  }


  function findStartingIndex(times) {
    const romeNow = getRomeNowString();

    for (let i = 0; i < times.length; i++) {
      if (times[i] >= romeNow) {
        return i;
      }
    }

    return 0;
  }


  function dayName(value, index) {
    if (index === 0) {
      return "Oggi";
    }

    if (index === 1) {
      return "Domani";
    }

    const date = new Date(
      `${value}T12:00:00`
    );

    return new Intl.DateTimeFormat(
      "it-IT",
      {
        weekday: "short"
      }
    )
      .format(date)
      .replace(".", "");
  }


  /* ==========================================
     CONTAINER
     ========================================== */

  function createContainer() {
    let container =
      document.getElementById(
        "oravicino-meteo"
      );

    if (container) {
      return container;
    }

    container =
      document.createElement(
        "section"
      );

    container.id =
      "oravicino-meteo";

    container.className =
      "ov-meteo";

    const header =
      document.querySelector(
        "header"
      );

    if (header) {
      header.insertAdjacentElement(
        "afterend",
        container
      );
    } else {
      document.body.prepend(
        container
      );
    }

    return container;
  }


  /* ==========================================
     STATUS
     ========================================== */

  function renderLoading(container) {
    container.innerHTML = `
      <div class="ov-meteo-loading">
        Caricamento meteo di Trento…
      </div>
    `;
  }


  function renderError(container) {
    container.innerHTML = `
      <div class="ov-meteo-error">
        Meteo temporaneamente non disponibile.
      </div>
    `;
  }


  /* ==========================================
     RESUMO DAS PRÓXIMAS HORAS
     ========================================== */

  function weatherSummary(
    data,
    startIndex
  ) {
    const hourly = data.hourly;

    let highestRain = 0;
    let rainTime = null;

    const end = Math.min(
      startIndex + HOURS_DETAIL,
      hourly.time.length
    );

    for (
      let i = startIndex;
      i < end;
      i++
    ) {
      const probability =
        Number(
          hourly
            .precipitation_probability[i] || 0
        );

      if (probability > highestRain) {
        highestRain =
          probability;

        rainTime =
          hourly.time[i];
      }
    }

    if (highestRain >= 60) {
      return (
        "☔ Pioggia probabile nelle prossime ore" +
        (
          rainTime
            ? `, soprattutto verso le ${parseLocalTime(rainTime)}.`
            : "."
        )
      );
    }

    if (highestRain >= 35) {
      return (
        "🌦️ Possibile pioggia nelle prossime ore" +
        (
          rainTime
            ? `, con probabilità maggiore verso le ${parseLocalTime(rainTime)}.`
            : "."
        )
      );
    }

    return (
      "✓ Nessuna pioggia significativa prevista nelle prossime 12 ore."
    );
  }


  /* ==========================================
     PREVISÃO POR HORA
     ========================================== */

  function buildHours(
    data,
    startIndex,
    amount,
    detail = false
  ) {
    const hourly = data.hourly;

    const items = [];

    const end = Math.min(
      startIndex + amount,
      hourly.time.length
    );

    for (
      let i = startIndex;
      i < end;
      i++
    ) {
      const info =
        weatherInfo(
          hourly.weather_code[i]
        );

      const temperature =
        Math.round(
          hourly.temperature_2m[i]
        );

      const rain =
        Number(
          hourly
            .precipitation_probability[i] || 0
        );

      const rainClass =
        rain >= 35
          ? " rain"
          : "";

      const rainText =
        rain >= 20
          ? `☔ ${rain}%`
          : "";

      if (detail) {
        items.push(`
          <div class="ov-meteo-detail-hour${rainClass}">

            <div class="ov-meteo-detail-time">
              ${escapeHTML(
                parseLocalTime(
                  hourly.time[i]
                )
              )}
            </div>

            <div class="ov-meteo-detail-icon">
              ${info.icon}
            </div>

            <div class="ov-meteo-detail-temp">
              ${temperature}°
            </div>

            <div class="ov-meteo-detail-rain">
              ${rainText}
            </div>

          </div>
        `);
      } else {
        items.push(`
          <div class="ov-meteo-hour${rainClass}">

            <div class="ov-meteo-hour-time">
              ${escapeHTML(
                parseLocalTime(
                  hourly.time[i]
                )
              )}
            </div>

            <div class="ov-meteo-hour-main">
              <span>
                ${info.icon}
              </span>

              <span>
                ${temperature}°
              </span>
            </div>

            <div class="ov-meteo-hour-rain">
              ${rainText}
            </div>

          </div>
        `);
      }
    }

    return items.join("");
  }


  /* ==========================================
     PREVISÃO DE 7 DIAS
     ========================================== */

  function buildDays(data) {
    const daily = data.daily;

    const items = [];

    for (
      let i = 0;
      i < daily.time.length;
      i++
    ) {
      const info =
        weatherInfo(
          daily.weather_code[i]
        );

      const max =
        Math.round(
          daily.temperature_2m_max[i]
        );

      const min =
        Math.round(
          daily.temperature_2m_min[i]
        );

      const rain =
        Number(
          daily
            .precipitation_probability_max[i] || 0
        );

      items.push(`
        <div class="ov-meteo-day${i === 0 ? " today" : ""}">

          <div class="ov-meteo-day-name">
            ${escapeHTML(
              dayName(
                daily.time[i],
                i
              )
            )}
          </div>

          <div class="ov-meteo-day-icon">
            ${info.icon}
          </div>

          <div class="ov-meteo-day-temp">
            ${max}°

            <span class="ov-meteo-day-min">
              / ${min}°
            </span>
          </div>

          <div class="ov-meteo-day-rain">
            ${
              rain >= 20
                ? `☔ ${rain}%`
                : ""
            }
          </div>

        </div>
      `);
    }

    return items.join("");
  }


  /* ==========================================
     ABRIR / FECHAR PREVISÃO
     ========================================== */

  function activateForecastPanel(
    container
  ) {
    const button =
      container.querySelector(
        ".ov-meteo-more"
      );

    const panel =
      container.querySelector(
        ".ov-meteo-panel"
      );

    if (!button || !panel) {
      console.error(
        "OraVicino Meteo: botão ou painel não encontrado."
      );

      return;
    }

    button.addEventListener(
      "click",
      function () {
        const isOpen =
          panel.classList.contains(
            "open"
          );

        if (isOpen) {
          panel.classList.remove(
            "open"
          );

          button.classList.remove(
            "open"
          );

          button.setAttribute(
            "aria-expanded",
            "false"
          );

          button.textContent =
            "PREVISIONI ›";
        } else {
          panel.classList.add(
            "open"
          );

          button.classList.add(
            "open"
          );

          button.setAttribute(
            "aria-expanded",
            "true"
          );

          button.textContent =
            "CHIUDI ×";
        }
      }
    );
  }


  /* ==========================================
     RENDER PRINCIPAL
     ========================================== */

  function renderWeather(
    container,
    data
  ) {
    const current =
      data.current;

    const startIndex =
      findStartingIndex(
        data.hourly.time
      );

    const currentWeather =
      weatherInfo(
        current.weather_code
      );

    const summary =
      weatherSummary(
        data,
        startIndex
      );

    container.innerHTML = `

      <div class="ov-meteo-inner">

        <div class="ov-meteo-now">

          <div class="ov-meteo-now-icon">
            ${currentWeather.icon}
          </div>

          <div>

            <div class="ov-meteo-city">
              ${escapeHTML(CITY)} · ADESSO
            </div>

            <div class="ov-meteo-current">

              <span class="ov-meteo-temp">
                ${Math.round(
                  current.temperature_2m
                )}°
              </span>

              <span class="ov-meteo-description">
                ${escapeHTML(
                  currentWeather.text
                )}
              </span>

            </div>

          </div>

        </div>


        <div class="ov-meteo-hours">

          ${buildHours(
            data,
            startIndex,
            HOURS_BAR
          )}

        </div>


        <button
          class="ov-meteo-more"
          type="button"
          aria-expanded="false"
        >
          PREVISIONI ›
        </button>

      </div>


      <div
        class="ov-meteo-panel"
      >

        <div class="ov-meteo-panel-inner">


          <div class="ov-meteo-panel-top">

            <div>

              <h2 class="ov-meteo-panel-title">
                Previsioni per ${escapeHTML(CITY)}
              </h2>

              <div class="ov-meteo-panel-subtitle">
                Prossime ore e 7 giorni
              </div>

            </div>


            <div class="ov-meteo-summary">
              ${escapeHTML(summary)}
            </div>

          </div>


          <div class="ov-meteo-section-label">
            Prossime 12 ore
          </div>


          <div class="ov-meteo-12hours">

            ${buildHours(
              data,
              startIndex,
              HOURS_DETAIL,
              true
            )}

          </div>


          <div class="ov-meteo-section-label">
            Prossimi 7 giorni
          </div>


          <div class="ov-meteo-days">

            ${buildDays(data)}

          </div>

        </div>

      </div>
    `;

    activateForecastPanel(
      container
    );
  }


  /* ==========================================
     CARREGAR API
     ========================================== */

  async function loadWeather() {
    const container =
      createContainer();

    renderLoading(
      container
    );

    try {
      const response =
        await fetch(
          API,
          {
            cache: "no-store"
          }
        );

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        );
      }

      const data =
        await response.json();

      if (
        !data.current ||
        !data.hourly ||
        !data.daily ||
        !Array.isArray(
          data.hourly.time
        ) ||
        !Array.isArray(
          data.daily.time
        )
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

      renderError(
        container
      );
    }
  }


  /* ==========================================
     START
     ========================================== */

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      loadWeather
    );
  } else {
    loadWeather();
  }

})();
