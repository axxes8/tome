import { afterEach, describe, expect, test, vi } from "vitest";
import path from "node:path";
import os from "node:os";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { findCalibreBookByMetadata, getAllBookAuthors, resetCalibreDB } from "@/lib/db/calibre";
import { createDatabase } from "@/lib/db/factory";

describe("Calibre duplicate detection with real database", () => {
  afterEach(() => { resetCalibreDB(); vi.unstubAllEnvs(); });

  test("matches titles and author sets without touching existing metadata", () => {
    vi.stubEnv("CALIBRE_DB_PATH", path.resolve(__dirname, "..", "..", "..", "fixtures", "calibre-test-comprehensive.db"));
    expect(findCalibreBookByMetadata("Dune", ["Frank Herbert"])).toBe(147);
    expect(findCalibreBookByMetadata("dune", ["frank herbert"])).toBe(147);
    expect(findCalibreBookByMetadata("Dune", ["Different Author"])).toBeUndefined();
    expect(findCalibreBookByMetadata("Dune", ["Frank Herbert", "Other Author"])).toBeUndefined();
    expect(findCalibreBookByMetadata("A nonexistent title", ["Frank Herbert"])).toBeUndefined();
    expect(getAllBookAuthors([147]).get(147)).toEqual(["Frank Herbert"]);
    expect(getAllBookAuthors([]).size).toBe(0);
  });

  test("decodes Calibre's escaped commas for sync and duplicate checks", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "tome-author-encoding-test-"));
    const dbPath = path.join(directory, "metadata.db");
    let connection: ReturnType<typeof createDatabase> | undefined;
    try {
      await copyFile(path.resolve(__dirname, "..", "..", "..", "fixtures", "calibre-test-comprehensive.db"), dbPath);
      connection = createDatabase({ path: dbPath, wal: false, foreignKeys: false });
      connection.sqlite.prepare("UPDATE authors SET name = ? WHERE name = ?").run("Herbert| Frank", "Frank Herbert");
      vi.stubEnv("CALIBRE_DB_PATH", dbPath);
      expect(getAllBookAuthors([147]).get(147)).toEqual(["Herbert, Frank"]);
      expect(findCalibreBookByMetadata("Dune", ["Herbert, Frank"])).toBe(147);
      expect(findCalibreBookByMetadata("Dune", ["Different Author"])).toBeUndefined();
    } finally {
      resetCalibreDB();
      connection?.sqlite.close();
      await rm(directory, { recursive: true });
    }
  });
});
