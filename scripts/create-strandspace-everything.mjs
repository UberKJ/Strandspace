import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import { PDFDocument as PDFLibDocument } from "pdf-lib";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, "..");
const docsDir = join(root, "docs");
const outputPdfDir = join(root, "output", "pdf");
const graphicsDir = join(root, "output", "graphics");

const noteMarkdownPath = join(outputPdfDir, "strandspace-everything-note.md");
const notePdfPath = join(outputPdfDir, "strandspace-everything-note.pdf");
const linksDocPath = join(docsDir, "strandspace-standard-links.md");
const architectureSvgPath = join(graphicsDir, "strandspace-everything-architecture.svg");
const roboticsSvgPath = join(graphicsDir, "strandspace-everything-robotics.svg");

const colors = {
  bg: "#070b12",
  ink: "#ecf3ff",
  blue: "#55c8ff",
  pink: "#ff7bd1",
  gold: "#ffd36b",
  cyan: "#90e8ff",
  green: "#72ef9d",
  border: "rgba(255,255,255,0.18)"
};

const linkSpec = [
  "strand://<domain>/<construct>/<id>?role=<construct|anchor|composite|relation|state>&v=<version>",
  "strand://<domain>/<construct>/<id>#<strand>",
  "strand://<domain>/<construct>/<id>?role=construct&state=stable",
  "strand://<domain>/<construct>/<id>?role=state&delta=<changed-field>"
];

const note = {
  title: "Strandspace Everything Note",
  subtitle: "A reusable memory substrate for repeated recognition and repeated action",
  summary: [
    "Strandspace learns a construct once, then recalls it from partial cues and updates only the strands that changed.",
    "That makes it useful for plants, rooms, tools, tasks, navigation, inspection, and any repeated local AI workload.",
    "The speedup comes from stable identity, mutable state, and minimal delta updates."
  ],
  sections: [
    {
      heading: "What the system stores",
      bullets: [
        "Anchor strands: stable primitives such as color, shape, location, door, chair, soil, or moisture.",
        "Composite strands: recurring bundles such as walkable corridor, yellow flower, or full-sun herb.",
        "Construct strands: the remembered whole, such as a room, a plant, a tool, or a task.",
        "Key-holder strand: a first gate that says whether the cue can relate to a known construct."
      ]
    },
    {
      heading: "Why it gets faster",
      bullets: [
        "The system does not rebuild the whole answer every time.",
        "A repeated cue can reactivate the construct directly.",
        "Only changed relations need to be updated.",
        "Cache the construct, not just the search result."
      ]
    },
    {
      heading: "Robot example",
      bullets: [
        "Build the room strandspace once: walls, doors, chair, table, floor, obstacles, safe paths.",
        "If the chair moves, update only the chair strand and the paths that depend on it.",
        "Re-enter the room later and recall the construct instead of remapping the whole scene."
      ]
    },
    {
      heading: "Pitfalls",
      bullets: [
        "Memory drift when the world changes.",
        "False confidence when partial cues are too weak.",
        "Overbinding when too many traits get glued together.",
        "Stale memory when old constructs never decay."
      ]
    }
  ]
};

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function svgRect(x, y, width, height, fill, stroke = colors.border, rx = 18) {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
}

function svgText(x, y, text, size = 28, fill = colors.ink, weight = 600, anchor = "middle") {
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${escapeXml(text)}</text>`;
}

function svgLine(x1, y1, x2, y2, stroke = colors.border, width = 3, dash = "") {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
}

function svgArrow(x1, y1, x2, y2, stroke = colors.cyan) {
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="4" marker-end="url(#arrow)"/>
  `;
}

function architectureSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <defs>
    <linearGradient id="core" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1c2d44"/>
      <stop offset="100%" stop-color="#0d1522"/>
    </linearGradient>
    <linearGradient id="pinkGlow" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${colors.pink}"/>
      <stop offset="100%" stop-color="${colors.gold}"/>
    </linearGradient>
    <linearGradient id="blueGlow" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${colors.blue}"/>
      <stop offset="100%" stop-color="${colors.cyan}"/>
    </linearGradient>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="${colors.ink}"/>
    </marker>
  </defs>
  <rect width="1600" height="900" fill="${colors.bg}"/>
  <g opacity="0.9">
    ${svgText(800, 70, "Strandspace Everything Architecture", 42, colors.ink, 800)}
    ${svgText(800, 110, "Stable identity, mutable state, minimal delta, partial-cue recall", 20, "#b9c7df", 500)}
  </g>
  <g>
    ${svgRect(90, 170, 300, 90, "url(#blueGlow)")}
    ${svgRect(450, 170, 340, 90, "url(#core)")}
    ${svgRect(850, 170, 320, 90, "url(#pinkGlow)")}
    ${svgRect(1220, 170, 300, 90, "url(#core)")}
    ${svgText(240, 215, "Input cue", 26, "#fff", 700)}
    ${svgText(620, 205, "Key-holder gate", 26, "#fff", 700)}
    ${svgText(1010, 205, "Strand layers", 26, "#fff", 700)}
    ${svgText(1370, 205, "Construct recall", 26, "#fff", 700)}
    ${svgArrow(390, 215, 450, 215)}
    ${svgArrow(790, 215, 850, 215)}
    ${svgArrow(1170, 215, 1220, 215)}
  </g>
  <g>
    ${svgRect(140, 340, 240, 88, "#10304c")}
    ${svgRect(140, 460, 240, 88, "#10304c")}
    ${svgRect(140, 580, 240, 88, "#10304c")}
    ${svgRect(450, 340, 240, 88, "#1e2745")}
    ${svgRect(450, 460, 240, 88, "#1e2745")}
    ${svgRect(450, 580, 240, 88, "#1e2745")}
    ${svgRect(760, 340, 260, 88, "#2a2344")}
    ${svgRect(760, 460, 260, 88, "#2a2344")}
    ${svgRect(760, 580, 260, 88, "#2a2344")}
    ${svgRect(1080, 340, 320, 88, "#33203f")}
    ${svgRect(1080, 460, 320, 88, "#33203f")}
    ${svgRect(1080, 580, 320, 88, "#33203f")}
    ${svgText(260, 376, "Anchor strands", 24, colors.blue, 700)}
    ${svgText(260, 496, "Color / shape", 22, "#d7e7ff", 500)}
    ${svgText(260, 616, "Location / state", 22, "#d7e7ff", 500)}
    ${svgText(570, 376, "Composite strands", 24, colors.pink, 700)}
    ${svgText(570, 496, "Recurring bundles", 22, "#ffd7f1", 500)}
    ${svgText(570, 616, "Reusable groups", 22, "#ffd7f1", 500)}
    ${svgText(890, 376, "Construct strands", 24, colors.gold, 700)}
    ${svgText(890, 496, "Known plant / room / tool", 22, "#fff2cc", 500)}
    ${svgText(890, 616, "Reactivate whole memory", 22, "#fff2cc", 500)}
    ${svgText(1240, 376, "Delta updates", 24, colors.green, 700)}
    ${svgText(1240, 496, "Only changed strands", 22, "#d8ffe8", 500)}
    ${svgText(1240, 616, "Fast repeat recall", 22, "#d8ffe8", 500)}
    ${svgArrow(380, 384, 450, 384)}
    ${svgArrow(690, 384, 760, 384)}
    ${svgArrow(1020, 384, 1080, 384)}
    ${svgArrow(1020, 504, 1080, 504)}
    ${svgArrow(1020, 624, 1080, 624)}
  </g>
  <g opacity="0.9">
    ${svgText(800, 820, "Domain packs can plug in here: plants, rooms, tools, tasks, navigation, inspection, and more.", 20, "#d4deef", 500)}
  </g>
