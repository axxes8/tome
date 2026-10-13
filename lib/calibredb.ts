import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { getLogger } from "@/lib/logger";
import { BookCreationError, type CalibreBookInput } from "@/lib/calibre-book-input";

const execFileAsync = promisify(execFile);
export type CalibredbRunner = (args: string[]) => Promise<string>;

export const runCalibredb: CalibredbRunner = async args => {
  try {
    const { stdout } = await execFileAsync("calibredb", args, {
      timeout: 60000,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, LANG: "C.UTF-8", LC_ALL: "C.UTF-8", CALIBRE_OVERRIDE_LANG: "en", QT_QPA_PLATFORM: "offscreen" },
    });
    return stdout;
  } catch (error) {
    getLogger().error({ err: error }, "Calibredb book creation failed");
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    if (code === "ENOENT") {
      throw new BookCreationError("Calibre tools are not installed. Rebuild Tome using this fork's Dockerfile.", 503);
    }
    if (code === "EACCES") {
      throw new BookCreationError("Tome cannot execute calibredb. Check container permissions.", 503);
    }
    // The process may have committed before failing or timing out. Never retry it automatically.
    throw new BookCreationError("Calibre could not finish the operation. Check Calibre-Web for this book, then use Sync Calibre before trying again. Check library permissions and pause other library managers.", 502, true);
  }
};

export async function createEmptyCalibreBook(
  input: CalibreBookInput,
  runner: CalibredbRunner = runCalibredb
): Promise<number> {
  const dbPath = process.env.CALIBRE_DB_PATH;
  if (!dbPath || path.basename(dbPath) !== "metadata.db") {
    throw new BookCreationError("CALIBRE_DB_PATH must point to an existing Calibre metadata.db file.", 503);
  }
  const libraryPath = path.resolve(path.dirname(dbPath));
  try {
    await access(dbPath, constants.R_OK | constants.W_OK);
    await access(libraryPath, constants.R_OK | constants.W_OK);
  } catch (error) {
    getLogger().error({ err: error }, "Calibre library is not writable");
    throw new BookCreationError("Mount the entire existing Calibre library read-write and set PUID/PGID to a user with write access.", 503);
  }
  const args = [
    "add", `--with-library=${libraryPath}`, "--empty",
    `--title=${input.title}`, `--authors=${input.authors.join(" & ")}`,
  ];
  if (input.isbn) args.push(`--isbn=${input.isbn}`);
  if (input.tags.length) args.push(`--tags=${input.tags.join(",")}`);
  const output = await runner(args);
  const match = /^Added book ids:\s*(\d+)\s*$/m.exec(output);
  const id = match ? Number(match[1]) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0) {
    getLogger().error({ output }, "Calibredb did not return a single new book ID");
    throw new BookCreationError("Calibre did not confirm the new book ID. Check Calibre-Web and use Sync Calibre; do not submit this book again until checked.", 502, true);
  }
  return id;
}
