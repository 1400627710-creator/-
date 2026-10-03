import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("./public/index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("./public/app.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("./public/styles.css", import.meta.url), "utf8");
const server = fs.readFileSync(new URL("./server.mjs", import.meta.url), "utf8");
const pkg = JSON.parse(fs.readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const launcher = fs.readFileSync(new URL("./安装并启动.bat", import.meta.url), "utf8");
const quickLauncher = fs.readFileSync(new URL("./启动卡牌工具.bat", import.meta.url), "utf8");

new vm.Script(app);

const requiredIds = [
  "projectName","preview","cardList","cardSearch","templateFilter","factionFilter","rarityFilter","sortCards","templateCards",
  "dynamicStats","description","textTarget","textSize","textColor","textAlign","textBold","applyTextAll",
  "aiPrompt","aiStylePreset","aiStyle","resetAiStyle","copyAiPrompt","copyRedrawPrompt","aiPromptPreview","artFocusX","artFocusY","artZoom","autoPalette",
  "assetList","customAssetList","skinList","projectExport","projectImport","projectFile",
  "batchImages","batchImageFiles","smartFrameBtn","smartFrameFile","uploadAssetBtn","customAssetFile",
  "batchRename","exportManifest","exportJsonList","batchPngZip","batchJpgZip",
  "sheetSize","cropMarks","singlePdf","batchPdf","batchPdfTop","exportCard",
  "safeMode","layoutMode","layoutQuickButton","rightModeTabs","layoutPanel","selectionCount",
  "alignLeft","alignHCenter","alignRight","alignTop","alignVCenter","alignBottom","distributeH","distributeV","selectAllLayers","lockAspect","snapEnabled",
  "addImageElement","freeImageFile","imageLabelTools","imageLabelPosition","addImageLabel","detachImageLabel","addTextElement","addNumberElement",
  "elX","elY","elW","elH","elR","elZ","elOpacity","elOpacityValue","selectedLayerName","toggleElementVisibility","toggleElementLock","layerUp","layerDown","bringFront","sendBack","layerList","resetLayout","copyLayoutAll",
  "openCardSearch","cardSearchModal","librarySearch","libraryResults","tagCloud","exportTTS",
  "markRuleTerm","openRuleTerms","openRuleTermsRules","termQuickColor","termQuickList","ruleTermsModal","termSearch","termList","termName","termColor","termCategory","termTags","termDescription","saveRuleTerm","insertRuleTerm"
];

if (!html.includes("v2.3.0 · 独立图层自由布局")) throw new Error("Visible 2.3.0 version badge is missing.");
if (!html.includes("自由布局（独立图层）")) throw new Error("High-visibility free-layout wording is missing.");
if (!html.includes("styles.css?v=2.3.0") || !html.includes("app.js?v=2.3.0")) throw new Error("2.3.0 browser cache busting is missing.");
if (!launcher.includes("CARD_STUDIO_PORT=8794") || !quickLauncher.includes("CARD_STUDIO_PORT=8794")) throw new Error("Launchers must use dedicated 2.3.0 port 8794.");
if (!launcher.includes("?v=2.3.0") || !quickLauncher.includes("?v=2.3.0")) throw new Error("Launchers must open cache-busted 2.3.0 URL.");
if (pkg.version !== "2.3.0") throw new Error("Package version must be 2.3.0.");

const missing = requiredIds.filter((id) => !html.includes('id="' + id + '"'));
if (missing.length) throw new Error("Missing required DOM ids: " + missing.join(", "));

const referencedIds = [...app.matchAll(/\$\("#([A-Za-z0-9_-]+)"\)/g)].map((m) => m[1]);
const dangling = [...new Set(referencedIds)].filter((id) => !html.includes('id="' + id + '"'));
if (dangling.length) throw new Error("App references missing DOM ids: " + dangling.join(", "));

const badSelectorLines = app.split("\n").filter((line) => {
  const t = line.trim();
  return /(^|[^$])\$\([^)]*\)\.forEach\(/.test(t);
});
if (badSelectorLines.length) throw new Error("Single-element selector used with forEach: " + badSelectorLines.join(" | "));

for (const dep of ["papaparse","xlsx","html-to-image","jspdf","jszip"]) {
  if (!pkg.dependencies?.[dep]) throw new Error("Missing npm dependency: " + dep);
  if (!html.toLowerCase().includes("/vendor/" + dep.toLowerCase())) throw new Error("Browser dependency is not served locally: " + dep);
}
for (const removed of ["openai","dotenv"]) if (pkg.dependencies?.[removed]) throw new Error("Obsolete external AI dependency remains: " + removed);

for (const id of [
  "projectExport","projectImport","batchImages","smartFrameBtn","uploadAssetBtn","autoPalette","copyAiPrompt","copyRedrawPrompt","presetShowcase","presetClassicFrame","batchRename",
  "batchPngZip","batchJpgZip","resetAiStyle","applyTextAll","sheetSize","cropMarks","layoutMode","addImageElement","addImageLabel","detachImageLabel","addTextElement","addNumberElement",
  "toggleElementVisibility","toggleElementLock","layerUp","layerDown","bringFront","sendBack","alignLeft","alignHCenter","alignRight","alignTop","alignVCenter","alignBottom","distributeH","distributeV","selectAllLayers",
  "resetLayout","openCardSearch","exportTTS","markRuleTerm","openRuleTerms","openRuleTermsRules","saveRuleTerm","insertRuleTerm"
]) {
  if (!app.includes('$("#' + id + '")')) throw new Error("Missing handler reference for #" + id);
}

for (const marker of [
  "indexedDB.open","projectPayload","customTemplates","userAssets","SHEETS","DEFAULT_LAYOUT","allLayerModels","renderLayerPanel","selectedModel","extraElements",
  "addFreeImage","addLabelToSelectedImage","renderCardLibrary","ttsCard","renderRichText","extractRuleTerms","ruleTerms",
  "DEFAULT_AI_STYLE","AI_STYLE_PRESETS","buildAiPrompt","refreshAiPromptPreview","makeSmartFrameDataUrl","applyCompositionPreset","paletteFromArt","autoFitText",
  "selectedElements","beginMarquee","selectionBounds","snappedMove","alignSelection","distributeSelection",
  "SKIN_THEME_KEYS","mergeThemeAppearance","themeAppearance","setToolMode","footerLeft","footerRight","setName","credit"
]) {
  if (!app.includes(marker)) throw new Error("Missing implemented feature marker: " + marker);
}

for (const group of ["content","text","layout","visual","rules","export"]) {
  if (!html.includes('data-tool-mode="' + group + '"') || !html.includes('data-tool-group="' + group + '"')) throw new Error("Missing focused workspace group: " + group);
}
if (!app.includes('$$("#rightModeTabs [data-tool-mode]").forEach') || !app.includes('$$(".right [data-tool-group]").forEach')) throw new Error("Workspace mode switch must iterate over all tabs and panels.");

for (const marker of ["marquee-box","selection-bounds","selection-group-resize","snap-guide","selected-primary"]) if (!css.includes(marker)) throw new Error("Missing free-editor CSS marker: " + marker);
if (!app.includes("mergeThemeAppearance(current().appearance,skin.appearance)")) throw new Error("Skin application must preserve frame/image asset references.");
if (!app.includes("themeAppearance(current().appearance)")) throw new Error("Saved skins must contain theme-only appearance state.");

for (const removed of [
  "apiKeyInput","saveApiKey","apiKeyStatus","aiQuality","aiGenerate","aiRedraw","batchAI",
  "setStyleReference","uploadStyleReference","styleReferenceFile","clearStyleReference","styleReferenceStatus"
]) {
  if (html.includes('id="' + removed + '"') || app.includes('$("#' + removed + '")')) throw new Error("Obsolete AI direct-connect control returned: " + removed);
}
for (const forbidden of ["/api/settings/api-key","/api/generate-image","/api/generate-image-reference","/api/redraw-image","OPENAI_API_KEY","new OpenAI","Authorization:\"Bearer"]) {
  if (server.includes(forbidden)) throw new Error("External AI provider / credential code must remain removed: " + forbidden);
}
if (!server.includes('/api/health')) throw new Error("Health endpoint is missing.");
if (!server.includes('app.use("/vendor"')) throw new Error("node_modules vendor route is missing.");
if (!server.includes('"127.0.0.1"')) throw new Error("Server must bind to localhost only.");
if (!server.includes('APP_VERSION = "2.3.0"')) throw new Error("Server runtime version marker is missing.");

if (!app.includes("version:7")) throw new Error("Independent-layer project schema version is missing.");
if (!app.includes("function escapeRegExp") || app.includes("\\function renderRichText")) throw new Error("Rule-term regex escaping regression.");
if (!html.includes("智能卡框导入") || !html.includes("全幅插画 · 竞技卡")) throw new Error("Production layout or smart-frame UI is missing.");
if (!html.includes('data-form="setName"') || !html.includes('data-form="credit"')) throw new Error("Collectible footer metadata fields are missing.");

console.log("Card Studio 2.3 smoke check passed.");
