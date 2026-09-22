/**
 * OraVicino — Scoprire
 * Atualiza data/scoprire.json usando OpenStreetMap / Overpass.
 *
 * Objetivo:
 * - descobrir pontos de interesse relevantes em Trento
 * - classificar automaticamente
 * - remover objetos sem utilidade turística
 * - preparar dados para o futuro scoprire.html
 *
 * Fonte:
 * OpenStreetMap contributors
 * https://www.openstreetmap.org/copyright
 */

const fs = require("fs");
const path = require("path");


// ==========================================================
// CONFIGURAÇÃO
// ==========================================================

const CITY = "Trento";
const COUNTRY = "Italia";

/*
 * Trento + entorno imediato.
 * Mantemos a mesma área geral usada em Servizi.
 */
const BBOX = "45.990,11.030,46.150,11.220";


/*
 * Mais de um servidor para reduzir problemas
 * temporários como o HTTP 504 que tivemos em Servizi.
 */
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.nchc.org.tw/api/interpreter"
];


const OUTPUT_FILE = path.join(
  __dirname,
  "..",
  "data",
  "scoprire.json"
);


// ==========================================================
// CONSULTA OVERPASS
// ==========================================================

const QUERY = `

[out:json][timeout:90];

(

  /* MUSEUS */
  node["tourism"="museum"](${BBOX});
  way["tourism"="museum"](${BBOX});
  relation["tourism"="museum"](${BBOX});


  /* ATRAÇÕES */
  node["tourism"="attraction"](${BBOX});
  way["tourism"="attraction"](${BBOX});
  relation["tourism"="attraction"](${BBOX});


  /* MIRANTES */
  node["tourism"="viewpoint"](${BBOX});
  way["tourism"="viewpoint"](${BBOX});
  relation["tourism"="viewpoint"](${BBOX});


  /* CASTELOS */
  node["historic"="castle"](${BBOX});
  way["historic"="castle"](${BBOX});
  relation["historic"="castle"](${BBOX});


  /* MONUMENTOS */
  node["historic"="monument"](${BBOX});
  way["historic"="monument"](${BBOX});
  relation["historic"="monument"](${BBOX});


  /* MEMORIAIS */
  node["historic"="memorial"](${BBOX});
  way["historic"="memorial"](${BBOX});
  relation["historic"="memorial"](${BBOX});


  /* RUÍNAS */
  node["historic"="ruins"](${BBOX});
  way["historic"="ruins"](${BBOX});
  relation["historic"="ruins"](${BBOX});


  /* SÍTIOS ARQUEOLÓGICOS */
  node["historic"="archaeological_site"](${BBOX});
  way["historic"="archaeological_site"](${BBOX});
  relation["historic"="archaeological_site"](${BBOX});


  /* PARQUES */
  node["leisure"="park"](${BBOX});
  way["leisure"="park"](${BBOX});
  relation["leisure"="park"](${BBOX});


  /* JARDINS */
  node["leisure"="garden"](${BBOX});
  way["leisure"="garden"](${BBOX});
  relation["leisure"="garden"](${BBOX});


  /* RESERVAS NATURAIS */
  node["leisure"="nature_reserve"](${BBOX});
  way["leisure"="nature_reserve"](${BBOX});
  relation["leisure"="nature_reserve"](${BBOX});


  /* PICOS / CUMES */
  node["natural"="peak"](${BBOX});


  /* CAVERNAS */
  node["natural"="cave_entrance"](${BBOX});


  /* CASCATAS */
  node["waterway"="waterfall"](${BBOX});
  way["waterway"="waterfall"](${BBOX});


  /* ARTE PÚBLICA */
  node["tourism"="artwork"](${BBOX});
  way["tourism"="artwork"](${BBOX});
  relation["tourism"="artwork"](${BBOX});


  /* GALERIAS */
  node["tourism"="gallery"](${BBOX});
  way["tourism"="gallery"](${BBOX});
  relation["tourism"="gallery"](${BBOX});

);

out center tags;

`;


// ==========================================================
// UTILIDADES
// ==========================================================

function sleep(ms) {

  return new Promise(
    resolve => setTimeout(resolve, ms)
  );

}


