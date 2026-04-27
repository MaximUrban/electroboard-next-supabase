import { NextRequest, NextResponse } from "next/server";
import { importDwgViaExternalAdapter } from "@/lib/server-dwg-adapter";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          error: "Файл DWG не передан",
        },
        { status: 400 }
      );
    }

    const fileName = file.name || "drawing.dwg";

    if (!fileName.toLowerCase().endsWith(".dwg")) {
      return NextResponse.json(
        {
          error: "Ожидался файл .dwg",
        },
        { status: 400 }
      );
    }

    const result = await importDwgViaExternalAdapter(file);

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          details: result.details,
        },
        { status: result.status || 500 }
      );
    }

    return NextResponse.json({
      asset: result.asset,
    });
  } catch (error) {
    console.error("DWG import route error:", error);

    return NextResponse.json(
      {
        error: "Ошибка сервера при импорте DWG",
      },
      { status: 500 }
    );
  }
}
