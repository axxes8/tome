import React from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AddBookModal } from "@/components/Library/AddBookModal";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function fillForm() {
  fireEvent.change(await screen.findByLabelText("Title *"), { target: { value: "A Book" } });
  fireEvent.change(screen.getByLabelText("Authors * (one per line)"), { target: { value: "Doe, Jane\nOther Author" } });
  fireEvent.click(screen.getByRole("checkbox"));
}

describe("AddBookModal", () => {
  test("requires shared-library acknowledgement and submits structured metadata", async () => {
    const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(
      async () => new Response(JSON.stringify({ calibreId: 42, bookId: 7 }), { status: 201 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const onCreated = vi.fn();
    render(<AddBookModal isOpen onClose={vi.fn()} onCreated={onCreated} />);
    const button = await screen.findByRole("button", { name: "Add Book" });
    expect(button.hasAttribute("disabled")).toBe(true);
    await fillForm();
    fireEvent.click(button);
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(7));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      title: "A Book", authors: ["Doe, Jane", "Other Author"], isbn: "", tags: [], libraryPaused: true,
    });
  });

  test("disables resubmission when the book may already have been saved", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      error: "Saved to Calibre; sync failed", mayHaveCreated: true,
    }), { status: 502 })));
    render(<AddBookModal isOpen onClose={vi.fn()} onCreated={vi.fn()} />);
    await fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Add Book" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Saved to Calibre");
    expect(screen.getByRole("button", { name: "Add Book" }).hasAttribute("disabled")).toBe(true);
  });

  test("preserves the form for correcting validation errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      error: "ISBN must contain 10 or 13 digits", mayHaveCreated: false,
    }), { status: 400 })));
    render(<AddBookModal isOpen onClose={vi.fn()} onCreated={vi.fn()} />);
    await fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Add Book" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Add Book" }).hasAttribute("disabled")).toBe(false);
    expect((screen.getByLabelText("Title *") as HTMLInputElement).value).toBe("A Book");
  });

  test("treats a lost response as unconfirmed, rather than offering a blind retry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Network disconnected"); }));
    render(<AddBookModal isOpen onClose={vi.fn()} onCreated={vi.fn()} />);
    await fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Add Book" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Check Calibre-Web");
    expect(screen.getByRole("button", { name: "Add Book" }).hasAttribute("disabled")).toBe(true);
  });
});
