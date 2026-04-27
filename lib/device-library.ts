export type LibraryCountry = "FR" | "DE" | "US" | "TR";

export type DeviceCategory = "mcb" | "rcd" | "rcbo";

export type DrawingAsset = {
  id: string;
  label: string;
  format: "dwg" | "dxf" | "pdf" | "jpg" | "png";
  viewType: "front" | "side" | "top" | "unknown";
  sourceUrl: string;
};

export type DeviceLibrarySourceItem = {
  id: string;
  brand: "Schneider";
  series: string;
  category: DeviceCategory;
  article: string;
  modules: number;
  catalogImageUrl: string;
  productUrl?: string;
  titleByCountry: Partial<Record<LibraryCountry, string>>;
  categoryLabelByCountry: Partial<Record<LibraryCountry, string>>;
  countries: LibraryCountry[];
  drawingAssets: DrawingAsset[];
};

export type DeviceLibraryItem = {
  id: string;
  brand: "Schneider";
  series: string;
  category: DeviceCategory;
  categoryLabel: string;
  article: string;
  modules: number;
  catalogImageUrl: string;
  productUrl?: string;
  name: string;
  country: LibraryCountry;
  drawingAssets: DrawingAsset[];
};

export const libraryCountries: { value: LibraryCountry; label: string }[] = [
  { value: "FR", label: "France" },
  { value: "DE", label: "Deutschland" },
  { value: "US", label: "United States" },
  { value: "TR", label: "Türkiye" },
];

export function fullCategoryLabel(country: LibraryCountry, category: DeviceCategory) {
  const labels: Record<LibraryCountry, Record<DeviceCategory, string>> = {
    FR: {
      mcb: "Автоматический выключатель",
      rcd: "Устройство защитного отключения",
      rcbo: "Дифференциальный автомат",
    },
    DE: {
      mcb: "Автоматический выключатель",
      rcd: "Устройство защитного отключения",
      rcbo: "Дифференциальный автомат",
    },
    US: {
      mcb: "Circuit breaker",
      rcd: "Residual current device",
      rcbo: "Residual current breaker with overcurrent protection",
    },
    TR: {
      mcb: "Otomatik sigorta",
      rcd: "Kaçak akım koruma şalteri",
      rcbo: "Diferansiyel otomatik sigorta",
    },
  };

  return labels[country][category];
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function makeCatalogPreview(params: {
  brand: string;
  series: string;
  article: string;
  line2: string;
}) {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
    <rect width="240" height="240" rx="20" fill="#ffffff"/>
    <rect x="24" y="18" width="192" height="204" rx="16" fill="#f3f6fb" stroke="#cfd8ea" stroke-width="2"/>
    <rect x="38" y="34" width="164" height="22" rx="8" fill="#1f2937"/>
    <text x="120" y="49" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#ffffff">${escapeXml(
      params.brand
    )}</text>

    <rect x="58" y="72" width="124" height="92" rx="10" fill="#e5e7eb" stroke="#9ca3af" stroke-width="2"/>
    <rect x="72" y="84" width="28" height="68" rx="6" fill="#d1d5db"/>
    <rect x="110" y="84" width="56" height="16" rx="4" fill="#111827"/>
    <rect x="110" y="108" width="42" height="10" rx="4" fill="#9ca3af"/>
    <rect x="110" y="126" width="46" height="10" rx="4" fill="#9ca3af"/>
    <rect x="110" y="144" width="32" height="10" rx="4" fill="#9ca3af"/>

    <text x="120" y="185" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" font-weight="700" fill="#111827">${escapeXml(
      params.series
    )}</text>
    <text x="120" y="204" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" fill="#374151">${escapeXml(
      params.article
    )}</text>
    <text x="120" y="221" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#6b7280">${escapeXml(
      params.line2
    )}</text>
  </svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function buildItem(params: {
  id: string;
  series: string;
  category: DeviceCategory;
  article: string;
  modules: number;
  countries: LibraryCountry[];
  titleByCountry: Partial<Record<LibraryCountry, string>>;
  categoryLabelByCountry: Partial<Record<LibraryCountry, string>>;
  drawingAssets?: DrawingAsset[];
}): DeviceLibrarySourceItem {
  return {
    id: params.id,
    brand: "Schneider",
    series: params.series,
    category: params.category,
    article: params.article,
    modules: params.modules,
    catalogImageUrl: makeCatalogPreview({
      brand: "Schneider",
      series: params.series,
      article: params.article,
      line2: params.category.toUpperCase(),
    }),
    titleByCountry: params.titleByCountry,
    categoryLabelByCountry: params.categoryLabelByCountry,
    countries: params.countries,
    drawingAssets:
      params.drawingAssets ||
      [
        {
          id: "front-dwg",
          label: "Front DWG",
          format: "dwg",
          viewType: "front",
          sourceUrl: `mock://cad/${params.article}/front.dwg`,
        },
        {
          id: "front-dxf",
          label: "Front DXF",
          format: "dxf",
          viewType: "front",
          sourceUrl: `mock://cad/${params.article}/front.dxf`,
        },
        {
          id: "front-pdf",
          label: "Front PDF",
          format: "pdf",
          viewType: "front",
          sourceUrl: `mock://cad/${params.article}/front.pdf`,
        },
      ],
  };
}

