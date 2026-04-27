import type { CadAsset } from "@/lib/cad-types";

export type DwgImportSuccess = {
  ok: true;
  asset: CadAsset;
};

export type DwgImportError = {
  ok: false;
  error: string;
  details?: string;
  status?: number;
};

export type DwgImportResult = DwgImportSuccess | DwgImportError;

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
      status: response.status,
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
