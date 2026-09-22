/**
 * OraVicino
 * -------------------------------------------------------
 * Aggiornamento automatico dei servizi di Trento
 *
 * Fonte:
 * OpenStreetMap / Overpass API
 *
 * Output:
 * data/servizi.json
 * -------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");


/* ======================================================
   CONFIGURAZIONE
====================================================== */

const OVERPASS_URL =
  "https://overpass-api.de/api/interpreter";


const OUTPUT_FILE =
  path.join(
    process.cwd(),
    "data",
    "servizi.json"
  );


/*
 * Bounding box ampia per Trento e dintorni immediati.
 *
 * Formato Overpass:
 * south, west, north, east
 *
 * La utilizziamo invece di dipendere dal nome
 * dell'area amministrativa, rendendo la query
 * più semplice e robusta per il progetto pilota.
 */

const BBOX =
  "45.990,11.030,46.150,11.220";


/* ======================================================
   CATEGORIE ORAVICINO
====================================================== */

const CATEGORY_RULES = [

  {
    category: "farmacia",
    icon: "💊",
    key: "amenity",
    value: "pharmacy"
  },

  {
    category: "supermercato",
    icon: "🛒",
    key: "shop",
    value: "supermarket"
  },

  {
    category: "parcheggio",
    icon: "🅿️",
    key: "amenity",
    value: "parking"
  },

  {
    category: "bancomat",
    icon: "🏧",
    key: "amenity",
    value: "atm"
  },

  {
    category: "benzina",
    icon: "⛽",
    key: "amenity",
    value: "fuel"
  },

  {
    category: "lavanderia",
    icon: "🧺",
    key: "shop",
    value: "laundry"
  },

  {
    category: "veterinario",
    icon: "🐾",
    key: "amenity",
    value: "veterinary"
  },

  {
    category: "ospedale",
    icon: "🏥",
    key: "amenity",
    value: "hospital"
  },

  {
    category: "clinica",
    icon: "🩺",
    key: "amenity",
    value: "clinic"
  },

  {
    category: "bagni",
    icon: "🚻",
    key: "amenity",
    value: "toilets"
  },

  {
    category: "acqua",
    icon: "💧",
    key: "amenity",
    value: "drinking_water"
  },

  {
    category: "poste",
    icon: "📮",
    key: "amenity",
    value: "post_office"
  },

  {
    category: "noleggio-bici",
    icon: "🚲",
    key: "amenity",
    value: "bicycle_rental"
  },

  {
    category: "noleggio-auto",
    icon: "🚗",
    key: "amenity",
    value: "car_rental"
  }

];


/* ======================================================
   QUERY OVERPASS
====================================================== */

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


/* ======================================================
   IDENTIFICARE CATEGORIA
====================================================== */

function getCategory(tags = {}) {

  for (
    const rule
    of CATEGORY_RULES
  ) {

    if (
      tags[rule.key] ===
      rule.value
    ) {

      return rule;

    }

  }


  return null;

}


/* ======================================================
   COORDINATE
====================================================== */

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


/* ======================================================
   INDIRIZZO
====================================================== */

