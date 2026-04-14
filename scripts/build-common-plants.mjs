import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeText } from "../strandspace/parser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = join(__dirname, "..", "data");
const plantsPath = join(dataDir, "plants.json");
const plantMediaPath = join(dataDir, "plant-media.json");
const plantSourcesPath = join(dataDir, "plant-sources.json");

const CATEGORIES = [
  "House plants",
  "Herbs",
  "Vegetables",
  "Trees",
  "Shrubs",
  "Flowering plants",
  "Perennials",
  "Succulents",
  "Ferns",
  "Bulbs",
  "Annual plants",
  "Aquatic plants",
  "Ornamental grasses",
  "Fruit trees"
];

const CURATED_PLANTS = [
  {
    title: "Basil",
    category: "Herbs",
    overrides: {
      displayName: "Basil",
      type: "herb",
      anchors: {
        plant_type: "herb",
        primary_color: "green",
        secondary_color: "white flowers",
        soil_type: "rich, moist, well-drained soil",
        pH: "6.0 to 7.5",
        moisture: "moderate",
        sunlight: "full sun",
        height: "1 to 2 ft",
        growth_habit: "bushy annual",
        bloom_type: "tiny white flowers",
        fragrance: "sweet fragrance",
        season: "warm season",
        wildlife: "pollinators",
        companions: "tomato, pepper, parsley",
        maintenance: "pinch flowers for leaf production",
        edible: "yes, leaves are edible"
      },
      composites: ["warm_kitchen_herb_profile", "culinary_herb_profile"],
      regionHint: "temperate"
    }
  },
  {
    title: "Agave",
    category: "Succulents",
    overrides: {
      displayName: "Agave",
      type: "succulent",
      anchors: {
        plant_type: "succulent",
        primary_color: "blue-green",
        secondary_color: "spiny leaves",
        soil_type: "very well-drained, gritty soil",
        pH: "6.0 to 7.5",
        moisture: "low",
        sunlight: "full sun",
        height: "2 to 6 ft",
        growth_habit: "rosette forming succulent",
        bloom_type: "tall flowering stalk",
        fragrance: "light fragrance",
        season: "seasonal bloom after maturity",
        wildlife: "pollinators",
        companions: "cactus, yucca, sedum",
        maintenance: "avoid overwatering and frost damage",
        edible: "sap or fibers used in some species"
      },
      composites: ["succulent_storage_profile", "dry_soil_profile", "sun_loving_tall_profile"],
      regionHint: "arid"
    }
  },
  {
    title: "Hemp",
    category: "Herbs",
    overrides: {
      displayName: "Hemp",
      type: "herb",
      anchors: {
        plant_type: "herb",
        primary_color: "green",
        secondary_color: "palmate leaves",
        soil_type: "well-drained fertile soil",
        pH: "6.0 to 7.5",
        moisture: "moderate",
        sunlight: "full sun",
        height: "4 to 12 ft",
        growth_habit: "fast-growing annual",
        bloom_type: "inconspicuous flowers",
        fragrance: "light earthy fragrance",
        season: "warm season",
        wildlife: "pollinators and wildlife habitat",
        companions: "corn, beans, clover",
        maintenance: "space for airflow and harvest at maturity",
        edible: "seeds and fiber depending on species"
      },
      composites: ["fiber_crop_profile", "warm_kitchen_herb_profile", "sun_loving_tall_profile"],
      regionHint: "temperate"
    }
  },
  {
    title: "Rosemary",
    category: "Herbs",
    overrides: {
      displayName: "Rosemary",
      type: "herb",
      anchors: {
        plant_type: "herb",
        primary_color: "green",
        secondary_color: "blue flowers",
        soil_type: "sandy, sharply drained soil",
        pH: "6.0 to 7.5",
        moisture: "low",
        sunlight: "full sun",
        height: "2 to 4 ft",
        growth_habit: "evergreen shrub",
        bloom_type: "small blue flower clusters",
        fragrance: "strong resinous fragrance",
        season: "year-round in mild climates",
        wildlife: "pollinators",
        companions: "lavender, sage, thyme",
        maintenance: "trim lightly after bloom",
        edible: "yes, leaves are edible"
      },
      composites: ["aromatic_evergreen_profile", "culinary_herb_profile", "dry_soil_profile"],
      regionHint: "mediterranean"
    }
  },
  {
    title: "Lavender",
    category: "Shrubs",
    overrides: {
      displayName: "Lavender",
      type: "shrub",
      anchors: {
        plant_type: "herb",
        primary_color: "purple",
        secondary_color: "silver foliage",
        soil_type: "fast-draining sandy or gravelly soil",
        pH: "6.5 to 7.5",
        moisture: "low",
        sunlight: "full sun",
        height: "1 to 3 ft",
        growth_habit: "woody perennial",
        bloom_type: "spike",
        fragrance: "strong fragrance",
        season: "summer",
        wildlife: "pollinators",
        companions: "roses, echinacea, rosemary",
        maintenance: "shear after bloom",
        edible: "sometimes used as culinary herb"
      },
      composites: ["dry_soil_profile", "aromatic_evergreen_profile", "pollinator_path"],
      regionHint: "mediterranean"
    }
  },
  {
    title: "Peace rose",
    category: "Shrubs",
    overrides: {
      displayName: "Peace rose",
      type: "shrub",
      anchors: {
        plant_type: "rose",
        primary_color: "pink",
        secondary_color: "yellow",
        soil_type: "rich, well-drained loam",
        pH: "6.0 to 6.5",
        moisture: "moderate",
        sunlight: "full sun",
        height: "3 to 6 ft",
        growth_habit: "upright shrub",
        bloom_type: "repeat bloomer",
        fragrance: "light fragrance",
        season: "spring to fall",
        wildlife: "pollinators",
        companions: "lavender, salvia, catmint",
        maintenance: "deadhead spent blooms",
        edible: "not typically edible"
      },
      composites: ["rose_soil_profile", "pink_yellow_flower_profile", "rose_signature_profile", "pollinator_path"],
      regionHint: "temperate"
    }
  },
  {
    title: "Red rose",
    category: "Shrubs",
    overrides: {
      displayName: "Red rose",
      type: "shrub",
      anchors: {
        plant_type: "rose",
        primary_color: "red",
        secondary_color: "green foliage",
        soil_type: "rich, well-drained loam",
        pH: "6.0 to 6.5",
        moisture: "moderate",
        sunlight: "full sun",
        height: "3 to 5 ft",
        growth_habit: "upright shrub",
        bloom_type: "repeat bloomer",
        fragrance: "medium to strong fragrance",
        season: "spring to fall",
        wildlife: "pollinators",
        companions: "allium, catmint, lavender",
        maintenance: "prune in late winter",
        edible: "not typically edible"
      },
      composites: ["rose_soil_profile", "rose_signature_profile", "pollinator_path"],
      regionHint: "temperate"
    }
  },
  {
    title: "Sunflower",
    category: "Flowering plants",
    overrides: {
      displayName: "Sunflower",
      type: "flower",
      anchors: {
        plant_type: "flower",
        primary_color: "yellow",
        secondary_color: "brown center",
        soil_type: "fertile, well-drained soil",
        pH: "6.0 to 7.5",
        moisture: "moderate",
        sunlight: "full sun",
        height: "5 to 12 ft",
        growth_habit: "tall annual",
        bloom_type: "large composite bloom",
        fragrance: "mild fragrance",
        season: "summer to fall",
        wildlife: "birds and bees",
        companions: "corn, beans, squash",
        maintenance: "stake in windy sites",
        edible: "seeds are edible"
      },
      composites: ["sun_loving_tall_profile", "pollinator_path"],
      regionHint: "temperate"
    }
  },
  {
    title: "Hosta",
    category: "Perennials",
    overrides: {
      displayName: "Hosta",
      type: "perennial",
      anchors: {
        plant_type: "foliage plant",
        primary_color: "green",
        secondary_color: "variegated leaves",
        soil_type: "rich, evenly moist soil",
        pH: "6.0 to 7.5",
        moisture: "moderate to high",
        sunlight: "partial shade to shade",
        height: "1 to 3 ft",
        growth_habit: "clump forming perennial",
        bloom_type: "lavender flower stalks",
        fragrance: "very light fragrance",
        season: "summer",
        wildlife: "pollinators",
        companions: "ferns, astilbe, heuchera",
        maintenance: "divide clumps every few years",
        edible: "not typically edible"
      },
      composites: ["shade_plant_profile", "foliage_texture_profile", "native_meadow_profile"],
      regionHint: "woodland"
    }
  },
  {
    title: "Echinacea",
    category: "Perennials",
    overrides: {
      displayName: "Echinacea",
      type: "perennial",
      anchors: {
        plant_type: "perennial flower",
        primary_color: "purple",
        secondary_color: "orange cone",
        soil_type: "average, well-drained soil",
        pH: "6.0 to 7.0",
        moisture: "moderate",
        sunlight: "full sun",
        height: "2 to 4 ft",
        growth_habit: "clump forming perennial",
        bloom_type: "daisy-like bloom",
        fragrance: "light fragrance",
        season: "summer",
        wildlife: "bees and butterflies",
        companions: "lavender, salvia, black-eyed susan",
        maintenance: "leave seed heads for birds",
        edible: "not typically edible"
      },
      composites: ["pollinator_perennial_profile", "native_meadow_profile"],
      regionHint: "prairie"
    }
  },
  {
    title: "Daylily",
    category: "Perennials",
    overrides: {
      displayName: "Daylily",
      type: "perennial",
      anchors: {
        plant_type: "perennial flower",
        primary_color: "varied",
        secondary_color: "green foliage",
        soil_type: "rich, well-drained soil",
        pH: "6.0 to 7.0",
        moisture: "moderate",
        sunlight: "full sun to partial shade",
        height: "1 to 4 ft",
        growth_habit: "clump forming perennial",
        bloom_type: "trumpet-shaped bloom",
        fragrance: "light fragrance",
        season: "summer",
        wildlife: "pollinators",
        companions: "hosta, iris, coneflower",
        maintenance: "divide clumps every few years",
        edible: "young shoots and flowers are edible in some cuisines"
      },
      composites: ["pollinator_perennial_profile", "foliage_texture_profile"],
      regionHint: "temperate"
    }
  }
];