function normalizeText(value) {

  if (!value) {
    return "";
  }

  return String(value)
    .trim()
    .replace(/\s+/g, " ");

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


function buildAddress(tags = {}) {

  const street =
    normalizeText(tags["addr:street"]);

  const number =
    normalizeText(tags["addr:housenumber"]);

  const place =
    normalizeText(tags["addr:place"]);


  if (street && number) {

    return `${street}, ${number}`;

  }


  if (street) {

    return street;

  }


  if (place && number) {

    return `${place}, ${number}`;

  }


  if (place) {

    return place;

  }


  return "";

}


function getWebsite(tags = {}) {

  return normalizeText(
    tags.website ||
    tags["contact:website"] ||
    tags.url
  );

}


function getPhone(tags = {}) {

  return normalizeText(
    tags.phone ||
    tags["contact:phone"]
  );

}


function getEmail(tags = {}) {

  return normalizeText(
    tags.email ||
    tags["contact:email"]
  );

}


// ==========================================================
// CLASSIFICAÇÃO
// ==========================================================

function classify(tags = {}) {

  if (tags.tourism === "museum") {

    return {
      category: "museo",
      label: "Museo",
      icon: "🏛️"
    };

  }


  if (tags.tourism === "viewpoint") {

    return {
      category: "panorama",
      label: "Panorama",
      icon: "👁️"
    };

  }


  if (tags.historic === "castle") {

    return {
      category: "storico",
      label: "Castello",
      icon: "🏰"
    };

  }


  if (
    tags.historic === "monument" ||
    tags.historic === "memorial"
  ) {

    return {
      category: "monumento",
      label: "Monumento",
      icon: "🗿"
    };

  }


  if (
    tags.historic === "ruins" ||
    tags.historic === "archaeological_site"
  ) {

    return {
      category: "storico",
      label: "Luogo storico",
      icon: "🏺"
    };

  }


  if (
    tags.leisure === "park" ||
    tags.leisure === "garden"
  ) {

    return {
      category: "parco",
      label: "Parco",
      icon: "🌳"
    };

  }


  if (
    tags.leisure === "nature_reserve" ||
    tags.natural === "peak" ||
    tags.natural === "cave_entrance" ||
    tags.waterway === "waterfall"
  ) {

    return {
      category: "natura",
      label: "Natura",
      icon: "🏔️"
    };

  }


  if (
    tags.tourism === "artwork" ||
    tags.tourism === "gallery"
  ) {

    return {
      category: "arte",
      label: "Arte",
      icon: "🎨"
    };

  }


  if (tags.tourism === "attraction") {

    return {
      category: "attrazione",
      label: "Attrazione",
      icon: "✨"
    };

  }


  return null;

}


// ==========================================================
// NOME
// ==========================================================

function getName(tags = {}) {

  return normalizeText(
    tags["name:it"] ||
    tags.name ||
    tags["official_name:it"] ||
    tags.official_name
  );

}


// ==========================================================
// FILTROS DE QUALIDADE
// ==========================================================

function shouldExclude(element) {

  const tags =
    element.tags || {};


  /*
   * Sem classificação útil.
   */
  if (!classify(tags)) {

    return true;

  }


  /*
   * Em Scoprire, ao contrário de Servizi,
   * exigimos nome.
   *
   * Isso elimina grande quantidade de
   * memoriais, obras e objetos técnicos
   * sem utilidade para descoberta.
   */
  if (!getName(tags)) {

    return true;

  }


  /*
   * Privado / sem acesso.
   */
  if (
    tags.access === "private" ||
    tags.access === "no"
  ) {

    return true;

  }


  /*
   * Elementos abandonados ou destruídos.
   */
  if (
    tags.disused === "yes" ||
    tags.abandoned === "yes" ||
    tags.demolished === "yes"
  ) {

    return true;

  }


  /*
   * Memoriais muito pequenos e técnicos
   * normalmente não interessam ao MVP.
   */
  if (
    tags.historic === "memorial" &&
    (
      tags.memorial === "plaque" ||
      tags.memorial === "stone"
    )
  ) {

    return true;

  }


  return false;

}


// ==========================================================
// CONTEXTO / TAGS ÚTEIS
// ==========================================================

function detectIndoor(tags = {}) {

  if (
    tags.indoor === "yes" ||
    tags.tourism === "museum" ||
    tags.tourism === "gallery"
  ) {

    return true;

  }


  return false;

}


function detectFree(tags = {}) {

  if (
    tags.fee === "no" ||
    tags.fee === "0"
  ) {

    return true;

  }


  if (
    tags.fee === "yes"
  ) {

    return false;

  }


  return null;

}


function detectFamily(tags = {}) {

  if (
    tags.kids === "yes" ||
    tags.child_friendly === "yes" ||
    tags.playground === "yes"
  ) {

    return true;

  }


  /*
   * Parques entram como potencialmente
   * interessantes para famílias.
   */
  if (
    tags.leisure === "park" ||
    tags.leisure === "garden"
  ) {

    return true;

  }


  return false;

}


// ==========================================================
// CONVERSÃO
// ==========================================================

function convertElement(element) {

  if (shouldExclude(element)) {

    return null;

  }


  const tags =
    element.tags || {};


  const coordinates =
    getCoordinates(element);


  if (!coordinates) {

    return null;

  }


  const classification =
    classify(tags);


  const name =
    getName(tags);


  const openingHours =
    normalizeText(
      tags.opening_hours
    );


  const website =
    getWebsite(tags);


  const phone =
    getPhone(tags);


  const email =
    getEmail(tags);


  const wikidata =
    normalizeText(
      tags.wikidata
    );


  const wikipedia =
    normalizeText(
      tags.wikipedia
    );


  return {

    id:
      `${element.type}-${element.id}`,

    sourceId:
      `osm:${element.type}/${element.id}`,

    source:
      "OpenStreetMap",

    category:
      classification.category,

    label:
      classification.label,

    icon:
      classification.icon,

    name,

    address:
      buildAddress(tags),

    city:
      normalizeText(
        tags["addr:city"]
      ) || CITY,

    area:
      normalizeText(
        tags["addr:suburb"] ||
        tags["addr:district"] ||
        tags["addr:hamlet"]
      ),

    lat:
      coordinates.lat,

    lng:
      coordinates.lng,

    website,

    phone,

    email,

    openingHours,

    hasOpeningHours:
      Boolean(openingHours),

    open24h:
      openingHours === "24/7",

    wheelchair:
      normalizeText(
        tags.wheelchair
      ),

    fee:
      normalizeText(
        tags.fee
      ),

    free:
      detectFree(tags),

    indoor:
      detectIndoor(tags),

    family:
      detectFamily(tags),

    operator:
      normalizeText(
        tags.operator
      ),

    description:
      normalizeText(
        tags["description:it"] ||
        tags.description
      ),

    wikidata,

    wikipedia,

    heritage:
      normalizeText(
        tags.heritage
      ),

    historic:
      normalizeText(
        tags.historic
      ),

    tourism:
      normalizeText(
        tags.tourism
      ),

    leisure:
      normalizeText(
        tags.leisure
      ),

    natural:
      normalizeText(
        tags.natural
      ),

    osmType:
      element.type,

    osmId:
      element.id

  };

}


// ==========================================================
// DEDUPLICAÇÃO
// ==========================================================

function normalizeForComparison(value) {

  return normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /[^a-z0-9]/g,
      ""
    );

}


