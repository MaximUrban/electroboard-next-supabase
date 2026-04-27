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
  productUrl?: string;
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
    productUrl: params.productUrl,
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
    id: "fr-acti9-a9f74110",
    series: "Acti9",
    category: "mcb",
    article: "A9F74110",
    modules: 1,
    countries: ["FR", "DE"],
    titleByCountry: {
      FR: "Acti9 disjoncteur 1P C10",
      DE: "Acti9 Leitungsschutzschalter 1P C10",
    },
    categoryLabelByCountry: {
      FR: "Автоматический выключатель",
      DE: "Автоматический выключатель",
    },
  }),
  buildItem({
    id: "fr-acti9-a9f74116",
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
    id: "fr-acti9-a9f74220",
    series: "Acti9",
    category: "mcb",
    article: "A9F74220",
    modules: 2,
    countries: ["FR", "DE"],
    titleByCountry: {
      FR: "Acti9 disjoncteur 2P C20",
      DE: "Acti9 Leitungsschutzschalter 2P C20",
    },
    categoryLabelByCountry: {
      FR: "Автоматический выключатель",
      DE: "Автоматический выключатель",
    },
  }),
  buildItem({
    id: "fr-acti9-a9r11225",
    series: "Acti9",
    category: "rcd",
    article: "A9R11225",
    modules: 2,
    countries: ["FR", "DE"],
    titleByCountry: {
      FR: "Acti9 interrupteur différentiel 2P 25A 30mA",
      DE: "Acti9 FI-Schutzschalter 2P 25A 30mA",
    },
    categoryLabelByCountry: {
      FR: "Устройство защитного отключения",
      DE: "Устройство защитного отключения",
    },
  }),
  buildItem({
    id: "fr-acti9-a9r11240",
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
    id: "fr-acti9-a9d11816",
    series: "Acti9",
    category: "rcbo",
    article: "A9D11816",
    modules: 2,
    countries: ["FR", "DE"],
    titleByCountry: {
      FR: "Acti9 disjoncteur différentiel 1P+N C16 30mA",
      DE: "Acti9 FI/LS-Schalter 1P+N C16 30mA",
    },
    categoryLabelByCountry: {
      FR: "Дифференциальный автомат",
      DE: "Дифференциальный автомат",
    },
  }),

  buildItem({
    id: "us-homeline-hom120",
    series: "Homeline",
    category: "mcb",
    article: "HOM120",
    modules: 1,
    countries: ["US"],
    titleByCountry: {
      US: "Homeline circuit breaker 1P 20A",
    },
    categoryLabelByCountry: {
      US: "Circuit breaker",
    },
  }),
  buildItem({
    id: "us-homeline-hom130",
    series: "Homeline",
    category: "mcb",
    article: "HOM130",
    modules: 1,
    countries: ["US"],
    titleByCountry: {
      US: "Homeline circuit breaker 1P 30A",
    },
    categoryLabelByCountry: {
      US: "Circuit breaker",
    },
  }),
  buildItem({
    id: "us-homeline-hom220",
    series: "Homeline",
    category: "mcb",
    article: "HOM220",
    modules: 2,
    countries: ["US"],
    titleByCountry: {
      US: "Homeline circuit breaker 2P 20A",
    },
    categoryLabelByCountry: {
      US: "Circuit breaker",
    },
  }),
  buildItem({
    id: "us-qo-qo120",
    series: "QO",
    category: "mcb",
    article: "QO120",
    modules: 1,
    countries: ["US"],
    titleByCountry: {
      US: "QO circuit breaker 1P 20A",
    },
    categoryLabelByCountry: {
      US: "Circuit breaker",
    },
  }),
  buildItem({
    id: "us-qo-qo230",
    series: "QO",
    category: "mcb",
    article: "QO230",
    modules: 2,
    countries: ["US"],
    titleByCountry: {
      US: "QO circuit breaker 2P 30A",
    },
    categoryLabelByCountry: {
      US: "Circuit breaker",
    },
  }),

  buildItem({
    id: "tr-ez9f34110",
    series: "Easy9",
    category: "mcb",
    article: "EZ9F34110",
    modules: 1,
    countries: ["TR"],
    productUrl: "https://www.se.com/tr/tr/product-range/61949-easy9-otomatik-sigorta-elektrik-sigorta-mcb-%C3%A7%C3%B6z%C3%BCmleri/",
    titleByCountry: {
      TR: "Easy9 otomatik sigorta 1P 10A C",
    },
    categoryLabelByCountry: {
      TR: "Otomatik sigorta",
    },
  }),
  buildItem({
    id: "tr-ez9f34116",
    series: "Easy9",
    category: "mcb",
    article: "EZ9F34116",
    modules: 1,
    countries: ["TR"],
    titleByCountry: {
      TR: "Easy9 otomatik sigorta 1P 16A C",
    },
    categoryLabelByCountry: {
      TR: "Otomatik sigorta",
    },
  }),
  buildItem({
    id: "tr-ez9f34120",
    series: "Easy9",
    category: "mcb",
    article: "EZ9F34120",
    modules: 1,
    countries: ["TR"],
    titleByCountry: {
      TR: "Easy9 otomatik sigorta 1P 20A C",
    },
    categoryLabelByCountry: {
      TR: "Otomatik sigorta",
    },
  }),
  buildItem({
    id: "tr-ez9f34125",
    series: "Easy9",
    category: "mcb",
    article: "EZ9F34125",
    modules: 1,
    countries: ["TR"],
    titleByCountry: {
      TR: "Easy9 otomatik sigorta 1P 25A C",
    },
    categoryLabelByCountry: {
      TR: "Otomatik sigorta",
    },
  }),
  buildItem({
    id: "tr-ez9f34132",
    series: "Easy9",
    category: "mcb",
    article: "EZ9F34132",
    modules: 1,
    countries: ["TR"],
    titleByCountry: {
      TR: "Easy9 otomatik sigorta 1P 32A C",
    },
    categoryLabelByCountry: {
      TR: "Otomatik sigorta",
    },
  }),
  buildItem({
    id: "tr-ez9f34216",
    series: "Easy9",
    category: "mcb",
    article: "EZ9F34216",
    modules: 2,
    countries: ["TR"],
    titleByCountry: {
      TR: "Easy9 otomatik sigorta 2P 16A C",
    },
    categoryLabelByCountry: {
      TR: "Otomatik sigorta",
    },
  }),
  buildItem({
    id: "tr-ez9f34225",
    series: "Easy9",
    category: "mcb",
    article: "EZ9F34225",
    modules: 2,
    countries: ["TR"],
    productUrl: "https://www.se.com/tr/tr/product/EZ9F34225/otomatik-sigorta-easy9-45ka-ce%C4%9Frisi-2kutup-25a/",
    titleByCountry: {
      TR: "Easy9 otomatik sigorta 2P 25A C 4.5kA",
    },
    categoryLabelByCountry: {
      TR: "Otomatik sigorta",
    },
  }),
  buildItem({
    id: "tr-ez9f34240",
    series: "Easy9",
    category: "mcb",
    article: "EZ9F34240",
    modules: 2,
    countries: ["TR"],
    productUrl: "https://www.se.com/tr/tr/product/EZ9F34240/otomatik-sigorta-easy9-45ka-ce%C4%9Frisi-2kutup-40a/",
    titleByCountry: {
      TR: "Easy9 otomatik sigorta 2P 40A C 4.5kA",
    },
    categoryLabelByCountry: {
      TR: "Otomatik sigorta",
    },
  }),
  buildItem({
    id: "tr-ez9f34263",
    series: "Easy9",
    category: "mcb",
    article: "EZ9F34263",
    modules: 2,
    countries: ["TR"],
    titleByCountry: {
      TR: "Easy9 minyatür devre kesici 2P 63A C 4.5kA",
    },
    categoryLabelByCountry: {
      TR: "Otomatik sigorta",
    },
  }),
  buildItem({
    id: "tr-ez9f51210",
    series: "Easy9",
    category: "mcb",
    article: "EZ9F51210",
    modules: 2,
    countries: ["TR"],
    productUrl: "https://www.se.com/tr/tr/product/EZ9F51210/otomatik-sigorta-easy9-2p-10-a-c-curve-10000-a/",
    titleByCountry: {
      TR: "Easy9 otomatik sigorta 2P 10A C 10kA",
    },
    categoryLabelByCountry: {
      TR: "Otomatik sigorta",
    },
  }),
  buildItem({
    id: "tr-ez9f51240",
    series: "Easy9",
    category: "mcb",
    article: "EZ9F51240",
    modules: 2,
    countries: ["TR"],
    productUrl: "https://www.se.com/tr/tr/product/EZ9F51240/otomatik-sigorta-easy9-2p-40-a-c-curve-10000-a/",
    titleByCountry: {
      TR: "Easy9 otomatik sigorta 2P 40A C 10kA",
    },
    categoryLabelByCountry: {
      TR: "Otomatik sigorta",
    },
  }),
  buildItem({
    id: "tr-ez9f43406",
    series: "Easy9",
    category: "mcb",
    article: "EZ9F43406",
    modules: 4,
    countries: ["TR"],
    productUrl: "https://www.se.com/tr/tr/product/EZ9F43406/easy9-mcb-4p-6a-c-3000a-400v-otomatik-sigorta/",
    titleByCountry: {
      TR: "Easy9 MCB 4P 6A C 3000A 400V otomatik sigorta",
    },
    categoryLabelByCountry: {
      TR: "Otomatik sigorta",
    },
  }),
  buildItem({
    id: "tr-ez9r34240",
    series: "Easy9",
    category: "rcd",
    article: "EZ9R34240",
    modules: 2,
    countries: ["TR"],
    productUrl: "https://www.se.com/tr/tr/product/EZ9R34240/easy9-ka%C3%A7ak-ak%C4%B1m-r%C3%B6lesi-2-kutup-40a-30ma-ac-tipi-230v/",
    titleByCountry: {
      TR: "Easy9 kaçak akım rölesi 2P 40A 30mA AC",
    },
    categoryLabelByCountry: {
      TR: "Kaçak akım koruma şalteri",
    },
  }),
  buildItem({
    id: "tr-ez9r34263",
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
    id: "tr-ez9d34616",
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
    id: "tr-ez9d34620",
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
    id: "tr-ez9d34625",
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
