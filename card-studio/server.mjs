import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const DEFAULT_CARD_ART_DIRECTION = [
  "Create production-ready collectible tabletop card artwork, not a generic poster.",
  "Use a premium hand-painted fantasy illustration aesthetic with intentional brushwork, rich material texture, atmospheric depth, controlled edges, and a clear value hierarchy.",
  "Compose for a portrait card around a 0.73 width-to-height ratio: one unmistakable focal subject, readable silhouette, strong gesture, and purposeful negative space.",
  "Keep the top 16 percent calmer and lower-detail for title and cost overlays; keep the bottom 27 percent calmer and darker or simpler for rules text. Do not place a face, weapon tip, or critical storytelling detail in those overlay-safe zones unless explicitly requested.",
  "Use cinematic but coherent lighting, foreground/midground/background separation, restrained color harmony, and enough local contrast around the focal subject to survive card-size printing.",
  "The image must remain visually strong when cropped full bleed. Avoid accidental tangencies at the card edges and avoid clutter behind text-safe areas.",
  "Never render typography, letters, numbers, logos, card borders, badges, watermarks, UI, or fake game text.",
  "Avoid plastic 3D rendering, cheap mobile-game gloss, muddy low-contrast detail, oversharpening, and flat vector graphics unless the requested style explicitly calls for them."
].join(" ");

const APP_VERSION = "2.2.0";
const app = express();
const root = dirname(fileURLToPath(import.meta.url));

app.use(express.json({ limit: "20mb" }));
app.use("/vendor", express.static(join(root, "node_modules")));
app.use(express.static(join(root, "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, version: APP_VERSION, aiConfigured: Boolean(process.env.OPENAI_API_KEY) });
});

function setEnvValue(key, value) {
  const envPath = join(root, ".env");
  let text = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const line = key + "=" + value;
  const re = new RegExp("^" + key + "=.*$", "m");
  text = re.test(text) ? text.replace(re, line) : (text.trimEnd() + (text.trim() ? "\n" : "") + line + "\n");
  writeFileSync(envPath, text, "utf8");
}

app.post("/api/settings/api-key", (req, res) => {
  const apiKey = String((req.body && req.body.apiKey) || "").trim();
  if (apiKey && apiKey.length < 20) {
    return res.status(400).json({ error: "API Key 看起来不完整。" });
  }
  process.env.OPENAI_API_KEY = apiKey;
  setEnvValue("OPENAI_API_KEY", apiKey);
  res.json({ ok: true, aiConfigured: Boolean(apiKey) });
});

app.post("/api/generate-image", async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({
      error: "尚未配置 AI Key。请在页面的“插画”区域填写并保存。"
    });
  }

  const body = req.body || {};
  const prompt = String(body.prompt || "").trim();
  const style = String(body.style || "").trim();
  const cardName = String(body.cardName || "").trim();
  const faction = String(body.faction || "").trim();
  const cardType = String(body.cardType || "").trim();
  const quality = ["low","medium","high","xhigh","max"].includes(body.quality) ? body.quality : "high";

  if (!prompt) {
    return res.status(400).json({ error: "请输入插画关键词。" });
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const fullPrompt = [
      "Create a vertical tabletop card illustration background.",
      DEFAULT_CARD_ART_DIRECTION,
      "No text, no letters, no logo, no border, no UI.",
      "Full-bleed artwork with a strong central focal point and readable silhouette.",
      "Leave calmer visual areas near the top and bottom for card text overlays.",
      cardType ? "Card template type: " + cardType + "." : "",
      cardName ? "Card subject: " + cardName + "." : "",
      faction ? "Faction mood: " + faction + "." : "",
      style ? "Unified set style: " + style + "." : "",
      "Scene request: " + prompt + "."
    ].filter(Boolean).join(" ");

    const result = await client.images.generate({
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-sunburst",
      prompt: fullPrompt,
      size: "1024x1392",
      quality,
      output_format: "png",
      background: "opaque"
    });

    const image = result.data && result.data[0];
    if (!image || !image.b64_json) {
      return res.status(502).json({ error: "图像服务没有返回图片。" });
    }

    res.json({
      image: "data:image/png;base64," + image.b64_json,
      revisedPrompt: image.revised_prompt || null
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error && error.message ? error.message : "AI 图片生成失败。"
    });
  }
});

