import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { cors } from "hono/cors";
import { compress } from "hono/compress";
import {
  createNote,
  Note,
  deleteNote,
  getNote,
  updateNote,
  getPaginate,
  getNoteByText,
} from "./notes";
import {
  CreateNoteRequestSchema,
  getPaginateNotesSchema,
  getSingleNoteSchema,
  updateNoteRequestSchema,
} from "./schema";

const app = new Hono();

app.use("*", secureHeaders());

app.use("*", compress());

app.use(
  "*",
  cors({
    origin: ["https://seen.red"],
  })
);

// TODO: Pagination
// CREATe
app.post("/", async (c) => {
  // const data = await c.req.json();
  let data: Note;

  try {
    data = await c.req.json();
  } catch (error) {
    console.error(error);
    c.status(400);
    return c.json({
      success: false,
      message: "Invalid JSON in the request body",
    });
  }

  const validation = CreateNoteRequestSchema.safeParse(data);
  //Valid DATA
  if (!validation.success) {
    c.status(400);
    return c.json({
      success: false,
      message: JSON.parse(validation.error.message)[0],
    });
  }

  // Database Error Handling
  let success = true;
  let message = "Successfully retrieved";
  let notes: Note[];

  const validatedData = validation.data;

  try {
  } catch (error) {
    c.status(500);
    success = false;
    message = "Error retrieving notes";
    console.error("Error connecting to DB.", error);
    notes = [];
    return c.json({ success, message, notes });
  }
  const note = await getNoteByText(data.text);

  if (note) {
    return c.json({ message: "already exists" });
  }

  const newNote: Partial<Note> = {
    text: validatedData.text,
    date: new Date(validatedData.date || Date.now()),
  };

  // Handle createNote() Errors
  let dbNote: Note;

  try {
    dbNote = await createNote(newNote);
  } catch (error) {
    console.error(error);
    return c.json({
      success: false,
      message: "Failed to create note",
      error: error.message,
    });
  }

  console.log({ dbNote });

  return c.json({ success, message, note: dbNote });
});

app.get("/:id", async (c) => {
  const result = getSingleNoteSchema.safeParse(c.req.param("id"));

  if (!result.success) {
    c.status(400);
    return c.json({
      success: false,
      message: JSON.parse(result.error.message)[0].message,
    });
  }

  const id = result.data;

  let note: Note | undefined;
  let success = true;
  let message = "A note found";

  try {
    note = await getNote(id);
  } catch (error) {
    c.status(500);
    success = false;
    message = "Error connecting to the database.";
    console.error("Error connecting to DB.", error);
    return c.json({ success, message });
  }

  if (!note) {
    c.status(404);
    return c.json({ success: false, message: "note not found" });
  }

  return c.json({ success, message, note });
});

//UPDATE
app.put("/:id", async (c) => {
  // UPDATE body
  const result = getSingleNoteSchema.safeParse(c.req.param("id"));

  let data: unknown;

  try {
    data = await c.req.json();
  } catch (error) {
    console.error(error);
    c.status(400);
    return c.json({
      success: false,
      message: "Invalid JSON in the request body",
    });
  }

  if (!result.success) {
    c.status(400);
    return c.json({
      success: false,
      message: JSON.parse(result.error.message)[0].message,
    });
  }

  const id = result.data;

  const validation = updateNoteRequestSchema.safeParse(data);

  if (!validation.success) {
    c.status(400);
    return c.json({
      success: false,
      message: JSON.parse(validation.error.message)[0],
    });
  }

  const validatedData = validation.data;

  let success = true;
  let message = "Successfully retrieved";
  let note: Note | undefined;

  try {
    const found = await getNote(result.data);

    if (!found) {
      c.status(404);
      return c.json({ success: false, message: "Note not found in database." });
    }

    note = found;
  } catch (error) {
    c.status(500);
    success = false;
    message = "Error retrieving notes";
    console.error("Error connecting to DB.", error);
    return c.json({ success, message });
  }

  const found = await getNote(result.data);

  if (!found) {
    c.status(404);
    return c.json({ success: false, message: "Note not found in database." });
  }

  note = {
    id: note.id,
    text: validatedData.text || note.text,
    date: new Date(validatedData.date || note.date.getTime()),
  };

  try {
    await updateNote(note.id, note);
  } catch (error) {
    console.error(error);
    c.status(500);
    return c.json({ success: false, message: "Error in updating the note" });
  }

  return c.json({ success: true, message: "successfully updated" });
});

//DELETE
app.delete("/:id", async (c) => {
  const result = getSingleNoteSchema.safeParse(c.req.param("id"));

  if (!result.success) {
    c.status(400);
    return c.json({
      success: false,
      message: JSON.parse(result.error.message)[0].message,
    });
  }

  const id = result.data;

  let success = true;
  let message = "Successfully retrieved";
  let notes: Note[];

  try {
    const found = await getNote(result.data);

    if (!found) {
      c.status(404);
      return c.json({ success: false, message: "Note not found in database." });
    }
  } catch (error) {
    c.status(500);
    success = false;
    message = "Not found notes from the database";
    console.error("DB connection error.", error);
    return c.json({ success, message });
  }

  // const found = await getNote(result.data);

  // if (!found) {
  //   c.status(404);
  //   return c.json({ success: false, message: "Note not found in database." });
  // }

  // notes.splice(found, 1);

  try {
    await deleteNote(id);
  } catch (error) {
    console.error(error);
    success = false;
    message = "Dosen't delete the note.";
  }

  return c.json({ success, message });
});

// LIST
app.get("/", async (c) => {
  let success = true;
  let message = "Successfully retrieved";
  let notes: Note[];

  const limit = parseInt(c.req.query("limit") || "10");
  const page = parseInt(c.req.query("page") || "0");
  const id = parseInt(c.req.query("id") || "0");

  const result = getPaginateNotesSchema.safeParse({ limit, page, id });

  if (!result.success) {
    c.status(400);
    return c.json({
      success: false,
      message: JSON.parse(result.error.message)[0].message,
    });
  }

  try {
    // notes = await getPaginate(result.data as { limit: number; page: number });
    notes = await getPaginate(result.data as Parameters<typeof getPaginate>[0]);
  } catch (error) {
    c.status(500);
    success = false;
    message = "Error retrieving notes";
    console.error("Error connecting to DB.", error);
    notes = [];
  }

  return c.json({ success, message, notes });
});

serve(app);
