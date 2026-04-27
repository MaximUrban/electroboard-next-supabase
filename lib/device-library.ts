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
  imageDocRef?: string;
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

function defaultDrawingAssets(article: string): DrawingAsset[] {
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

function schneiderRenditionUrl(docRef: string) {
  return `https://download.schneider-electric.com/files?p_Doc_Ref=${encodeURIComponent(
    docRef
  )}&p_File_Type=rendition_369_jpg&default_image=DefaultProductImage.png`;
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
  imageDocRef?: string;
  drawingAssets?: DrawingAsset[];
}): DeviceLibrarySourceItem {
  return {
    id: params.id,
    brand: "Schneider",
    series: params.series,
    category: params.category,
    article: params.article,
    modules: params.modules,
    catalogImageUrl: params.imageDocRef
      ? schneiderRenditionUrl(params.imageDocRef)
      : makeCatalogPreview({
          brand: "Schneider",
          series: params.series,
          article: params.article,
          line2: params.category.toUpperCase(),
        }),
    imageDocRef: params.imageDocRef,
    productUrl: params.productUrl,
    titleByCountry: params.titleByCountry,
    categoryLabelByCountry: params.categoryLabelByCountry,
    countries: params.countries,
    drawingAssets: params.drawingAssets || defaultDrawingAssets(params.article),
  };
}

function buildTurkeyMcb(
  article: string,
  series: string,
  poles: 1 | 2 | 3 | 4,
  rating: number,
  curve: "B" | "C",
  ka: string,
  imageDocRef?: string
) {
  return buildItem({
    id: `tr-${article.toLowerCase()}`,
    series,
    category: "mcb",
    article,
    modules: poles,
    imageDocRef,
    countries: ["TR"],
    titleByCountry: {
      TR: `${series} otomatik sigorta ${poles}P ${rating}A ${curve} ${ka}`,
    },
    categoryLabelByCountry: {
      TR: "Otomatik sigorta",
    },
  });
}

function buildTurkeyRcd(
  article: string,
  poles: 2 | 4,
  rating: number,
  sensitivity: string,
  imageDocRef?: string
) {
  return buildItem({
    id: `tr-${article.toLowerCase()}`,
    series: "Easy9",
    category: "rcd",
    article,
    modules: poles,
    imageDocRef,
    countries: ["TR"],
    titleByCountry: {
      TR: `Easy9 kaçak akım koruma şalteri ${poles}P ${rating}A ${sensitivity}`,
    },
    categoryLabelByCountry: {
      TR: "Kaçak akım koruma şalteri",
    },
  });
}

function buildTurkeyRcbo(
  article: string,
  rating: number,
  sensitivity: string,
  imageDocRef?: string
) {
  return buildItem({
    id: `tr-${article.toLowerCase()}`,
    series: "Easy9",
    category: "rcbo",
    article,
    modules: 2,
    imageDocRef,
    countries: ["TR"],
    titleByCountry: {
      TR: `Easy9 diferansiyel otomatik sigorta 1P+N ${rating}A ${sensitivity}`,
    },
    categoryLabelByCountry: {
      TR: "Diferansiyel otomatik sigorta",
    },
  });
}

