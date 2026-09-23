const fs = require("fs");
const path = require("path");

const CITY = "Trento";
const COUNTRY = "Italia";

// Trento + área imediatamente próxima.
// Mantemos a mesma área utilizada nos demais módulos do OraVicino.
const BBOX = "45.990,11.030,46.150,11.220";

const OUTPUT = path.join(__dirname, "..", "data", "dormire.json");

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.nchc.org.tw/api/interpreter"
];

const QUERY = `
[out:json][timeout:90];

(
  node["tourism"="hotel"](${BBOX});
  way["tourism"="hotel"](${BBOX});
  relation["tourism"="hotel"](${BBOX});

  node["tourism"="guest_house"](${BBOX});
  way["tourism"="guest_house"](${BBOX});
  relation["tourism"="guest_house"](${BBOX});

  node["tourism"="hostel"](${BBOX});
  way["tourism"="hostel"](${BBOX});
  relation["tourism"="hostel"](${BBOX});

  node["tourism"="apartment"](${BBOX});
  way["tourism"="apartment"](${BBOX});
  relation["tourism"="apartment"](${BBOX});

  node["tourism"="chalet"](${BBOX});
  way["tourism"="chalet"](${BBOX});
  relation["tourism"="chalet"](${BBOX});

  node["tourism"="camp_site"](${BBOX});
  way["tourism"="camp_site"](${BBOX});
  relation["tourism"="camp_site"](${BBOX});

  node["tourism"="alpine_hut"](${BBOX});
  way["tourism"="alpine_hut"](${BBOX});
  relation["tourism"="alpine_hut"](${BBOX});

  node["tourism"="wilderness_hut"](${BBOX});
  way["tourism"="wilderness_hut"](${BBOX});
  relation["tourism"="wilderness_hut"](${BBOX});
);

out center tags;
`;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function clean(value) {
  if (value === undefined || value === null) return null;

  const text = String(value).trim();

  return text || null;
}

function normalizeUrl(value) {
  const url = clean(value);

  if (!url) return null;

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  return `https://${url}`;
}

function normalizePhone(value) {
  return clean(value);
}

function getCoordinates(element) {
  if (
    typeof element.lat === "number" &&
    typeof element.lon === "number"
  ) {
    return {
      lat: element.lat,
      lng: element.lon
    };
  }

  if (
    element.center &&
    typeof element.center.lat === "number" &&
    typeof element.center.lon === "number"
  ) {
    return {
      lat: element.center.lat,
      lng: element.center.lon
    };
  }

  return null;
}

function getName(tags = {}) {
  return (
    clean(tags["name:it"]) ||
    clean(tags.name) ||
    clean(tags.official_name) ||
    clean(tags.brand) ||
    clean(tags.operator)
  );
}

function getAddress(tags = {}) {
  const street = clean(tags["addr:street"]);
  const number = clean(tags["addr:housenumber"]);
  const place = clean(tags["addr:place"]);

  if (street && number) {
    return `${street}, ${number}`;
  }

  if (street) {
    return street;
  }

  if (place && number) {
    return `${place}, ${number}`;
  }

  return place;
}

function getCity(tags = {}) {
  return (
    clean(tags["addr:city"]) ||
    clean(tags["addr:town"]) ||
    clean(tags["addr:village"]) ||
    CITY
  );
}

function getArea(tags = {}) {
  return (
    clean(tags["addr:suburb"]) ||
    clean(tags["addr:district"]) ||
    clean(tags["addr:hamlet"]) ||
    clean(tags["addr:quarter"]) ||
    null
  );
}

function classify(tags = {}) {
  const tourism = tags.tourism;

  switch (tourism) {
    case "hotel":
      return {
        category: "hotel",
        label: "Hotel",
        icon: "🏨"
      };

    case "guest_house":
      return {
        category: "bnb",
        label: "B&B / Guest house",
        icon: "🛏️"
      };

    case "hostel":
      return {
        category: "hostel",
        label: "Ostello",
        icon: "🎒"
      };

    case "apartment":
      return {
        category: "appartamento",
        label: "Appartamento",
        icon: "🏠"
      };

    case "chalet":
      return {
        category: "chalet",
        label: "Chalet",
        icon: "🏡"
      };

    case "camp_site":
      return {
        category: "campeggio",
        label: "Campeggio",
        icon: "⛺"
      };

    case "alpine_hut":
      return {
        category: "rifugio",
        label: "Rifugio",
        icon: "🏔️"
      };

    case "wilderness_hut":
      return {
        category: "rifugio",
        label: "Rifugio",
        icon: "🏔️"
      };

    default:
      return null;
  }
}