const PLANT_KEYWORDS = [
  "plant",
  "flower",
  "tree",
  "shrub",
  "herb",
  "vegetable",
  "fruit",
  "succulent",
  "fern",
  "grass",
  "vine",
  "bulb",
  "orchid",
  "houseplant",
  "cactus",
  "annual",
  "perennial",
  "aquatic"
];

const BLACKLIST_TITLES = new Set([
  "Houseplant",
  "Herb",
  "Tree",
  "Shrub",
  "Vegetable",
  "Flowering plant",
  "Perennial plant",
  "Annual plant",
  "Succulent plant",
  "Bulb",
  "Fern",
  "Aquatic plant",
  "Ornamental grass",
  "Garden plant",
  "Plant",
  "Fruit tree"
]);

const EXCLUDED_COMMON_NAMES = new Set([
  "genovese basil",
  "gentiana lutea",
  "gentiana pannonica",
  "dracaena angolensis"
]);

const TYPE_PROFILES = {
  herb: {
    plant_type: "herb",
    soil_type: "free-draining soil with modest fertility",
    pH: "6.0 to 7.5",
    moisture: "even moisture without waterlogging",
    sunlight: "bright sun or strong light",
    height: "1 to 3 ft",
    growth_habit: "herbaceous annual or perennial",
    bloom_type: "small flower clusters",
    fragrance: "often aromatic",
    season: "warm season",
    wildlife: "pollinators",
    companions: "tomato, basil, parsley",
    maintenance: "pinch and harvest often to keep it compact",
    edible: "often edible",
    composites: ["culinary_herb_profile", "warm_kitchen_herb_profile", "pollinator_path"]
  },
  vegetable: {
    plant_type: "vegetable",
    soil_type: "rich, well-drained garden soil",
    pH: "6.0 to 7.0",
    moisture: "moderate and steady moisture",
    sunlight: "full sun",
    height: "varies by crop",
    growth_habit: "edible crop",
    bloom_type: "crop flowers",
    fragrance: "mild or not notable",
    season: "warm season or cool season",
    wildlife: "garden pollinators",
    companions: "beans, basil, marigold",
    maintenance: "harvest regularly and keep weeds down",
    edible: "edible crop",
    composites: ["vegetable_crop_profile", "sun_loving_tall_profile", "native_meadow_profile"]
  },
  tree: {
    plant_type: "tree",
    soil_type: "deep, well-drained soil",
    pH: "5.5 to 7.5",
    moisture: "moderate",
    sunlight: "full sun to partial shade",
    height: "varies by species",
    growth_habit: "woody perennial",
    bloom_type: "flowers or catkins",
    fragrance: "usually subtle",
    season: "spring to summer",
    wildlife: "birds, bees, and insects",
    companions: "understory shrubs, bulbs, perennials",
    maintenance: "prune structurally while young",
    edible: "varies by species",
    composites: ["tree_canopy_profile", "foliage_texture_profile", "pollinator_path"]
  },
  shrub: {
    plant_type: "shrub",
    soil_type: "well-drained loam",
    pH: "5.5 to 7.0",
    moisture: "moderate",
    sunlight: "full sun to partial shade",
    height: "varies by species",
    growth_habit: "woody perennial shrub",
    bloom_type: "flower clusters or spikes",
    fragrance: "varies by species",
    season: "spring to summer",
    wildlife: "pollinators and birds",
    companions: "perennials, groundcovers, bulbs",
    maintenance: "prune after bloom if needed",
    edible: "varies by species",
    composites: ["shrub_frame_profile", "pollinator_perennial_profile", "foliage_texture_profile"]
  },
  flower: {
    plant_type: "flower",
    soil_type: "well-drained loam",
    pH: "6.0 to 7.0",
    moisture: "moderate",
    sunlight: "full sun to partial shade",
    height: "varies by species",
    growth_habit: "blooming ornamental",
    bloom_type: "showy bloom",
    fragrance: "varies by species",
    season: "spring to fall",
    wildlife: "pollinators",
    companions: "salvia, basil, marigold",
    maintenance: "deadhead spent blooms when needed",
    edible: "usually not edible",
    composites: ["pollinator_path", "native_meadow_profile", "pollinator_perennial_profile"]
  },
  perennial: {
    plant_type: "perennial flower",
    soil_type: "well-drained loam",
    pH: "6.0 to 7.0",
    moisture: "moderate",
    sunlight: "full sun to partial shade",
    height: "varies by species",
    growth_habit: "perennial",
    bloom_type: "seasonal bloom",
    fragrance: "varies by species",
    season: "spring to fall",
    wildlife: "pollinators",
    companions: "grasses, bulbs, shrubs",
    maintenance: "divide or cut back as needed",
    edible: "usually not edible",
    composites: ["pollinator_perennial_profile", "native_meadow_profile", "foliage_texture_profile"]
  },
  succulent: {
    plant_type: "succulent",
    soil_type: "gritty, sharply drained soil",
    pH: "6.0 to 7.5",
    moisture: "low",
    sunlight: "bright light or full sun",
    height: "varies by species",
    growth_habit: "water-storing plant",
    bloom_type: "small seasonal bloom",
    fragrance: "usually light or none",
    season: "warm season",
    wildlife: "pollinators",
    companions: "cactus, gravel garden plants",
    maintenance: "water sparingly and avoid wet feet",
    edible: "usually not edible",
    composites: ["succulent_storage_profile", "dry_soil_profile", "sun_loving_tall_profile"]
  },
  fern: {
    plant_type: "fern",
    soil_type: "rich, evenly moist soil",
    pH: "5.5 to 7.0",
    moisture: "moderate to high",
    sunlight: "partial shade to shade",
    height: "varies by species",
    growth_habit: "fronded perennial",
    bloom_type: "non-flowering fronds",
    fragrance: "none or light",
    season: "spring to fall",
    wildlife: "shade garden visitors",
    companions: "hosta, astilbe, heuchera",
    maintenance: "keep evenly moist and trim old fronds",
    edible: "usually not edible",
    composites: ["shade_plant_profile", "foliage_texture_profile", "woodland_edge_profile"]
  },
  bulb: {
    plant_type: "bulb",
    soil_type: "well-drained soil",
    pH: "6.0 to 7.0",
    moisture: "moderate",
    sunlight: "full sun to partial shade",
    height: "varies by species",
    growth_habit: "bulb-forming perennial",
    bloom_type: "spring bloom",
    fragrance: "varies by species",
    season: "spring",
    wildlife: "pollinators",
    companions: "perennials, annuals, groundcovers",
    maintenance: "allow foliage to die back naturally",
    edible: "varies by species",
    composites: ["pollinator_perennial_profile", "native_meadow_profile", "foliage_texture_profile"]
  },
  aquatic: {
    plant_type: "aquatic plant",
    soil_type: "muddy or saturated conditions",
    pH: "6.0 to 7.5",
    moisture: "high",
    sunlight: "full sun to partial shade",
    height: "varies by species",
    growth_habit: "water garden plant",
    bloom_type: "water bloom or foliage",
    fragrance: "usually light",
    season: "summer",
    wildlife: "aquatic visitors and pollinators",
    companions: "rushes, sedges, water lilies",
    maintenance: "keep roots wet or submerged as needed",
    edible: "varies by species",
    composites: ["aquatic_edge_profile", "foliage_texture_profile", "native_meadow_profile"]
  },
  grass: {
    plant_type: "ornamental grass",
    soil_type: "well-drained soil",
    pH: "5.5 to 7.5",
    moisture: "moderate",
    sunlight: "full sun to partial shade",
    height: "varies by species",
    growth_habit: "clumping or spreading grass",
    bloom_type: "seed heads or plumes",
    fragrance: "usually light",
    season: "late spring to fall",
    wildlife: "birds and habitat insects",
    companions: "perennials, shrubs, bulbs",
    maintenance: "cut back in late winter if needed",
    edible: "usually not edible",
    composites: ["grass_sward_profile", "native_meadow_profile", "foliage_texture_profile"]
  },
  vine: {
    plant_type: "vine",
    soil_type: "rich, well-drained soil",
    pH: "6.0 to 7.0",
    moisture: "moderate",
    sunlight: "full sun to partial shade",
    height: "varies by species",
    growth_habit: "climbing or trailing",
    bloom_type: "flower clusters",
    fragrance: "varies by species",
    season: "spring to summer",
    wildlife: "pollinators",
    companions: "trellises, shrubs, trees",
    maintenance: "train and prune as needed",
    edible: "varies by species",
    composites: ["trellis_vine_profile", "pollinator_path", "foliage_texture_profile"]
  },
  houseplant: {
    plant_type: "houseplant",
    soil_type: "free-draining potting mix",
    pH: "6.0 to 7.0",
    moisture: "moderate",
    sunlight: "bright indirect light",
    height: "varies by species",
    growth_habit: "indoor ornamental",
    bloom_type: "foliage or indoor bloom",
    fragrance: "usually light",
    season: "year-round indoors",
    wildlife: "indoor gardeners",
    companions: "other indoor foliage plants",
    maintenance: "rotate, dust, and water carefully",
    edible: "usually not edible",
    composites: ["houseplant_buffer_profile", "foliage_texture_profile", "shade_plant_profile"]
  },
  annual: {
    plant_type: "annual flower",
    soil_type: "rich, well-drained soil",
    pH: "6.0 to 7.0",
    moisture: "moderate",
    sunlight: "full sun",
    height: "varies by species",
    growth_habit: "seasonal annual",
    bloom_type: "showy seasonal bloom",
    fragrance: "varies by species",
    season: "spring to fall",
    wildlife: "pollinators",
    companions: "basil, marigold, zinnia",
    maintenance: "deadhead and replant each season",
    edible: "usually not edible",
    composites: ["native_meadow_profile", "pollinator_path", "sun_loving_tall_profile"]
  }
};