const staticDevices: DeviceLibrarySourceItem[] = [
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

  buildTurkeyMcb("EZ9F34106", "Easy9", 1, 6, "C", "4.5kA"),
  buildTurkeyMcb("EZ9F34110", "Easy9", 1, 10, "C", "4.5kA"),
  buildTurkeyMcb("EZ9F34116", "Easy9", 1, 16, "C", "4.5kA"),
  buildTurkeyMcb("EZ9F34120", "Easy9", 1, 20, "C", "4.5kA"),
  buildTurkeyMcb("EZ9F34125", "Easy9", 1, 25, "C", "4.5kA"),
  buildTurkeyMcb("EZ9F34132", "Easy9", 1, 32, "C", "4.5kA"),
  buildTurkeyMcb("EZ9F34140", "Easy9", 1, 40, "C", "4.5kA", "PB111299"),
  buildTurkeyMcb("EZ9F34150", "Easy9", 1, 50, "C", "4.5kA"),
  buildTurkeyMcb("EZ9F34163", "Easy9", 1, 63, "C", "4.5kA"),

  buildTurkeyMcb("EZ9F34206", "Easy9", 2, 6, "C", "4.5kA"),
  buildTurkeyMcb("EZ9F34210", "Easy9", 2, 10, "C", "4.5kA"),
  buildTurkeyMcb("EZ9F34216", "Easy9", 2, 16, "C", "4.5kA"),
  buildTurkeyMcb("EZ9F34220", "Easy9", 2, 20, "C", "4.5kA", "PB111305"),
  buildTurkeyMcb("EZ9F34225", "Easy9", 2, 25, "C", "4.5kA"),
  buildTurkeyMcb("EZ9F34232", "Easy9", 2, 32, "C", "4.5kA"),
  buildTurkeyMcb("EZ9F34240", "Easy9", 2, 40, "C", "4.5kA", "PB111306"),
  buildTurkeyMcb("EZ9F34250", "Easy9", 2, 50, "C", "4.5kA"),
  buildTurkeyMcb("EZ9F34263", "Easy9", 2, 63, "C", "4.5kA"),

  buildTurkeyMcb("EZ9F34306", "Easy9", 3, 6, "C", "4.5kA"),
  buildTurkeyMcb("EZ9F34310", "Easy9", 3, 10, "C", "4.5kA"),
  buildTurkeyMcb("EZ9F34316", "Easy9", 3, 16, "C", "4.5kA"),
  buildTurkeyMcb("EZ9F34320", "Easy9", 3, 20, "C", "4.5kA"),
  buildTurkeyMcb("EZ9F34325", "Easy9", 3, 25, "C", "4.5kA"),
  buildTurkeyMcb("EZ9F34332", "Easy9", 3, 32, "C", "4.5kA"),
  buildTurkeyMcb("EZ9F34340", "Easy9", 3, 40, "C", "4.5kA"),
  buildTurkeyMcb("EZ9F34350", "Easy9", 3, 50, "C", "4.5kA"),
  buildTurkeyMcb("EZ9F34363", "Easy9", 3, 63, "C", "4.5kA"),

  buildTurkeyMcb("EZ9F34406", "Easy9", 4, 6, "C", "4.5kA"),
  buildTurkeyMcb("EZ9F34410", "Easy9", 4, 10, "C", "4.5kA"),
  buildTurkeyMcb("EZ9F34416", "Easy9", 4, 16, "C", "4.5kA"),
  buildTurkeyMcb("EZ9F34420", "Easy9", 4, 20, "C", "4.5kA", "PB111313"),
  buildTurkeyMcb("EZ9F34425", "Easy9", 4, 25, "C", "4.5kA"),
  buildTurkeyMcb("EZ9F34432", "Easy9", 4, 32, "C", "4.5kA"),
  buildTurkeyMcb("EZ9F34440", "Easy9", 4, 40, "C", "4.5kA"),
  buildTurkeyMcb("EZ9F34450", "Easy9", 4, 50, "C", "4.5kA"),
  buildTurkeyMcb("EZ9F34463", "Easy9", 4, 63, "C", "4.5kA"),

  buildTurkeyMcb("EZ9F26106", "Easy9", 1, 6, "B", "6kA"),
  buildTurkeyMcb("EZ9F26110", "Easy9", 1, 10, "B", "6kA"),
  buildTurkeyMcb("EZ9F26116", "Easy9", 1, 16, "B", "6kA"),
  buildTurkeyMcb("EZ9F26120", "Easy9", 1, 20, "B", "6kA"),
  buildTurkeyMcb("EZ9F26125", "Easy9", 1, 25, "B", "6kA"),
  buildTurkeyMcb("EZ9F26132", "Easy9", 1, 32, "B", "6kA"),
  buildTurkeyMcb("EZ9F26140", "Easy9", 1, 40, "B", "6kA"),
  buildTurkeyMcb("EZ9F26150", "Easy9", 1, 50, "B", "6kA"),
  buildTurkeyMcb("EZ9F26163", "Easy9", 1, 63, "B", "6kA"),

  buildTurkeyMcb("EZ9F56106", "Easy9", 1, 6, "C", "6kA"),
  buildTurkeyMcb("EZ9F56110", "Easy9", 1, 10, "C", "6kA"),
  buildTurkeyMcb("EZ9F56116", "Easy9", 1, 16, "C", "6kA"),
  buildTurkeyMcb("EZ9F56120", "Easy9", 1, 20, "C", "6kA"),
  buildTurkeyMcb("EZ9F56125", "Easy9", 1, 25, "C", "6kA"),
  buildTurkeyMcb("EZ9F56132", "Easy9", 1, 32, "C", "6kA"),
  buildTurkeyMcb("EZ9F56140", "Easy9", 1, 40, "C", "6kA"),
  buildTurkeyMcb("EZ9F56150", "Easy9", 1, 50, "C", "6kA"),
  buildTurkeyMcb("EZ9F56163", "Easy9", 1, 63, "C", "6kA"),

  buildTurkeyMcb("EZ9F56206", "Easy9", 2, 6, "C", "6kA"),
  buildTurkeyMcb("EZ9F56210", "Easy9", 2, 10, "C", "6kA"),
  buildTurkeyMcb("EZ9F56216", "Easy9", 2, 16, "C", "6kA"),
  buildTurkeyMcb("EZ9F56220", "Easy9", 2, 20, "C", "6kA"),
  buildTurkeyMcb("EZ9F56225", "Easy9", 2, 25, "C", "6kA"),
  buildTurkeyMcb("EZ9F56232", "Easy9", 2, 32, "C", "6kA"),
  buildTurkeyMcb("EZ9F56240", "Easy9", 2, 40, "C", "6kA", "PB111330"),
  buildTurkeyMcb("EZ9F56250", "Easy9", 2, 50, "C", "6kA"),
  buildTurkeyMcb("EZ9F56263", "Easy9", 2, 63, "C", "6kA"),

  buildTurkeyMcb("EZ9F29106", "Easy9 Pro", 1, 6, "B", "10kA"),
  buildTurkeyMcb("EZ9F29110", "Easy9 Pro", 1, 10, "B", "10kA"),
  buildTurkeyMcb("EZ9F29116", "Easy9 Pro", 1, 16, "B", "10kA"),
  buildTurkeyMcb("EZ9F29120", "Easy9 Pro", 1, 20, "B", "10kA"),
  buildTurkeyMcb("EZ9F29125", "Easy9 Pro", 1, 25, "B", "10kA"),
  buildTurkeyMcb("EZ9F29132", "Easy9 Pro", 1, 32, "B", "10kA"),
  buildTurkeyMcb("EZ9F29140", "Easy9 Pro", 1, 40, "B", "10kA"),
  buildTurkeyMcb("EZ9F29150", "Easy9 Pro", 1, 50, "B", "10kA"),
  buildTurkeyMcb("EZ9F29163", "Easy9 Pro", 1, 63, "B", "10kA"),

  buildTurkeyMcb("EZ9F51106", "Easy9", 1, 6, "C", "10kA"),
  buildTurkeyMcb("EZ9F51110", "Easy9", 1, 10, "C", "10kA"),
  buildTurkeyMcb("EZ9F51116", "Easy9", 1, 16, "C", "10kA"),
  buildTurkeyMcb("EZ9F51120", "Easy9", 1, 20, "C", "10kA", "PB111351"),
  buildTurkeyMcb("EZ9F51125", "Easy9", 1, 25, "C", "10kA"),
  buildTurkeyMcb("EZ9F51132", "Easy9", 1, 32, "C", "10kA"),
  buildTurkeyMcb("EZ9F51140", "Easy9", 1, 40, "C", "10kA"),
  buildTurkeyMcb("EZ9F51150", "Easy9", 1, 50, "C", "10kA"),
  buildTurkeyMcb("EZ9F51163", "Easy9", 1, 63, "C", "10kA", "PB111355"),

  buildTurkeyMcb("EZ9F51206", "Easy9", 2, 6, "C", "10kA"),
  buildTurkeyMcb("EZ9F51210", "Easy9", 2, 10, "C", "10kA", "PB111356"),
  buildTurkeyMcb("EZ9F51216", "Easy9", 2, 16, "C", "10kA", "PB111357"),
  buildTurkeyMcb("EZ9F51220", "Easy9", 2, 20, "C", "10kA"),
  buildTurkeyMcb("EZ9F51225", "Easy9", 2, 25, "C", "10kA"),
  buildTurkeyMcb("EZ9F51232", "Easy9", 2, 32, "C", "10kA"),
  buildTurkeyMcb("EZ9F51240", "Easy9", 2, 40, "C", "10kA", "PB111360"),
  buildTurkeyMcb("EZ9F51250", "Easy9", 2, 50, "C", "10kA"),
  buildTurkeyMcb("EZ9F51263", "Easy9", 2, 63, "C", "10kA"),

  buildTurkeyMcb("EZ9F57306", "Easy9 Pro", 3, 6, "C", "6kA"),
  buildTurkeyMcb("EZ9F57310", "Easy9 Pro", 3, 10, "C", "6kA"),
  buildTurkeyMcb("EZ9F57316", "Easy9 Pro", 3, 16, "C", "6kA"),
  buildTurkeyMcb("EZ9F57320", "Easy9 Pro", 3, 20, "C", "6kA"),
  buildTurkeyMcb("EZ9F57325", "Easy9 Pro", 3, 25, "C", "6kA"),
  buildTurkeyMcb("EZ9F57332", "Easy9 Pro", 3, 32, "C", "6kA"),
  buildTurkeyMcb("EZ9F57340", "Easy9 Pro", 3, 40, "C", "6kA"),
  buildTurkeyMcb("EZ9F57350", "Easy9 Pro", 3, 50, "C", "6kA"),
  buildTurkeyMcb("EZ9F57363", "Easy9 Pro", 3, 63, "C", "6kA"),

  buildTurkeyMcb("EZ9F57406", "Easy9 Pro", 4, 6, "C", "6kA"),
  buildTurkeyMcb("EZ9F57410", "Easy9 Pro", 4, 10, "C", "6kA"),
  buildTurkeyMcb("EZ9F57416", "Easy9 Pro", 4, 16, "C", "6kA"),
  buildTurkeyMcb("EZ9F57420", "Easy9 Pro", 4, 20, "C", "6kA"),
  buildTurkeyMcb("EZ9F57425", "Easy9 Pro", 4, 25, "C", "6kA"),
  buildTurkeyMcb("EZ9F57432", "Easy9 Pro", 4, 32, "C", "6kA"),
  buildTurkeyMcb("EZ9F57440", "Easy9 Pro", 4, 40, "C", "6kA"),
  buildTurkeyMcb("EZ9F57450", "Easy9 Pro", 4, 50, "C", "6kA"),
  buildTurkeyMcb("EZ9F57463", "Easy9 Pro", 4, 63, "C", "6kA"),

  buildTurkeyRcd("EZ9R34225", 2, 25, "30mA"),
  buildTurkeyRcd("EZ9R34240", 2, 40, "30mA", "PB111381"),
  buildTurkeyRcd("EZ9R34263", 2, 63, "30mA"),
  buildTurkeyRcd("EZ9R34425", 4, 25, "30mA"),
  buildTurkeyRcd("EZ9R34440", 4, 40, "30mA"),
  buildTurkeyRcd("EZ9R34463", 4, 63, "30mA"),

  buildTurkeyRcbo("EZ9D34606", 6, "30mA"),
  buildTurkeyRcbo("EZ9D34610", 10, "30mA"),
  buildTurkeyRcbo("EZ9D34616", 16, "30mA"),
  buildTurkeyRcbo("EZ9D34620", 20, "30mA"),
  buildTurkeyRcbo("EZ9D34625", 25, "30mA"),
  buildTurkeyRcbo("EZ9D34632", 32, "30mA"),
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
