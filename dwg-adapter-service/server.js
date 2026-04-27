import express from "express";
import fs from "fs/promises";
import os from "os";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";

const app = express();

app.use(
  express.json({
    limit: "100mb",
  })
);

function getEnv(name, fallback = "") {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function safeBaseName(fileName) {
  const parsed = path.parse(fileName || "drawing.dwg");
  const raw = parsed.name || "drawing";
  return raw.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function ensureDwgFileName(fileName) {
  const normalized = fileName || "drawing.dwg";
  return normalized.toLowerCase().endsWith(".dwg")
    ? normalized
    : `${normalized}.dwg`;
}

function replaceTemplateValue(value, vars) {
  return value.replaceAll("{{inputDir}}", vars.inputDir)
    .replaceAll("{{outputDir}}", vars.outputDir)
    .replaceAll("{{inputFile}}", vars.inputFile)
    .replaceAll("{{inputFileName}}", vars.inputFileName)
    .replaceAll("{{baseName}}", vars.baseName)
    .replaceAll("{{outputFile}}", vars.outputFile);
}

function runProcess(bin, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      resolve({
        code: code ?? 0,
        stdout,
        stderr,
      });
    });
  });
}

async function rmSafe(target) {
  try {
    await fs.rm(target, { recursive: true, force: true });
  } catch {}
}

app.get("/health", async (_req, res) => {
  res.json({
    ok: true,
    service: "dwg-adapter-service",
  });
});

app.post("/convert", async (req, res) => {
  const authToken = getEnv("ADAPTER_AUTH_TOKEN");

  if (authToken) {
    const authHeader = req.headers.authorization || "";
    const expected = `Bearer ${authToken}`;
    if (authHeader !== expected) {
      return res.status(401).json({
        ok: false,
        error: "Unauthorized",
      });
    }
  }

  const fileName =
    typeof req.body?.fileName === "string" ? req.body.fileName : "";
  const fileBase64 =
    typeof req.body?.fileBase64 === "string" ? req.body.fileBase64 : "";

  if (!fileName || !fileBase64) {
    return res.status(400).json({
      ok: false,
      error: "fileName and fileBase64 are required",
    });
  }

  if (!fileName.toLowerCase().endsWith(".dwg")) {
    return res.status(400).json({
      ok: false,
      error: "Expected .dwg file",
    });
  }

  const converterBin = getEnv("DWG_CONVERTER_BIN");
  const converterArgsRaw = getEnv("DWG_CONVERTER_ARGS_JSON");

  if (!converterBin || !converterArgsRaw) {
    return res.status(501).json({
      ok: false,
      error: "DWG converter is not configured",
      details:
        "Set DWG_CONVERTER_BIN and DWG_CONVERTER_ARGS_JSON environment variables",
    });
  }

  let converterArgsTemplate = [];
  try {
    const parsed = JSON.parse(converterArgsRaw);
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
      throw new Error("DWG_CONVERTER_ARGS_JSON must be a JSON string array");
    }
    converterArgsTemplate = parsed;
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Invalid DWG_CONVERTER_ARGS_JSON",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }

  const jobId = crypto.randomUUID();
  const workDir = path.join(os.tmpdir(), `dwg-job-${jobId}`);
  const inputDir = path.join(workDir, "input");
  const outputDir = path.join(workDir, "output");

  try {
    await fs.mkdir(inputDir, { recursive: true });
    await fs.mkdir(outputDir, { recursive: true });

    const normalizedFileName = ensureDwgFileName(fileName);
    const baseName = safeBaseName(normalizedFileName);
    const inputFileName = `${baseName}.dwg`;
    const outputFileName = `${baseName}.dxf`;

    const inputFile = path.join(inputDir, inputFileName);
    const outputFile = path.join(outputDir, outputFileName);

    const fileBuffer = Buffer.from(fileBase64, "base64");
    await fs.writeFile(inputFile, fileBuffer);

    const vars = {
      inputDir,
      outputDir,
      inputFile,
      inputFileName,
      baseName,
      outputFile,
    };

    const converterArgs = converterArgsTemplate.map((arg) =>
      replaceTemplateValue(arg, vars)
    );

    const result = await runProcess(converterBin, converterArgs, workDir);

    let dxfText = "";
    try {
      dxfText = await fs.readFile(outputFile, "utf8");
    } catch {
      dxfText = "";
    }

    if (result.code !== 0) {
      return res.status(500).json({
        ok: false,
        error: "DWG converter process failed",
        details: result.stderr || result.stdout || `Exit code: ${result.code}`,
      });
    }

    if (!dxfText.trim()) {
      return res.status(500).json({
        ok: false,
        error: "Converter did not produce DXF output",
        details: result.stderr || result.stdout || "Output DXF file is empty or missing",
      });
    }

    return res.json({
      ok: true,
      dxfText,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "DWG conversion failed",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  } finally {
    await rmSafe(workDir);
  }
});

const port = Number(getEnv("PORT", "8080"));
app.listen(port, () => {
  console.log(`dwg-adapter-service listening on ${port}`);
});
