import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const outDir = join(__dirname, "..", "output", "pdf");
const markdownPath = join(outDir, "strandspace-garden-white-paper.md");
const pdfPath = join(outDir, "strandspace-garden-white-paper.pdf");

const benchmarkSearchRows = [
  { query: "basil", tokenized: 31.246, strandspace: 22.405, shared: 3 },
  { query: "herb full sun", tokenized: 48.336, strandspace: 39.654, shared: 6 },
  { query: "yellow flower moist", tokenized: 34.275, strandspace: 32.995, shared: 5 },
  { query: "yellow", tokenized: 6.085, strandspace: 2.315, shared: 6 }
];

const repeatedBenchmarkRows = [
  { query: "yellow flower moist", llm: 10853.474, strandspace: 1140.87, hits: 5, rate: "100%" },
  { query: "herb full sun", llm: 9304.977, strandspace: 2161.219, hits: 5, rate: "100%" }
];

const paper = {
  title: "Strandspace Garden",
  subtitle: "A Strand-Based Memory Architecture for Faster Repetitive Plant Retrieval",
  edition: "Proof-of-Concept White Paper - Revised Edition",
  date: "April 2026",
  executiveSummary: [
    "Strandspace Garden is a local gardening atlas that converts plant names, care traits, region data, pictures, and learned user selections into reusable strands.",
    "The prototype uses a curated 200-plant common catalog and only keeps entries with verified picture and source matches. Incorrect or ambiguous items are skipped.",
    "Positive matches can be saved as Strand memory, which lets later searches reuse the same construct and associated strands instead of rebuilding the answer from scratch.",
    "Live measurements from the running prototype show that Strandspace can be faster than tokenized search on repetitive plant queries, especially when the query is broad, trait-based, or repeated."
  ],
  abstract: [
    "Strandspace Garden applies the Strandspace representation model to a gardening knowledge base. Plant identity, region fit, care guidance, fertilizer, biology, and picture links are encoded as reusable strands rather than isolated text fragments. In the proof-of-concept application, a positive search result can be saved into local Strand memory, and the next search can reuse that learned construct. The result is a faster and more stable retrieval path for repeated garden questions such as color-based queries, sunlight queries, and mixed trait searches."
  ],
  sections: [
    {
      heading: "1. Technical Field",
      paragraphs: [
        "This paper relates to artificial intelligence, structured retrieval, plant information systems, semantic memory, and reusable knowledge representations for repetitive domain tasks.",
        "More specifically, it proposes a gardening atlas that uses strand-based memory to represent plant identity, region fit, picture metadata, fertilizer, biology, and care guidance in a way that can be reused across repeated searches."
      ]
    },
    {
      heading: "2. Background and Problem Statement",
      paragraphs: [
        "Most gardening assistants still search by token overlap, embedding similarity, or broad retrieval of text passages. Those methods can answer a question, but they do not always preserve reusable structure. The same plant may be rediscovered many times, even when the user keeps asking about the same family of traits.",
        "Gardening questions are repetitive by nature. Users ask for yellow flowers, herbs in full sun, plants that like moist soil, plants for a region, and care rules for the same species over and over. A useful system should recognize the repeated shape of the request and reuse the same plant construct when the evidence is strong.",
        "The core problem is not only answer quality. It is also retrieval cost. A system that can reapply a learned strand path should be able to reduce repeated work over time."
      ],
      bullets: [
        "Token search is a useful baseline, but it does not retain learned plant constructs.",
        "Generic retrieval often ignores which parts of the answer were already confirmed before.",
        "A gardening atlas benefits from region, color, moisture, soil, fertilizer, biology, and picture data all being tied to the same reusable plant identity."
      ]
    },
    {
      heading: "3. Summary of the Proposed Architecture",
      paragraphs: [
        "Strandspace Garden organizes the catalog into three levels: anchor strands, composite strands, and construct strands. Anchor strands hold reusable primitives such as plant type, color, soil, moisture, sunlight, height, fragrance, and season. Composite strands bundle recurring care and biology patterns. Construct strands represent the stabilized identity of a plant such as Basil, Lavender, Peace rose, or Sunflower.",
        "The application also keeps a key-holder strand at the front of each trace. The key-holder identifies the candidate plant or search family and carries a can-relate flag that tells the system whether this construct can responsibly answer the request. When the evidence is weak, the key-holder becomes a no-match gate instead of forcing a guess.",
        "When a user clicks a positive result, the application stores the plant, its activated strands, and its trace into local Strand memory. Future queries can reuse that memory and rank the same construct more quickly."
      ]
    },
    {
      heading: "4. Core Principles",
      bullets: [
        "Reusable primitives: stable plant traits are stored once and reused across many records.",
        "Multi-strand meaning: no single strand carries the whole answer by itself.",
        "Hierarchical recall: anchors combine into composites, and composites stabilize into constructs.",
        "Partial-cue recall: a broad query such as yellow flower moist can reactivate a familiar plant cluster.",
        "Confidence gating: if the evidence is too weak, the system returns no strong match rather than guessing.",
        "Memory growth: user clicks and repeated queries strengthen the strands that were actually useful."
      ]
    },
    {
      heading: "5. Strand Definition",
      paragraphs: [
        "A strand is a structured record for one semantic family. In the gardening prototype, a strand can represent color, soil, moisture, sunlight, bloom type, growth habit, fertility, region fit, or picture identity. The first spike or header acts as the strand key. Later spikes carry the payload that belongs to that family.",
        "This keyed structure matters because it lets the system interpret the rest of the record without treating every field as generic text. A color strand, for example, is read differently from a moisture strand or an image strand. The meaning comes from the keyed family, not from raw tokens alone."
      ],
      bullets: [
        "Anchor strand examples: plant_type, primary_color, secondary_color, soil_type, pH, moisture, sunlight, height, growth_habit, bloom_type.",
        "Composite strand examples: rose_soil_profile, dry_soil_profile, shade_plant_profile, pink_yellow_flower_profile, pollinator_path.",
        "Construct strand examples: Basil, Lavender, Peace rose, Red rose, Sunflower, Hosta."
      ]
    },
    {
      heading: "6. Encoding Model",
      paragraphs: [
        "A plant is not stored as one opaque label. Instead, it is encoded as a linked set of strands. For example, Basil carries the construct strand Basil, anchor strands such as green, full sun, rich moist soil, herb, and edible leaves, and composite strands such as culinary herb and warm kitchen herb. The same structure can later be reused when the user asks for herbs in full sun or another basil-like request.",
        "Picture data is also bound into the same model. A plant record can carry a picture path, full-picture link, page source, and image strand so the visual record stays attached to the same construct. That makes the image part of the memory trace rather than a detached file."
      ],
      bullets: [
        "The first spike identifies the family.",
        "The later spikes carry the trait payload.",
        "The picture link is saved alongside the construct so the plant and its image can be recalled together."
      ]
    },
    {
      heading: "7. Recognition Model",
      paragraphs: [
        "Recognition in Strandspace Garden works in two modes. Progressive assembly mode is used when the query is new or weakly learned. In that mode, the system detects primitive strands, combines them into a candidate plant family, and only then stabilizes a construct if the evidence is strong enough.",
        "Construct recall mode is used when the query partially matches a plant that has already been learned. In that case, the system does not need to rebuild the whole answer from scratch. The key-holder strand, learned memory, and weighted strand links can reactivate the most likely plant directly.",
        "If the evidence is weak, the system returns a no-match response rather than inventing a plant. That behavior matters for gardening because false positives are more harmful than an honest lack of confidence."
      ]
    },
    {
      heading: "8. Worked Examples",
      paragraphs: [
        "Basil is a strong example of structured recall. The query basil hits the construct strand directly, activates herb, full sun, rich moist soil, and edible leaf strands, and returns a stable plant card with picture and care details.",
        "Yellow flower moist is a broader trait query. In a token-only system, this could easily collapse into noisy keyword overlap. In Strandspace Garden, the query is treated as a list-style strand request, which lets the application surface many matching plants and then import the positive result into Strand memory if the user selects one.",
        "Peace rose demonstrates how a specific cultivar can be represented through both botanical and gardening strands. Its rose soil profile, pink-yellow flower profile, and pollinator path are all reusable in later searches for roses with similar traits."
      ]
    },
    {
      heading: "9. Memory Efficiency and Recall Model",
      paragraphs: [
        "Strandspace is intended to improve memory efficiency by storing stable primitives once and reusing them across many concepts. In a gardening catalog, that means the same sunlight, soil, moisture, and region strands can support hundreds of plants without duplicating the whole answer every time.",
        "The benefit is strongest on repetitive questions. When a user asks a similar question again, the system can reuse the previously learned plant construct and its activated strands. In the current prototype, the search report and benchmark report both expose the measured timing difference between tokenized search and Strandspace recall."
      ]
    },
    {
      heading: "10. Confidence, Ambiguity, and Expertise Growth",
      paragraphs: [
        "The prototype uses explicit confidence gating. If the query does not match a plant with enough evidence, the system says no strong match instead of guessing. That avoids spurious plant matches when the user types an under-specified or misleading query.",
        "The same plant can be rendered at different levels of expertise. A child-friendly answer can stay short and simple. A gardener answer can focus on care, fertilizer, and region. A scientist answer can emphasize structured traits and botanical relations. Those layers all sit on top of the same strand memory."
      ],
      bullets: [
        "Low-confidence queries trigger a no-match gate.",
        "Positive result clicks can be saved as Strand memory.",
        "Repeated memory hits strengthen future recall."
      ]
    },
    {
      heading: "11. Possible Implementations and Applications",
      paragraphs: [
        "The garden prototype is one domain example, but the same pattern can be applied to other repetitive knowledge tasks. Any domain with recurring entities, stable traits, and a need for fast repeat recall can benefit from strand-style memory.",
        "Possible applications include semantic search, expert knowledge assistants, structured retrieval, image-linked catalogs, educational tools, and domain-specific answer systems that need to reuse what they learned the last time."
      ],
      bullets: [
        "Gardening knowledge bases",
        "Regional plant guides",
        "Picture-linked botanical catalogs",
        "Repeat-question assistants",
        "Structured support tools for care, fertilizer, and region planning"
      ]
    },
    {
      heading: "12. Prototype Roadmap",
      paragraphs: [
        "The current proof of concept is intentionally small and curated. The next version should continue to favor quality over volume: keep the common-plant corpus limited to verified entries, skip incorrect or ambiguous records, and only include a plant when the picture and source information actually match.",
        "A practical roadmap is to grow the curated seed set, continue importing positive matches into Strand memory, and measure the repeated-query speedup over a larger sample. The benchmark should focus on the same user shapes that matter in a garden setting: color queries, moisture queries, sunlight queries, region queries, and mixed trait questions."
      ],
      bullets: [
        "Phase 1: 200 common plants with verified pictures and source links.",
        "Phase 2: click-to-save Strand memory for positive matches.",
        "Phase 3: repeated-query benchmark runs for the same garden questions.",
        "Phase 4: larger catalog scaling while keeping the strand memory model intact."
      ]
    },
    {
      heading: "13. Conclusion",
      paragraphs: [
        "Strandspace Garden demonstrates a practical way to turn a plant catalog into reusable semantic memory. By attaching plant identity, care, region, and picture metadata to keyed strands, the application can reactivate familiar plant constructs from partial evidence and save those constructs for later.",
        "The live prototype does not claim universal superiority over every search method. Instead, it shows a clear proof of concept in a repetitive gardening domain: when the same kind of query returns again, Strandspace can reuse what it already learned and respond faster on the queries that matter most."
      ]
    }
  ],
  tables: [
    {
      title: "Table 1. Search comparison timings on the live prototype",
      columns: ["Query", "Tokenized ms", "Strandspace ms", "Shared top matches"],
      rows: benchmarkSearchRows.map((row) => [
        row.query,
        row.tokenized.toFixed(3),
        row.strandspace.toFixed(3),
        String(row.shared)
      ])
    },
    {
      title: "Table 2. Repeated-query benchmark with Strand memory",
      columns: ["Query", "LLM avg ms", "Strandspace avg ms", "Cache hits", "Cache hit rate"],
      rows: repeatedBenchmarkRows.map((row) => [
        row.query,
        row.llm.toFixed(3),
        row.strandspace.toFixed(3),
        String(row.hits),
        row.rate
      ])
    }
  ]
};

