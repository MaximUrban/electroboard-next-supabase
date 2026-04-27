import type { DeviceCategory, DeviceLibraryItem, DrawingAsset } from "@/lib/device-library";
import { fullCategoryLabel } from "@/lib/device-library";

type TurkeySeed = {
  article: string;
  productUrl: string;
  modules: number;
};

const TURKEY_SEEDS: TurkeySeed[] = [
  {
    article: "EZ9R34240",
    productUrl:
      "https://www.se.com/tr/tr/product/EZ9R34240/easy9-ka%C3%A7ak-ak%C4%B1m-r%C3%B6lesi-2-kutup-40a-30ma-ac-tipi-230v/",
    modules: 2,
  },
  {
    article: "EZ9F34240",
    productUrl:
      "https://www.se.com/tr/tr/product/EZ9F34240/otomatik-sigorta-easy9-45ka-ce%C4%9Frisi-2kutup-40a/",
    modules: 2,
  },
  {
    article: "EZ9F43240",
    productUrl:
      "https://www.se.com/tr/tr/product/EZ9F43240/otomatik-sigorta-easy9-3ka-ce%C4%9Frisi-2kutup-40a/",
    modules: 2,
  },
  {
    article: "EZ9F34225",
    productUrl:
      "https://www.se.com/tr/tr/product/EZ9F34225/otomatik-sigorta-easy9-45ka-ce%C4%9Frisi-2kutup-25a/",
    modules: 2,
  },
  {
    article: "EZ9F34263",
    productUrl:
      "https://www.se.com/tr/tr/product/EZ9F34263/minyat%C3%BCr-devre-kesici-mcb-easy9-2p-63a-c-e%C4%9Frisi-4500a-iec-en-608981/",
    modules: 2,
  },
  {
    article: "EZ9F34140",
    productUrl:
      "https://www.se.com/tr/tr/product/EZ9F34140/otomatik-sigorta-easy9-45ka-ce%C4%9Frisi-1kutup-40a/",
    modules: 1,
  },
  {
    article: "EZ9F51163",
    productUrl:
      "https://www.se.com/tr/tr/product/EZ9F51163/otomatik-sigorta-easy9-1p-63-a-c-curve-10000-a/",
    modules: 1,
  },
  {
    article: "EZ9F51240",
    productUrl:
      "https://www.se.com/tr/tr/product/EZ9F51240/otomatik-sigorta-easy9-2p-40-a-c-curve-10000-a/",
    modules: 2,
  },
  {
    article: "EZ9F51210",
    productUrl:
      "https://www.se.com/tr/tr/product/EZ9F51210/otomatik-sigorta-easy9-2p-10-a-c-curve-10000-a/",
    modules: 2,
  },
];

function textBetween(value: string, start: string, end: string) {
  const s = value.indexOf(start);
  if (s === -1) return "";
  const from = s + start.length;
  const e = value.indexOf(end, from);
  if (e === -1) return "";
  return value.slice(from, e);
}

function decodeHtml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function extractMeta(html: string, key: string) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${key}["']`, "i"),
    new RegExp(`<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${key}["']`, "i"),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1]);
  }

  return "";
}

function extractTitle(html: string) {
  const ogTitle = extractMeta(html, "og:title");
  if (ogTitle) return ogTitle;

  const title = textBetween(html, "<title>", "</title>");
  if (title) return decodeHtml(title).trim();

  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1?.[1]) {
    return decodeHtml(h1[1].replace(/<[^>]+>/g, "").trim());
  }

  return "";
}

