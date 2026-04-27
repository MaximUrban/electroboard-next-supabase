import { NextRequest, NextResponse } from "next/server";
import {
  filterStaticDeviceLibrary,
  libraryCountries,
  type LibraryCountry,
} from "@/lib/device-library";
import { getTurkeyLiveLibrary } from "@/lib/schneider-tr-parser";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const countryParam = (searchParams.get("country") || "FR") as LibraryCountry;
  const search = searchParams.get("search") || "";
  const category = searchParams.get("category") || "";

  const country: LibraryCountry = libraryCountries.some(
    (item) => item.value === countryParam
  )
    ? countryParam
    : "FR";

  let items;

  if (country === "TR") {
    const liveItems = await getTurkeyLiveLibrary({ search, category });
    items =
      liveItems.length > 0
        ? liveItems
        : filterStaticDeviceLibrary({ country, search, category });
  } else {
    items = filterStaticDeviceLibrary({ country, search, category });
  }

  return NextResponse.json({
    country,
    items,
  });
}
