# Strandspace Garden Lab

Strandspace Garden Lab is a separate working copy of the gardening information app powered by Strandspace recall.
It is organized around climate regions first, then uses strand-based recall to explain plant biology, fertilizer, light, soil, moisture, companions, and maintenance.

## Core flow

1. Search plant strands
   - type a plant name or a strand term like tree, shrub, weed, shade, or fertilizer
   - the search returns ranked plant matches from the Strandspace catalog
   - selected plants show region fit, elevation range, biology, soil, moisture, fertilizer, and natural growing regions

2. Ask a gardening question
   - ask about care, biology, companion planting, fertilizer, or flowering behavior
   - Strandspace turns the question into strands and a key-holder check
   - weak matches return an explicit no-match message instead of guessing

3. Save garden memory
   - save notes and favorites for any matched plant
   - notes live in the SQLite garden memory table alongside the plant catalog

4. Use Strandspace recall
   - Strandspace uses the local strand graph, learned weights, and quick-recall taxonomy strands
   - Hybrid mode can fall back to outside sources when the local catalog is weak
   - Outside image and text lookups are cached into the local atlas when they are imported

## Goal

Build a real gardening atlas that can answer:

- What grows well in this region?
- What fertilizer should I use?
- How much sun or shade does it want?
- What kind of soil and moisture does it need?
- What plant biology traits should I watch for?
- Which plant strands connect to similar care needs?

## Features

- A SQLite-backed plant catalog seeded from the JSON plant files on startup
- A generated synthetic plant seed set with 1000 extra records for search and strand testing
- A generated plant media index with picture thumbnails or source links for every plant record
- A plant strand search panel for the full local catalog
- Strand-based recall for gardening questions
- Audience modes:
  - Child
  - Gardener
  - Scientist
- A regional plant catalog built from the local database
- Source citations and care templates on matched plant cards
- Quick-recall strands for plant forms, plant biology, and care patterns
- SQLite garden memory for notes and favorites
- Outside fallback search for weak local matches
- Legacy flower support for outside thumbnails and import testing
- No-match gates when the evidence is weak
- Strand trace display and learning feedback
- Benchmarking for repeated questions

## Supported questions

Examples:

- What plants fit a temperate garden?
- What fertilizer does lavender need?
- Does rosemary like dry soil?
- Which plants are good for a woodland region?
- How tall does a sunflower get?
- What does a rose smell like?

## Strand model

### Anchor strands

Basic reusable traits:

- `plant_type`
- `primary_color`
- `secondary_color`
- `soil_type`
- `pH`
- `moisture`
- `sunlight`
- `height`
- `growth_habit`
- `bloom_type`
- `fragrance`
- `season`
- `wildlife`
- `companions`
- `maintenance`
- `edible`

### Quick-recall taxonomy strands

Common fast-recall families:

- `tree`
- `shrub`
- `subshrub`
- `vine`
- `herb`
- `grass`
- `fern`
- `bulb`
- `succulent`
- `cactus`
- `groundcover`
- `aquatic`
- `annual`
- `biennial`
- `perennial`
- `weed`

Common biology and care strands:

- `root_system`
- `stem_structure`
- `leaf_structure`
- `flowering`
- `fruiting`
- `seed_set`
- `pollination`
- `photosynthesis`
- `dormancy`
- `hardiness`
- `propagation`
- `pruning`
- `transplanting`
- `fertility`
- `pH_balance`
- `water_balance`
- `pest_pressure`
- `disease_pressure`
- `sunlight`
- `soil`
- `moisture`
- `mulch`
- `companion`
- `spacing`
- `deadheading`
- `staking`
- `division`
- `compost`
- `irrigation`
- `fertilizer`

### Key holder strand

Every trace starts with a key holder strand:

- it carries the identity of the matched plant or outside result
- it records whether the question can relate to that identity
- it gives the model a shape check before other strands are interpreted, like a round peg versus a square hole

### Composite strands

Reusable descriptions:

- `rose_soil_profile`
- `pink_yellow_flower_profile`
- `rose_signature_profile`
- `dry_soil_profile`
- `aromatic_evergreen_profile`
- `culinary_herb_profile`
- `shade_plant_profile`
- `pollinator_path`
- `pollinator_perennial_profile`
- `native_meadow_profile`
- `foliage_texture_profile`

### Construct strands

Stable plant identities:

- Peace rose
- Red rose
- Lavender
- Rosemary
- Basil
- Sunflower
- Echinacea
- Hosta

## V2 Learning loop

The app records:

- question
- audience
- activated strands
- feedback rating
- outside-search result when the local catalog is not enough
- plant strand search selections and any imported outside flower hits

That lets the system strengthen the strand paths that are most useful for each audience.

## Legacy flower dataset

The app still keeps a dedicated flower dataset at `data/flowers.json` for the thumbnail and import flow.
It is separate from the main plant catalog, so plant strand search does not depend on flower records.
Each flower has a strand-named picture in `public/pictures/` such as `public/pictures/saffron_aster.jpg`.
The source links for the picture set are recorded in `public/pictures/sources.json`.
When a selected flower does not already have a local picture, the server resolves a thumbnail from outside search, saves it back into `public/pictures/`, and shows the local-versus-outside lookup timing in the Suggestions panel.

## Plant catalog

The main garden atlas is stored in SQLite at `data/rootline.sqlite`.
It is seeded automatically from `data/plants.json` and `data/region-plants.json` the first time the app starts.
The extra region plants add more temperate, arid, woodland, tropical, alpine, prairie, coastal, Mediterranean, and container-friendly choices so the atlas feels useful from the start.
The media enricher writes `data/plant-media.json`, which stores a picture URL when one is found and a Wikimedia Commons search link when it is not.
The catalog summaries include source citations and care templates when available.

## Garden memory

The SQLite database also stores:

- notes for matched plants
- favorites for quick recall

That memory is available through the garden panel in the UI and the `/api/garden` endpoints.

## Run locally

```bash
npm install
npm run dev
```

Then open the local URL printed by the server.