function mdTable(title, columns, rows) {
  const header = `| ${columns.join(" | ")} |`;
  const separator = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.map((cell) => String(cell).replaceAll("|", "\\|")).join(" | ")} |`).join("\n");
  return `### ${title}\n\n${header}\n${separator}\n${body}\n\n`;
}

function buildMarkdown() {
  const out = [];
  out.push(`# ${paper.title}\n`);
  out.push(`## ${paper.subtitle}\n`);
  out.push(`**${paper.edition}**\n`);
  out.push(`April 2026\n`);
  out.push(`## Executive Summary\n`);
  for (const paragraph of paper.executiveSummary) {
    out.push(`${paragraph}\n`);
  }
  out.push(`## Abstract\n`);
  for (const paragraph of paper.abstract) {
    out.push(`${paragraph}\n`);
  }
  for (const section of paper.sections) {
    out.push(`## ${section.heading}\n`);
    for (const paragraph of section.paragraphs ?? []) {
      out.push(`${paragraph}\n`);
    }
    if (section.bullets?.length) {
      for (const bullet of section.bullets) {
        out.push(`- ${bullet}\n`);
      }
      out.push("\n");
    }
  }
  for (const table of paper.tables) {
    out.push(mdTable(table.title, table.columns, table.rows));
  }
  out.push(`## Appendix Note\n`);
  out.push(`This paper reflects live measurements from the running Strandspace Garden prototype and is intended as a proof-of-concept white paper.\n`);
  return out.join("\n");
}