</svg>`;
}

function roboticsSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <defs>
    <linearGradient id="floor" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#111827"/>
      <stop offset="100%" stop-color="#0a0d14"/>
    </linearGradient>
    <linearGradient id="roomGlow" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#72ef9d"/>
      <stop offset="50%" stop-color="#55c8ff"/>
      <stop offset="100%" stop-color="#ff7bd1"/>
    </linearGradient>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#ecf3ff"/>
    </marker>
  </defs>
  <rect width="1600" height="900" fill="${colors.bg}"/>
  <rect x="120" y="130" width="1360" height="620" rx="42" fill="url(#floor)" stroke="rgba(255,255,255,0.14)" stroke-width="3"/>
  ${svgText(800, 74, "Robot Strandspace Room Recall", 42, colors.ink, 800)}
  ${svgText(800, 112, "One room, one construct, many small delta updates", 20, "#b9c7df", 500)}
  <g>
    <rect x="200" y="210" width="330" height="170" rx="26" fill="#10243a" stroke="#55c8ff" stroke-width="3"/>
    <rect x="720" y="190" width="260" height="140" rx="24" fill="#251d33" stroke="#ff7bd1" stroke-width="3"/>
    <rect x="1100" y="210" width="260" height="180" rx="24" fill="#2c2418" stroke="#ffd36b" stroke-width="3"/>
    <rect x="250" y="510" width="250" height="120" rx="18" fill="#16361f" stroke="#72ef9d" stroke-width="3"/>
    <rect x="690" y="500" width="300" height="130" rx="18" fill="#1b2232" stroke="#90e8ff" stroke-width="3"/>
    <rect x="1110" y="500" width="220" height="150" rx="18" fill="#332033" stroke="#ff7bd1" stroke-width="3"/>
    ${svgText(365, 260, "Chair", 28, "#fff", 700)}
    ${svgText(850, 245, "Table", 28, "#fff", 700)}
    ${svgText(1230, 260, "Door", 28, "#fff", 700)}
    ${svgText(375, 560, "Walk path", 28, "#fff", 700)}
    ${svgText(840, 555, "Robot pose", 28, "#fff", 700)}
    ${svgText(1220, 565, "Obstacle zone", 28, "#fff", 700)}
  </g>
  <g>
    ${svgArrow(520, 335, 690, 345)}
    ${svgArrow(980, 340, 1100, 345)}
    ${svgArrow(820, 500, 450, 400)}
    ${svgArrow(820, 500, 820, 350)}
    ${svgArrow(820, 500, 1230, 400)}
    ${svgArrow(820, 500, 1130, 520)}
  </g>
  <g>
    ${svgText(185, 815, "Anchor strands: wall, chair, door, table, floor, obstacle, corridor", 20, "#d4deef", 500, "start")}
    ${svgText(185, 848, "Composite strands: safe path, room cluster, charging zone, reachable surface", 20, "#d4deef", 500, "start")}
    ${svgText(185, 881, "Construct strand: known room v1 - only moved objects trigger delta updates", 20, "#d4deef", 500, "start")}
  </g>
  <circle cx="820" cy="505" r="26" fill="#ecf3ff"/>
  <circle cx="820" cy="505" r="11" fill="#0a0d14"/>
  ${svgText(820, 515, "bot", 16, "#0a0d14", 800)}
</svg>`;
}

function markdownNote() {
  return `# ${note.title}\n\n` +
    `## ${note.subtitle}\n\n` +
    `${note.summary.map((line) => `${line}\n`).join("\n")}\n` +
    `## Standardized links\n\n` +
    `${linkSpec.map((line) => `- \`${line}\``).join("\n")}\n\n` +
    `## Plug-in contract\n\n` +
    `Any domain can plug into Strandspace if it exposes: \`constructId\`, \`anchorStrands[]\`, \`compositeStrands[]\`, \`relationStrands[]\`, \`state\`, \`delta\`, \`confidence\`, and \`version\`.\n\n` +
    `## Robotics example\n\n` +
    `A robot builds a room construct once, then reuses it later. If a chair moves, the system updates only the chair strand and the dependent path strands. The room construct stays stable, which keeps recall fast and makes local replanning cheap.\n\n` +
    `## Pitfalls\n\n` +
    `- Memory drift when the real world changes.\n- False confidence from weak partial cues.\n- Overbinding too many traits into one construct.\n- Stale memory if old constructs never decay.\n`;
}

function createDocument() {
  return new PDFDocument({
    size: "LETTER",
    layout: "landscape",
    margins: { top: 28, bottom: 28, left: 28, right: 28 },
    bufferPages: true
  });
}

