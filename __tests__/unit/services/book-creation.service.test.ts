import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";
import { BookCreationError, parseCalibreBookInput } from "@/lib/calibre-book-input";
import { BookCreationService } from "@/lib/services/book-creation.service";

const input = { title: "A Book", authors: ["An Author"], tags: [] };

function createDependencies() {
  return {
    create: vi.fn(async () => 42),
    findDuplicate: vi.fn<(title: string, authors: string[]) => number | undefined>(() => undefined),
    sync: vi.fn(async () => ({
      success: true, syncedCount: 1, updatedCount: 0, removedCount: 0, totalBooks: 1,
    })),
    findBook: vi.fn<() => Promise<{ id: number } | undefined>>(async () => ({ id: 7 })),
    watcher: { suspend: vi.fn(), resume: vi.fn() },
  };
}

describe("metadata-only book creation", () => {
  beforeEach(() => vi.stubEnv("ALLOW_CALIBRE_BOOK_CREATION", "true"));
  afterEach(() => vi.unstubAllEnvs());

  test("normalizes metadata without losing commas in author names", () => {
    expect(parseCalibreBookInput({
      title: " A Book ", authors: [" Doe, Jane ", "Other Author"],
      tags: [" Fiction ", "Fiction"], isbn: "978-0-123456-78-9", libraryPaused: true,
    })).toEqual({
      title: "A Book", authors: ["Doe, Jane", "Other Author"],
      tags: ["Fiction"], isbn: "9780123456789",
    });
  });

  test.each([
    null, [], {}, { ...input, libraryPaused: false },
    { ...input, title: " ", libraryPaused: true },
    { ...input, title: "x".repeat(501), libraryPaused: true },
    { ...input, title: "A\0Book", libraryPaused: true },
    { ...input, authors: [], libraryPaused: true },
    { ...input, authors: [null], libraryPaused: true },
    { ...input, authors: ["A & B"], libraryPaused: true },
    { ...input, authors: Array(21).fill("Author"), libraryPaused: true },
    { ...input, tags: "Fiction", libraryPaused: true },
    { ...input, tags: ["Fiction,Fantasy"], libraryPaused: true },
    { ...input, isbn: "not-an-isbn", libraryPaused: true },
  ])("rejects invalid input %j", value => {
    expect(() => parseCalibreBookInput(value)).toThrow(BookCreationError);
  });

  test("creation remains disabled by default", async () => {
    vi.stubEnv("ALLOW_CALIBRE_BOOK_CREATION", "");
    const deps = createDependencies();
    await expect(new BookCreationService(deps).create(input)).rejects.toMatchObject({ status: 403 });
    expect(deps.create).not.toHaveBeenCalled();
  });

  test("creates then syncs and verifies the Tome book", async () => {
    const deps = createDependencies();
    await expect(new BookCreationService(deps).create(input)).resolves.toEqual({ calibreId: 42, bookId: 7 });
    expect(deps.create).toHaveBeenCalledWith(input);
    expect(deps.findBook).toHaveBeenCalledWith(42);
    expect(deps.watcher.suspend).toHaveBeenCalledOnce();
    expect(deps.watcher.resume).toHaveBeenCalledOnce();
  });

  test("rejects duplicates without touching the watcher or creating a book", async () => {
    const deps = createDependencies();
    deps.findDuplicate.mockReturnValue(42);
    await expect(new BookCreationService(deps).create(input)).rejects.toMatchObject({ status: 409 });
    expect(deps.create).not.toHaveBeenCalled();
    expect(deps.watcher.resume).not.toHaveBeenCalled();
  });

  test("preserves a saved Calibre book when sync fails", async () => {
    const deps = createDependencies();
    deps.sync.mockResolvedValue({ success: false, syncedCount: 0, updatedCount: 0, removedCount: 0, totalBooks: 0 });
    await expect(new BookCreationService(deps).create(input)).rejects.toMatchObject({
      status: 502, mayHaveCreated: true, calibreId: 42,
    });
    expect(deps.create).toHaveBeenCalledOnce();
    expect(deps.watcher.resume).toHaveBeenCalledOnce();
  });

  test("reports a missing Tome book as a partial failure", async () => {
    const deps = createDependencies();
    deps.findBook.mockResolvedValue(undefined);
    await expect(new BookCreationService(deps).create(input)).rejects.toMatchObject({ mayHaveCreated: true, calibreId: 42 });
  });

  test("resumes the watcher after command failure without retrying", async () => {
    const deps = createDependencies();
    deps.create.mockRejectedValue(new BookCreationError("Command timed out", 502, true));
    await expect(new BookCreationService(deps).create(input)).rejects.toMatchObject({ mayHaveCreated: true });
    expect(deps.create).toHaveBeenCalledOnce();
    expect(deps.sync).not.toHaveBeenCalled();
    expect(deps.watcher.resume).toHaveBeenCalledOnce();
  });

  test("rejects overlapping creates and releases its guard afterward", async () => {
    const deps = createDependencies();
    let finish: ((id: number) => void) | undefined;
    deps.create.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const service = new BookCreationService(deps);
    const first = service.create(input);
    await expect(service.create(input)).rejects.toMatchObject({ status: 409 });
    finish?.(42);
    await first;
    deps.create.mockResolvedValue(43);
    await expect(service.create(input)).resolves.toEqual({ calibreId: 43, bookId: 7 });
  });
});