app.post("/api/generate-image-reference", async (req, res) => {
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: "尚未配置 AI Key。" });
  const body=req.body||{},reference=String(body.reference||""),prompt=String(body.prompt||"").trim(),style=String(body.style||"").trim(),cardName=String(body.cardName||"").trim(),faction=String(body.faction||"").trim(),cardType=String(body.cardType||"").trim(),quality=["low","medium","high","xhigh","max"].includes(body.quality)?body.quality:"high";
  if(!reference.startsWith("data:image/"))return res.status(400).json({error:"风格参考图无效。"});if(!prompt)return res.status(400).json({error:"请输入插画关键词。"});
  try{
    const match=reference.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);if(!match)return res.status(400).json({error:"风格参考图格式不支持。"});
    const fullPrompt=[
      "Create a NEW vertical tabletop card illustration using the input image ONLY as a visual style reference.",
      DEFAULT_CARD_ART_DIRECTION,
      "Transfer its brushwork, palette logic, texture, lighting language, edge treatment, and overall visual medium. Do not copy the reference subject, pose, objects, composition, symbols, or identity unless explicitly requested.",
      "The new subject and scene must follow the request below while remaining recognizably from the same card set.",
      cardType?"Card template type: "+cardType+".":"",cardName?"New card subject: "+cardName+".":"",faction?"Faction mood: "+faction+".":"",style?"Unified set style: "+style+".":"","New scene request: "+prompt+"."
    ].filter(Boolean).join(" ");
    const form=new FormData();form.append("model",process.env.OPENAI_IMAGE_EDIT_MODEL||"gpt-image-2.5-sunburst");form.append("image",new Blob([Buffer.from(match[2],"base64")],{type:match[1]}),"style-reference.png");form.append("prompt",fullPrompt);form.append("size","1024x1392");form.append("quality",quality);form.append("output_format","png");
    const response=await fetch("https://api.openai.com/v1/images/edits",{method:"POST",headers:{Authorization:"Bearer "+process.env.OPENAI_API_KEY},body:form}),data=await response.json();if(!response.ok)throw new Error((data.error&&data.error.message)||"参考图生图失败。");const image=data.data&&data.data[0];if(!image||!image.b64_json)throw new Error("图像服务没有返回图片。");res.json({image:"data:image/png;base64,"+image.b64_json});
  }catch(error){console.error(error);res.status(500).json({error:error&&error.message?error.message:"参考图生图失败。"})}
});

app.post("/api/redraw-image", async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: "尚未配置 AI Key。请在页面的“插画”区域填写并保存。" });
  }
  const body = req.body || {};
  const imageDataUrl = String(body.image || "");
  const prompt = String(body.prompt || "").trim();
  const style = String(body.style || "").trim();
  const cardName = String(body.cardName || "").trim();
  const faction = String(body.faction || "").trim();
  const cardType = String(body.cardType || "").trim();
  const quality = ["low","medium","high","xhigh","max"].includes(body.quality) ? body.quality : "high";
  if (!imageDataUrl.startsWith("data:image/")) return res.status(400).json({ error: "当前卡牌没有可用于重绘的图片。" });
  if (!prompt) return res.status(400).json({ error: "请输入重绘要求。" });

  try {
    const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) return res.status(400).json({ error: "当前图片格式不支持重绘。" });
    const mime = match[1];
    const bytes = Buffer.from(match[2], "base64");
    const fullPrompt = [
      "Edit this existing vertical tabletop card illustration.",
      DEFAULT_CARD_ART_DIRECTION,
      "Preserve the main subject identity and overall composition unless the request explicitly asks to change them.",
      "No text, no letters, no logo, no border, no UI.",
      cardType ? "Card template type: " + cardType + "." : "",
      cardName ? "Card subject: " + cardName + "." : "",
      faction ? "Faction mood: " + faction + "." : "",
      style ? "Unified set style: " + style + "." : "",
      "Redraw request: " + prompt + "."
    ].filter(Boolean).join(" ");

    const form = new FormData();
    form.append("model", process.env.OPENAI_IMAGE_EDIT_MODEL || "gpt-image-2.5-sunburst");
    form.append("image", new Blob([bytes], { type: mime }), "card-art.png");
    form.append("prompt", fullPrompt);
    form.append("size", "1024x1392");
    form.append("quality", quality);
    form.append("output_format", "png");

    const response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: "Bearer " + process.env.OPENAI_API_KEY },
      body: form
    });
    const data = await response.json();
    if (!response.ok) throw new Error((data.error && data.error.message) || "图像重绘失败。");
    const image = data.data && data.data[0];
    if (!image || !image.b64_json) throw new Error("图像服务没有返回图片。");
    res.json({ image: "data:image/png;base64," + image.b64_json });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error && error.message ? error.message : "图像重绘失败。" });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(join(root, "public", "index.html"));
});

const port = Number(process.env.PORT || 8787);
app.listen(port, "127.0.0.1", () => {
  console.log("卡牌组装流水线已启动：http://localhost:" + port);
});
