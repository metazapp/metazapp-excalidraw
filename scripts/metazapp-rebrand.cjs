// Re-applies Metazapp branding. Safe to re-run after merging upstream Excalidraw.
// Keeps LICENSE (MIT, Copyright (c) 2020 Excalidraw) untouched, as required.
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const BRAND = "Metazapp Excalidraw";

function edit(rel, fn) {
  const p = path.join(root, rel);
  const before = fs.readFileSync(p, "utf8");
  const after = fn(before);
  if (after !== before) {
    fs.writeFileSync(p, after);
    console.log("updated", rel);
  } else {
    console.log("unchanged", rel);
  }
}

// 1. index.html: title + meta/og tags (skip comments and Excalidraw+ refs)
edit("excalidraw-app/index.html", (s) =>
  s
    .split("\n")
    .map((line) => {
      if (line.includes("<!--") || line.trim().startsWith("//")) return line;
      if (line.includes("Metazapp")) return line;
      return line.replace(/Excalidraw(?![+\w])/g, BRAND);
    })
    .join("\n"),
);

// 2. PWA manifest in vite config
edit("excalidraw-app/vite.config.mts", (s) =>
  s
    .replace(/short_name: "Excalidraw"/, 'short_name: "MZ Excalidraw"')
    .replace(/name: "Excalidraw"/, `name: "${BRAND}"`)
    .replace(
      /"Excalidraw is a whiteboard tool/,
      `"${BRAND} (based on Excalidraw) is a whiteboard tool`,
    ),
);

// 3. package names (app + monorepo root only; library packages keep @excalidraw/* names)
edit("package.json", (s) =>
  s.replace(
    /"name": "excalidraw-monorepo"/,
    '"name": "metazapp-excalidraw-monorepo"',
  ),
);
edit("excalidraw-app/package.json", (s) =>
  s.replace(/"name": "excalidraw-app"/, '"name": "metazapp-excalidraw-app"'),
);
