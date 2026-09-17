import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindPanelLifecycle } from '../src/panel-lifecycle.js';

for (const tool of ['swatter', 'rag']) {
  test(`${tool}: minimize keeps tool armed and restore repairs panel layer`, () => {
    const win = new EventEmitter();
    let armed = tool, captured = true, restores = 0, hidden = false;
    win.hide = () => { hidden = true; win.emit('hide'); };
    bindPanelLifecycle(win, { isQuitting: () => false, restoreLayer: () => restores++ });
    win.emit('minimize');
    assert.equal(hidden, true);
    assert.equal(armed, tool); assert.equal(captured, true);
    win.emit('restore'); win.emit('show');
    assert.equal(armed, tool); assert.equal(captured, true);
    assert.equal(restores, 2);
  });
}
test('close hides while quit permits normal window destruction', () => {
  const win = new EventEmitter();
  let quitting = false, hidden = 0, prevented = 0, restored = 0;
  win.hide = () => { hidden++; };
  bindPanelLifecycle(win, { isQuitting: () => quitting, restoreLayer: () => restored++ });
  const event = { preventDefault: () => prevented++ };
  win.emit('close', event);
  assert.deepEqual([hidden, prevented, restored], [1, 1, 0]);
  quitting = true; win.emit('close', event); win.emit('minimize');
  assert.deepEqual([hidden, prevented, restored], [1, 1, 0]);
});
