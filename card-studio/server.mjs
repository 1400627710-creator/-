import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const root = dirname(fileURLToPath(import.meta.url));

app.use(express.json({ limit: "3mb" }));
app.use(express.static(join(root, "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, aiConfigured: Boolean(process.env.OPENAI_API_KEY) });
});

app.post("/api/generate-image", async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({
      error: "尚未配置 OPENAI_API_KEY。复制 .env.example 为 .env 后填写 API Key。"
    });
  }

  const body = req.body || {};
  const prompt = String(body.prompt || "").trim();
  const style = String(body.style || "").trim();
  const cardName = String(body.cardName || "").trim();
  const faction = String(body.faction || "").trim();
  const cardType = String(body.cardType || "").trim();

  if (!prompt) {
    return res.status(400).json({ error: "请输入插画关键词。" });
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const fullPrompt = [
      "Create a vertical tabletop card illustration background.",
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
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-flare",
      prompt: fullPrompt,
      size: "1024x1536",
      quality: "low",
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

app.get("*", (_req, res) => {
  res.sendFile(join(root, "public", "index.html"));
});

const port = Number(process.env.PORT || 8787);
app.listen(port, () => {
  console.log("卡牌组装流水线已启动：http://localhost:" + port);
});
