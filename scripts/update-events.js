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
// Datas
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
// Texto
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
// Classificação OraVicino
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

  const text = `${typology} ${topics} ${data.event_title || ""}`
    .toLowerCase();

  if (
    text.includes("musica") ||
    text.includes("concerto") ||
    text.includes("musicale")
  ) {
    return "Musica";
  }

  if (
    text.includes("sport") ||
    text.includes("running") ||
    text.includes("gara")
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

  if (
    text.includes("festival")
  ) {
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

      if (slug) tags.add(slug);
    }
  }

  if (Array.isArray(data.topics)) {
    for (const topic of data.topics) {
      const name = topic?.name?.["ita-IT"];

      if (name) {
        const slug = slugify(name);

        if (slug) tags.add(slug);
      }
    }
  }

  return Array.from(tags);
}

// ----------------------------------------------------
// Datas do evento
// ----------------------------------------------------

function getInterval(data) {
  const interval = data?.time_interval;

  if (!interval) return null;

  const input = interval.input || {};

  let start = input.startDateTime || null;
  let end = input.endDateTime || null;

  if (
    Array.isArray(interval.events) &&
    interval.events.length > 0
  ) {
    const starts = interval.events
      .map(event => event.start)
      .filter(Boolean)
      .map(value => new Date(value))
      .filter(value => !Number.isNaN(value.getTime()));

    const ends = interval.events
      .map(event => event.end)
      .filter(Boolean)
      .map(value => new Date(value))
      .filter(value => !Number.isNaN(value.getTime()));

    if (starts.length > 0) {
      starts.sort((a, b) => a - b);
      start = starts[0].toISOString();
    }

    if (ends.length > 0) {
      ends.sort((a, b) => a - b);
      end = ends[ends.length - 1].toISOString();
    }
  }

  if (!start) return null;

  if (!end) end = start;

  return {
    start,
    end
  };
}

// ----------------------------------------------------
// Conversão Agenda Trento → OraVicino
// ----------------------------------------------------

function normalizeEvent(hit) {
  const metadata = hit?.metadata || {};

  if (metadata.classIdentifier !== "event") {
    return null;
  }

  const data =
    hit?.data?.["ita-IT"] ||
    {};

  const extra =
    hit?.extradata?.["ita-IT"] ||
    {};

  const interval = getInterval(data);

  if (!interval) {
    return null;
  }

  const dateStart = isoDate(interval.start);
  const dateEnd = isoDate(interval.end);

  if (!dateStart || !dateEnd) {
    return null;
  }

  const today = todayRome();
  const limit = futureLimit(DAYS_AHEAD);

  // Evento completamente encerrado.
  if (dateEnd < today) {
    return null;
  }

  // Evento começa além da nossa janela.
  if (dateStart > limit) {
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

  const category = classifyEvent(data);

  let venue = "Trento";

  if (
    Array.isArray(data.takes_place_in) &&
    data.takes_place_in.length > 0
  ) {
    venue =
      data.takes_place_in[0]?.name?.["ita-IT"] ||
      venue;
  }

  const geo =
    Array.isArray(extra.geo) &&
    extra.geo.length > 0
      ? extra.geo[0]
      : null;

  const lat =
    geo?.latitude != null
      ? Number(geo.latitude)
      : null;

  const lng =
    geo?.longitude != null
      ? Number(geo.longitude)
      : null;

  let price = "Info";

  if (data.is_accessible_for_free === 1) {
    price = "Gratis";
  } else {
    const cost = stripHtml(data.cost_notes);

    if (cost) price = cost;
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
    dateStart,
    dateEnd,
    timeStart: timeRome(interval.start),
    timeEnd: timeRome(interval.end),
    price,
    lat:
      Number.isFinite(lat)
        ? lat
        : null,
    lng:
      Number.isFinite(lng)
        ? lng
        : null,
    tags: buildTags(data, category),
    image: null,
    url,
    source: "Agenda Trento",
    sourceUrl: url,
    modified:
      metadata.modified ||
      null
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

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "OraVicino/1.0"
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
    const result = await fetchPage(offset);

    if (total === null) {
      total = Number(result.totalCount || 0);

      console.log(
        `Total informado pela Agenda Trento: ${total}`
      );
    }

    const pageHits =
      Array.isArray(result.searchHits)
        ? result.searchHits
        : [];

    hits.push(...pageHits);

    if (pageHits.length === 0) {
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
// Remoção de duplicados
// ----------------------------------------------------

function deduplicate(events) {
  const map = new Map();

  for (const event of events) {
    const key =
      `${event.sourceId}|${event.dateStart}|${event.dateEnd}`;

    if (!map.has(key)) {
      map.set(key, event);
    }
  }

  return Array.from(map.values());
}

// ----------------------------------------------------
// Execução
// ----------------------------------------------------

async function main() {
  console.log("");
  console.log("====================================");
  console.log(" OraVicino · Agenda Trento");
  console.log("====================================");
  console.log("");

  console.log(
    `Hoje em Trento: ${todayRome()}`
  );

  console.log(
    `Janela: próximos ${DAYS_AHEAD} dias`
  );

  console.log("");

  const hits = await fetchAllEvents();

  console.log("");
  console.log(
    `Registros recebidos: ${hits.length}`
  );

  let events = hits
    .map(normalizeEvent)
    .filter(Boolean);

  events = deduplicate(events);

  events.sort((a, b) => {
    const dateCompare =
      a.dateStart.localeCompare(b.dateStart);

    if (dateCompare !== 0) {
      return dateCompare;
    }

    return (a.timeStart || "99:99")
      .localeCompare(b.timeStart || "99:99");
  });

  console.log(
    `Eventos atuais/próximos selecionados: ${events.length}`
  );

  if (events.length === 0) {
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
    JSON.stringify(events, null, 2) + "\n",
    "utf8"
  );

  console.log("");
  console.log(
    `Arquivo criado: ${OUTPUT}`
  );

  console.log("");

  console.log("Primeiros eventos:");

  events.slice(0, 10).forEach(
    (event, index) => {
      console.log(
        `${index + 1}. ${event.dateStart} · ${event.title}`
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
