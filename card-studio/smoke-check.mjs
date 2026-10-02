import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("./public/index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("./public/app.js", import.meta.url), "utf8");

new vm.Script(app);

const requiredIds = [
  "preview","cardList","cardSearch","templateFilter","sortCards","templateCards",
  "dynamicStats","description","textTarget","textSize","textColor","textAlign","textBold","applyTextAll",
  "aiPrompt","aiStyle","aiQuality","aiGenerate","aiRedraw","apiKeyInput","saveApiKey","apiKeyStatus",
  "assetList","customAssetList","skinList","projectExport","projectImport","projectFile",
  "batchImages","batchAI","batchImageFiles","uploadAssetBtn","customAssetFile",
  "batchRename","exportManifest","exportJsonList","batchPngZip","batchPdf","batchPdfTop","exportCard"
];

const missing = requiredIds.filter((id) => !html.includes('id="' + id + '"'));
if (missing.length) throw new Error("Missing required DOM ids: " + missing.join(", "));

for (const lib of ["papaparse", "xlsx", "html-to-image", "jspdf", "jszip"]) {
  if (!html.toLowerCase().includes(lib)) throw new Error("Missing browser dependency: " + lib);
}

const badSelectors = app.split("\n").filter((line) => {
  const t = line.trimStart();
  return t.startsWith('$("[data-form]").forEach') || t.startsWith('$("[data-color]").forEach');
});
if (badSelectors.length) throw new Error("querySelector used where querySelectorAll helper is required.");

for (const id of [
  "projectExport","projectImport","batchImages","batchAI","uploadAssetBtn","batchRename","batchPngZip",
  "saveApiKey","aiRedraw","applyTextAll"
]) {
  if (!app.includes('$("#' + id + '")')) throw new Error("Missing handler reference for #" + id);
}

for (const marker of ["indexedDB.open", "/api/settings/api-key", "/api/redraw-image"]) {
  if (!app.includes(marker)) throw new Error("Missing implemented feature marker: " + marker);
}

console.log("Card Studio smoke check passed.");
