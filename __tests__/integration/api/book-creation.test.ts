import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/books/create/route";
import { bookCreationService } from "@/lib/services/book-creation.service";
import { BookCreationError } from "@/lib/calibre-book-input";

const body = { title: "Book", authors: ["Author"], tags: [], libraryPaused: true };
function request(payload: unknown, origin = "http://localhost:3000") {
  return new NextRequest("http://localhost:3000/api/books/create", {
    method: "POST", headers: { "Content-Type": "application/json", origin },
    body: JSON.stringify(payload),
  });
}

describe("book creation API", () => {
  beforeEach(() => vi.stubEnv("ALLOW_CALIBRE_BOOK_CREATION", "true"));
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  test("returns opt-in capabilities", async () => {
    expect(await (await GET()).json()).toEqual({ enabled: true });
    vi.stubEnv("ALLOW_CALIBRE_BOOK_CREATION", "");
    expect(await (await GET()).json()).toEqual({ enabled: false });
    expect((await POST(request(body))).status).toBe(403);
  });

  test("returns the created Calibre and Tome IDs", async () => {
    const create = vi.spyOn(bookCreationService, "create").mockResolvedValue({ calibreId: 42, bookId: 7 });
    const response = await POST(request(body));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ calibreId: 42, bookId: 7 });
    expect(create).toHaveBeenCalledWith({ title: "Book", authors: ["Author"], tags: [], isbn: undefined });
  });

  test("rejects malformed JSON and invalid metadata before creation", async () => {
    const create = vi.spyOn(bookCreationService, "create");
    expect((await POST(request({ ...body, title: "" }))).status).toBe(400);
    const malformed = new NextRequest("http://localhost:3000/api/books/create", { method: "POST", body: "{" });
    expect((await POST(malformed)).status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  test("rejects cross-origin writes", async () => {
    const create = vi.spyOn(bookCreationService, "create");
    const crossOriginRequest = request(body, "http://example.com");
    const getHeader = crossOriginRequest.headers.get.bind(crossOriginRequest.headers);
    // Happy DOM strips Origin from constructed requests; model a real browser header.
    vi.spyOn(crossOriginRequest.headers, "get").mockImplementation(name =>
      name.toLowerCase() === "origin" ? "http://example.com" : getHeader(name)
    );
    expect(crossOriginRequest.nextUrl.origin).toBe("http://localhost:3000");
    expect((await POST(crossOriginRequest)).status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  test("surfaces partial creation instead of reporting success", async () => {
    vi.spyOn(bookCreationService, "create").mockRejectedValue(new BookCreationError("Saved, but sync failed", 502, true, 42));
    const response = await POST(request(body));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Saved, but sync failed", mayHaveCreated: true, calibreId: 42 });
  });
});
