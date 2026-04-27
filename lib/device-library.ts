export type LibraryCountry = "FR" | "DE" | "US";

export type DeviceCategory = "mcb" | "rcd" | "rcbo";

export type CadVariant = {
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
  imageUrl: string;
  titleByCountry: Partial<Record<LibraryCountry, string>>;
  categoryLabelByCountry: Partial<Record<LibraryCountry, string>>;
  countries: LibraryCountry[];
  cadVariants: CadVariant[];
};

export type DeviceLibraryItem = {
  id: string;
  brand: "Schneider";
  series: string;
  category: DeviceCategory;
  categoryLabel: string;
  article: string;
  modules: number;
  imageUrl: string;
  name: string;
  country: LibraryCountry;
  cadVariants: CadVariant[];
};

export const libraryCountries: { value: LibraryCountry; label: string }[] = [
  { value: "FR", label: "France" },
  { value: "DE", label: "Deutschland" },
  { value: "US", label: "United States" },
];

const schneiderDevices: DeviceLibrarySourceItem[] = [
  {
    id: "sch-acti9-mcb-1p-c16-fr",
    brand: "Schneider",
    series: "Acti9",
    category: "mcb",
    article: "A9F74116",
    modules: 1,
    imageUrl:
      "https://download.schneider-electric.com/files?p_Doc_Ref=A9F74116",
    titleByCountry: {
      FR: "Acti9 iC60N disjoncteur 1P C16",
      DE: "Acti9 iC60N Leitungsschutzschalter 1P C16",
      US: "Acti9 iC60N miniature circuit breaker 1P C16",
    },
    categoryLabelByCountry: {
      FR: "Disjoncteur",
      DE: "Leitungsschutzschalter",
      US: "Circuit breaker",
    },
    countries: ["FR", "DE"],
    cadVariants: [
      {
        id: "front-jpg",
        label: "Front JPG",
        format: "jpg",
        viewType: "front",
        sourceUrl: "https://example.com/schneider/a9f74116/front.jpg",
      },
      {
        id: "front-dwg",
        label: "Front DWG",
        format: "dwg",
        viewType: "front",
        sourceUrl: "https://example.com/schneider/a9f74116/front.dwg",
      },
    ],
  },
  {
    id: "sch-acti9-rcd-2p-40a-30ma",
    brand: "Schneider",
    series: "Acti9",
    category: "rcd",
    article: "A9R11240",
    modules: 2,
    imageUrl:
      "https://download.schneider-electric.com/files?p_Doc_Ref=A9R11240",
    titleByCountry: {
      FR: "Acti9 interrupteur différentiel 2P 40A 30mA",
      DE: "Acti9 FI-Schalter 2P 40A 30mA",
      US: "Acti9 residual current device 2P 40A 30mA",
    },
    categoryLabelByCountry: {
      FR: "Interrupteur différentiel",
      DE: "FI-Schalter",
      US: "Residual current device",
    },
    countries: ["FR", "DE", "US"],
    cadVariants: [
      {
        id: "front-png",
        label: "Front PNG",
        format: "png",
        viewType: "front",
        sourceUrl: "https://example.com/schneider/a9r11240/front.png",
      },
      {
        id: "front-pdf",
        label: "Front PDF",
        format: "pdf",
        viewType: "front",
        sourceUrl: "https://example.com/schneider/a9r11240/front.pdf",
      },
    ],
  },
  {
    id: "sch-homeline-mcb-1p-20a-us",
    brand: "Schneider",
    series: "Homeline",
    category: "mcb",
    article: "HOM120",
    modules: 1,
    imageUrl:
      "https://download.schneider-electric.com/files?p_Doc_Ref=HOM120",
    titleByCountry: {
      US: "Homeline miniature circuit breaker 1P 20A",
    },
    categoryLabelByCountry: {
      US: "Circuit breaker",
    },
    countries: ["US"],
    cadVariants: [
      {
        id: "front-jpg",
        label: "Front JPG",
        format: "jpg",
        viewType: "front",
        sourceUrl: "https://example.com/schneider/hom120/front.jpg",
      },
    ],
  },
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
        item.category,
      article: item.article,
      modules: item.modules,
      imageUrl: item.imageUrl,
      name:
        item.titleByCountry[country] ||
        item.titleByCountry.FR ||
        item.article,
      country,
      cadVariants: item.cadVariants,
    }));
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
      item.series.toLowerCase().includes(search);

    const matchesCategory = !category || item.category === category;

    return matchesSearch && matchesCategory;
  });
}