function buildAddress(tags = {}) {

  const street =
    tags["addr:street"] || "";


  const number =
    tags["addr:housenumber"] || "";


  const postcode =
    tags["addr:postcode"] || "";


  const city =
    tags["addr:city"] || "";


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


/* ======================================================
   NOME
====================================================== */

function getName(
  tags,
  category
) {

  if (tags.name) {

    return tags.name;

  }


  /*
   * Alcuni servizi pubblici non hanno necessariamente
   * un nome in OpenStreetMap.
   *
   * Non li eliminiamo perché possono essere utilissimi
   * per OraVicino.
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


/* ======================================================
   TELEFONO
====================================================== */

function getPhone(tags = {}) {

  return (
    tags.phone
    ||
    tags["contact:phone"]
    ||
    ""
  );

}


/* ======================================================
   WEBSITE
====================================================== */

function getWebsite(tags = {}) {

  return (
    tags.website
    ||
    tags["contact:website"]
    ||
    ""
  );

}


/* ======================================================
   EMAIL
====================================================== */

function getEmail(tags = {}) {

  return (
    tags.email
    ||
    tags["contact:email"]
    ||
    ""
  );

}


/* ======================================================
   ACCESSIBILITÀ
====================================================== */

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


/* ======================================================
   NORMALIZZAZIONE
====================================================== */

function normalizeElement(element) {

  const tags =
    element.tags || {};


  const categoryRule =
    getCategory(tags);


  if (!categoryRule) {

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
   * Per attività commerciali vogliamo normalmente
   * un nome.
   *
   * Per parcheggi, ATM, bagni e acqua possiamo
   * utilizzare un nome generico.
   */

  if (!name) {

    return null;

  }


  return {

    id:
      `osm-${element.type}-${element.id}`,

    sourceId:
      `${element.type}/${element.id}`,

    source:
      "OpenStreetMap",

    name,

    category:
      categoryRule.category,

    icon:
      categoryRule.icon,

    address:
      buildAddress(tags),

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
      "",

    lat:
      Number(
        coordinates.lat
      ),

    lng:
      Number(
        coordinates.lng
      ),

    phone:
      getPhone(tags),

    website:
      getWebsite(tags),

    email:
      getEmail(tags),

    openingHours:
      tags.opening_hours
      ||
      "",

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

    osmType:
      element.type,

    osmId:
      element.id

  };

}


/* ======================================================
   REMOZIONE DUPLICATI
====================================================== */

function removeDuplicates(items) {

  const unique =
    new Map();


  for (
    const item
    of items
  ) {

    /*
     * sourceId è univoco nel dataset OSM.
     */

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


/* ======================================================
   ORDINAMENTO
====================================================== */

function sortServices(items) {

  return items.sort(
    (a, b) => {

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


/* ======================================================
   STATISTICHE
====================================================== */

function printStatistics(items) {

  const statistics = {};


  for (
    const item
    of items
  ) {

    statistics[
      item.category
    ] =
      (
        statistics[
          item.category
        ]
        ||
        0
      )
      +
      1;

  }


  console.log(
    "\n=============================="
  );

  console.log(
    "ORAVICINO — SERVIZI TRENTO"
  );

  console.log(
    "=============================="
  );


  console.log(
    `Totale servizi: ${items.length}`
  );


  console.log(
    "\nCategorie:"
  );


  Object
    .entries(statistics)
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


  const withAddress =
    items.filter(
      item =>
        item.address
    ).length;


  const withOpeningHours =
    items.filter(
      item =>
        item.openingHours
    ).length;


  const withPhone =
    items.filter(
      item =>
        item.phone
    ).length;


  const withWebsite =
    items.filter(
      item =>
        item.website
    ).length;


  console.log(
    "\nQualità dati:"
  );


  console.log(
    `- con indirizzo: ${withAddress}`
  );


  console.log(
    `- con orari: ${withOpeningHours}`
  );


  console.log(
    `- con telefono: ${withPhone}`
  );


  console.log(
    `- con sito web: ${withWebsite}`
  );


  console.log(
    "==============================\n"
  );

}


/* ======================================================
   MAIN
====================================================== */

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
            "OraVicino/1.0"

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


  console.log(
    `Elementi ricevuti: ${data.elements.length}`
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
   * Protezione:
   * non sovrascriviamo il database
   * se la query restituisce zero risultati.
   */

  if (
    services.length === 0
  ) {

    throw new Error(
      "Nessun servizio trovato. Il file esistente non verrà sovrascritto."
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

      total:
        services.length

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
    services
  );


  console.log(
    `File generato: ${OUTPUT_FILE}`
  );

}


/* ======================================================
   AVVIO
====================================================== */

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