function isPrivate(tags = {}) {
  const access = clean(tags.access);

  return access === "private" || access === "no";
}

function parseBoolean(value) {
  const normalized = clean(value);

  if (!normalized) return null;

  if (
    normalized === "yes" ||
    normalized === "true" ||
    normalized === "1"
  ) {
    return true;
  }

  if (
    normalized === "no" ||
    normalized === "false" ||
    normalized === "0"
  ) {
    return false;
  }

  return null;
}

function getWebsite(tags = {}) {
  return normalizeUrl(
    tags.website ||
    tags["contact:website"] ||
    tags.url
  );
}

function getPhone(tags = {}) {
  return normalizePhone(
    tags.phone ||
    tags["contact:phone"] ||
    tags.mobile ||
    tags["contact:mobile"]
  );
}

function getEmail(tags = {}) {
  return clean(
    tags.email ||
    tags["contact:email"]
  );
}

function qualityScore(item) {
  let score = 0;

  if (item.name) score += 10;
  if (item.address) score += 3;
  if (item.website) score += 4;
  if (item.phone) score += 3;
  if (item.email) score += 2;
  if (item.openingHours) score += 2;
  if (item.stars) score += 2;
  if (item.rooms) score += 1;
  if (item.beds) score += 1;
  if (item.wheelchair) score += 1;

  return score;
}

function convert(element) {
  const tags = element.tags || {};
  const coordinates = getCoordinates(element);
  const classification = classify(tags);
  const name = getName(tags);

  if (!coordinates || !classification || !name) {
    return null;
  }

  if (isPrivate(tags)) {
    return null;
  }

  if (
    tags.disused === "yes" ||
    tags.abandoned === "yes" ||
    tags.demolished === "yes"
  ) {
    return null;
  }

  const openingHours = clean(tags.opening_hours);

  const item = {
    id: `${element.type}-${element.id}`,
    sourceId: `osm:${element.type}/${element.id}`,
    source: "OpenStreetMap",

    category: classification.category,
    label: classification.label,
    icon: classification.icon,

    name,

    address: getAddress(tags),
    city: getCity(tags),
    area: getArea(tags),

    lat: coordinates.lat,
    lng: coordinates.lng,

    website: getWebsite(tags),
    phone: getPhone(tags),
    email: getEmail(tags),

    openingHours,

    hasOpeningHours: Boolean(openingHours),

    open24h:
      openingHours &&
      openingHours.replace(/\s/g, "").toLowerCase() === "24/7",

    wheelchair: clean(tags.wheelchair),

    stars: clean(tags.stars),
    rooms: clean(tags.rooms),
    beds: clean(tags.beds),

    operator: clean(tags.operator),
    brand: clean(tags.brand),

    internetAccess: clean(tags.internet_access),
    wifi:
      tags.internet_access === "wlan" ||
      tags.internet_access === "wifi" ||
      tags["internet_access:fee"] === "no",

    breakfast: clean(tags.breakfast),
    restaurant: clean(tags.restaurant),

    pets: clean(
      tags.dog ||
      tags.pets
    ),

    smoking: clean(tags.smoking),

    fee: clean(tags.fee),

    reservation: clean(
      tags.reservation ||
      tags.booking
    ),

    checkIn: clean(
      tags.check_in ||
      tags["check-in"]
    ),

    checkOut: clean(
      tags.check_out ||
      tags["check-out"]
    ),

    family:
      parseBoolean(tags.family) ??
      parseBoolean(tags.child_friendly) ??
      null,

    description:
      clean(tags["description:it"]) ||
      clean(tags.description),

    wikidata: clean(tags.wikidata),
    wikipedia: clean(tags.wikipedia),

    tourism: clean(tags.tourism),

    osmType: element.type,
    osmId: element.id
  };

  item.hasContact = Boolean(
    item.website ||
    item.phone ||
    item.email
  );

  return item;
}

