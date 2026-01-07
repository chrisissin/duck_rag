import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { parseDiskAlert } from "./parser/diskParser.js";
import { decide } from "./decision/decide.js";
import { formatReport } from "./report/formatReport.js";

const app = express();
app.use(express.json());
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use("/", express.static(path.join(__dirname, "web")));

app.post("/api/analyze", async (req, res) => {
  const parsed = await parseDiskAlert(req.body.text);
  const decision = decide(parsed);
  res.json(formatReport({ parsed, decision }));
});

app.listen(3000, () => console.log("Running on http://localhost:3000"));
