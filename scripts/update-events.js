const fs = require("fs");
const path = require("path");

const API =
  "https://eventi.comune.trento.it/opendata/api/content/search/";

const OUTPUT = path.join(
  process.cwd(),
  "data",
  "eventi-auto.json"
);

const DAYS_AHEAD = 30;
const PAGE_SIZE = 100;

// ----------------------------------------------------
// DATAS
// ----------------------------------------------------

function localDateString(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function isoDate(value) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return localDateString(date);
}

function timeRome(value) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function todayRome() {
  return localDateString(new Date());
}

function futureLimit(days) {
  const date = new Date();

  date.setUTCDate(date.getUTCDate() + days);

  return localDateString(date);
}

// ----------------------------------------------------
// TEXTO
// ----------------------------------------------------

function stripHtml(value) {
  if (!value) return "";

  return String(value)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ----------------------------------------------------
// CLASSIFICAÇÃO
// ----------------------------------------------------

function classifyEvent(data) {
  const typology = Array.isArray(data.has_public_event_typology)
    ? data.has_public_event_typology.join(" ")
    : "";

  const topics = Array.isArray(data.topics)
    ? data.topics
        .map(item => item?.name?.["ita-IT"] || "")
        .join(" ")
    : "";

  const title = data.event_title || "";

  const text =
    `${typology} ${topics} ${title}`.toLowerCase();

  if (
    text.includes("musica") ||
    text.includes("concerto") ||
    text.includes("musicale") ||
    text.includes("live")
  ) {
    return "Musica";
  }

  if (
    text.includes("sport") ||
    text.includes("running") ||
    text.includes("gara") ||
    text.includes("calcio") ||
    text.includes("baseball")
  ) {
    return "Sport";
  }

  if (
    text.includes("bambin") ||
    text.includes("famigl") ||
    text.includes("ragazz")
  ) {
    return "Famiglie";
  }

  if (text.includes("festival")) {
    return "Festival";
  }

  return "Cultura";
}

function buildTags(data, category) {
  const tags = new Set();

  tags.add(category.toLowerCase());

  if (data.is_accessible_for_free === 1) {
    tags.add("gratis");
  }

  if (Array.isArray(data.has_public_event_typology)) {
    for (const value of data.has_public_event_typology) {
      const slug = slugify(value);

      if (slug) {
        tags.add(slug);
      }
    }
  }

  if (Array.isArray(data.topics)) {
    for (const topic of data.topics) {
      const name =
        topic?.name?.["ita-IT"];

      if (!name) continue;

      const slug = slugify(name);

      if (slug) {
        tags.add(slug);
      }
    }
  }

  return Array.from(tags);
}

// ----------------------------------------------------
// INTERVALO OFICIAL
// ----------------------------------------------------

function getOfficialInterval(data) {
  const interval = data?.time_interval;

  if (!interval) {
    return null;
  }

  const input = interval.input || {};

  let start =
    input.startDateTime || null;

  let end =
    input.endDateTime || null;

  if (!start) {
    const first =
      interval?.default_value?.from_time;

    if (first) {
      start = first;
    }
  }

  if (!end) {
    const last =
      interval?.default_value?.to_time;

    if (last) {
      end = last;
    }
  }

  if (!start) {
    return null;
  }

  if (!end) {
    end = start;
  }

  return {
    start,
    end
  };
}

// ----------------------------------------------------
// OCORRÊNCIAS
// ----------------------------------------------------

function getOccurrences(data) {
  const interval =
    data?.time_interval;

  if (!interval) {
    return [];
  }

  const raw = [];

  if (Array.isArray(interval.events)) {
    raw.push(...interval.events);
  }

  if (
    raw.length === 0 &&
    Array.isArray(interval.recurrences)
  ) {
    raw.push(...interval.recurrences);
  }

  return raw
    .filter(item => item?.start)
    .map(item => ({
      start: item.start,
      end: item.end || item.start
    }))
    .filter(item => {
      const start =
        new Date(item.start);

      const end =
        new Date(item.end);

      return (
        !Number.isNaN(start.getTime()) &&
        !Number.isNaN(end.getTime())
      );
    })
    .sort(
      (a, b) =>
        new Date(a.start) -
        new Date(b.start)
    );
}

// ----------------------------------------------------
// DATA ÚTIL PARA ORAVICINO
// ----------------------------------------------------

function getUsefulOccurrence(data) {
  const today = todayRome();
  const limit = futureLimit(DAYS_AHEAD);

  const official =
    getOfficialInterval(data);

  if (!official) {
    return null;
  }

  const originalDateStart =
    isoDate(official.start);

  const originalDateEnd =
    isoDate(official.end);

  if (
    !originalDateStart ||
    !originalDateEnd
  ) {
    return null;
  }

  // Evento já terminou.
  if (originalDateEnd < today) {
    return null;
  }

  // Evento começa depois da janela.
  if (originalDateStart > limit) {
    return null;
  }

  const occurrences =
    getOccurrences(data);

  // ------------------------------------------------
  // Procura ocorrência explícita atual ou futura.
  // ------------------------------------------------

  for (const occurrence of occurrences) {
    const startDate =
      isoDate(occurrence.start);

    const endDate =
      isoDate(occurrence.end);

    if (!startDate || !endDate) {
      continue;
    }

    if (endDate < today) {
      continue;
    }

    if (startDate > limit) {
      continue;
    }

    // Ocorrência já começou e ainda está válida.
    if (
      startDate <= today &&
      endDate >= today
    ) {
      return {
        dateStart: today,
        dateEnd: endDate,
        timeStart: timeRome(
          occurrence.start
        ),
        timeEnd: timeRome(
          occurrence.end
        ),
        originalDateStart,
        originalDateEnd,
        ongoing: startDate < today
      };
    }

    // Próxima ocorrência futura.
    if (
      startDate >= today &&
      startDate <= limit
    ) {
      return {
        dateStart: startDate,
        dateEnd: endDate,
        timeStart: timeRome(
          occurrence.start
        ),
        timeEnd: timeRome(
          occurrence.end
        ),
        originalDateStart,
        originalDateEnd,
        ongoing: false
      };
    }
  }

  // ------------------------------------------------
  // EVENTO DE LONGA DURAÇÃO
  //
  // Algumas exposições/festivais são enviados pela
  // API como um intervalo único, sem ocorrências
  // diárias separadas.
  // ------------------------------------------------

  if (
    originalDateStart <= today &&
    originalDateEnd >= today
  ) {
    return {
      dateStart: today,
      dateEnd: originalDateEnd,
      timeStart: timeRome(
        official.start
      ),
      timeEnd: timeRome(
        official.end
      ),
      originalDateStart,
      originalDateEnd,
      ongoing: originalDateStart < today
    };
  }

  // Evento futuro dentro dos próximos 30 dias.
  if (
    originalDateStart >= today &&
    originalDateStart <= limit
  ) {
    return {
      dateStart: originalDateStart,
      dateEnd: originalDateEnd,
      timeStart: timeRome(
        official.start
      ),
      timeEnd: timeRome(
        official.end
      ),
      originalDateStart,
      originalDateEnd,
      ongoing: false
    };
  }

  return null;
}

// ----------------------------------------------------
// NORMALIZAÇÃO
// ----------------------------------------------------

function normalizeEvent(hit) {
  const metadata =
    hit?.metadata || {};

  if (
    metadata.classIdentifier !== "event"
  ) {
    return null;
  }

  const data =
    hit?.data?.["ita-IT"] || {};

  const extra =
    hit?.extradata?.["ita-IT"] || {};

  const useful =
    getUsefulOccurrence(data);

  if (!useful) {
    return null;
  }

  const title =
    data.event_title ||
    metadata?.name?.["ita-IT"] ||
    "Evento";

  const description =
    stripHtml(data.event_abstract) ||
    stripHtml(data.description) ||
    "";

  const category =
    classifyEvent(data);

  let venue = "Trento";

  if (
    Array.isArray(data.takes_place_in) &&
    data.takes_place_in.length > 0
  ) {
    venue =
      data.takes_place_in[0]
        ?.name?.["ita-IT"] ||
      venue;
  }

  const geo =
    Array.isArray(extra.geo) &&
    extra.geo.length > 0
      ? extra.geo[0]
      : null;

  const latitude =
    geo?.latitude != null
      ? Number(geo.latitude)
      : null;

  const longitude =
    geo?.longitude != null
      ? Number(geo.longitude)
      : null;

  let price = "Info";

  if (
    data.is_accessible_for_free === 1
  ) {
    price = "Gratis";
  } else {
    const cost =
      stripHtml(data.cost_notes);

    if (cost) {
      price = cost;
    }
  }

  const url =
    extra.urlAlias ||
    `https://eventi.comune.trento.it/read/${metadata.id}`;

  return {
    id: `trento-${metadata.id}`,
    sourceId: metadata.id,

    title,
    category,
    description,

    venue,
    address: venue,
    city: "Trento",
    area: venue,

    dateStart:
      useful.dateStart,

    dateEnd:
      useful.dateEnd,

    timeStart:
      useful.timeStart,

    timeEnd:
      useful.timeEnd,

    originalDateStart:
      useful.originalDateStart,

    originalDateEnd:
      useful.originalDateEnd,

    ongoing:
      useful.ongoing,

    price,

    lat:
      Number.isFinite(latitude)
        ? latitude
        : null,

    lng:
      Number.isFinite(longitude)
        ? longitude
        : null,

    tags:
      buildTags(
        data,
        category
      ),

    image: null,

    url,

    source:
      "Agenda Trento",

    sourceUrl:
      url,

    modified:
      metadata.modified || null
  };
}

// ----------------------------------------------------
// API
// ----------------------------------------------------

async function fetchPage(offset) {
  const query =
    `class = [event] limit ${PAGE_SIZE} offset ${offset}`;

  const url =
    `${API}?` +
    new URLSearchParams({
      q: query
    }).toString();

  console.log(
    `Consultando eventos ${offset + 1}–${offset + PAGE_SIZE}...`
  );

  const response =
    await fetch(url, {
      headers: {
        Accept:
          "application/json",

        "User-Agent":
          "OraVicino/1.0"
      }
    });

  if (!response.ok) {
    throw new Error(
      `Agenda Trento respondeu HTTP ${response.status}`
    );
  }

  return response.json();
}

async function fetchAllEvents() {
  const hits = [];

  let offset = 0;
  let total = null;

  while (true) {
    const result =
      await fetchPage(offset);

    if (total === null) {
      total =
        Number(
          result.totalCount || 0
        );

      console.log(
        `Total informado pela Agenda Trento: ${total}`
      );
    }

    const pageHits =
      Array.isArray(
        result.searchHits
      )
        ? result.searchHits
        : [];

    hits.push(...pageHits);

    if (
      pageHits.length === 0
    ) {
      break;
    }

    offset += PAGE_SIZE;

    if (offset >= total) {
      break;
    }
  }

  return hits;
}

// ----------------------------------------------------
// DUPLICADOS
// ----------------------------------------------------

function deduplicate(events) {
  const map = new Map();

  for (const event of events) {
    const key =
      `${event.sourceId}|${event.dateStart}`;

    if (!map.has(key)) {
      map.set(key, event);
    }
  }

  return Array.from(
    map.values()
  );
}

// ----------------------------------------------------
// EXECUÇÃO
// ----------------------------------------------------

async function main() {
  console.log("");
  console.log(
    "===================================="
  );

  console.log(
    " OraVicino · Agenda Trento"
  );

  console.log(
    "===================================="
  );

  console.log("");

  console.log(
    `Hoje em Trento: ${todayRome()}`
  );

  console.log(
    `Janela: próximos ${DAYS_AHEAD} dias`
  );

  console.log("");

  const hits =
    await fetchAllEvents();

  console.log("");

  console.log(
    `Registros recebidos: ${hits.length}`
  );

  let events =
    hits
      .map(normalizeEvent)
      .filter(Boolean);

  events =
    deduplicate(events);

  events.sort((a, b) => {
    const dateCompare =
      a.dateStart.localeCompare(
        b.dateStart
      );

    if (dateCompare !== 0) {
      return dateCompare;
    }

    return (
      a.timeStart || "99:99"
    ).localeCompare(
      b.timeStart || "99:99"
    );
  });

  console.log(
    `Eventos úteis selecionados: ${events.length}`
  );

  if (
    events.length === 0
  ) {
    throw new Error(
      "Nenhum evento atual ou futuro foi encontrado. O arquivo não será criado."
    );
  }

  fs.mkdirSync(
    path.dirname(OUTPUT),
    {
      recursive: true
    }
  );

  fs.writeFileSync(
    OUTPUT,
    JSON.stringify(
      events,
      null,
      2
    ) + "\n",
    "utf8"
  );

  console.log("");

  console.log(
    `Arquivo criado: ${OUTPUT}`
  );

  console.log("");

  console.log(
    "Primeiros eventos:"
  );

  events
    .slice(0, 15)
    .forEach(
      (event, index) => {
        const status =
          event.ongoing
            ? " [IN CORSO]"
            : "";

        console.log(
          `${index + 1}. ${event.dateStart} · ${event.title}${status}`
        );
      }
    );

  console.log("");

  console.log(
    "IMPORTAÇÃO CONCLUÍDA COM SUCESSO."
  );
}

main().catch(error => {
  console.error("");

  console.error(
    "ERRO NA IMPORTAÇÃO:"
  );

  console.error(error);

  process.exit(1);
});
