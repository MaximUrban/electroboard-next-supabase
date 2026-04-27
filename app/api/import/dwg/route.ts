import { NextRequest, NextResponse } from "next/server";

/**
 * Временный серверный route под будущий DWG-конвертер.
 *
 * Следующий этап:
 * - подключить реальный converter/worker/service
 * - вернуть normalized CadAsset
 */
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
    const lower = fileName.toLowerCase();

    if (!lower.endsWith(".dwg")) {
      return NextResponse.json(
        {
          error: "Ожидался файл .dwg",
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: "Реальный серверный DWG-конвертер ещё не подключён",
        details:
          "DXF уже импортируется реально. Для DWG на следующем этапе нужно подключить backend adapter: DWG -> DXF/JSON.",
      },
      { status: 501 }
    );
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