function createDocument() {
  return new PDFDocument({
    size: "LETTER",
    margins: {
      top: 54,
      bottom: 54,
      left: 54,
      right: 54
    },
    bufferPages: true
  });
}

function addFooter(doc, pageNumber) {
  const footerY = doc.page.height - 34;
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  doc.save();
  doc.lineWidth(0.5).strokeColor("#c6c6c6");
  doc.moveTo(left, footerY - 8).lineTo(right, footerY - 8).stroke();
  doc.fillColor("#666666").font("Helvetica").fontSize(8);
  doc.text(`Strandspace Garden White Paper`, left, footerY, { width: 220, align: "left" });
  doc.text(`Page ${pageNumber}`, left, footerY, { width: right - left, align: "right" });
  doc.restore();
}

function ensureSpace(doc, neededHeight) {
  const bottomLimit = doc.page.height - doc.page.margins.bottom - 24;
  if (doc.y + neededHeight > bottomLimit) {
    doc.addPage();
  }
}

function writeParagraph(doc, text, options = {}) {
  doc.font("Helvetica").fontSize(options.fontSize ?? 11).fillColor("#222222");
  doc.text(text, {
    width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
    align: "left",
    lineGap: 3,
    paragraphGap: options.paragraphGap ?? 8
  });
}

