import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createEmptyCalibreBook } from "@/lib/calibredb";

describe("calibredb empty book command", () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "tome-calibredb-test-"));
    const dbPath = path.join(directory, "metadata.db");
    await writeFile(dbPath, "");
    vi.stubEnv("CALIBRE_DB_PATH", dbPath);
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true });
  });

  test("passes options as discrete arguments, with no ebook file", async () => {
    const runner = vi.fn(async () => "Added book ids: 123\n");
    expect(await createEmptyCalibreBook({
      title: '--help; "quoted" book', authors: ["Doe, Jane", "Other Author"],
      isbn: "9780123456789", tags: ["Physical", "Wishlist"],
    }, runner)).toBe(123);
    expect(runner).toHaveBeenCalledWith([
      "add", `--with-library=${directory}`, "--empty",
      '--title=--help; "quoted" book', "--authors=Doe, Jane & Other Author",
      "--isbn=9780123456789", "--tags=Physical,Wishlist",
    ]);
  });

  test.each(["", "Added book ids: 1, 2\n", "Added book ids: 0\n", "Added book ids: 99999999999999999999\n"])(
    "marks unconfirmed output as potentially committed: %j", async output => {
      await expect(createEmptyCalibreBook({ title: "Book", authors: ["Author"], tags: [] }, async () => output))
        .rejects.toMatchObject({ status: 502, mayHaveCreated: true });
    }
  );

  test("rejects a missing library rather than allowing Calibre to create a new one", async () => {
    vi.stubEnv("CALIBRE_DB_PATH", path.join(directory, "missing", "metadata.db"));
    const runner = vi.fn(async () => "Added book ids: 1\n");
    await expect(createEmptyCalibreBook({ title: "Book", authors: ["Author"], tags: [] }, runner))
      .rejects.toMatchObject({ status: 503, mayHaveCreated: false });
    expect(runner).not.toHaveBeenCalled();
  });
});
