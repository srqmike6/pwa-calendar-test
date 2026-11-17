const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

app.disable("x-powered-by");
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_req, res) => {
  res.json({ ok: true, app: "MACH SFRG Events" });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`MACH SFRG Events running on port ${PORT}`);
});
