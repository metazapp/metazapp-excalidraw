# Notice

**Metazapp Excalidraw** is a modified version of [Excalidraw](https://github.com/excalidraw/excalidraw), maintained by Metazapp Solutions Pvt Ltd.

Excalidraw is licensed under the MIT License — Copyright (c) 2020 Excalidraw. The original license is kept unchanged in [`LICENSE`](./LICENSE) and applies to this project.

"Excalidraw" and the Excalidraw logo are names/marks of the original project. This fork is not affiliated with or endorsed by the Excalidraw team.

## Metazapp additions

- **Export to PDF** (main menu → _Export to PDF…_): exports the used canvas
  area with automatic page setup — picks orientation, fits on one page when
  readable, otherwise tiles onto the fewest pages and scales up to fill them,
  skipping blank pages. Code: `excalidraw-app/pdf/`,
  `excalidraw-app/components/PdfExportDialog.tsx`.

## Keeping in sync with upstream

```bash
git fetch upstream
git merge upstream/master
node scripts/metazapp-rebrand.cjs   # re-apply branding if upstream changed those files
```