function slugify(value = "") {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleCase(value = "") {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeCategory(category) {
  return String(category).trim();
}

function inferType(summary, category) {
  const text = normalizeText([summary.title, summary.description, summary.extract, category].join(" "));
  if (text.includes("succulent")) return "succulent";
  if (text.includes("fern")) return "fern";
  if (text.includes("aquatic")) return "aquatic";
  if (text.includes("houseplant") || text.includes("indoor plant")) return "houseplant";
  if (text.includes("vine") || text.includes("climbing")) return "vine";
  if (text.includes("bulb")) return "bulb";
  if (text.includes("grass")) return "grass";
  if (text.includes("herb")) return "herb";
  if (text.includes("vegetable")) return "vegetable";
  if (text.includes("tree")) return "tree";
  if (text.includes("shrub")) return "shrub";
  if (text.includes("perennial")) return "perennial";
  if (text.includes("annual")) return "annual";
  if (text.includes("flower")) return "flower";

  const categoryKey = normalizeCategory(category).toLowerCase();
  if (categoryKey.includes("herb")) return "herb";
  if (categoryKey.includes("vegetable")) return "vegetable";
  if (categoryKey.includes("tree")) return "tree";
  if (categoryKey.includes("shrub")) return "shrub";
  if (categoryKey.includes("succulent")) return "succulent";
  if (categoryKey.includes("fern")) return "fern";
  if (categoryKey.includes("bulb")) return "bulb";
  if (categoryKey.includes("aquatic")) return "aquatic";
  if (categoryKey.includes("grass")) return "grass";
  if (categoryKey.includes("annual")) return "annual";
  if (categoryKey.includes("perennial")) return "perennial";
  if (categoryKey.includes("house")) return "houseplant";
  return "flower";
}

function inferColor(title, description = "") {
  const text = normalizeText(`${title} ${description}`);
  for (const color of ["red", "pink", "white", "yellow", "blue", "purple", "orange", "green", "gold", "silver", "amber", "violet", "crimson", "scarlet", "coral", "magenta"]) {
    if (text.includes(color)) {
      return color;
    }
  }
  return "green";
}

function getProfile(type) {
  return TYPE_PROFILES[type] ?? TYPE_PROFILES.flower;
}

function buildQuestionIdeas(title, type) {
  const label = titleCase(title);
  const profile = getProfile(type);
  return [
    `What kind of plant is ${label}?`,
    `Does ${label} prefer ${profile.sunlight}?`,
    `What strands describe ${label}?`
  ];
}

function buildSources(summary, type, category) {
  const pageUrl = summary.content_urls?.desktop?.page ?? null;
  if (!pageUrl) {
    return [];
  }

  return [
    {
      title: summary.title,
      url: pageUrl,
      description: summary.description ?? type,
      excerpt: summary.extract ?? "",
      source: "wikipedia",
      category: normalizeCategory(category)
    }
  ];
}

function buildPlantRecord(summary, category, overrides = {}) {
  const type = overrides.type ?? inferType(summary, category);
  const profile = getProfile(type);
  const displayName = overrides.displayName ?? summary.title;
  const primaryColor = overrides.anchors?.primary_color ?? inferColor(displayName, summary.description ?? summary.extract ?? "");
  const constructStrand = slugify(displayName);
  const aliases = [...new Set([displayName, summary.title].filter(Boolean))];
  const mergedAnchors = {
    plant_type: profile.plant_type,
    primary_color: primaryColor,
    secondary_color: type === "flower" ? "varied" : "green foliage",
    soil_type: profile.soil_type,
    pH: profile.pH,
    moisture: profile.moisture,
    sunlight: profile.sunlight,
    height: profile.height,
    growth_habit: profile.growth_habit,
    bloom_type: profile.bloom_type,
    fragrance: profile.fragrance,
    season: profile.season,
    wildlife: profile.wildlife,
    companions: profile.companions,
    maintenance: profile.maintenance,
    edible: profile.edible,
    ...(overrides.anchors ?? {})
  };

  return {
    id: constructStrand,
    name: displayName,
    aliases,
    constructStrand,
    regionHint:
      overrides.regionHint ??
      (type === "succulent" ? "arid" : type === "aquatic" ? "coastal" : type === "houseplant" ? "containers" : "temperate"),
    anchors: mergedAnchors,
    composites: overrides.composites ?? profile.composites,
    questionIdeas: buildQuestionIdeas(displayName, type),
    sources: buildSources(summary, type, category),
    careNotes: {
      wikipedia: summary.description ?? null
    }
  };
}

function isExcludedPlantTitle(value = "") {
  return EXCLUDED_COMMON_NAMES.has(normalizeText(value));
}

function buildMediaEntry(summary, plant, overrides = {}) {
  const imageUrl = summary.thumbnail?.source ?? null;
  const pageUrl = summary.content_urls?.desktop?.page ?? null;
  return {
    id: plant.id,
    strand: plant.constructStrand,
    title: overrides.displayName ?? plant.name ?? summary.title,
    imageUrl,
    fullImageUrl: pageUrl,
    pageUrl,
    source: "wikipedia",
    imageStatus: imageUrl ? "resolved" : "missing"
  };
}

function isLikelyPlant(summary, category) {
  if (!summary || summary.type !== "standard") {
    return false;
  }

  const title = String(summary.title ?? "");
  const normalizedTitle = normalizeText(title);
  if (!normalizedTitle || normalizedTitle.startsWith("list of") || BLACKLIST_TITLES.has(title)) {
    return false;
  }

  const text = normalizeText([summary.title, summary.description, summary.extract, category].join(" "));
  if (!PLANT_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return false;
  }

  const description = normalizeText(summary.description ?? "");
  if (description.startsWith("genus of") || description.startsWith("family of")) {
    return false;
  }

  return Boolean(summary.thumbnail?.source && summary.content_urls?.desktop?.page);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "StrandspaceGarden/1.0 (plant catalog rebuild)"
    }
  });
  if (!response.ok) {
    throw new Error(`${url} -> ${response.status}`);
  }
  return response.json();
}