function deduplicate(items) {

  const seen =
    new Map();


  for (const item of items) {

    const normalizedName =
      normalizeForComparison(
        item.name
      );


    /*
     * Nome + coordenada arredondada.
     * Ajuda a eliminar casos em que o mesmo
     * local aparece como node e way.
     */
    const latKey =
      item.lat.toFixed(4);

    const lngKey =
      item.lng.toFixed(4);


    const key =
      `${normalizedName}:${latKey}:${lngKey}`;


    if (!seen.has(key)) {

      seen.set(
        key,
        item
      );

      continue;

    }


    /*
     * Se encontramos duplicata,
     * preservamos a versão com mais dados.
     */

    const existing =
      seen.get(key);


    const existingScore =
      qualityScore(existing);

    const newScore =
      qualityScore(item);


    if (newScore > existingScore) {

      seen.set(
        key,
        item
      );

    }

  }


  return Array.from(
    seen.values()
  );

}


function qualityScore(item) {

  let score = 0;


  if (item.address) score += 1;
  if (item.website) score += 2;
  if (item.phone) score += 1;
  if (item.email) score += 1;
  if (item.openingHours) score += 2;
  if (item.description) score += 2;
  if (item.wikidata) score += 2;
  if (item.wikipedia) score += 2;
  if (item.wheelchair) score += 1;
  if (item.heritage) score += 1;


  return score;

}


// ==========================================================
// OVERPASS COM FALLBACK
// ==========================================================

async function fetchFromOverpass() {

  let lastError = null;


  for (
    let i = 0;
    i < OVERPASS_ENDPOINTS.length;
    i++
  ) {

    const endpoint =
      OVERPASS_ENDPOINTS[i];


    console.log("");
    console.log(
      `Tentativa ${i + 1}/${OVERPASS_ENDPOINTS.length}`
    );

    console.log(
      `Overpass: ${endpoint}`
    );


    try {

      const response =
        await fetch(
          endpoint,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/x-www-form-urlencoded;charset=UTF-8",

              "User-Agent":
                "OraVicino/1.0"
            },

            body:
              "data=" +
              encodeURIComponent(
                QUERY
              )
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
        !data ||
        !Array.isArray(
          data.elements
        )
      ) {

        throw new Error(
          "Risposta Overpass non valida."
        );

      }


      return data;

    }
    catch (error) {

      lastError = error;


      console.warn(
        `Falha: ${error.message}`
      );


      if (
        i <
        OVERPASS_ENDPOINTS.length - 1
      ) {

        console.log(
          "Tentando outro servidor..."
        );

        await sleep(3000);

      }

    }

  }


  throw lastError ||
    new Error(
      "Nenhum servidor Overpass respondeu."
    );

}


