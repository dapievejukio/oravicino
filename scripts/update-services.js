/**
 * OraVicino
 * ============================================================
 * Database automatico dei servizi di Trento
 *
 * Fonte:
 * OpenStreetMap / Overpass API
 *
 * Output:
 * data/servizi.json
 *
 * Versione 2
 * ============================================================
 */

const fs = require("fs");
const path = require("path");


/* ============================================================
   CONFIGURAZIONE
============================================================ */

const OVERPASS_URL =
  "https://overpass-api.de/api/interpreter";


const OUTPUT_FILE =
  path.join(
    process.cwd(),
    "data",
    "servizi.json"
  );


/*
 * Trento e dintorni immediati.
 *
 * Overpass bbox:
 * south, west, north, east
 */

const BBOX =
  "45.990,11.030,46.150,11.220";


/* ============================================================
   CATEGORIE ORAVICINO
============================================================ */

const CATEGORY_RULES = [

  {
    category: "farmacia",
    group: "servizio",
    label: "Farmacie",
    icon: "💊",
    key: "amenity",
    value: "pharmacy"
  },

  {
    category: "supermercato",
    group: "servizio",
    label: "Supermercati",
    icon: "🛒",
    key: "shop",
    value: "supermarket"
  },

  {
    category: "parcheggio",
    group: "utilita",
    label: "Parcheggi",
    icon: "🅿️",
    key: "amenity",
    value: "parking"
  },

  {
    category: "bancomat",
    group: "utilita",
    label: "Bancomat",
    icon: "🏧",
    key: "amenity",
    value: "atm"
  },

  {
    category: "benzina",
    group: "servizio",
    label: "Benzina",
    icon: "⛽",
    key: "amenity",
    value: "fuel"
  },

  {
    category: "lavanderia",
    group: "servizio",
    label: "Lavanderie",
    icon: "🧺",
    key: "shop",
    value: "laundry"
  },

  {
    category: "veterinario",
    group: "servizio",
    label: "Veterinari",
    icon: "🐾",
    key: "amenity",
    value: "veterinary"
  },

  {
    category: "ospedale",
    group: "servizio",
    label: "Ospedali",
    icon: "🏥",
    key: "amenity",
    value: "hospital"
  },

  {
    category: "clinica",
    group: "servizio",
    label: "Cliniche",
    icon: "🩺",
    key: "amenity",
    value: "clinic"
  },

  {
    category: "bagni",
    group: "utilita",
    label: "Bagni pubblici",
    icon: "🚻",
    key: "amenity",
    value: "toilets"
  },

  {
    category: "acqua",
    group: "utilita",
    label: "Acqua potabile",
    icon: "💧",
    key: "amenity",
    value: "drinking_water"
  },

  {
    category: "poste",
    group: "servizio",
    label: "Poste",
    icon: "📮",
    key: "amenity",
    value: "post_office"
  },

  {
    category: "noleggio-bici",
    group: "utilita",
    label: "Noleggio bici",
    icon: "🚲",
    key: "amenity",
    value: "bicycle_rental"
  },

  {
    category: "noleggio-auto",
    group: "servizio",
    label: "Noleggio auto",
    icon: "🚗",
    key: "amenity",
    value: "car_rental"
  }

];


/* ============================================================
   QUERY OVERPASS
============================================================ */

function buildQuery() {

  const queries =
    CATEGORY_RULES
      .map(
        rule => `

          node
            ["${rule.key}"="${rule.value}"]
            (${BBOX});

          way
            ["${rule.key}"="${rule.value}"]
            (${BBOX});

          relation
            ["${rule.key}"="${rule.value}"]
            (${BBOX});

        `
      )
      .join("\n");


  return `

    [out:json][timeout:90];

    (

      ${queries}

    );

    out center tags;

  `;

}


/* ============================================================
   CATEGORIA
============================================================ */

function getCategoryRule(tags = {}) {

  for (const rule of CATEGORY_RULES) {

    if (
      tags[rule.key] ===
      rule.value
    ) {

      return rule;

    }

  }


  return null;

}


/* ============================================================
   COORDINATE
============================================================ */

function getCoordinates(element) {

  if (
    Number.isFinite(element.lat)
    &&
    Number.isFinite(element.lon)
  ) {

    return {

      lat: element.lat,

      lng: element.lon

    };

  }


  if (
    element.center
    &&
    Number.isFinite(
      element.center.lat
    )
    &&
    Number.isFinite(
      element.center.lon
    )
  ) {

    return {

      lat:
        element.center.lat,

      lng:
        element.center.lon

    };

  }


  return null;

}


/* ============================================================
   INDIRIZZO
============================================================ */