const staticDevices: DeviceLibrarySourceItem[] = [
  buildItem({
    id: "sch-acti9-mcb-1p-c16-fr",
    series: "Acti9",
    category: "mcb",
    article: "A9F74116",
    modules: 1,
    countries: ["FR", "DE"],
    titleByCountry: {
      FR: "Acti9 disjoncteur 1P C16",
      DE: "Acti9 Leitungsschutzschalter 1P C16",
    },
    categoryLabelByCountry: {
      FR: "Автоматический выключатель",
      DE: "Автоматический выключатель",
    },
  }),
  buildItem({
    id: "sch-acti9-rcd-2p-40a-30ma",
    series: "Acti9",
    category: "rcd",
    article: "A9R11240",
    modules: 2,
    countries: ["FR", "DE", "US"],
    titleByCountry: {
      FR: "Acti9 interrupteur différentiel 2P 40A 30mA",
      DE: "Acti9 FI-Schutzschalter 2P 40A 30mA",
      US: "Acti9 residual current device 2P 40A 30mA",
    },
    categoryLabelByCountry: {
      FR: "Устройство защитного отключения",
      DE: "Устройство защитного отключения",
      US: "Residual current device",
    },
  }),
  buildItem({
    id: "sch-homeline-mcb-1p-20a-us",
    series: "Homeline",
    category: "mcb",
    article: "HOM120",
    modules: 1,
    countries: ["US"],
    titleByCountry: {
      US: "Homeline miniature circuit breaker 1P 20A",
    },
    categoryLabelByCountry: {
      US: "Circuit breaker",
    },
  }),
];

export function getStaticDeviceLibrary(country: LibraryCountry): DeviceLibraryItem[] {
  return staticDevices
    .filter((item) => item.countries.includes(country))
    .map((item) => ({
      id: item.id,
      brand: item.brand,
      series: item.series,
      category: item.category,
      categoryLabel:
        item.categoryLabelByCountry[country] ||
        item.categoryLabelByCountry.FR ||
        fullCategoryLabel(country, item.category),
      article: item.article,
      modules: item.modules,
      catalogImageUrl: item.catalogImageUrl,
      productUrl: item.productUrl,
      name:
        item.titleByCountry[country] ||
        item.titleByCountry.FR ||
        item.article,
      country,
      drawingAssets: item.drawingAssets,
    }))
    .sort((a, b) => {
      if (a.series !== b.series) return a.series.localeCompare(b.series);
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return a.article.localeCompare(b.article);
    });
}

export function filterStaticDeviceLibrary(params: {
  country: LibraryCountry;
  search?: string;
  category?: string;
}) {
  const search = (params.search || "").trim().toLowerCase();
  const category = (params.category || "").trim().toLowerCase();

  return getStaticDeviceLibrary(params.country).filter((item) => {
    const matchesSearch =
      !search ||
      item.name.toLowerCase().includes(search) ||
      item.article.toLowerCase().includes(search) ||
      item.series.toLowerCase().includes(search) ||
      item.categoryLabel.toLowerCase().includes(search);

    const matchesCategory = !category || item.category === category;

    return matchesSearch && matchesCategory;
  });
}
