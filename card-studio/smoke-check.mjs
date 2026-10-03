import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("./public/index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("./public/app.js", import.meta.url), "utf8");
const server = fs.readFileSync(new URL("./server.mjs", import.meta.url), "utf8");
const pkg = JSON.parse(fs.readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const launcher = fs.readFileSync(new URL("./安装并启动.bat", import.meta.url), "utf8");
const quickLauncher = fs.readFileSync(new URL("./启动卡牌工具.bat", import.meta.url), "utf8");

new vm.Script(app);

const requiredIds = [
  "projectName","preview","cardList","cardSearch","templateFilter","factionFilter","rarityFilter","sortCards","templateCards",
  "dynamicStats","description","textTarget","textSize","textColor","textAlign","textBold","applyTextAll",
  "aiPrompt","aiStylePreset","aiStyle","resetAiStyle","aiQuality","aiGenerate","aiRedraw","apiKeyInput","saveApiKey","apiKeyStatus","artFocusX","artFocusY","artZoom","autoPalette","setStyleReference","uploadStyleReference","styleReferenceFile","clearStyleReference","styleReferenceStatus",
  "assetList","customAssetList","skinList","projectExport","projectImport","projectFile",
  "batchImages","batchAI","batchImageFiles","smartFrameBtn","smartFrameFile","uploadAssetBtn","customAssetFile",
  "batchRename","exportManifest","exportJsonList","batchPngZip","batchJpgZip",
  "sheetSize","cropMarks","singlePdf","batchPdf","batchPdfTop","exportCard",
  "safeMode","layoutMode","layoutQuickButton","layoutPanel","addImageElement","freeImageFile","imageLabelTools","imageLabelPosition","addImageLabel","detachImageLabel","addTextElement","addNumberElement","elX","elY","elW","elH","elR","elZ","elOpacity","elOpacityValue","selectedLayerName","toggleElementVisibility","layerUp","layerDown","layerList","resetLayout","copyLayoutAll",
  "openCardSearch","cardSearchModal","librarySearch","libraryResults","tagCloud","exportTTS",
  "markRuleTerm","openRuleTerms","termQuickColor","termQuickList","ruleTermsModal","termSearch","termList","termName","termColor","termCategory","termTags","termDescription","saveRuleTerm","insertRuleTerm"
];

if (!html.includes("v2.2.0 · 独立图层自由布局")) throw new Error("Visible 2.2.0 version badge is missing.");
if (!html.includes("自由布局（独立图层）")) throw new Error("High-visibility free-layout wording is missing.");
if (!html.includes("styles.css?v=2.2.0") || !html.includes("app.js?v=2.2.0")) throw new Error("2.2.0 browser cache busting is missing.");
if (!launcher.includes("CARD_STUDIO_PORT=8793") || !quickLauncher.includes("CARD_STUDIO_PORT=8793")) throw new Error("Launchers must use the dedicated 2.2.0 port.");
if (!launcher.includes("?v=2.2.0") || !quickLauncher.includes("?v=2.2.0")) throw new Error("Launchers must open the cache-busted 2.2.0 URL.");
if (pkg.version !== "2.2.0") throw new Error("Package version must be 2.2.0.");

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
  "projectExport","projectImport","batchImages","batchAI","smartFrameBtn","uploadAssetBtn","autoPalette","setStyleReference","uploadStyleReference","clearStyleReference","presetShowcase","presetClassicFrame","batchRename",
  "batchPngZip","batchJpgZip","saveApiKey","aiRedraw","resetAiStyle","applyTextAll","sheetSize","cropMarks","layoutMode","addImageElement","addImageLabel","detachImageLabel","addTextElement","addNumberElement","toggleElementVisibility","layerUp","layerDown","resetLayout","openCardSearch","exportTTS","markRuleTerm","openRuleTerms","saveRuleTerm","insertRuleTerm"
]) {
  if (!app.includes('$("#' + id + '")')) throw new Error("Missing handler reference for #" + id);
}

for (const marker of ["indexedDB.open", "projectPayload", "customTemplates", "userAssets", "SHEETS", "factionFilter", "rarityFilter", "DEFAULT_LAYOUT", "stat_attack", "stat_health", "rarityText", "allLayerModels", "renderLayerPanel", "selectedModel", "opacity", "visible", "extraElements", "addFreeImage", "addLabelToSelectedImage", "parentId", "renderCardLibrary", "ttsCard", "renderRichText", "extractRuleTerms", "ruleTerms", "byTerm", "botanical", "canvas", "classical", "DEFAULT_AI_STYLE", "AI_STYLE_PRESETS", "makeSmartFrameDataUrl", "applyCompositionPreset", "paletteFromArt", "autoFitText", "aiReferenceImage", "requestGeneratedArt"]) {
  if (!app.includes(marker)) throw new Error("Missing implemented feature marker: " + marker);
}

for (const endpoint of ["/api/health","/api/settings/api-key","/api/generate-image","/api/generate-image-reference","/api/redraw-image"]) {
  if (!server.includes(endpoint)) throw new Error("Missing server endpoint: " + endpoint);
}

if (!server.includes('app.use("/vendor"')) throw new Error("node_modules vendor route is missing.");
if (!server.includes('"127.0.0.1"')) throw new Error("Server must bind to localhost only.");
if (!server.includes("OPENAI_IMAGE_EDIT_MODEL")) throw new Error("Dedicated image edit model setting is missing.");
if (!server.includes("DEFAULT_CARD_ART_DIRECTION")) throw new Error("Production card AI art direction is missing.");
if (!server.includes('"gpt-image-2.5-sunburst"')) throw new Error("Quality-first GPT Image 2.5 Sunburst default is missing.");
if (!server.includes('"xhigh","max"')) throw new Error("XHIGH/MAX AI quality support is missing.");
if (!server.includes('1024x1392')) throw new Error("Card-aspect AI output size is missing.");
if (!server.includes('APP_VERSION = "2.2.0"')) throw new Error("Server runtime version marker is missing.");

if (!app.includes("version:7")) throw new Error("Independent-layer project schema version is missing.");
if (!app.includes("function escapeRegExp") || app.includes("\\function renderRichText")) throw new Error("Rule-term regex escaping regression.");
if (!html.includes("每个字段独立")) throw new Error("Independent-module guidance is missing.");
if (!html.includes("智能卡框导入") || !html.includes("全幅插画 · 竞技卡")) throw new Error("Production layout or smart-frame UI is missing.");
console.log("Card Studio smoke check passed.");

if (app.includes('$("#preview .layout-node.selected").forEach')) throw new Error("single-selector helper used for layout selection list");
