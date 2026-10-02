import fs from "node:fs";

const html = fs.readFileSync(new URL("./public/index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("./public/app.js", import.meta.url), "utf8");

const requiredIds = [
  "preview","cardList","cardSearch","templateFilter","sortCards","templateCards",
  "dynamicStats","description","aiPrompt","aiStyle","assetList","customAssetList",
  "skinList","projectExport","projectImport","projectFile","batchImages","batchAI",
  "batchImageFiles","uploadAssetBtn","customAssetFile","batchRename","exportManifest",
  "exportJsonList","batchPngZip","batchPdf","batchPdfTop","exportCard"
];

const missing = requiredIds.filter((id) => !html.includes('id="' + id + '"'));
if (missing.length) {
  throw new Error("Missing required DOM ids: " + missing.join(", "));
}
if (!html.includes("jszip.min.js")) {
  throw new Error("JSZip CDN script is missing.");
}
if (app.includes('$("[data-form]").forEach') || app.includes('$("[data-color]").forEach')) {
  throw new Error("querySelector used where querySelectorAll helper is required.");
}
for (const id of ["projectExport","projectImport","batchImages","batchAI","uploadAssetBtn","batchRename","batchPngZip"]) {
  if (!app.includes('$("#' + id + '")')) {
    throw new Error("Missing handler reference for #" + id);
  }
}
console.log("Card Studio smoke check passed.");
