const crypto = require("crypto");
const fs = require("fs");

const { dataFile } = require("../config");
const { readJSON, writeJSONFile } = require("../store");

// ─── TO DO ────────────────────────────────────────────────────────────────────
// The to-do list on the home page. One flat list: tasks in the order they were
// added, ticked off rather than deleted so a mis-tap can be undone, and cleared
// away in one go once they no longer matter.

const TODO_FILE = dataFile("todo.json");
if (!fs.existsSync(TODO_FILE)) fs.writeFileSync(TODO_FILE, JSON.stringify({ items: [] }, null, 2));

const TODO_MAX_ITEMS = 500;
const TODO_MAX_TEXT  = 300;

function readTodos()  { const d = readJSON(TODO_FILE, { items: [] }); if (!Array.isArray(d.items)) d.items = []; return d; }
function writeTodos(d){ writeJSONFile(TODO_FILE, d); }

// Whitespace collapsed so a pasted line break cannot make an item two rows tall.
const todoText = s => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, TODO_MAX_TEXT);

function newTodo(text) {
  return { id: "td_" + Date.now().toString(36) + crypto.randomBytes(3).toString("hex"),
           text, done: false, created: Date.now(), doneAt: null };
}

module.exports = { TODO_FILE, TODO_MAX_ITEMS, TODO_MAX_TEXT, newTodo, readTodos, todoText, writeTodos };
