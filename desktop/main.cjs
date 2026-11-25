// Metazapp Excalidraw — Electron shell.
// Serves the production web build from a private `app://` origin so that
// localStorage / IndexedDB (your drawings) persist between launches.
const { app, BrowserWindow, Menu, net, protocol, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const ORIGIN = "app://metazapp";
const WEB_ROOT = app.isPackaged
  ? path.join(process.resourcesPath, "web")
  : path.join(__dirname, "..", "excalidraw-app", "build");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      allowServiceWorkers: true,
      stream: true,
    },
  },
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let mainWindow = null;

const resolveFile = (urlPath) => {
  const rel = decodeURIComponent(urlPath).replace(/^\/+/, "");
  const file = path.normalize(path.join(WEB_ROOT, rel));
  if (!file.startsWith(WEB_ROOT)) {
    return null;
  }
  try {
    if (fs.statSync(file).isFile()) {
      return file;
    }
  } catch {
    // fall through to SPA index
  }
  return path.join(WEB_ROOT, "index.html");
};

const openFileFromArgs = (argv) => {
  const file = argv.find((a) => /\.excalidraw$/i.test(a));
  if (!file || !mainWindow) {
    return;
  }
  try {
    const json = fs.readFileSync(file, "utf8");
    // hand the scene to the app the same way a drag & drop would
    mainWindow.webContents.executeJavaScript(`(() => {
      const file = new File([${JSON.stringify(json)}], ${JSON.stringify(
      path.basename(file),
    )}, { type: "application/json" });
      const dt = new DataTransfer(); dt.items.add(file);
      const target = document.querySelector(".excalidraw") || document.body;
      target.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true, clientX: 200, clientY: 200 }));
    })()`);
  } catch (e) {
    console.error("Failed to open", file, e);
  }
};

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 560,
    title: "Metazapp Excalidraw",
    backgroundColor: "#ffffff",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      spellcheck: true,
    },
  });

  // external links open in the default browser, not inside the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(ORIGIN)) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) {
        shell.openExternal(url);
      }
    }
  });

  mainWindow.loadURL(`${ORIGIN}/`);
  mainWindow.webContents.once("did-finish-load", () => {
    setTimeout(() => openFileFromArgs(process.argv), 800);
  });
};

app.on("second-instance", (_event, argv) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
    openFileFromArgs(argv);
  }
});

app.whenReady().then(() => {
  protocol.handle("app", (request) => {
    const file = resolveFile(new URL(request.url).pathname);
    if (!file) {
      return new Response("Forbidden", { status: 403 });
    }
    return net.fetch(pathToFileURL(file).toString());
  });

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "View",
        submenu: [
          { role: "reload" },
          { role: "toggleDevTools" },
          { type: "separator" },
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { type: "separator" },
          { role: "togglefullscreen" },
        ],
      },
      { role: "windowMenu" },
    ]),
  );

  createWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});
