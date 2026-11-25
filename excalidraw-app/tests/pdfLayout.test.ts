import { computePdfLayout, MM_PER_PX, PAPER_SIZES } from "../pdf/pdfLayout";

const mm = (px: number) => px * MM_PER_PX;
const px = (mmVal: number) => mmVal / MM_PER_PX;

describe("computePdfLayout", () => {
  it("fits a small drawing on one page and picks the matching orientation", () => {
    // wide drawing → landscape
    const layout = computePdfLayout({
      content: { x: 0, y: 0, width: 800, height: 300 },
      paper: "a4",
      orientation: "auto",
      mode: "auto",
      scale: 1,
      marginMm: 10,
    });
    expect(layout.pages).toHaveLength(1);
    expect(layout.orientation).toBe("landscape");
    expect(layout.pageWidthMm).toBe(PAPER_SIZES.a4.h);
    // content fills the printable width
    expect(mm(800) * layout.scale).toBeCloseTo(297 - 20, 5);
  });

  it("uses portrait for tall drawings", () => {
    const layout = computePdfLayout({
      content: { x: 0, y: 0, width: 300, height: 900 },
      paper: "a4",
      orientation: "auto",
      mode: "auto",
      scale: 1,
      marginMm: 10,
    });
    expect(layout.orientation).toBe("portrait");
  });

  it("splits a huge drawing into the fewest readable pages and fills them", () => {
    const layout = computePdfLayout({
      content: { x: 0, y: 0, width: 6000, height: 2000 },
      paper: "a4",
      orientation: "auto",
      mode: "auto",
      scale: 1,
      marginMm: 10,
      skipBlankPages: false,
    });
    expect(layout.mode).toBe("tiled");
    expect(layout.scale).toBeGreaterThanOrEqual(0.5);
    // grid covers the content on both axes
    expect(layout.gridRect.width).toBeGreaterThanOrEqual(6000 - 1e-6);
    expect(layout.gridRect.height).toBeGreaterThanOrEqual(2000 - 1e-6);
    // and is tight on at least one axis (scaled up to fill pages)
    const tightW = Math.abs(layout.gridRect.width - 6000) < 1e-6;
    const tightH = Math.abs(layout.gridRect.height - 2000) < 1e-6;
    expect(tightW || tightH).toBe(true);
    // no orientation does it with fewer pages at ≥50%
    for (const o of ["portrait", "landscape"] as const) {
      const alt = computePdfLayout({
        content: { x: 0, y: 0, width: 6000, height: 2000 },
        paper: "a4",
        orientation: o,
        mode: "auto",
        scale: 1,
        marginMm: 10,
        skipBlankPages: false,
      });
      expect(alt.pages.length).toBeGreaterThanOrEqual(layout.pages.length);
    }
  });

  it("tiles at an exact user scale", () => {
    const layout = computePdfLayout({
      content: { x: 0, y: 0, width: px(400), height: px(250) },
      paper: "a4",
      orientation: "portrait",
      mode: "tiled",
      scale: 1,
      marginMm: 10,
      skipBlankPages: false,
    });
    expect(layout.scale).toBe(1);
    // 400mm / 190mm → 3 cols, 250mm / 277mm → 1 row
    expect(layout.cols).toBe(3);
    expect(layout.rows).toBe(1);
  });

  it("skips tiles with nothing on them", () => {
    const layout = computePdfLayout({
      content: { x: 0, y: 0, width: px(400), height: px(500) },
      occupied: [
        { x: 0, y: 0, width: 10, height: 10 },
        { x: px(390), y: px(490), width: 10, height: 10 },
      ],
      paper: "a4",
      orientation: "portrait",
      mode: "tiled",
      scale: 1,
      marginMm: 10,
    });
    expect(layout.totalTiles).toBeGreaterThan(2);
    expect(layout.pages).toHaveLength(2);
  });

  it("fit-to-drawing page wraps the content plus margins", () => {
    const layout = computePdfLayout({
      content: { x: 0, y: 0, width: 960, height: 480 },
      paper: "fit",
      orientation: "auto",
      mode: "auto",
      scale: 1,
      marginMm: 5,
    });
    expect(layout.pages).toHaveLength(1);
    expect(layout.pageWidthMm).toBeCloseTo(mm(960) + 10, 5);
    expect(layout.pageHeightMm).toBeCloseTo(mm(480) + 10, 5);
  });
});