function writeBullets(doc, bullets) {
  for (const bullet of bullets) {
    ensureSpace(doc, 20);
    doc.font("Helvetica").fontSize(11).fillColor("#222222");
    doc.text(`- ${bullet}`, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      indent: 10,
      lineGap: 3,
      paragraphGap: 4
    });
  }
}

function writeSectionHeading(doc, heading) {
  ensureSpace(doc, 28);
  doc.moveDown(0.4);
  doc.font("Helvetica-Bold").fontSize(14).fillColor("#17324a");
  doc.text(heading, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: "left" });
  doc.moveDown(0.35);
}

function drawTable(doc, table) {
  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const columnWidths = table.columnWidths ?? [];
  const widths = columnWidths.length
    ? columnWidths
    : table.columns.length === 4
      ? [170, 100, 110, usableWidth - 380]
      : [160, 90, 100, 70, usableWidth - 420];
  const headerHeight = 24;
  const cellPadding = 4;
  const rowFontSize = 10;

  writeSectionHeading(doc, table.title);

  const drawRow = (cells, y, isHeader = false) => {
    const heights = cells.map((cell, index) => doc.heightOfString(String(cell), {
      width: widths[index] - (cellPadding * 2),
      font: isHeader ? "Helvetica-Bold" : "Helvetica",
      fontSize: rowFontSize
    }));
    const rowHeight = Math.max(isHeader ? headerHeight : 22, ...heights.map((value) => value + (cellPadding * 2)));
    ensureSpace(doc, rowHeight + 8);
    const rowY = doc.y;
    let x = doc.page.margins.left;

    for (let index = 0; index < cells.length; index += 1) {
      const width = widths[index];
      doc.save();
      if (isHeader) {
        doc.rect(x, rowY, width, rowHeight).fillAndStroke("#e8eef4", "#c4ced8");
        doc.fillColor("#17324a").font("Helvetica-Bold").fontSize(rowFontSize);
      } else {
        doc.rect(x, rowY, width, rowHeight).strokeColor("#d2d7dd").stroke();
        doc.fillColor("#222222").font("Helvetica").fontSize(rowFontSize);
      }
      doc.text(String(cells[index]), x + cellPadding, rowY + cellPadding, {
        width: width - (cellPadding * 2),
        lineGap: 2
      });
      doc.restore();
      x += width;
    }
    doc.y = rowY + rowHeight;
  };

  drawRow(table.columns, doc.y, true);
  for (const row of table.rows) {
    drawRow(row, doc.y, false);
  }
  doc.moveDown(0.5);
}

