// Hiding the control panel must not interrupt an active desktop tool.
export function bindPanelLifecycle(win, { isQuitting, restoreLayer }) {
  const hide = (event) => {
    if (isQuitting()) return;
    event?.preventDefault();
    win.hide();
  };
  win.on('minimize', hide);
  win.on('close', hide);
  win.on('show', restoreLayer);
  win.on('restore', restoreLayer);
}
