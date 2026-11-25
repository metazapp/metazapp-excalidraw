/**
 * Metazapp Excalidraw — PDF page-setup engine.
 *
 * Pure (DOM-free) layout maths: given the bounding box of the used canvas
 * area, decides paper orientation, scale and how the drawing is split into
 * pages. Rendering lives in `exportToPdf.ts`.
 *
 * Units: scene px (1 px at 100% zoom = 1 CSS px = 25.4/96 mm) and mm.
 */

export const MM_PER_PX = 25.4 / 96;

export type PaperId = "a5" | "a4" | "a3" | "a2" | "letter" | "legal" | "fit";
export type Orientation = "auto" | "portrait" | "landscape";
export type LayoutMode = "auto" | "single" | "tiled";

/** portrait width × height in mm */
export const PAPER_SIZES: Record<
  Exclude<PaperId, "fit">,
  { label: string; w: number; h: number }
> = {
  a5: { label: "A5", w: 148, h: 210 },
  a4: { label: "A4", w: 210, h: 297 },
  a3: { label: "A3", w: 297, h: 420 },
  a2: { label: "A2", w: 420, h: 594 },
  letter: { label: "Letter", w: 215.9, h: 279.4 },
  legal: { label: "Legal", w: 215.9, h: 355.6 },
};

/** jsPDF's hard limit is 14400pt ≈ 5080mm per side */
export const MAX_PAGE_MM = 5000;
/** don't blow a tiny doodle up beyond this when fitting to a page */
export const MAX_FIT_SCALE = 3;
/** below this print scale, text drawn at default sizes gets hard to read */
export const DEFAULT_MIN_READABLE_SCALE = 0.5;
/** breathing room around the content so stroke widths/roughness aren't clipped */
export const CONTENT_PADDING_PX = 12;

export type Rect = { x: number; y: number; width: number; height: number };

export type PdfLayoutInput = {
  /** bounding box of the used canvas area, in scene px */
  content: Rect;
  paper: PaperId;
  orientation: Orientation;
  mode: LayoutMode;
  /** print scale for `tiled` mode and `fit` paper (1 = 100%) */
  scale: number;
  marginMm: number;
  /** element bounding boxes, used to skip blank pages */
  occupied?: readonly Rect[];
  skipBlankPages?: boolean;
  minReadableScale?: number;
};

export type PdfPage = {
  /** scene-space region drawn onto this page's printable area */
  region: Rect;
  row: number;
  col: number;
};

export type PdfLayout = {
  pageWidthMm: number;
  pageHeightMm: number;
  orientation: "portrait" | "landscape";
  marginMm: number;
  /** final print scale (1 = 100%) */
  scale: number;
  rows: number;
  cols: number;
  /** pages to emit (blank tiles already removed when requested) */
  pages: PdfPage[];
  /** tiles in the grid, including skipped blank ones */
  totalTiles: number;
  mode: "single" | "tiled";
  /** union of all tiles in scene px (for previews) */
  gridRect: Rect;
};

const EPS = 1e-6;

export const padRect = (r: Rect, pad: number): Rect => ({
  x: r.x - pad,
  y: r.y - pad,
  width: r.width + pad * 2,
  height: r.height + pad * 2,
});

const intersects = (a: Rect, b: Rect) =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

const pageDims = (
  paper: Exclude<PaperId, "fit">,
  orientation: "portrait" | "landscape",
) => {
  const { w, h } = PAPER_SIZES[paper];
  return orientation === "portrait" ? { w, h } : { w: h, h: w };
};

const printable = (w: number, h: number, margin: number) => ({
  pw: Math.max(1, w - margin * 2),
  ph: Math.max(1, h - margin * 2),
});

/** max scale at which the content fits one printable area */
const fitScaleFor = (content: Rect, pw: number, ph: number) =>
  Math.min(pw / (content.width * MM_PER_PX), ph / (content.height * MM_PER_PX));

const orientationsFor = (o: Orientation): ("portrait" | "landscape")[] =>
  o === "auto" ? ["portrait", "landscape"] : [o];

const buildGrid = (
  content: Rect,
  pw: number,
  ph: number,
  scale: number,
  cols: number,
  rows: number,
) => {
  const tileW = pw / (scale * MM_PER_PX);
  const tileH = ph / (scale * MM_PER_PX);
  const cx = content.x + content.width / 2;
  const cy = content.y + content.height / 2;
  const gridRect: Rect = {
    x: cx - (cols * tileW) / 2,
    y: cy - (rows * tileH) / 2,
    width: cols * tileW,
    height: rows * tileH,
  };
  const tiles: PdfPage[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      tiles.push({
        row,
        col,
        region: {
          x: gridRect.x + col * tileW,
          y: gridRect.y + row * tileH,
          width: tileW,
          height: tileH,
        },
      });
    }
  }
  return { tiles, gridRect };
};