function extractImage(html: string) {
  const candidates = [
    extractMeta(html, "og:image"),
    extractMeta(html, "twitter:image"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate.startsWith("http")) return candidate;
  }

  const srcMatch = html.match(/https:\/\/[^"' )]+?\.(?:png|jpg|jpeg|webp)/i);
  return srcMatch?.[0] || "";
}

function detectCategory(title: string): DeviceCategory {
  const lower = title.toLowerCase();

  if (
    lower.includes("kaçak akım") ||
    lower.includes("akım rölesi") ||
    lower.includes("koruma şalteri")
  ) {
    return "rcd";
  }

  if (lower.includes("diferansiyel")) {
    return "rcbo";
  }

  return "mcb";
}

function detectSeries(title: string) {
  const lower = title.toLowerCase();
  if (lower.includes("easy9 pro")) return "Easy9 Pro";
  if (lower.includes("easy9")) return "Easy9";
  return "Schneider";
}

function buildFallbackImage(article: string, series: string) {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
    <rect width="240" height="240" rx="20" fill="#ffffff"/>
    <rect x="24" y="18" width="192" height="204" rx="16" fill="#f3f6fb" stroke="#cfd8ea" stroke-width="2"/>
    <rect x="58" y="72" width="124" height="92" rx="10" fill="#e5e7eb" stroke="#9ca3af" stroke-width="2"/>
    <rect x="72" y="84" width="28" height="68" rx="6" fill="#d1d5db"/>
    <rect x="110" y="84" width="56" height="16" rx="4" fill="#111827"/>
    <rect x="110" y="108" width="42" height="10" rx="4" fill="#9ca3af"/>
    <rect x="110" y="126" width="46" height="10" rx="4" fill="#9ca3af"/>
    <rect x="110" y="144" width="32" height="10" rx="4" fill="#9ca3af"/>
    <text x="120" y="188" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" font-weight="700" fill="#111827">${series}</text>
    <text x="120" y="208" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" fill="#374151">${article}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function extractDrawingAssets(html: string, article: string): DrawingAsset[] {
  const found = new Map<string, DrawingAsset>();

  const regex = /(https:\/\/[^"' )]+?\.(dwg|dxf|pdf|png|jpg|jpeg))/gi;
  const matches = html.matchAll(regex);

  for (const match of matches) {
    const url = match[1];
    const ext = match[2].toLowerCase();
    const format =
      ext === "jpeg" ? "jpg" : (ext as DrawingAsset["format"]);

    const label = `Front ${format.toUpperCase()}`;
    const key = `${format}-${url}`;

    if (!found.has(key)) {
      found.set(key, {
        id: `${article}-${format}-${found.size + 1}`,
        label,
        format,
        viewType: "front",
        sourceUrl: url,
      });
    }
  }

  if (found.size > 0) {
    return [...found.values()].slice(0, 6);
  }

  return [
    {
      id: `${article}-front-dwg`,
      label: "Front DWG",
      format: "dwg",
      viewType: "front",
      sourceUrl: `mock://cad/${article}/front.dwg`,
    },
    {
      id: `${article}-front-dxf`,
      label: "Front DXF",
      format: "dxf",
      viewType: "front",
      sourceUrl: `mock://cad/${article}/front.dxf`,
    },
    {
      id: `${article}-front-pdf`,
      label: "Front PDF",
      format: "pdf",
      viewType: "front",
      sourceUrl: `mock://cad/${article}/front.pdf`,
    },
  ];
}

async function parseTurkeyProduct(seed: TurkeySeed): Promise<DeviceLibraryItem | null> {
  try {
    const res = await fetch(seed.productUrl, {
      next: { revalidate: 60 * 60 * 12 },
      headers: {
        "user-agent": "Mozilla/5.0 Electroboard/1.0",
        "accept-language": "tr-TR,tr;q=0.9,en;q=0.8",
      },
    });

    if (!res.ok) return null;

    const html = await res.text();

    const title = extractTitle(html) || seed.article;
    const series = detectSeries(title);
    const category = detectCategory(title);
    const image = extractImage(html) || buildFallbackImage(seed.article, series);
    const drawingAssets = extractDrawingAssets(html, seed.article);

    return {
      id: `tr-live-${seed.article.toLowerCase()}`,
      brand: "Schneider",
      series,
      category,
      categoryLabel: fullCategoryLabel("TR", category),
      article: seed.article,
      modules: seed.modules,
      catalogImageUrl: image,
      productUrl: seed.productUrl,
      name: title,
      country: "TR",
      drawingAssets,
    };
  } catch {
    return null;
  }
}

export async function getTurkeyLiveLibrary(params?: {
  search?: string;
  category?: string;
}) {
  const items = (
    await Promise.all(TURKEY_SEEDS.map((seed) => parseTurkeyProduct(seed)))
  ).filter(Boolean) as DeviceLibraryItem[];

  const search = (params?.search || "").trim().toLowerCase();
  const category = (params?.category || "").trim().toLowerCase();

  return items
    .filter((item) => {
      const matchesSearch =
        !search ||
        item.name.toLowerCase().includes(search) ||
        item.article.toLowerCase().includes(search) ||
        item.series.toLowerCase().includes(search) ||
        item.categoryLabel.toLowerCase().includes(search);

      const matchesCategory = !category || item.category === category;

      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => a.article.localeCompare(b.article));
}