async function fetchCategoryTitles(category) {
  const titles = [];
  let cmcontinue = null;

  while (titles.length < 120) {
    const url = new URL("https://en.wikipedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("list", "categorymembers");
    url.searchParams.set("cmtitle", `Category:${category}`);
    url.searchParams.set("cmnamespace", "0");
    url.searchParams.set("cmlimit", "50");
    url.searchParams.set("format", "json");
    url.searchParams.set("origin", "*");
    if (cmcontinue) {
      url.searchParams.set("cmcontinue", cmcontinue);
    }

    const data = await fetchJson(url);
    const members = data?.query?.categorymembers ?? [];
    titles.push(...members.map((entry) => entry.title));
    cmcontinue = data?.continue?.cmcontinue ?? null;
    if (!cmcontinue || members.length === 0) {
      break;
    }
  }

  return [...new Set(titles)];
}

async function fetchSummary(title) {
  const url = new URL(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
  const response = await fetch(url, {
    headers: {
      "User-Agent": "StrandspaceGarden/1.0 (plant catalog rebuild)"
    }
  });
  if (!response.ok) {
    return null;
  }
  return response.json();
}

async function main() {
  await mkdir(dataDir, { recursive: true });

  const accepted = [];
  const media = [];
  const sources = [];
  const seen = new Set();

  for (const item of CURATED_PLANTS) {
    if (isExcludedPlantTitle(item.title) || isExcludedPlantTitle(item.overrides?.displayName)) {
      continue;
    }

    const summary = await fetchSummary(item.title);
    if (!summary || !summary.thumbnail?.source || !summary.content_urls?.desktop?.page) {
      continue;
    }

    const plant = buildPlantRecord(summary, item.category, item.overrides ?? {});
    if (seen.has(normalizeText(plant.name))) {
      continue;
    }

    seen.add(normalizeText(plant.name));
    accepted.push(plant);
    media.push(buildMediaEntry(summary, plant, item.overrides ?? {}));
    sources.push(...buildSources(summary, inferType(summary, item.category), item.category).map((entry) => ({
      id: plant.id,
      constructStrand: plant.constructStrand,
      name: plant.name,
      ...entry
    })));
  }

  const titles = [];
  for (const category of CATEGORIES) {
    const items = await fetchCategoryTitles(category);
    titles.push(...items.map((title) => ({ title, category })));
  }

  for (const item of titles) {
    if (accepted.length >= 200) {
      break;
    }

    if (isExcludedPlantTitle(item.title)) {
      continue;
    }

    if (seen.has(normalizeText(item.title))) {
      continue;
    }
    seen.add(normalizeText(item.title));

    const summary = await fetchSummary(item.title);
    if (!isLikelyPlant(summary, item.category)) {
      continue;
    }

    const plant = buildPlantRecord(summary, item.category);
    accepted.push(plant);
    media.push(buildMediaEntry(summary, plant));
    sources.push(...buildSources(summary, inferType(summary, item.category), item.category).map((entry) => ({
      id: plant.id,
      constructStrand: plant.constructStrand,
      name: plant.name,
      ...entry
    })));
  }

  if (accepted.length < 200) {
    throw new Error(`Only collected ${accepted.length} verified plants`);
  }

  await writeFile(plantsPath, `${JSON.stringify(accepted, null, 2)}\n`, "utf8");
  await writeFile(plantMediaPath, `${JSON.stringify(media, null, 2)}\n`, "utf8");
  await writeFile(plantSourcesPath, `${JSON.stringify(sources, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({ plants: accepted.length, media: media.length, sources: sources.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