const gridCount = (content: Rect, pw: number, ph: number, scale: number) => {
  const tileW = pw / (scale * MM_PER_PX);
  const tileH = ph / (scale * MM_PER_PX);
  return {
    cols: Math.max(1, Math.ceil(content.width / tileW - EPS)),
    rows: Math.max(1, Math.ceil(content.height / tileH - EPS)),
  };
};

type Candidate = {
  orientation: "portrait" | "landscape";
  w: number;
  h: number;
  pw: number;
  ph: number;
  scale: number;
  cols: number;
  rows: number;
};

/** fewest pages first, then the larger (more legible) scale */
const better = (a: Candidate, b: Candidate | null) =>
  !b ||
  a.cols * a.rows < b.cols * b.rows ||
  (a.cols * a.rows === b.cols * b.rows && a.scale > b.scale + EPS);

export const computePdfLayout = (input: PdfLayoutInput): PdfLayout => {
  const {
    paper,
    orientation,
    mode,
    marginMm,
    occupied,
    skipBlankPages = true,
    minReadableScale = DEFAULT_MIN_READABLE_SCALE,
  } = input;
  const content: Rect = {
    ...input.content,
    width: Math.max(1, input.content.width),
    height: Math.max(1, input.content.height),
  };
  const userScale = Math.max(0.05, input.scale || 1);

  let chosen: Candidate | null = null;

  if (paper === "fit") {
    // page wraps the drawing exactly (great for on-screen PDFs)
    let scale = userScale;
    const maxPrintable = MAX_PAGE_MM - marginMm * 2;
    scale = Math.min(
      scale,
      maxPrintable / (content.width * MM_PER_PX),
      maxPrintable / (content.height * MM_PER_PX),
    );
    const pw = content.width * MM_PER_PX * scale;
    const ph = content.height * MM_PER_PX * scale;
    chosen = {
      orientation: pw > ph ? "landscape" : "portrait",
      w: pw + marginMm * 2,
      h: ph + marginMm * 2,
      pw,
      ph,
      scale,
      cols: 1,
      rows: 1,
    };
  } else {
    const candidates = orientationsFor(orientation).map((o) => {
      const { w, h } = pageDims(paper, o);
      const { pw, ph } = printable(w, h, marginMm);
      return { o, w, h, pw, ph, fit: fitScaleFor(content, pw, ph) };
    });

    const bestFit = candidates.reduce((a, b) => (b.fit > a.fit ? b : a));

    const useSingle =
      mode === "single" ||
      (mode === "auto" && bestFit.fit >= minReadableScale - EPS);

    if (useSingle) {
      chosen = {
        orientation: bestFit.o,
        w: bestFit.w,
        h: bestFit.h,
        pw: bestFit.pw,
        ph: bestFit.ph,
        scale: Math.min(bestFit.fit, MAX_FIT_SCALE),
        cols: 1,
        rows: 1,
      };
    } else {
      for (const c of candidates) {
        let scale = mode === "auto" ? minReadableScale : userScale;
        const { cols, rows } = gridCount(content, c.pw, c.ph, scale);
        if (mode === "auto") {
          // fewest pages at a readable scale, then enlarge to fill them
          scale = Math.min(
            (cols * c.pw) / (content.width * MM_PER_PX),
            (rows * c.ph) / (content.height * MM_PER_PX),
          );
        }
        const cand: Candidate = {
          orientation: c.o,
          w: c.w,
          h: c.h,
          pw: c.pw,
          ph: c.ph,
          scale,
          cols,
          rows,
        };
        if (better(cand, chosen)) {
          chosen = cand;
        }
      }
    }
  }

  const c = chosen!;
  const { tiles, gridRect } = buildGrid(
    content,
    c.pw,
    c.ph,
    c.scale,
    c.cols,
    c.rows,
  );

  let pages = tiles;
  if (skipBlankPages && occupied && occupied.length && tiles.length > 1) {
    pages = tiles.filter((t) => occupied.some((r) => intersects(t.region, r)));
    if (!pages.length) {
      pages = tiles.slice(0, 1);
    }
  }

  return {
    pageWidthMm: c.w,
    pageHeightMm: c.h,
    orientation: c.orientation,
    marginMm,
    scale: c.scale,
    rows: c.rows,
    cols: c.cols,
    pages,
    totalTiles: tiles.length,
    mode: c.cols * c.rows > 1 ? "tiled" : "single",
    gridRect,
  };
};
