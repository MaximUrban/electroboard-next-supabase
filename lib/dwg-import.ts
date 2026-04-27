import type { CadAsset } from "@/lib/cad-types";

export type DwgImportSuccess = {
  ok: true;
  asset: CadAsset;
};

export type DwgImportError = {
  ok: false;
  error: string;
  details?: string;
};

export type DwgImportResult = DwgImportSuccess | DwgImportError;

/**
 * Здесь будет реальный серверный адаптер DWG -> normalized CAD JSON.
 *
 * Варианты подключения позже:
 * 1) внешний сервис-конвертер
 * 2) локальный backend/worker
 * 3) DXF intermediary pipeline
 *
 * Сейчас функция специально возвращает понятную ошибку,
 * чтобы UI уже умел работать с реальным серверным потоком.
 */
export async function importDwgOnServer(file: File): Promise<DwgImportResult> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/import/dwg", {
    method: "POST",
    body: formData,
  });

  let json: unknown = null;

  try {
    json = await response.json();
  } catch {
    json = null;
  }

  if (!response.ok) {
    const message =
      typeof json === "object" &&
      json !== null &&
      "error" in json &&
      typeof (json as { error?: unknown }).error === "string"
        ? (json as { error: string }).error
        : "DWG import failed";

    const details =
      typeof json === "object" &&
      json !== null &&
      "details" in json &&
      typeof (json as { details?: unknown }).details === "string"
        ? (json as { details: string }).details
        : undefined;

    return {
      ok: false,
      error: message,
      details,
    };
  }

  if (
    typeof json === "object" &&
    json !== null &&
    "asset" in json
  ) {
    return {
      ok: true,
      asset: (json as { asset: CadAsset }).asset,
    };
  }

  return {
    ok: false,
    error: "DWG import returned invalid response",
  };
}
