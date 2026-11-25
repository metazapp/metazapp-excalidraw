/**
 * Metazapp Excalidraw — renders a computed PDF layout to a PDF blob.
 *
 * Each page is rendered as its own crop of the scene (via the public
 * `exportScene` API) at the requested DPI, so detail stays sharp no matter how
 * big the drawing is, and memory stays bounded to one page at a time.
 * jsPDF is lazy-loaded so it doesn't weigh on the app's initial bundle.
 */
import { exportScene, getCommonBounds } from "@excalidraw/excalidraw";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";

import {
  CONTENT_PADDING_PX,
  MM_PER_PX,
  padRect,
  type PdfLayout,
  type Rect,
} from "./pdfLayout";

/** per-page pixel budget (browsers cap canvas area around 16k×16k / 268M px) */
const MAX_PAGE_PIXELS = 40_000_000;

export type PdfRenderOptions = {
  dpi: number;
  /** render the canvas background colour (otherwise white paper) */
  background: boolean;
  darkMode: boolean;
  pageNumbers: boolean;
  title: string;
};

export type ExportSource = {
  elements: readonly NonDeletedExcalidrawElement[];
  appState: AppState;
  files: BinaryFiles;
};

const toRect = ([minX, minY, maxX, maxY]: readonly number[]): Rect => ({
  x: minX,
  y: minY,
  width: maxX - minX,
  height: maxY - minY,
});

/** elements to export: the selection (with bound text) or everything */
export const getExportElements = (
  elements: readonly NonDeletedExcalidrawElement[],
  appState: AppState,
  selectedOnly: boolean,
) => {
  if (!selectedOnly) {
    return elements;
  }
  const ids = appState.selectedElementIds;
  const selected = elements.filter((el) => ids[el.id]);
  const selectedIds = new Set(selected.map((el) => el.id));
  // include frames' children and containers' bound text
  return elements.filter(
    (el) =>
      selectedIds.has(el.id) ||
      ("containerId" in el &&
        el.containerId &&
        selectedIds.has(el.containerId)) ||
      (el.frameId && selectedIds.has(el.frameId)),
  );
};

/** used canvas area (padded) plus per-element boxes for blank-page skipping */
export const measureContent = (
  elements: readonly NonDeletedExcalidrawElement[],
) => {
  if (!elements.length) {
    return null;
  }
  return {
    content: padRect(toRect(getCommonBounds(elements)), CONTENT_PADDING_PX),
    occupied: elements.map((el) =>
      padRect(toRect(getCommonBounds([el])), CONTENT_PADDING_PX / 2),
    ),
  };
};

const renderRegion = (
  src: ExportSource,
  region: Rect,
  scale: number,
  opts: Pick<PdfRenderOptions, "background" | "darkMode">,
) =>
  exportScene({
    type: "canvas",
    data: {
      elements: src.elements,
      appState: src.appState,
      files: src.files,
    },
    config: {
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height,
      origin: "canvas",
      fit: "none",
      padding: 0,
      scale,
      theme: opts.darkMode ? "dark" : "light",
      canvasBackgroundColor: opts.background ? undefined : false,
    },
  });

/** the exact page colour the renderer uses (handles dark-mode inversion) */
const samplePageColor = async (
  src: ExportSource,
  layout: PdfLayout,
  opts: PdfRenderOptions,
): Promise<[number, number, number] | null> => {
  if (!opts.background) {
    return null;
  }
  const far = layout.gridRect;
  const canvas = await renderRegion(
    src,
    { x: far.x - 1e5, y: far.y - 1e5, width: 4, height: 4 },
    1,
    opts,
  );
  const [r, g, b, a] = canvas.getContext("2d")!.getImageData(1, 1, 1, 1).data;
  if (a < 250 || (r > 250 && g > 250 && b > 250)) {
    return null; // white/transparent — plain paper is fine
  }
  return [r, g, b];
};

export const exportToPdf = async (
  src: ExportSource,
  layout: PdfLayout,
  opts: PdfRenderOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> => {
  const { jsPDF } = await import("jspdf");
  const { pageWidthMm: W, pageHeightMm: H, marginMm: M } = layout;
  const orientation = W > H ? "landscape" : "portrait";

  const doc = new jsPDF({
    unit: "mm",
    format: [W, H],
    orientation,
    compress: true,
  });
  doc.setProperties({
    title: opts.title,
    creator: "Metazapp Excalidraw",
  });

  const pageColor = await samplePageColor(src, layout, opts);
  // JPEG is far smaller/faster for opaque pages; PNG keeps transparency crisp
  const useJpeg = opts.background;

  const total = layout.pages.length;
  for (let i = 0; i < total; i++) {
    const page = layout.pages[i];
    if (i > 0) {
      doc.addPage([W, H], orientation);
    }
    if (pageColor) {
      doc.setFillColor(pageColor[0], pageColor[1], pageColor[2]);
      doc.rect(0, 0, W, H, "F");
    }

    // scene px → device px at the requested DPI, within the pixel budget
    let renderScale = (layout.scale * opts.dpi) / 96;
    const pixels =
      page.region.width * page.region.height * renderScale * renderScale;
    if (pixels > MAX_PAGE_PIXELS) {
      renderScale *= Math.sqrt(MAX_PAGE_PIXELS / pixels);
    }

    const canvas = await renderRegion(src, page.region, renderScale, opts);
    const imgW = page.region.width * MM_PER_PX * layout.scale;
    const imgH = page.region.height * MM_PER_PX * layout.scale;
    const data = useJpeg
      ? canvas.toDataURL("image/jpeg", 0.92)
      : canvas.toDataURL("image/png");
    doc.addImage(
      data,
      useJpeg ? "JPEG" : "PNG",
      M,
      M,
      imgW,
      imgH,
      undefined,
      "FAST",
    );
    // release the page bitmap early
    canvas.width = canvas.height = 0;

    if (opts.pageNumbers && total > 1 && M >= 4) {
      doc.setFontSize(8);
      doc.setTextColor(pageColor && opts.darkMode ? 200 : 120);
      const label =
        layout.mode === "tiled"
          ? `Page ${i + 1} of ${total}  ·  row ${page.row + 1}, col ${
              page.col + 1
            }`
          : `Page ${i + 1} of ${total}`;
      doc.text(label, W / 2, H - M / 2, {
        align: "center",
        baseline: "middle",
      });
    }

    onProgress?.(i + 1, total);
    // yield so the UI can repaint progress
    await new Promise((r) => setTimeout(r, 0));
  }

  return doc.output("blob");
};

export const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};
