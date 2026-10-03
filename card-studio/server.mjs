import express from "express";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_VERSION = "2.3.0";
const app = express();
const root = dirname(fileURLToPath(import.meta.url));

app.use(express.json({ limit: "20mb" }));
app.use("/vendor", express.static(join(root, "node_modules")));
app.use(express.static(join(root, "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, version: APP_VERSION });
});

app.get("*", (_req, res) => {
  res.sendFile(join(root, "public", "index.html"));
});

const port = Number(process.env.PORT || 8787);
app.listen(port, "127.0.0.1", () => {
  console.log("卡牌组装流水线已启动：http://localhost:" + port);
});