// ==========================================================
// ESTATÍSTICAS
// ==========================================================

function countBy(
  items,
  field
) {

  const result = {};


  for (const item of items) {

    const key =
      item[field] ||
      "senza-categoria";


    result[key] =
      (result[key] || 0) + 1;

  }


  return Object.fromEntries(

    Object.entries(result)
      .sort(
        (a, b) =>
          b[1] - a[1]
      )

  );

}


// ==========================================================
// EXECUÇÃO
// ==========================================================

async function main() {

  console.log("");
  console.log(
    "======================================"
  );

  console.log(
    " OraVicino — aggiornamento Scoprire"
  );

  console.log(
    "======================================"
  );

  console.log("");

  console.log(
    `Città: ${CITY}`
  );

  console.log(
    `BBOX: ${BBOX}`
  );


  const data =
    await fetchFromOverpass();


  const rawElements =
    data.elements;


  console.log("");
  console.log(
    `Elementi OSM ricevuti: ${rawElements.length}`
  );


  const converted =
    rawElements
      .map(convertElement)
      .filter(Boolean);


  console.log(
    `Dopo pulizia iniziale: ${converted.length}`
  );


  const deduplicated =
    deduplicate(converted);


  deduplicated.sort(
    (a, b) => {

      const categoryCompare =
        a.category.localeCompare(
          b.category,
          "it"
        );


      if (categoryCompare !== 0) {

        return categoryCompare;

      }


      return a.name.localeCompare(
        b.name,
        "it"
      );

    }
  );


  const categories =
    countBy(
      deduplicated,
      "category"
    );


  const withAddress =
    deduplicated.filter(
      item => item.address
    ).length;


  const withWebsite =
    deduplicated.filter(
      item => item.website
    ).length;


  const withPhone =
    deduplicated.filter(
      item => item.phone
    ).length;


  const withOpeningHours =
    deduplicated.filter(
      item => item.openingHours
    ).length;


  const withWikipedia =
    deduplicated.filter(
      item =>
        item.wikipedia ||
        item.wikidata
    ).length;


  const indoor =
    deduplicated.filter(
      item => item.indoor
    ).length;


  const family =
    deduplicated.filter(
      item => item.family
    ).length;


  const payload = {

    metadata: {

      project:
        "OraVicino",

      section:
        "Scoprire",

      city:
        CITY,

      country:
        COUNTRY,

      source:
        "OpenStreetMap",

      sourceLicense:
        "ODbL",

      generatedAt:
        new Date().toISOString(),

      bbox:
        BBOX,

      rawTotal:
        rawElements.length,

      afterCleaning:
        converted.length,

      total:
        deduplicated.length,

      categories

    },

    places:
      deduplicated

  };


  /*
   * Proteção contra erro de consulta.
   *
   * Não queremos sobrescrever um banco bom
   * com arquivo vazio por falha externa.
   */
  if (
    deduplicated.length === 0
  ) {

    throw new Error(
      "Nenhum ponto encontrado. Arquivo não será sobrescrito."
    );

  }


  fs.mkdirSync(
    path.dirname(
      OUTPUT_FILE
    ),
    {
      recursive: true
    }
  );


  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(
      payload,
      null,
      2
    ) + "\n",
    "utf8"
  );


  console.log("");
  console.log(
    "--------------------------------------"
  );

  console.log(
    `Totale Scoprire: ${deduplicated.length}`
  );

  console.log(
    `Elementi esclusi: ${rawElements.length - converted.length}`
  );


  console.log("");
  console.log(
    "Categorie:"
  );


  for (
    const [category, count]
    of Object.entries(categories)
  ) {

    console.log(
      `  ${category}: ${count}`
    );

  }


  console.log("");
  console.log(
    "Qualità dati:"
  );

  console.log(
    `  con indirizzo: ${withAddress}`
  );

  console.log(
    `  con orari: ${withOpeningHours}`
  );

  console.log(
    `  con telefono: ${withPhone}`
  );

  console.log(
    `  con sito web: ${withWebsite}`
  );

  console.log(
    `  Wikipedia/Wikidata: ${withWikipedia}`
  );

  console.log(
    `  al coperto: ${indoor}`
  );

  console.log(
    `  famiglia: ${family}`
  );


  console.log("");
  console.log(
    `File generato: ${OUTPUT_FILE}`
  );

  console.log(
    "--------------------------------------"
  );

}


main()
  .catch(
    error => {

      console.error("");
      console.error(
        "ERRORE:"
      );

      console.error(
        error
      );

      process.exit(1);

    }
  );
