import { NextRequest, NextResponse } from "next/server";

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function fallbackSvg(article: string, series: string) {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
    <rect width="240" height="240" rx="20" fill="#ffffff"/>
    <rect x="24" y="18" width="192" height="204" rx="16" fill="#f3f6fb" stroke="#cfd8ea" stroke-width="2"/>
    <rect x="38" y="34" width="164" height="22" rx="8" fill="#1f2937"/>
    <text x="120" y="49" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#ffffff">Schneider</text>

    <rect x="58" y="72" width="124" height="92" rx="10" fill="#e5e7eb" stroke="#9ca3af" stroke-width="2"/>
    <rect x="72" y="84" width="28" height="68" rx="6" fill="#d1d5db"/>
    <rect x="110" y="84" width="56" height="16" rx="4" fill="#111827"/>
    <rect x="110" y="108" width="42" height="10" rx="4" fill="#9ca3af"/>
    <rect x="110" y="126" width="46" height="10" rx="4" fill="#9ca3af"/>
    <rect x="110" y="144" width="32" height="10" rx="4" fill="#9ca3af"/>

    <text x="120" y="185" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" font-weight="700" fill="#111827">${escapeXml(
      series
    )}</text>
    <text x="120" y="204" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" fill="#374151">${escapeXml(
      article
    )}</text>
    <text x="120" y="221" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#6b7280">preview fallback</text>
  </svg>`;

  return new NextResponse(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=86400, s-maxage=86400",
    },
  });
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
    if (match?.[1]) {
      return match[1]
        .replaceAll("&amp;", "&")
        .replaceAll("&quot;", '"')
        .replaceAll("&#39;", "'")
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">");
    }
  }

  return "";
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const url = searchParams.get("url") || "";
  const article = searchParams.get("article") || "unknown";
  const series = searchParams.get("series") || "Schneider";

  if (!url || !/^https:\/\/www\.se\.com\//i.test(url)) {
    return fallbackSvg(article, series);
  }

  try {
    const productRes = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 Electroboard/1.0",
        "accept-language": "tr-TR,tr;q=0.9,en;q=0.8",
      },
      next: { revalidate: 60 * 60 * 12 },
    });

    if (!productRes.ok) {
      return fallbackSvg(article, series);
    }

    const html = await productRes.text();

    const imageUrl =
      extractMeta(html, "og:image") ||
      extractMeta(html, "twitter:image") ||
      "";

    if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
      return fallbackSvg(article, series);
    }

    const imageRes = await fetch(imageUrl, {
      headers: {
        "user-agent": "Mozilla/5.0 Electroboard/1.0",
        referer: "https://www.se.com/",
      },
      next: { revalidate: 60 * 60 * 12 },
    });

    if (!imageRes.ok) {
      return fallbackSvg(article, series);
    }

    const contentType =
      imageRes.headers.get("content-type") || "image/jpeg";
    const buffer = await imageRes.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=86400, s-maxage=86400",
      },
    });
  } catch {
    return fallbackSvg(article, series);
  }
}
