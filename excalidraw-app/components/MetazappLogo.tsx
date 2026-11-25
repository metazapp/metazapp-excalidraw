// Metazapp Excalidraw brand mark (icon + wordmark).
// Icon source: branding/logo.svg (copied to public/favicon.svg by
// `desktop/scripts/generate-icons.mjs`).
export const MetazappLogo = () => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: "0.75rem",
    }}
  >
    <img
      src="/favicon.svg"
      alt=""
      width={56}
      height={56}
      style={{ borderRadius: 14 }}
    />
    <span
      style={{
        fontFamily: "Assistant, system-ui, sans-serif",
        fontSize: "2.1rem",
        lineHeight: 1,
        color: "var(--color-primary, #1d3f8f)",
        whiteSpace: "nowrap",
      }}
    >
      <strong style={{ fontWeight: 700 }}>Metazapp</strong>{" "}
      <span style={{ fontWeight: 400, opacity: 0.8 }}>Excalidraw</span>
    </span>
  </div>
);
