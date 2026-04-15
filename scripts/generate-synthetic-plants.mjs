import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const outputPath = join(__dirname, "..", "data", "generated-plants.json");

const COLOR_PREFIXES = [
  "Azure",
  "Amber",
  "Beryl",
  "Coral",
  "Crimson",
  "Emerald",
  "Golden",
  "Indigo",
  "Ivory",
  "Jade",
  "Lilac",
  "Magenta",
  "Moss",
  "Pearl",
  "Rose",
  "Saffron",
  "Scarlet",
  "Silver",
  "Teal",
  "Violet"
];

const NOUNS = [
  "Aster",
  "Briar",
  "Clover",
  "Dahlia",
  "Fern",
  "Foxglove",
  "Gardenia",
  "Heather",
  "Iris",
  "Juniper",
  "Knotweed",
  "Lavender",
  "Maple",
  "Nettle",
  "Orchid",
  "Peony",
  "Quince",
  "Rose",
  "Sage",
  "Thyme",
  "Umbellifer",
  "Verbena",
  "Willow",
  "Yarrow",
  "Zinnia",
  "Anemone",
  "Begonia",
  "Campion",
  "Delphinium",
  "Elderberry",
  "Freesia",
  "Gaillardia",
  "Hollyhock",
  "Impatiens",
  "Jasmine",
  "Kale",
  "Larkspur",
  "Marigold",
  "Nemesia",
  "Oak",
  "Poppy",
  "Queenanne",
  "Ranunculus",
  "Stonecrop",
  "Tulip",
  "Ulex",
  "Vetch",
  "Wisteria",
  "Xeranthemum",
  "Yucca"
];

const FORMS = [
  "tree",
  "shrub",
  "subshrub",
  "vine",
  "herb",
  "grass",
  "fern",
  "bulb",
  "succulent",
  "cactus",
  "groundcover",
  "aquatic",
  "annual",
  "biennial",
  "perennial",
  "weed"
];

const REGIONS = [
  "temperate",
  "mediterranean",
  "arid",
  "coastal",
  "woodland",
  "tropical",
  "alpine",
  "prairie",
  "containers"
];

const CLUSTERS = ["nocturne", "jewel", "neon", "pastel", "ember", "grove", "tide", "dune"];

const SECONDARY_COLORS = [
  "cream",
  "silver foliage",
  "green foliage",
  "bronze foliage",
  "white tips",
  "pale lavender",
  "moss green",
  "charcoal veins",
  "gold edges",
  "blush reverse"
];

const SOIL_TYPES = [
  "rich, well-drained loam",
  "sandy, sharply drained soil",
  "gravelly, lean soil",
  "moist, humus-rich soil",
  "chalky, alkaline soil",
  "slightly acidic loam",
  "forest humus",
  "loamy garden soil",
  "fast-draining potting mix",
  "organic, moisture-retentive soil"
];