function buildAddress(tags = {}) {

  const street =
    tags["addr:street"]
    ||
    tags["addr:place"]
    ||
    "";


  const number =
    tags["addr:housenumber"]
    ||
    "";


  const postcode =
    tags["addr:postcode"]
    ||
    "";


  const city =
    tags["addr:city"]
    ||
    "";


  const firstLine =
    [
      street,
      number
    ]
      .filter(Boolean)
      .join(" ");


  const secondLine =
    [
      postcode,
      city
    ]
      .filter(Boolean)
      .join(" ");


  return (
    [
      firstLine,
      secondLine
    ]
      .filter(Boolean)
      .join(", ")
  );

}


/* ============================================================
   NOME
============================================================ */

function getName(
  tags,
  category
) {

  if (tags.name) {

    return tags.name;

  }


  if (tags.brand) {

    return tags.brand;

  }


  if (tags.operator) {

    return tags.operator;

  }


  /*
   * Alcune infrastrutture urbane sono utili
   * anche senza un nome proprio.
   */

  const fallbackNames = {

    parcheggio:
      "Parcheggio",

    bancomat:
      "Bancomat",

    bagni:
      "Bagni pubblici",

    acqua:
      "Acqua potabile",

    "noleggio-bici":
      "Noleggio biciclette"

  };


  return (
    fallbackNames[
      category
    ]
    ||
    ""
  );

}


/* ============================================================
   CONTATTI
============================================================ */

function getPhone(tags = {}) {

  return (
    tags.phone
    ||
    tags["contact:phone"]
    ||
    ""
  );

}


function getWebsite(tags = {}) {

  return (
    tags.website
    ||
    tags["contact:website"]
    ||
    ""
  );

}


function getEmail(tags = {}) {

  return (
    tags.email
    ||
    tags["contact:email"]
    ||
    ""
  );

}


/* ============================================================
   ACCESSIBILITÀ
============================================================ */

function getWheelchair(tags = {}) {

  if (
    tags.wheelchair === "yes"
  ) {

    return true;

  }


  if (
    tags.wheelchair === "no"
  ) {

    return false;

  }


  return null;

}


/* ============================================================
   ACCESSO PUBBLICO
============================================================ */

function isClearlyRestricted(tags = {}) {

  const access =
    String(
      tags.access || ""
    )
      .toLowerCase()
      .trim();


  const restrictedValues = new Set([
    "private",
    "no"
  ]);


  return restrictedValues.has(
    access
  );

}


function isPublicAccess(tags = {}) {

  const access =
    String(
      tags.access || ""
    )
      .toLowerCase()
      .trim();


  if (
    access === "private"
    ||
    access === "no"
  ) {

    return false;

  }


  if (
    access === "yes"
    ||
    access === "public"
    ||
    access === "customers"
    ||
    access === "permissive"
    ||
    access === "destination"
  ) {

    return true;

  }


  /*
   * null = OSM non specifica esplicitamente
   * il tipo di accesso.
   */

  return null;

}


/* ============================================================
   PARCHEGGI
============================================================ */

function shouldKeepParking(tags = {}) {

  /*
   * Eliminiamo i parcheggi esplicitamente
   * privati o vietati.
   */

  if (
    isClearlyRestricted(tags)
  ) {

    return false;

  }


  /*
   * Parcheggi privati residenziali.
   */

  const parking =
    String(
      tags.parking || ""
    )
      .toLowerCase();


  const access =
    String(
      tags.access || ""
    )
      .toLowerCase();


  if (
    parking === "private"
  ) {

    return false;

  }


  if (
    access === "residents"
  ) {

    return false;

  }


  return true;

}


/* ============================================================
   FILTRO GENERALE
============================================================ */

function shouldKeepElement(
  tags,
  categoryRule
) {

  if (!categoryRule) {

    return false;

  }


  if (
    categoryRule.category ===
    "parcheggio"
  ) {

    return shouldKeepParking(
      tags
    );

  }


  /*
   * Per le altre categorie escludiamo
   * elementi esplicitamente non accessibili.
   */

  if (
    isClearlyRestricted(tags)
  ) {

    return false;

  }


  return true;

}


/* ============================================================
   ORARI
============================================================ */

function normalizeOpeningHours(tags = {}) {

  return (
    tags.opening_hours
    ||
    ""
  );

}


function isOpen24Hours(
  openingHours
) {

  if (!openingHours) {

    return false;

  }


  const normalized =
    String(openingHours)
      .replace(/\s/g, "")
      .toLowerCase();


  return (
    normalized === "24/7"
  );

}


/* ============================================================
   CAMPI DERIVATI
============================================================ */

function hasContactData(
  phone,
  website,
  email
) {

  return Boolean(
    phone
    ||
    website
    ||
    email
  );

}


/* ============================================================
   NORMALIZZAZIONE
============================================================ */

