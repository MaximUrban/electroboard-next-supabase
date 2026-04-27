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

const schneiderDevices: DeviceLibrarySourceItem[] = [
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

  buildItem({
    id: "tr-easy9-ez9f56120",
    series: "Easy9",
    category: "mcb",
    article: "EZ9F56120",
    modules: 1,
    countries: ["TR"],
    titleByCountry: {
      TR: "Easy9 otomatik sigorta 1P 20A C 6000A",
    },
    categoryLabelByCountry: {
      TR: "Otomatik sigorta",
    },
  }),

  buildItem({
    id: "tr-easy9-ez9f56125",
    series: "Easy9",
    category: "mcb",
    article: "EZ9F56125",
    modules: 1,
    countries: ["TR"],
    titleByCountry: {
      TR: "Easy9 otomatik sigorta 1P 25A C 6000A",
    },
    categoryLabelByCountry: {
      TR: "Otomatik sigorta",
    },
  }),

  buildItem({
    id: "tr-easy9-ez9f56132",
    series: "Easy9",
    category: "mcb",
    article: "EZ9F56132",
    modules: 1,
    countries: ["TR"],
    titleByCountry: {
      TR: "Easy9 otomatik sigorta 1P 32A C 6000A",
    },
    categoryLabelByCountry: {
      TR: "Otomatik sigorta",
    },
  }),

  buildItem({
    id: "tr-easy9-ez9f56150",
    series: "Easy9",
    category: "mcb",
    article: "EZ9F56150",
    modules: 1,
    countries: ["TR"],
    titleByCountry: {
      TR: "Easy9 otomatik sigorta 1P 50A C 6000A",
    },
    categoryLabelByCountry: {
      TR: "Otomatik sigorta",
    },
  }),

  buildItem({
    id: "tr-easy9-ez9f26116",
    series: "Easy9",
    category: "mcb",
    article: "EZ9F26116",
    modules: 1,
    countries: ["TR"],
    titleByCountry: {
      TR: "Easy9 otomatik sigorta 1P 16A B 6000A",
    },
    categoryLabelByCountry: {
      TR: "Otomatik sigorta",
    },
  }),

  buildItem({
    id: "tr-easy9-ez9f26125",
    series: "Easy9",
    category: "mcb",
    article: "EZ9F26125",
    modules: 1,
    countries: ["TR"],
    titleByCountry: {
      TR: "Easy9 otomatik sigorta 1P 25A B 6000A",
    },
    categoryLabelByCountry: {
      TR: "Otomatik sigorta",
    },
  }),

  buildItem({
    id: "tr-easy9-ez9f56206",
    series: "Easy9",
    category: "mcb",
    article: "EZ9F56206",
    modules: 2,
    countries: ["TR"],
    titleByCountry: {
      TR: "Easy9 otomatik sigorta 2P 6A C 6000A",
    },
    categoryLabelByCountry: {
      TR: "Otomatik sigorta",
    },
  }),

  buildItem({
    id: "tr-easy9-ez9f56210",
    series: "Easy9",
    category: "mcb",
    article: "EZ9F56210",
    modules: 2,
    countries: ["TR"],
    titleByCountry: {
      TR: "Easy9 otomatik sigorta 2P 10A C 6000A",
    },
    categoryLabelByCountry: {
      TR: "Otomatik sigorta",
    },
  }),

  buildItem({
    id: "tr-easy9-ez9f56216",
    series: "Easy9",
    category: "mcb",
    article: "EZ9F56216",
    modules: 2,
    countries: ["TR"],
    titleByCountry: {
      TR: "Easy9 otomatik sigorta 2P 16A C 6000A",
    },
    categoryLabelByCountry: {
      TR: "Otomatik sigorta",
    },
  }),

  buildItem({
    id: "tr-easy9-ez9f56225",
    series: "Easy9",
    category: "mcb",
    article: "EZ9F56225",
    modules: 2,
    countries: ["TR"],
    titleByCountry: {
      TR: "Easy9 otomatik sigorta 2P 25A C 6000A",
    },
    categoryLabelByCountry: {
      TR: "Otomatik sigorta",
    },
  }),

  buildItem({
    id: "tr-easy9-ez9f34306",
    series: "Easy9",
    category: "mcb",
    article: "EZ9F34306",
    modules: 3,
    countries: ["TR"],
    titleByCountry: {
      TR: "Easy9 otomatik sigorta 3P 6A C 4.5kA",
    },
    categoryLabelByCountry: {
      TR: "Otomatik sigorta",
    },
  }),

  buildItem({
    id: "tr-easy9-ez9f34316",
    series: "Easy9",
    category: "mcb",
    article: "EZ9F34316",
    modules: 3,
    countries: ["TR"],
    titleByCountry: {
      TR: "Easy9 otomatik sigorta 3P 16A C 4.5kA",
    },
    categoryLabelByCountry: {
      TR: "Otomatik sigorta",
    },
  }),

  buildItem({
    id: "tr-easy9-ez9f34416",
    series: "Easy9",
    category: "mcb",
    article: "EZ9F34416",
    modules: 4,
    countries: ["TR"],
    titleByCountry: {
      TR: "Easy9 otomatik sigorta 4P 16A C 4.5kA",
    },
    categoryLabelByCountry: {
      TR: "Otomatik sigorta",
    },
  }),

  buildItem({
    id: "tr-easy9pro-ez9f29116",
    series: "Easy9 Pro",
    category: "mcb",
    article: "EZ9F29116",
    modules: 1,
    countries: ["TR"],
    titleByCountry: {
      TR: "Easy9 Pro otomatik sigorta 1P 16A B 10kA",
    },
    categoryLabelByCountry: {
      TR: "Otomatik sigorta",
    },
  }),

  buildItem({
    id: "tr-easy9pro-ez9f29120",
    series: "Easy9 Pro",
    category: "mcb",
    article: "EZ9F29120",
    modules: 1,
    countries: ["TR"],
    titleByCountry: {
      TR: "Easy9 Pro otomatik sigorta 1P 20A B 10kA",
    },
    categoryLabelByCountry: {
      TR: "Otomatik sigorta",
    },
  }),

  buildItem({
    id: "tr-easy9pro-ez9f29125",
    series: "Easy9 Pro",
    category: "mcb",
    article: "EZ9F29125",
    modules: 1,
    countries: ["TR"],
    titleByCountry: {
      TR: "Easy9 Pro otomatik sigorta 1P 25A B 10kA",
    },
    categoryLabelByCountry: {
      TR: "Otomatik sigorta",
    },
  }),

  buildItem({
    id: "tr-easy9pro-ez9f57450",
    series: "Easy9 Pro",
    category: "mcb",
    article: "EZ9F57450",
    modules: 4,
    countries: ["TR"],
    titleByCountry: {
      TR: "Easy9 Pro otomatik sigorta 4P 50A C 6kA",
    },
    categoryLabelByCountry: {
      TR: "Otomatik sigorta",
    },
  }),

  buildItem({
    id: "tr-easy9-rcd-2p-40a-30ma",
    series: "Easy9",
    category: "rcd",
    article: "EZ9R34240",
    modules: 2,
    countries: ["TR"],
    titleByCountry: {
      TR: "Easy9 kaçak akım koruma şalteri 2P 40A 30mA",
    },
    categoryLabelByCountry: {
      TR: "Kaçak akım koruma şalteri",
    },
  }),

  buildItem({
    id: "tr-easy9-rcd-2p-63a-30ma",
    series: "Easy9",
    category: "rcd",
    article: "EZ9R34263",
    modules: 2,
    countries: ["TR"],
    titleByCountry: {
      TR: "Easy9 kaçak akım koruma şalteri 2P 63A 30mA",
    },
    categoryLabelByCountry: {
      TR: "Kaçak akım koruma şalteri",
    },
  }),

  buildItem({
    id: "tr-easy9-rcbo-1p-n-16a-30ma",
    series: "Easy9",
    category: "rcbo",
    article: "EZ9D34616",
    modules: 2,
    countries: ["TR"],
    titleByCountry: {
      TR: "Easy9 diferansiyel otomatik sigorta 1P+N 16A 30mA",
    },
    categoryLabelByCountry: {
      TR: "Diferansiyel otomatik sigorta",
    },
  }),

  buildItem({
    id: "tr-easy9-rcbo-1p-n-20a-30ma",
    series: "Easy9",
    category: "rcbo",
    article: "EZ9D34620",
    modules: 2,
    countries: ["TR"],
    titleByCountry: {
      TR: "Easy9 diferansiyel otomatik sigorta 1P+N 20A 30mA",
    },
    categoryLabelByCountry: {
      TR: "Diferansiyel otomatik sigorta",
    },
  }),

  buildItem({
    id: "tr-easy9-rcbo-1p-n-25a-30ma",
    series: "Easy9",
    category: "rcbo",
    article: "EZ9D34625",
    modules: 2,
    countries: ["TR"],
    titleByCountry: {
      TR: "Easy9 diferansiyel otomatik sigorta 1P+N 25A 30mA",
    },
    categoryLabelByCountry: {
      TR: "Diferansiyel otomatik sigorta",
    },
  }),
];

export function getDeviceLibrary(country: LibraryCountry): DeviceLibraryItem[] {
  return schneiderDevices
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

export function filterDeviceLibrary(params: {
  country: LibraryCountry;
  search?: string;
  category?: string;
}) {
  const search = (params.search || "").trim().toLowerCase();
  const category = (params.category || "").trim().toLowerCase();

  return getDeviceLibrary(params.country).filter((item) => {
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
