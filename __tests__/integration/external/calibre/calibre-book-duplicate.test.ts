import { afterEach, describe, expect, test, vi } from "vitest";
import path from "node:path";
import { findCalibreBookByMetadata, getAllBookAuthors, resetCalibreDB } from "@/lib/db/calibre";

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
});