function writePdf(md) {
  return new Promise((resolve, reject) => {
    const doc = createDocument();
    const stream = createWriteStream(notePdfPath);
    doc.pipe(stream);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const innerWidth = pageWidth - doc.page.margins.left - doc.page.margins.right;
    const colGap = 18;
    const colWidth = (innerWidth - colGap * 2) / 3;
    const leftX = doc.page.margins.left;
    const topY = 34;
    const boxH = 250;

    doc.fillColor("#12324f").font("Helvetica-Bold").fontSize(24);
    doc.text(note.title, leftX, 24, { width: innerWidth, align: "left" });
    doc.fillColor("#355c7d").font("Helvetica").fontSize(11);
    doc.text(note.subtitle, leftX, 54, { width: innerWidth, align: "left" });

    const drawPanel = (x, title, bodyLines, bulletLines = []) => {
      const originalX = doc.x;
      const originalY = doc.y;
      doc.save();
      doc.roundedRect(x, topY, colWidth, boxH, 18).fillAndStroke("#f7f9fc", "#d3dbe7");
      doc.fillColor("#17324a").font("Helvetica-Bold").fontSize(12);
      doc.text(title, x + 16, topY + 14, { width: colWidth - 32 });
      const text = [
        ...bodyLines,
        "",
        "Key points",
        ...bulletLines.map((bullet) => `- ${bullet}`)
      ].join("\n");
      doc.fillColor("#222").font("Helvetica").fontSize(8.5);
      doc.text(text, x + 16, topY + 40, {
        width: colWidth - 32,
        height: boxH - 56,
        lineGap: 2,
        ellipsis: true
      });
      doc.restore();
      doc.x = originalX;
      doc.y = originalY;
    };

    drawPanel(
      leftX,
      "Speedup mechanism",
      [
        "Learn once, recall many times.",
        "Keep identity stable.",
        "Update only the changed strands."
      ],
      [
        "No full rebuild on repeat.",
        "Partial cues can reopen the construct.",
        "Cache the construct, not just the answer."
      ]
    );

    drawPanel(
      leftX + colWidth + colGap,
      "Standardized links",
      [
        "One plug-in link contract for all domains.",
        "Map anchors, composites, relations, state, delta, and version."
      ],
      [
        "strand://<domain>/<construct>/<id>?role=<type>&v=<version>",
        "strand://<domain>/<construct>/<id>#<strand>",
        "strand://<domain>/<construct>/<id>?role=state&delta=<field>"
      ]
    );

    drawPanel(
      leftX + (colWidth + colGap) * 2,
      "Robot room example",
      [
        "Build the room once.",
        "If a chair moves, update only chair and dependent paths.",
        "Recall the room later instead of remapping everything."
      ],
      [
        "Stable room construct.",
        "Mutable chair state.",
        "Delta-only replanning."
      ]
    );

    doc.fillColor("#12324f").font("Helvetica-Bold").fontSize(11);
    doc.text("General rule: stable identity + mutable state + minimal delta updates = faster local recall.", leftX, pageHeight - 56, { width: innerWidth });
    doc.fillColor("#666").font("Helvetica").fontSize(8.5);
    doc.text("Strandspace can plug into plants, rooms, tools, tasks, navigation, inspection, and repeated-question systems.", leftX, pageHeight - 38, { width: innerWidth });

    const pageCount = doc.bufferedPageRange().count;
    for (let index = 0; index < pageCount; index += 1) {
      doc.switchToPage(index);
      const footerY = doc.page.height - 24;
      doc.save();
      doc.strokeColor("#cbd5e1").lineWidth(0.5);
      doc.moveTo(28, footerY - 6).lineTo(doc.page.width - 28, footerY - 6).stroke();
      doc.fillColor("#777").font("Helvetica").fontSize(8);
      doc.text(`Strandspace Everything Note`, 28, footerY, { width: 260, align: "left" });
      doc.text(`Page ${index + 1}`, 28, footerY, { width: doc.page.width - 56, align: "right" });
      doc.restore();
    }

    doc.end();
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}

async function trimPdfToFirstPage(inputPath, outputPath) {
  const sourceBytes = await fs.readFile(inputPath);
  const sourcePdf = await PDFLibDocument.load(sourceBytes);
  const trimmedPdf = await PDFLibDocument.create();
  const [firstPage] = await trimmedPdf.copyPages(sourcePdf, [0]);
  trimmedPdf.addPage(firstPage);
  const bytes = await trimmedPdf.save();
  await fs.writeFile(outputPath, bytes);
}

await fs.mkdir(docsDir, { recursive: true });
await fs.mkdir(outputPdfDir, { recursive: true });
await fs.mkdir(graphicsDir, { recursive: true });

const markdown = markdownNote();
await fs.writeFile(linksDocPath, markdown, "utf8");
await fs.writeFile(noteMarkdownPath, markdown, "utf8");
await fs.writeFile(architectureSvgPath, architectureSvg(), "utf8");
await fs.writeFile(roboticsSvgPath, roboticsSvg(), "utf8");
await writePdf(markdown);
await trimPdfToFirstPage(notePdfPath, notePdfPath);

console.log(`Wrote ${linksDocPath}`);
console.log(`Wrote ${noteMarkdownPath}`);
console.log(`Wrote ${notePdfPath}`);
console.log(`Wrote ${architectureSvgPath}`);
console.log(`Wrote ${roboticsSvgPath}`);
