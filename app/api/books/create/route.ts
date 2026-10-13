import { NextRequest, NextResponse } from "next/server";
import { BookCreationError, parseCalibreBookInput } from "@/lib/calibre-book-input";
import { bookCreationService } from "@/lib/services/book-creation.service";
import { getLogger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ enabled: process.env.ALLOW_CALIBRE_BOOK_CREATION === "true" });
}

export async function POST(request: NextRequest) {
  try {
    if (process.env.ALLOW_CALIBRE_BOOK_CREATION !== "true") {
      throw new BookCreationError("Book creation is disabled.", 403);
    }
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin) {
      throw new BookCreationError("Cross-origin book creation is not allowed.", 403);
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      getLogger().warn({ err: error }, "Invalid book creation JSON");
      throw new BookCreationError("Request body must be valid JSON.", 400);
    }
    const result = await bookCreationService.create(parseCalibreBookInput(body));
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    getLogger().error({ err: error }, "Error adding book");
    if (error instanceof BookCreationError) {
      return NextResponse.json({
        error: error.message,
        mayHaveCreated: error.mayHaveCreated,
        calibreId: error.calibreId,
      }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to add book. Check the Tome logs for details." }, { status: 500 });
  }
}
