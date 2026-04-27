import { NextRequest, NextResponse } from "next/server";
import {
  filterStaticDeviceLibrary,
  libraryCountries,
  type LibraryCountry,
} from "@/lib/device-library";

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

  const items = filterStaticDeviceLibrary({
    country,
    search,
    category,
  });

  return NextResponse.json({
    country,
    items,
  });
}