async function renderPdf(markdown) {
  await fs.mkdir(outDir, { recursive: true });

  const doc = createDocument();
  const stream = createWriteStream(pdfPath);
  doc.pipe(stream);

  // Title page
  doc.fillColor("#12324f").font("Helvetica-Bold").fontSize(26);
  doc.text(paper.title, { align: "left" });
  doc.moveDown(0.25);
  doc.fillColor("#355c7d").font("Helvetica").fontSize(15);
  doc.text(paper.subtitle, { align: "left" });
  doc.moveDown(0.25);
  doc.fillColor("#566270").font("Helvetica-Bold").fontSize(11);
  doc.text(paper.edition, { align: "left" });
  doc.text(paper.date, { align: "left" });
  doc.moveDown(1);
  doc.strokeColor("#c8d0d9").lineWidth(1).moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
  doc.moveDown(1);

  doc.fillColor("#17324a").font("Helvetica-Bold").fontSize(15);
  doc.text("Executive Summary");
  doc.moveDown(0.25);
  writeBullets(doc, paper.executiveSummary);
  doc.moveDown(0.5);

  doc.fillColor("#17324a").font("Helvetica-Bold").fontSize(15);
  doc.text("Abstract");
  doc.moveDown(0.25);
  writeParagraph(doc, paper.abstract[0]);

  doc.addPage();

  for (const section of paper.sections) {
    writeSectionHeading(doc, section.heading);
    for (const paragraph of section.paragraphs ?? []) {
      writeParagraph(doc, paragraph);
      doc.moveDown(0.1);
    }
    if (section.bullets?.length) {
      writeBullets(doc, section.bullets);
      doc.moveDown(0.15);
    }
    doc.moveDown(0.25);
  }

  for (const table of paper.tables) {
    drawTable(doc, table);
    doc.moveDown(0.5);
  }

  writeSectionHeading(doc, "Appendix Note");
  writeParagraph(doc, "This paper reflects live measurements from the running Strandspace Garden prototype and is intended as a proof-of-concept white paper.");

  const pageRange = doc.bufferedPageRange();
  for (let index = 0; index < pageRange.count; index += 1) {
    doc.switchToPage(pageRange.start + index);
    addFooter(doc, index + 1);
  }

  doc.end();

  await new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  await fs.writeFile(markdownPath, markdown, "utf8");
}

const markdown = buildMarkdown();
await renderPdf(markdown);

console.log(`Wrote ${markdownPath}`);
console.log(`Wrote ${pdfPath}`);