const PHS = ["5.5 to 6.5", "6.0 to 6.5", "6.0 to 7.0", "6.5 to 7.5", "7.0 to 8.0"];
const MOISTURES = ["low", "moderate", "moderate to high", "even", "seasonally moist"];
const SUNLIGHTS = ["full sun", "full sun to part shade", "part shade", "dappled shade", "bright shade"];
const GROWTH_HABITS = [
  "upright tree",
  "mounded shrub",
  "woody subshrub",
  "climbing vine",
  "bushy annual",
  "ornamental grass",
  "woodland fern",
  "spring bulb",
  "fleshy succulent",
  "columnar cactus",
  "spreading groundcover",
  "water garden perennial"
];
const BLOOM_TYPES = [
  "single bloom",
  "clustered bloom",
  "spike",
  "star bloom",
  "cup bloom",
  "double bloom",
  "floret cluster",
  "catkin",
  "umbel",
  "no showy bloom"
];
const FRAGRANCES = [
  "strong fragrance",
  "light fragrance",
  "sweet fragrance",
  "spicy fragrance",
  "resinous fragrance",
  "citrus fragrance",
  "earthy fragrance",
  "none",
  "faint fragrance"
];
const SEASONS = [
  "spring",
  "spring to summer",
  "summer",
  "summer to fall",
  "fall",
  "year-round in mild climates",
  "warm season",
  "cool season"
];
const WILDLIFE = [
  "pollinators",
  "bees",
  "butterflies",
  "songbirds",
  "beneficial insects",
  "hummingbirds",
  "wildlife",
  "seed-eating birds"
];
const COMPANIONS = [
  "lavender, salvia, catmint",
  "rosemary, thyme, sage",
  "echinacea, rudbeckia, grasses",
  "hosta, ferns, astilbe",
  "tomato, basil, parsley",
  "allium, catmint, nepeta",
  "dill, calendula, fennel",
  "sedum, thyme, yarrow"
];
const MAINTENANCES = [
  "deadhead spent blooms",
  "prune in late winter",
  "shear after bloom",
  "trim lightly after bloom",
  "divide every few years",
  "cut back after frost",
  "pinch tips to encourage branching",
  "mulch and water deeply during establishment"
];
const EDIBLES = [
  "not typically edible",
  "yes, leaves are edible",
  "yes, flowers are edible",
  "yes, young shoots are edible",
  "not edible",
  "sometimes used in tea"
];

