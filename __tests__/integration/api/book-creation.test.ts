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
    expect((await POST(crossOriginRequest)).status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  function withHeaders(req: NextRequest, overrides: Record<string, string>) {
    const getHeader = req.headers.get.bind(req.headers);
    vi.spyOn(req.headers, "get").mockImplementation(name =>
      overrides[name.toLowerCase()] ?? getHeader(name)
    );
    return req;
  }

  test("allows same-origin writes behind Docker port mapping", async () => {
    vi.spyOn(bookCreationService, "create").mockResolvedValue({ calibreId: 7, bookId: 3 });
    const mapped = withHeaders(
      new NextRequest("http://0.0.0.0:3000/api/books/create", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }),
      { origin: "http://192.168.1.76:8085", host: "192.168.1.76:8085", "sec-fetch-site": "same-origin" }
    );
    expect((await POST(mapped)).status).toBe(201);
  });

  test("allows same-origin writes behind a reverse proxy", async () => {
    vi.spyOn(bookCreationService, "create").mockResolvedValue({ calibreId: 7, bookId: 3 });
    const proxied = withHeaders(
      new NextRequest("http://0.0.0.0:3000/api/books/create", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }),
      { origin: "https://tome.example.com", host: "tome:3000", "x-forwarded-host": "tome.example.com" }
    );
    expect((await POST(proxied)).status).toBe(201);
  });

  test("rejects requests the browser marks cross-site", async () => {
    const create = vi.spyOn(bookCreationService, "create");
    const crossSite = withHeaders(request(body), { "sec-fetch-site": "cross-site" });
    expect((await POST(crossSite)).status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  test("surfaces partial creation instead of reporting success", async () => {
    vi.spyOn(bookCreationService, "create").mockRejectedValue(new BookCreationError("Saved, but sync failed", 502, true, 42));
    const response = await POST(request(body));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Saved, but sync failed", mayHaveCreated: true, calibreId: 42 });
  });
});
