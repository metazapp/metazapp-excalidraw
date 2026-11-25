/**
 * Metazapp Excalidraw — "Export to PDF" dialog.
 */
import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import { FilledButton } from "@excalidraw/excalidraw/components/FilledButton";
import { useEffect, useMemo, useState } from "react";

import { exportScene } from "@excalidraw/excalidraw";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import {
  computePdfLayout,
  PAPER_SIZES,
  type LayoutMode,
  type Orientation,
  type PaperId,
} from "../pdf/pdfLayout";
import {
  downloadBlob,
  exportToPdf,
  getExportElements,
  measureContent,
} from "../pdf/exportToPdf";

import "./PdfExportDialog.scss";

const PREVIEW_BOX = 320;

const MARGINS = [
  { label: "None", value: 0 },
  { label: "Narrow (5 mm)", value: 5 },
  { label: "Normal (10 mm)", value: 10 },
  { label: "Wide (20 mm)", value: 20 },
];

const QUALITY = [
  { label: "Draft · 150 dpi", value: 150 },
  { label: "Standard · 200 dpi", value: 200 },
  { label: "Print · 300 dpi", value: 300 },
];

type Props = {
  excalidrawAPI: ExcalidrawImperativeAPI;
  onClose: () => void;
};

export const PdfExportDialog = ({ excalidrawAPI, onClose }: Props) => {
  // snapshot the scene once when the dialog opens
  const source = useMemo(
    () => ({
      elements: excalidrawAPI.getSceneElements(),
      appState: excalidrawAPI.getAppState(),
      files: excalidrawAPI.getFiles(),
    }),
    [excalidrawAPI],
  );
  const hasSelection = useMemo(
    () =>
      source.elements.some((el) => source.appState.selectedElementIds[el.id]),
    [source],
  );

  const [paper, setPaper] = useState<PaperId>("a4");
  const [orientation, setOrientation] = useState<Orientation>("auto");
  const [mode, setMode] = useState<LayoutMode>("auto");
  const [scalePct, setScalePct] = useState(100);
  const [marginMm, setMarginMm] = useState(10);
  const [dpi, setDpi] = useState(200);
  const [background, setBackground] = useState(
    source.appState.exportBackground,
  );
  const [darkMode, setDarkMode] = useState(source.appState.exportWithDarkMode);
  const [selectedOnly, setSelectedOnly] = useState(hasSelection);
  const [skipBlank, setSkipBlank] = useState(true);
  const [pageNumbers, setPageNumbers] = useState(true);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const elements = useMemo(
    () => getExportElements(source.elements, source.appState, selectedOnly),
    [source, selectedOnly],
  );
  const measured = useMemo(() => measureContent(elements), [elements]);

  const layout = useMemo(
    () =>
      measured
        ? computePdfLayout({
            content: measured.content,
            occupied: measured.occupied,
            paper,
            orientation,
            mode,
            scale: scalePct / 100,
            marginMm,
            skipBlankPages: skipBlank,
          })
        : null,
    [measured, paper, orientation, mode, scalePct, marginMm, skipBlank],
  );

  // ---- preview ------------------------------------------------------------
  // callback ref: the Dialog mounts its content in a portal after first render
  const [previewEl, setPreviewEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!layout || !previewEl) {
      return;
    }
    let cancelled = false;
    const g = layout.gridRect;
    const scale = PREVIEW_BOX / Math.max(g.width, g.height);
    exportScene({
      type: "canvas",
      data: { elements, appState: source.appState, files: source.files },
      config: {
        x: g.x,
        y: g.y,
        width: g.width,
        height: g.height,
        origin: "canvas",
        fit: "none",
        padding: 0,
        scale,
        theme: darkMode ? "dark" : "light",
        canvasBackgroundColor: background ? undefined : false,
      },
    })
      .then((canvas) => {
        if (cancelled) {
          return;
        }
        canvas.className = "PdfExport__previewCanvas";
        previewEl.replaceChildren(canvas);
      })
      .catch((e) => console.warn("PDF preview failed", e));
    return () => {
      cancelled = true;
    };
  }, [layout, elements, source, darkMode, background, previewEl]);

  const overlay = useMemo(() => {
    if (!layout) {
      return null;
    }
    const g = layout.gridRect;
    const s = PREVIEW_BOX / Math.max(g.width, g.height);
    const kept = new Set(layout.pages.map((p) => `${p.row}:${p.col}`));
    const tiles = [];
    const tileW = g.width / layout.cols;
    const tileH = g.height / layout.rows;
    let n = 0;
    for (let row = 0; row < layout.rows; row++) {
      for (let col = 0; col < layout.cols; col++) {
        const on = kept.has(`${row}:${col}`);
        if (on) {
          n++;
        }
        tiles.push(
          <g key={`${row}:${col}`} className={on ? "" : "is-skipped"}>
            <rect
              x={col * tileW * s}
              y={row * tileH * s}
              width={tileW * s}
              height={tileH * s}
            />
            {layout.pages.length > 1 && on && (
              <text x={col * tileW * s + 6} y={row * tileH * s + 14}>
                {n}
              </text>
            )}
          </g>,
        );
      }
    }
    return (
      <svg
        className="PdfExport__overlay"
        width={g.width * s}
        height={g.height * s}
      >
        {tiles}
      </svg>
    );
  }, [layout]);

  // ---- export -------------------------------------------------------------
  const onExport = async () => {
    if (!layout) {
      return;
    }
    setError(null);
    setProgress("Preparing…");
    try {
      const name = excalidrawAPI.getName() || "drawing";
      const blob = await exportToPdf(
        { elements, appState: source.appState, files: source.files },
        layout,
        { dpi, background, darkMode, pageNumbers, title: name },
        (done, total) => setProgress(`Rendering page ${done} of ${total}…`),
      );
      downloadBlob(blob, `${name}.pdf`);
      setProgress(null);
      onClose();
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "PDF export failed");
      setProgress(null);
    }
  };

  const paperLabel =
    paper === "fit"
      ? `${Math.round(layout?.pageWidthMm ?? 0)}×${Math.round(
          layout?.pageHeightMm ?? 0,
        )} mm`
      : `${PAPER_SIZES[paper].label} ${layout?.orientation ?? ""}`;

  return (
    <Dialog
      onCloseRequest={onClose}
      title="Export to PDF"
      size="wide"
      className="PdfExport"
    >
      {!layout ? (
        <p className="PdfExport__empty">
          The canvas is empty — draw something first.
        </p>
      ) : (
        <div className="PdfExport__body">
          <div className="PdfExport__previewCol">
            <div className="PdfExport__preview">
              <div ref={setPreviewEl} />
              {overlay}
            </div>
            <div className="PdfExport__summary">
              <strong>
                {layout.pages.length} page{layout.pages.length > 1 ? "s" : ""}
              </strong>{" "}
              · {paperLabel} · {Math.round(layout.scale * 100)}% scale
              {layout.totalTiles > layout.pages.length && (
                <> · {layout.totalTiles - layout.pages.length} blank skipped</>
              )}
            </div>
          </div>

          <div className="PdfExport__settings">
            <label>
              <span>Paper</span>
              <select
                value={paper}
                onChange={(e) => setPaper(e.target.value as PaperId)}
              >
                {Object.entries(PAPER_SIZES).map(([id, p]) => (
                  <option key={id} value={id}>
                    {p.label} ({p.w} × {p.h} mm)
                  </option>
                ))}
                <option value="fit">Fit to drawing (single page)</option>
              </select>
            </label>

            {paper !== "fit" && (
              <>
                <label>
                  <span>Orientation</span>
                  <select
                    value={orientation}
                    onChange={(e) =>
                      setOrientation(e.target.value as Orientation)
                    }
                  >
                    <option value="auto">Auto (best fit)</option>
                    <option value="portrait">Portrait</option>
                    <option value="landscape">Landscape</option>
                  </select>
                </label>
                <label>
                  <span>Layout</span>
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as LayoutMode)}
                  >
                    <option value="auto">Auto (readable, fewest pages)</option>
                    <option value="single">Fit on one page</option>
                    <option value="tiled">Multiple pages at fixed scale</option>
                  </select>
                </label>
              </>
            )}

            {(mode === "tiled" || paper === "fit") && (
              <label>
                <span>Scale</span>
                <div className="PdfExport__scale">
                  <input
                    type="range"
                    min={10}
                    max={300}
                    step={5}
                    value={scalePct}
                    onChange={(e) => setScalePct(Number(e.target.value))}
                  />
                  <input
                    type="number"
                    min={5}
                    max={1000}
                    value={scalePct}
                    onChange={(e) =>
                      setScalePct(Math.max(5, Number(e.target.value) || 100))
                    }
                  />
                  %
                </div>
              </label>
            )}

            <label>
              <span>Margins</span>
              <select
                value={marginMm}
                onChange={(e) => setMarginMm(Number(e.target.value))}
              >
                {MARGINS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Quality</span>
              <select
                value={dpi}
                onChange={(e) => setDpi(Number(e.target.value))}
              >
                {QUALITY.map((q) => (
                  <option key={q.value} value={q.value}>
                    {q.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="PdfExport__checks">
              {hasSelection && (
                <label>
                  <input
                    type="checkbox"
                    checked={selectedOnly}
                    onChange={(e) => setSelectedOnly(e.target.checked)}
                  />
                  Only selected elements
                </label>
              )}
              <label>
                <input
                  type="checkbox"
                  checked={background}
                  onChange={(e) => setBackground(e.target.checked)}
                />
                Canvas background
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={darkMode}
                  onChange={(e) => setDarkMode(e.target.checked)}
                />
                Dark mode
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={skipBlank}
                  onChange={(e) => setSkipBlank(e.target.checked)}
                />
                Skip blank pages
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={pageNumbers}
                  onChange={(e) => setPageNumbers(e.target.checked)}
                />
                Page numbers
              </label>
            </div>

            {error && <div className="PdfExport__error">{error}</div>}

            <FilledButton
              size="large"
              fullWidth
              label="Export PDF"
              status={progress ? "loading" : null}
              disabled={!!progress}
              onClick={onExport}
            >
              {progress ?? "Export PDF"}
            </FilledButton>
          </div>
        </div>
      )}
    </Dialog>
  );
};
