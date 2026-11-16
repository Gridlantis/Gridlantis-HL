const { TODO_MAX_ITEMS, newTodo, readTodos, todoText, writeTodos } = require("../domains/todo");
const { broadcast } = require("../sse");

// The home page's to-do list. Every change answers with the whole list and tells
// other open pages, so a task ticked off on the phone disappears on the desktop.
module.exports = async function todoRoutes(ctx) {
  const { req, pathname, json, readBody } = ctx;
  if (pathname !== '/api/todo' && !pathname.startsWith('/api/todo/')) return;

  const saved = d => { writeTodos(d); broadcast('todo_changed', {}); return json({ ok: true, items: d.items }); };

  if (pathname === '/api/todo' && req.method === 'GET') return json(readTodos());

  if (pathname === '/api/todo' && req.method === 'POST') {
    const b = JSON.parse((await readBody(64 * 1024)).toString() || '{}');
    const text = todoText(b.text);
    if (!text) return json({ error: 'Write something to do' }, 400);
    const d = readTodos();
    if (d.items.length >= TODO_MAX_ITEMS) return json({ error: 'The list is full (' + TODO_MAX_ITEMS + '). Clear the done tasks.' }, 400);
    d.items.push(newTodo(text));
    return saved(d);
  }

  // Removes every ticked-off task.
  if (pathname === '/api/todo/clear-done' && req.method === 'POST') {
    const d = readTodos();
    d.items = d.items.filter(t => !t.done);
    return saved(d);
  }

  const id = pathname.split('/')[3];
  if (req.method === 'PUT') {
    const b = JSON.parse((await readBody(64 * 1024)).toString() || '{}');
    const d = readTodos();
    const t = d.items.find(x => x.id === id);
    if (!t) return json({ error: 'That task is gone' }, 404);
    if (b.text !== undefined) {
      const text = todoText(b.text);
      if (!text) return json({ error: 'A task needs some words' }, 400);
      t.text = text;
    }
    if (b.done !== undefined) { t.done = !!b.done; t.doneAt = t.done ? Date.now() : null; }
    return saved(d);
  }
  if (req.method === 'DELETE') {
    const d = readTodos();
    const n = d.items.length;
    d.items = d.items.filter(x => x.id !== id);
    if (d.items.length === n) return json({ error: 'That task is gone' }, 404);
    return saved(d);
  }
};