function normalizeElement(element) {

  const tags =
    element.tags || {};


  const categoryRule =
    getCategoryRule(tags);


  if (!categoryRule) {

    return null;

  }


  if (
    !shouldKeepElement(
      tags,
      categoryRule
    )
  ) {

    return null;

  }


  const coordinates =
    getCoordinates(element);


  if (!coordinates) {

    return null;

  }


  const name =
    getName(
      tags,
      categoryRule.category
    );


  /*
   * Attività commerciali senza nome
   * non sono abbastanza utili.
   *
   * Infrastrutture urbane possono invece
   * utilizzare nomi generici.
   */

  if (!name) {

    return null;

  }


  const phone =
    getPhone(tags);


  const website =
    getWebsite(tags);


  const email =
    getEmail(tags);


  const openingHours =
    normalizeOpeningHours(tags);


  const address =
    buildAddress(tags);


  return {

    id:
      `osm-${element.type}-${element.id}`,

    sourceId:
      `${element.type}/${element.id}`,

    source:
      "OpenStreetMap",

    category:
      categoryRule.category,

    group:
      categoryRule.group,

    label:
      categoryRule.label,

    icon:
      categoryRule.icon,

    name,

    address,

    city:
      tags["addr:city"]
      ||
      "Trento",

    area:
      tags["addr:suburb"]
      ||
      tags["addr:district"]
      ||
      tags["addr:quarter"]
      ||
      tags["addr:neighbourhood"]
      ||
      "",

    lat:
      Number(
        coordinates.lat
      ),

    lng:
      Number(
        coordinates.lng
      ),

    phone,

    website,

    email,

    openingHours,

    open24h:
      isOpen24Hours(
        openingHours
      ),

    hasOpeningHours:
      Boolean(
        openingHours
      ),

    hasContact:
      hasContactData(
        phone,
        website,
        email
      ),

    publicAccess:
      isPublicAccess(tags),

    wheelchair:
      getWheelchair(tags),

    operator:
      tags.operator
      ||
      "",

    brand:
      tags.brand
      ||
      "",

    fee:
      tags.fee
      ||
      "",

    access:
      tags.access
      ||
      "",

    capacity:
      tags.capacity
      ||
      "",

    parkingType:
      tags.parking
      ||
      "",

    covered:
      tags.covered
      ||
      "",

    supervised:
      tags.supervised
      ||
      "",

    toiletsWheelchair:
      tags["toilets:wheelchair"]
      ||
      "",

    drinkingWater:
      tags.drinking_water
      ||
      "",

    osmType:
      element.type,

    osmId:
      element.id

  };

}


/* ============================================================
   DUPLICATI
============================================================ */

function removeDuplicates(items) {

  const unique =
    new Map();


  for (
    const item
    of items
  ) {

    if (
      !unique.has(
        item.sourceId
      )
    ) {

      unique.set(
        item.sourceId,
        item
      );

    }

  }


  return [
    ...unique.values()
  ];

}


/* ============================================================
   ORDINAMENTO
============================================================ */

function sortServices(items) {

  return items.sort(
    (a, b) => {

      const groupCompare =
        a.group.localeCompare(
          b.group,
          "it"
        );


      if (
        groupCompare !== 0
      ) {

        return groupCompare;

      }


      const categoryCompare =
        a.category.localeCompare(
          b.category,
          "it"
        );


      if (
        categoryCompare !== 0
      ) {

        return categoryCompare;

      }


      return (
        a.name.localeCompare(
          b.name,
          "it"
        )
      );

    }
  );

}


/* ============================================================
   STATISTICHE
============================================================ */

function getStatistics(items) {

  const categories = {};

  const groups = {};


  for (
    const item
    of items
  ) {

    categories[
      item.category
    ] =
      (
        categories[
          item.category
        ]
        ||
        0
      )
      +
      1;


    groups[
      item.group
    ] =
      (
        groups[
          item.group
        ]
        ||
        0
      )
      +
      1;

  }


  return {

    categories,

    groups,

    withAddress:
      items.filter(
        item =>
          Boolean(
            item.address
          )
      ).length,

    withOpeningHours:
      items.filter(
        item =>
          item.hasOpeningHours
      ).length,

    open24h:
      items.filter(
        item =>
          item.open24h
      ).length,

    withPhone:
      items.filter(
        item =>
          Boolean(
            item.phone
          )
      ).length,

    withWebsite:
      items.filter(
        item =>
          Boolean(
            item.website
          )
      ).length,

    withContact:
      items.filter(
        item =>
          item.hasContact
      ).length,

    wheelchairYes:
      items.filter(
        item =>
          item.wheelchair === true
      ).length

  };

}


/* ============================================================
   LOG STATISTICHE
============================================================ */