const FORM_PROFILE = {
  tree: {
    regionHint: "woodland",
    plantType: "tree",
    sunlight: ["full sun to part shade", "full sun", "dappled shade"],
    moisture: ["moderate", "seasonally moist"],
    soil: ["rich, well-drained loam", "moist, humus-rich soil", "forest humus"],
    height: ["12 to 30 ft", "20 to 40 ft", "8 to 18 ft"],
    growthHabit: ["upright tree", "broadleaf tree"],
    bloom: ["catkin", "spring bloom"],
    fragrance: ["light fragrance", "none"],
    season: ["spring", "spring to summer"],
    wildlife: ["songbirds", "beneficial insects", "pollinators"],
    companions: ["ferns, hosta, astilbe", "shade perennials, bulbs, moss"],
    maintenance: ["prune deadwood", "mulch around the root zone"],
    edible: ["not typically edible", "sometimes used in tea"],
    composites: ["shade_plant_profile", "foliage_texture_profile", "native_meadow_profile"]
  },
  shrub: {
    regionHint: "temperate",
    plantType: "shrub",
    sunlight: ["full sun", "full sun to part shade", "part shade"],
    moisture: ["moderate", "seasonally moist"],
    soil: ["rich, well-drained loam", "slightly acidic loam", "moist, humus-rich soil"],
    height: ["3 to 8 ft", "4 to 10 ft", "2 to 6 ft"],
    growthHabit: ["mounded shrub", "upright shrub"],
    bloom: ["clustered bloom", "double bloom"],
    fragrance: ["light fragrance", "sweet fragrance", "none"],
    season: ["spring to summer", "summer", "fall"],
    wildlife: ["pollinators", "beneficial insects", "songbirds"],
    companions: ["lavender, salvia, catmint", "grasses, asters, sedum"],
    maintenance: ["prune after bloom", "deadhead spent blooms"],
    edible: ["not typically edible", "sometimes used in tea"],
    composites: ["pollinator_path", "pollinator_perennial_profile", "foliage_texture_profile"]
  },
  subshrub: {
    regionHint: "mediterranean",
    plantType: "subshrub",
    sunlight: ["full sun", "full sun to part shade"],
    moisture: ["low", "moderate"],
    soil: ["sandy, sharply drained soil", "gravelly, lean soil", "fast-draining potting mix"],
    height: ["1 to 3 ft", "2 to 4 ft"],
    growthHabit: ["woody subshrub", "mounded subshrub"],
    bloom: ["spike", "clustered bloom"],
    fragrance: ["strong fragrance", "resinous fragrance", "citrus fragrance"],
    season: ["spring to summer", "summer"],
    wildlife: ["pollinators", "beneficial insects"],
    companions: ["rosemary, thyme, sage", "lavender, catmint, oregano"],
    maintenance: ["shear lightly after bloom", "trim to shape"],
    edible: ["sometimes used in tea", "yes, leaves are edible"],
    composites: ["dry_soil_profile", "aromatic_evergreen_profile", "culinary_herb_profile"]
  },
  vine: {
    regionHint: "tropical",
    plantType: "vine",
    sunlight: ["full sun to part shade", "part shade", "bright shade"],
    moisture: ["moderate", "moderate to high"],
    soil: ["moist, humus-rich soil", "organic, moisture-retentive soil"],
    height: ["6 to 15 ft", "10 to 20 ft", "4 to 12 ft"],
    growthHabit: ["climbing vine", "twining vine"],
    bloom: ["single bloom", "clustered bloom", "star bloom"],
    fragrance: ["light fragrance", "sweet fragrance", "none"],
    season: ["summer", "summer to fall"],
    wildlife: ["pollinators", "hummingbirds"],
    companions: ["trellised annuals, groundcovers, ferns"],
    maintenance: ["train on support", "prune for shape"],
    edible: ["not typically edible", "yes, young shoots are edible"],
    composites: ["pollinator_path", "shade_plant_profile", "native_meadow_profile"]
  },
  herb: {
    regionHint: "mediterranean",
    plantType: "herb",
    sunlight: ["full sun", "full sun to part shade"],
    moisture: ["low", "moderate"],
    soil: ["rich, well-drained loam", "sandy, sharply drained soil", "fast-draining potting mix"],
    height: ["6 to 18 in", "1 to 3 ft", "8 to 24 in"],
    growthHabit: ["culinary herb", "bushy herb", "upright herb"],
    bloom: ["tiny flower clusters", "spike", "umbrels"],
    fragrance: ["strong fragrance", "sweet fragrance", "citrus fragrance"],
    season: ["warm season", "summer", "year-round in mild climates"],
    wildlife: ["pollinators", "beneficial insects"],
    companions: ["tomato, basil, parsley", "lavender, rosemary, sage"],
    maintenance: ["pinch tips to encourage branching", "harvest frequently"],
    edible: ["yes, leaves are edible", "sometimes used in tea"],
    composites: ["culinary_herb_profile", "warm_kitchen_herb_profile", "aromatic_evergreen_profile"]
  },
  grass: {
    regionHint: "prairie",
    plantType: "grass",
    sunlight: ["full sun", "full sun to part shade"],
    moisture: ["low", "moderate"],
    soil: ["loamy garden soil", "gravelly, lean soil", "rich, well-drained loam"],
    height: ["1 to 4 ft", "2 to 6 ft", "6 to 12 in"],
    growthHabit: ["ornamental grass", "clumping grass"],
    bloom: ["plume", "panicle", "no showy bloom"],
    fragrance: ["none", "light fragrance"],
    season: ["summer", "fall", "warm season"],
    wildlife: ["seed-eating birds", "beneficial insects"],
    companions: ["echinacea, rudbeckia, sedum"],
    maintenance: ["cut back in late winter", "divide every few years"],
    edible: ["not typically edible", "young shoots are edible"],
    composites: ["native_meadow_profile", "foliage_texture_profile", "pollinator_perennial_profile"]
  },
  fern: {
    regionHint: "woodland",
    plantType: "fern",
    sunlight: ["bright shade", "part shade", "dappled shade"],
    moisture: ["moderate to high", "even"],
    soil: ["forest humus", "moist, humus-rich soil"],
    height: ["8 to 24 in", "1 to 4 ft"],
    growthHabit: ["woodland fern", "clumping fern"],
    bloom: ["no showy bloom", "frond display"],
    fragrance: ["none"],
    season: ["spring to fall", "year-round in mild climates"],
    wildlife: ["beneficial insects", "wildlife"],
    companions: ["hosta, astilbe, bleeding heart"],
    maintenance: ["keep evenly moist", "remove old fronds in spring"],
    edible: ["not typically edible"],
    composites: ["shade_plant_profile", "foliage_texture_profile", "native_meadow_profile"]
  },
  bulb: {
    regionHint: "temperate",
    plantType: "bulb",
    sunlight: ["full sun", "part shade"],
    moisture: ["moderate", "seasonally moist"],
    soil: ["rich, well-drained loam", "loamy garden soil"],
    height: ["6 to 18 in", "8 to 24 in"],
    growthHabit: ["spring bulb", "bulb clump"],
    bloom: ["cup bloom", "star bloom"],
    fragrance: ["light fragrance", "sweet fragrance", "none"],
    season: ["spring", "spring to summer"],
    wildlife: ["pollinators"],
    companions: ["tulips, daffodils, muscari"],
    maintenance: ["lift and divide every few years", "allow foliage to die back"],
    edible: ["not typically edible"],
    composites: ["pollinator_path", "pollinator_perennial_profile", "native_meadow_profile"]
  },
  succulent: {
    regionHint: "arid",
    plantType: "succulent",
    sunlight: ["full sun", "full sun to part shade"],
    moisture: ["low"],
    soil: ["gravelly, lean soil", "fast-draining potting mix", "sandy, sharply drained soil"],
    height: ["3 to 12 in", "1 to 3 ft"],
    growthHabit: ["fleshy succulent", "rosette succulent"],
    bloom: ["clustered bloom", "single bloom"],
    fragrance: ["none", "light fragrance"],
    season: ["summer", "year-round in mild climates"],
    wildlife: ["pollinators"],
    companions: ["sedum, thyme, yarrow"],
    maintenance: ["water sparingly", "protect from frost"],
    edible: ["not typically edible", "sometimes used in tea"],
    composites: ["dry_soil_profile", "foliage_texture_profile"]
  },
  cactus: {
    regionHint: "arid",
    plantType: "cactus",
    sunlight: ["full sun", "bright shade"],
    moisture: ["low"],
    soil: ["gravelly, lean soil", "fast-draining potting mix", "sandy, sharply drained soil"],
    height: ["4 to 18 in", "1 to 6 ft", "6 to 24 in"],
    growthHabit: ["columnar cactus", "clumping cactus"],
    bloom: ["single bloom", "cup bloom"],
    fragrance: ["none", "light fragrance"],
    season: ["summer", "warm season"],
    wildlife: ["pollinators"],
    companions: ["agave, yucca, sedum"],
    maintenance: ["water sparingly", "protect from frost"],
    edible: ["not typically edible"],
    composites: ["dry_soil_profile", "native_meadow_profile"]
  },
  groundcover: {
    regionHint: "coastal",
    plantType: "groundcover",
    sunlight: ["full sun to part shade", "part shade", "bright shade"],
    moisture: ["moderate", "seasonally moist"],
    soil: ["loamy garden soil", "moist, humus-rich soil", "rich, well-drained loam"],
    height: ["2 to 12 in", "4 to 18 in"],
    growthHabit: ["spreading groundcover"],
    bloom: ["clustered bloom", "star bloom", "no showy bloom"],
    fragrance: ["light fragrance", "none"],
    season: ["spring to summer", "summer"],
    wildlife: ["pollinators", "beneficial insects"],
    companions: ["ferns, hosta, low shrubs"],
    maintenance: ["trim edges to contain spread", "mulch and water deeply during establishment"],
    edible: ["not typically edible"],
    composites: ["shade_plant_profile", "foliage_texture_profile", "native_meadow_profile"]
  },
  aquatic: {
    regionHint: "tropical",
    plantType: "aquatic",
    sunlight: ["full sun", "full sun to part shade"],
    moisture: ["high"],
    soil: ["pond mud", "heavy moisture-retentive soil", "organic, moisture-retentive soil"],
    height: ["floating", "6 to 24 in", "1 to 4 ft"],
    growthHabit: ["water garden perennial", "emergent aquatic"],
    bloom: ["single bloom", "star bloom", "clustered bloom"],
    fragrance: ["none", "light fragrance"],
    season: ["summer", "year-round in mild climates"],
    wildlife: ["pollinators", "wildlife"],
    companions: ["water lilies, iris, reeds"],
    maintenance: ["keep in still water or bog soil", "remove spent foliage"],
    edible: ["not typically edible"],
    composites: ["native_meadow_profile", "shade_plant_profile"]
  },
  annual: {
    regionHint: "containers",
    plantType: "annual",
    sunlight: ["full sun", "full sun to part shade"],
    moisture: ["moderate"],
    soil: ["rich, well-drained loam", "fast-draining potting mix"],
    height: ["6 to 18 in", "1 to 3 ft", "2 to 4 ft"],
    growthHabit: ["bedding annual", "bushy annual"],
    bloom: ["double bloom", "clustered bloom", "star bloom"],
    fragrance: ["light fragrance", "sweet fragrance", "none"],
    season: ["spring to fall", "summer"],
    wildlife: ["pollinators"],
    companions: ["petunia, marigold, verbena"],
    maintenance: ["deadhead spent blooms", "feed lightly through the season"],
    edible: ["not typically edible", "yes, flowers are edible"],
    composites: ["pollinator_path", "pollinator_perennial_profile", "native_meadow_profile"]
  },
  biennial: {
    regionHint: "temperate",
    plantType: "biennial",
    sunlight: ["full sun", "part shade"],
    moisture: ["moderate"],
    soil: ["loamy garden soil", "rich, well-drained loam"],
    height: ["1 to 4 ft", "2 to 6 ft"],
    growthHabit: ["biennial rosette", "upright biennial"],
    bloom: ["spike", "clustered bloom"],
    fragrance: ["light fragrance", "none"],
    season: ["spring to summer", "summer"],
    wildlife: ["pollinators"],
    companions: ["foxglove, hollyhock, parsley"],
    maintenance: ["allow to self-seed if desired", "remove spent stalks"],
    edible: ["not typically edible", "yes, young leaves are edible"],
    composites: ["pollinator_path", "native_meadow_profile"]
  },
  perennial: {
    regionHint: "prairie",
    plantType: "perennial",
    sunlight: ["full sun", "full sun to part shade", "part shade"],
    moisture: ["moderate", "seasonally moist"],
    soil: ["loamy garden soil", "rich, well-drained loam", "moist, humus-rich soil"],
    height: ["1 to 3 ft", "2 to 5 ft", "6 to 18 in"],
    growthHabit: ["long-lived perennial", "clumping perennial"],
    bloom: ["clustered bloom", "double bloom", "star bloom"],
    fragrance: ["light fragrance", "sweet fragrance", "none"],
    season: ["summer", "summer to fall", "spring to summer"],
    wildlife: ["pollinators", "butterflies"],
    companions: ["echinacea, rudbeckia, grasses"],
    maintenance: ["cut back in late winter", "divide every few years"],
    edible: ["not typically edible", "sometimes used in tea"],
    composites: ["pollinator_perennial_profile", "native_meadow_profile", "foliage_texture_profile"]
  },
  weed: {
    regionHint: "prairie",
    plantType: "weed",
    sunlight: ["full sun", "part shade", "bright shade"],
    moisture: ["moderate", "low"],
    soil: ["loamy garden soil", "compact soil", "disturbed soil"],
    height: ["4 to 18 in", "1 to 3 ft"],
    growthHabit: ["wild weed", "spreading weed"],
    bloom: ["small flower clusters", "no showy bloom"],
    fragrance: ["none", "earthy fragrance"],
    season: ["spring to fall", "summer"],
    wildlife: ["beneficial insects", "pollinators"],
    companions: ["clover, grasses, native forbs"],
    maintenance: ["pull before seed set", "remove when small"],
    edible: ["sometimes edible", "not typically edible"],
    composites: ["native_meadow_profile", "foliage_texture_profile"]
  }
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(list, index, offset = 0) {
  return list[(index + offset) % list.length];
}

function buildPlant(index) {
  const prefixIndex = Math.floor(index / NOUNS.length) % COLOR_PREFIXES.length;
  const nounIndex = index % NOUNS.length;
  const form = FORMS[index % FORMS.length];
  const profile = FORM_PROFILE[form];
  const color = COLOR_PREFIXES[prefixIndex];
  const noun = NOUNS[nounIndex];
  const name = `${color} ${noun}`;
  const strand = `gen_${String(index + 1).padStart(4, "0")}_${color.toLowerCase()}_${noun.toLowerCase()}`.replace(/[^a-z0-9_]+/g, "_");
  const rand = mulberry32(0x9e3779b9 ^ index);
  const regionHint = pick(REGIONS, index, form.length % REGIONS.length);

  const anchors = {
    plant_type: profile.plantType,
    primary_color: color.toLowerCase(),
    secondary_color: pick(SECONDARY_COLORS, index, 3),
    soil_type: pick(profile.soil, index, Math.floor(rand() * profile.soil.length)),
    pH: pick(PHS, index, Math.floor(rand() * PHS.length)),
    moisture: pick(profile.moisture, index, Math.floor(rand() * profile.moisture.length)),
    sunlight: pick(profile.sunlight, index, Math.floor(rand() * profile.sunlight.length)),
    height: pick(profile.height, index, Math.floor(rand() * profile.height.length)),
    growth_habit: pick(profile.growthHabit, index, Math.floor(rand() * profile.growthHabit.length)),
    bloom_type: pick(profile.bloom, index, Math.floor(rand() * profile.bloom.length)),
    fragrance: pick(profile.fragrance, index, Math.floor(rand() * profile.fragrance.length)),
    season: pick(profile.season, index, Math.floor(rand() * profile.season.length)),
    wildlife: pick(profile.wildlife, index, Math.floor(rand() * profile.wildlife.length)),
    companions: pick(profile.companions, index, Math.floor(rand() * profile.companions.length)),
    maintenance: pick(profile.maintenance, index, Math.floor(rand() * profile.maintenance.length)),
    edible: pick(profile.edible, index, Math.floor(rand() * profile.edible.length)),
    region_hint: regionHint,
    experiment_cluster: pick(CLUSTERS, index, Math.floor(rand() * CLUSTERS.length)),
    light_bias: profile.sunlight.some((item) => item.includes("shade")) ? "shade-biased" : "sun-biased",
    color_cluster: `${color.toLowerCase()}-${pick(["soft", "bright", "deep", "dusty"], index, Math.floor(rand() * 4))}`,
    palette_group: pick(["warm", "cool", "neutral", "jewel", "pastel"], index, Math.floor(rand() * 5))
  };

  return {
    id: `gen-${String(index + 1).padStart(4, "0")}`,
    name,
    aliases: [
      name,
      `${noun} ${color}`,
      `${color} strand ${noun}`
    ],
    constructStrand: strand,
    regionHint,
    experiment_cluster: anchors.experiment_cluster,
    composites: profile.composites,
    anchors
  };
}

const plants = Array.from({ length: 1000 }, (_, index) => buildPlant(index));
await writeFile(outputPath, `${JSON.stringify(plants, null, 2)}\n`, "utf8");

console.log(`Wrote ${plants.length} synthetic plants to ${outputPath}`);
