import type { CadAsset } from "@/lib/cad-types";
import { parseDxfToCadAsset } from "@/lib/dxf-parser";

type ExternalDwgAdapterSuccess = {
  ok: true;
  asset: CadAsset;
};

type ExternalDwgAdapterError = {
  ok: false;
  error: string;
  details?: string;
  status?: number;
};

export type ExternalDwgAdapterResult =
  | ExternalDwgAdapterSuccess
  | ExternalDwgAdapterError;

function getEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

async function fileToBase64(file: File) {
  const buffer = await file.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}

/**
 * Ожидаемый контракт внешнего адаптера:
 *
 * POST {EXTERNAL_DWG_ADAPTER_URL}
 * Headers:
 *   Authorization: Bearer {EXTERNAL_DWG_ADAPTER_TOKEN}   // если токен задан
 *   Content-Type: application/json
 *
 * Body:
 * {
 *   "fileName": "example.dwg",
 *   "fileBase64": "...."
 * }
 *
 * Ответ:
 * {
 *   "ok": true,
 *   "dxfText": "0\nSECTION\n2\nENTITIES\n..."
 * }
 *
 * или:
 * {
 *   "ok": false,
 *   "error": "..."
 * }
 */
export async function importDwgViaExternalAdapter(file: File): Promise<ExternalDwgAdapterResult> {
  const adapterUrl = getEnv("EXTERNAL_DWG_ADAPTER_URL");
  const adapterToken = getEnv("EXTERNAL_DWG_ADAPTER_TOKEN");

  if (!adapterUrl) {
    return {
      ok: false,
      status: 501,
      error: "Реальный DWG-конвертер не настроен",
      details:
        "Добавьте EXTERNAL_DWG_ADAPTER_URL в переменные окружения.",
    };
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (adapterToken) {
    headers.authorization = `Bearer ${adapterToken}`;
  }

  try {
    const response = await fetch(adapterUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        fileName: file.name,
        fileBase64: await fileToBase64(file),
      }),
    });

    let json: unknown = null;

    try {
      json = await response.json();
    } catch {
      json = null;
    }

    if (!response.ok) {
      const error =
        typeof json === "object" &&
        json !== null &&
        "error" in json &&
        typeof (json as { error?: unknown }).error === "string"
          ? (json as { error: string }).error
          : "DWG adapter request failed";

      const details =
        typeof json === "object" &&
        json !== null &&
        "details" in json &&
        typeof (json as { details?: unknown }).details === "string"
          ? (json as { details: string }).details
          : undefined;

      return {
        ok: false,
        status: response.status,
        error,
        details,
      };
    }

    const dxfText =
      typeof json === "object" &&
      json !== null &&
      "dxfText" in json &&
      typeof (json as { dxfText?: unknown }).dxfText === "string"
        ? (json as { dxfText: string }).dxfText
        : "";

    if (!dxfText) {
      return {
        ok: false,
        error: "DWG adapter did not return DXF text",
      };
    }

    const asset = parseDxfToCadAsset(file.name, dxfText);

    return {
      ok: true,
      asset: {
        ...asset,
        sourceFormat: "dwg",
        sourceName: file.name,
        importedFileName: file.name,
        importMode: "drawing-import",
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: "Ошибка обращения к внешнему DWG-конвертеру",
      details: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
