(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TrackerModel = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const fields = ['p', 'priority', 'title', 'details', 'sub', 'owner', 'req', 'days', 'completedAt', 'createdAt'];
  const clone = x => JSON.parse(JSON.stringify(x));
  function canonical(x) {
    if (Array.isArray(x)) return '[' + x.map(canonical).join(',') + ']';
    if (x && typeof x === 'object') return '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + canonical(x[k])).join(',') + '}';
    return JSON.stringify(x === undefined ? null : x);
  }
  const equal = (a, b) => canonical(a) === canonical(b);
  class Conflict extends Error {
    constructor(message, details = {}) { super(message); this.name = 'Conflict'; this.status = 409; this.details = details; }
  }
  function diff(before, after) {
    const changes = [];
    const oldTasks = new Map(before.data.map(t => [t.id, t]));
    const newTasks = new Map(after.data.map(t => [t.id, t]));
    for (const t of after.data) {
      const prev = oldTasks.get(t.id);
      if (!prev) { changes.push({ type: 'task.add', task: clone(t) }); continue; }
      const patch = {};
      for (const f of fields) if (!equal(prev[f], t[f])) patch[f] = { before: prev[f] ?? null, after: t[f] ?? null };
      if (Object.keys(patch).length) changes.push({ type: 'task.edit', taskId: t.id, fields: patch });
      const oldNotes = new Map((prev.updates || []).map(n => [n.id, n]));
      const newNotes = new Map((t.updates || []).map(n => [n.id, n]));
      for (const n of t.updates || []) {
        const old = oldNotes.get(n.id);
        if (!old) changes.push({ type: 'note.add', taskId: t.id, note: clone(n) });
        else if (!equal(old, n)) changes.push({ type: 'note.edit', taskId: t.id, noteId: n.id, before: clone(old), after: clone(n) });
      }
      for (const n of prev.updates || []) if (!newNotes.has(n.id)) changes.push({ type: 'note.delete', taskId: t.id, noteId: n.id, before: clone(n) });
    }
    for (const t of before.data) if (!newTasks.has(t.id)) changes.push({ type: 'task.delete', taskId: t.id, before: clone(t) });
    if (!equal(before.emailRecipients, after.emailRecipients)) changes.push({ type: 'settings.edit', before: before.emailRecipients || [], after: after.emailRecipients || [] });
    return changes;
  }
  function apply(state, changes) {
    const next = clone(state);
    for (const c of changes) {
      if (c.type === 'auth.edit') continue; // Private role settings are checked by the journal adapter.
      if (c.type === 'settings.edit') {
        if (!equal(next.emailRecipients, c.before) && !equal(next.emailRecipients, c.after)) throw new Conflict('Email recipients changed on another PC.', { change: c });
        next.emailRecipients = clone(c.after); continue;
      }
      const t = next.data.find(t => t.id === (c.taskId ?? c.task?.id));
      if (c.type === 'task.add') {
        if (t) throw new Conflict('This activity ID already exists.', { change: c });
        next.data.push(clone(c.task)); continue;
      }
      if (!t) throw new Conflict('This activity was deleted on another PC.', { change: c });
      if (c.type === 'task.delete') {
        if (!equal(t, c.before)) throw new Conflict('This activity has newer edits or notes. Review them before deleting.', { change: c, current: t });
        next.data = next.data.filter(x => x.id !== t.id); continue;
      }
      if (c.type === 'task.edit') {
        for (const [f, v] of Object.entries(c.fields)) {
          if (!fields.includes(f)) throw new Error('Unknown activity field: ' + f);
          if (!equal(t[f], v.before) && !equal(t[f], v.after)) throw new Conflict('Another PC changed “' + f + '”. Both versions are retained for review.', { change: c, field: f, current: t[f] ?? null });
          t[f] = clone(v.after);
        }
        continue;
      }
      t.updates ||= [];
      const n = t.updates.find(n => n.id === (c.noteId ?? c.note?.id));
      if (c.type === 'note.add') {
        if (n) throw new Conflict('This note ID already exists.', { change: c });
        t.updates.unshift(clone(c.note)); continue;
      }
      if (!n) throw new Conflict('This note was deleted on another PC.', { change: c });
      if (!equal(n, c.before) && !(c.type === 'note.edit' && equal(n, c.after))) throw new Conflict('Another PC edited this note. Both versions are retained for review.', { change: c, current: n });
      if (c.type === 'note.edit') t.updates[t.updates.indexOf(n)] = clone(c.after);
      else if (c.type === 'note.delete') t.updates = t.updates.filter(n => n.id !== c.noteId);
      else throw new Error('Unknown change type.');
    }
    return next;
  }
  return { fields, clone, equal, canonical, Conflict, diff, apply };
});
