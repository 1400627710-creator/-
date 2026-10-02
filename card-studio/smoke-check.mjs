import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("./public/index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("./public/app.js", import.meta.url), "utf8");
const server = fs.readFileSync(new URL("./server.mjs", import.meta.url), "utf8");
const pkg = JSON.parse(fs.readFileSync(new URL("./package.json", import.meta.url), "utf8"));

new vm.Script(app);

const requiredIds = [
  "projectName","preview","cardList","cardSearch","templateFilter","factionFilter","rarityFilter","sortCards","templateCards",
  "dynamicStats","description","textTarget","textSize","textColor","textAlign","textBold","applyTextAll",
  "aiPrompt","aiStyle","aiQuality","aiGenerate","aiRedraw","apiKeyInput","saveApiKey","apiKeyStatus",
  "assetList","customAssetList","skinList","projectExport","projectImport","projectFile",
  "batchImages","batchAI","batchImageFiles","uploadAssetBtn","customAssetFile",
  "batchRename","exportManifest","exportJsonList","batchPngZip","batchJpgZip",
  "sheetSize","cropMarks","singlePdf","batchPdf","batchPdfTop","exportCard",
  "safeMode","layoutMode","layoutQuickButton","layoutPanel","addTextElement","addNumberElement","elX","elY","elW","elH","elR","elZ","resetLayout","copyLayoutAll",
  "openCardSearch","cardSearchModal","librarySearch","libraryResults","tagCloud","exportTTS"
];

const missing = requiredIds.filter((id) => !html.includes('id="' + id + '"'));
if (missing.length) throw new Error("Missing required DOM ids: " + missing.join(", "));

const referencedIds = [...app.matchAll(/\$\("#([A-Za-z0-9_-]+)"\)/g)].map((m) => m[1]);
const dangling = [...new Set(referencedIds)].filter((id) => !html.includes('id="' + id + '"'));
if (dangling.length) throw new Error("App references missing DOM ids: " + dangling.join(", "));

for (const dep of ["papaparse","xlsx","html-to-image","jspdf","jszip"]) {
  if (!pkg.dependencies?.[dep]) throw new Error("Missing npm dependency: " + dep);
  if (!html.toLowerCase().includes("/vendor/" + dep.toLowerCase())) throw new Error("Browser dependency is not served locally: " + dep);
}

const badSelectors = app.split("\n").filter((line) => {
  const t = line.trimStart();
  return t.startsWith('$("[data-form]").forEach') || t.startsWith('$("[data-color]").forEach');
});
if (badSelectors.length) throw new Error("querySelector used where querySelectorAll helper is required.");

for (const id of [
  "projectExport","projectImport","batchImages","batchAI","uploadAssetBtn","batchRename",
  "batchPngZip","batchJpgZip","saveApiKey","aiRedraw","applyTextAll","sheetSize","cropMarks","layoutMode","addTextElement","addNumberElement","resetLayout","openCardSearch","exportTTS"
]) {
  if (!app.includes('$("#' + id + '")')) throw new Error("Missing handler reference for #" + id);
}

for (const marker of ["indexedDB.open", "projectPayload", "customTemplates", "userAssets", "SHEETS", "factionFilter", "rarityFilter", "DEFAULT_LAYOUT", "extraElements", "renderCardLibrary", "ttsCard"]) {
  if (!app.includes(marker)) throw new Error("Missing implemented feature marker: " + marker);
}

for (const endpoint of ["/api/health","/api/settings/api-key","/api/generate-image","/api/redraw-image"]) {
  if (!server.includes(endpoint)) throw new Error("Missing server endpoint: " + endpoint);
}

if (!server.includes('app.use("/vendor"')) throw new Error("node_modules vendor route is missing.");
if (!server.includes('"127.0.0.1"')) throw new Error("Server must bind to localhost only.");
if (!server.includes("OPENAI_IMAGE_EDIT_MODEL")) throw new Error("Dedicated image edit model setting is missing.");

console.log("Card Studio smoke check passed.");