function printStatistics(
  items,
  rawCount
) {

  const stats =
    getStatistics(items);


  console.log(
    "\n======================================"
  );

  console.log(
    "ORAVICINO — SERVIZI TRENTO"
  );

  console.log(
    "======================================"
  );


  console.log(
    `Elementi OSM ricevuti: ${rawCount}`
  );


  console.log(
    `Servizi dopo pulizia: ${items.length}`
  );


  console.log(
    `Elementi esclusi: ${rawCount - items.length}`
  );


  console.log(
    "\nGRUPPI:"
  );


  Object
    .entries(
      stats.groups
    )
    .sort(
      (a, b) =>
        b[1] - a[1]
    )
    .forEach(
      ([group, total]) => {

        console.log(
          `- ${group}: ${total}`
        );

      }
    );


  console.log(
    "\nCATEGORIE:"
  );


  Object
    .entries(
      stats.categories
    )
    .sort(
      (a, b) =>
        b[1] - a[1]
    )
    .forEach(
      ([category, total]) => {

        console.log(
          `- ${category}: ${total}`
        );

      }
    );


  console.log(
    "\nQUALITÀ DATI:"
  );


  console.log(
    `- con indirizzo: ${stats.withAddress}`
  );


  console.log(
    `- con orari: ${stats.withOpeningHours}`
  );


  console.log(
    `- aperti 24h: ${stats.open24h}`
  );


  console.log(
    `- con telefono: ${stats.withPhone}`
  );


  console.log(
    `- con sito web: ${stats.withWebsite}`
  );


  console.log(
    `- con almeno un contatto: ${stats.withContact}`
  );


  console.log(
    `- accessibili in sedia a rotelle: ${stats.wheelchairYes}`
  );


  console.log(
    "======================================\n"
  );

}


/* ============================================================
   MAIN
============================================================ */

async function main() {

  console.log(
    "OraVicino"
  );


  console.log(
    "Scaricamento servizi OpenStreetMap..."
  );


  const query =
    buildQuery();


  const response =
    await fetch(
      OVERPASS_URL,
      {

        method:
          "POST",

        headers: {

          "Content-Type":
            "application/x-www-form-urlencoded",

          "User-Agent":
            "OraVicino/2.0"

        },

        body:
          new URLSearchParams({

            data:
              query

          })

      }
    );


  if (!response.ok) {

    throw new Error(
      `Overpass HTTP ${response.status}`
    );

  }


  const data =
    await response.json();


  if (
    !Array.isArray(
      data.elements
    )
  ) {

    throw new Error(
      "Risposta Overpass non valida."
    );

  }


  const rawCount =
    data.elements.length;


  console.log(
    `Elementi ricevuti: ${rawCount}`
  );


  let services =
    data.elements
      .map(
        normalizeElement
      )
      .filter(Boolean);


  services =
    removeDuplicates(
      services
    );


  services =
    sortServices(
      services
    );


  /*
   * Protezione contro una risposta vuota
   * o un problema temporaneo dell'API.
   */

  if (
    services.length === 0
  ) {

    throw new Error(
      "Nessun servizio trovato. Il database esistente non verrà sovrascritto."
    );

  }


  /*
   * Protezione aggiuntiva.
   *
   * Abbiamo già verificato che Trento restituisce
   * migliaia di elementi. Se improvvisamente
   * ne arrivassero pochissimi, è preferibile
   * non sostituire il database esistente.
   */

  if (
    services.length < 100
  ) {

    throw new Error(
      `Solo ${services.length} servizi trovati. Aggiornamento annullato per sicurezza.`
    );

  }


  const outputDirectory =
    path.dirname(
      OUTPUT_FILE
    );


  if (
    !fs.existsSync(
      outputDirectory
    )
  ) {

    fs.mkdirSync(
      outputDirectory,
      {
        recursive: true
      }
    );

  }


  const statistics =
    getStatistics(
      services
    );


  const payload = {

    metadata: {

      project:
        "OraVicino",

      city:
        "Trento",

      country:
        "Italia",

      source:
        "OpenStreetMap",

      sourceLicense:
        "ODbL",

      generatedAt:
        new Date()
          .toISOString(),

      bbox:
        BBOX,

      rawTotal:
        rawCount,

      total:
        services.length,

      groups:
        statistics.groups,

      categories:
        statistics.categories

    },

    services

  };


  fs.writeFileSync(

    OUTPUT_FILE,

    JSON.stringify(
      payload,
      null,
      2
    )
    +
    "\n",

    "utf8"

  );


  printStatistics(
    services,
    rawCount
  );


  console.log(
    `File generato: ${OUTPUT_FILE}`
  );

}


/* ============================================================
   AVVIO
============================================================ */

main()
  .catch(
    error => {

      console.error(
        "\nErrore aggiornamento servizi:"
      );

      console.error(
        error
      );

      process.exit(1);

    }
  );