function deduplicate(items) {
  const map = new Map();

  for (const item of items) {
    const normalizedName = item.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");

    const lat = item.lat.toFixed(4);
    const lng = item.lng.toFixed(4);

    const key = `${normalizedName}:${lat}:${lng}`;

    const existing = map.get(key);

    if (!existing) {
      map.set(key, item);
      continue;
    }

    if (qualityScore(item) > qualityScore(existing)) {
      map.set(key, item);
    }
  }

  return Array.from(map.values());
}

async function fetchOverpass(endpoint) {
  console.log(`Tentativo Overpass: ${endpoint}`);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "User-Agent": "OraVicino/1.0 (oravicino.com)"
    },
    body: new URLSearchParams({
      data: QUERY
    }).toString()
  });

  if (!response.ok) {
    throw new Error(
      `Overpass HTTP ${response.status} ${response.statusText}`
    );
  }

  const json = await response.json();

  if (!json || !Array.isArray(json.elements)) {
    throw new Error("Risposta Overpass non valida.");
  }

  return json.elements;
}

async function getElements() {
  let lastError = null;

  for (let i = 0; i < OVERPASS_ENDPOINTS.length; i++) {
    const endpoint = OVERPASS_ENDPOINTS[i];

    try {
      return await fetchOverpass(endpoint);
    } catch (error) {
      lastError = error;

      console.error(
        `Errore con ${endpoint}:`,
        error.message
      );

      if (i < OVERPASS_ENDPOINTS.length - 1) {
        console.log("Provo un altro server Overpass...");
        await sleep(3000);
      }
    }
  }

  throw lastError || new Error("Nessun server Overpass disponibile.");
}

function countByCategory(items) {
  return items.reduce((result, item) => {
    result[item.category] =
      (result[item.category] || 0) + 1;

    return result;
  }, {});
}

async function main() {
  console.log("======================================");
  console.log("ORAVICINO · DORMIRE");
  console.log("Aggiornamento strutture ricettive");
  console.log("======================================");
  console.log("");

  const elements = await getElements();

  console.log(`Elementi OSM ricevuti: ${elements.length}`);

  const converted = elements
    .map(convert)
    .filter(Boolean);

  const stays = deduplicate(converted)
    .sort((a, b) => {
      const categoryComparison =
        a.category.localeCompare(b.category, "it");

      if (categoryComparison !== 0) {
        return categoryComparison;
      }

      return a.name.localeCompare(b.name, "it");
    });

  if (stays.length === 0) {
    throw new Error(
      "Nessuna struttura trovata. dormire.json non verrà sovrascritto."
    );
  }

  const categories = countByCategory(stays);

  const metadata = {
    project: "OraVicino",
    section: "Dormire",
    city: CITY,
    country: COUNTRY,

    source: "OpenStreetMap",
    sourceLicense: "ODbL",

    generatedAt: new Date().toISOString(),

    bbox: BBOX,

    rawTotal: elements.length,
    afterCleaning: converted.length,
    total: stays.length,

    categories
  };

  const payload = {
    metadata,
    stays
  };

  fs.mkdirSync(path.dirname(OUTPUT), {
    recursive: true
  });

  fs.writeFileSync(
    OUTPUT,
    JSON.stringify(payload, null, 2),
    "utf8"
  );

  console.log("");
  console.log(`Strutture dopo pulizia: ${stays.length}`);

  console.log("");
  console.log("Categorie:");

  Object.entries(categories)
    .sort((a, b) => b[1] - a[1])
    .forEach(([category, total]) => {
      console.log(`- ${category}: ${total}`);
    });

  console.log("");
  console.log("Qualità dati:");

  console.log(
    `- con indirizzo: ${stays.filter(x => x.address).length}`
  );

  console.log(
    `- con sito web: ${stays.filter(x => x.website).length}`
  );

  console.log(
    `- con telefono: ${stays.filter(x => x.phone).length}`
  );

  console.log(
    `- con contatto: ${stays.filter(x => x.hasContact).length}`
  );

  console.log(
    `- con orari: ${stays.filter(x => x.hasOpeningHours).length}`
  );

  console.log(
    `- accessibilità indicata: ${stays.filter(x => x.wheelchair).length}`
  );

  console.log("");
  console.log(`Creato: ${OUTPUT}`);
}

main().catch(error => {
  console.error("");
  console.error("ERRORE:");
  console.error(error);

  process.exit(1);
});
