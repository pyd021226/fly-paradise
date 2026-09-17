import { Menu, Tray } from 'electron';

function menuItem(label, action, state, onAction, extra = {}) {
  return {
    label,
    click: () => onAction(action),
    ...extra,
    checked: extra.type === 'checkbox' ? !!state : undefined,
  };
}

export function createTrayController({ icon, onShow, onAction }) {
  const tray = new Tray(icon);
  let state = {};

  const rebuildMenu = () => {
    const menu = Menu.buildFromTemplate([
      { label: '打开控制面板', click: onShow },
      { type: 'separator' },
      menuItem('暂停活动', 'pause', state.paused, onAction, { type: 'checkbox' }),
      menuItem('全图透视', 'xray', state.watch, onAction, { type: 'checkbox' }),
      menuItem('快进', 'fast', state.fast, onAction, { type: 'checkbox' }),
      { type: 'separator' },
      menuItem(state.swatterOn ? '收起苍蝇拍' : '拿出苍蝇拍', 'swatter', false, onAction),
      menuItem(state.ragOn ? '收起抹布' : '拿出抹布', 'rag', false, onAction),
      { type: 'separator' },
      { label: '退出果蝇乐园', click: () => onAction('quit') },
    ]);
    tray.setContextMenu(menu);
  };

  tray.setToolTip('果蝇乐园');
  tray.on('click', onShow);
  rebuildMenu();

  return {
    update(next) {
      state = { ...state, ...next };
      rebuildMenu();
    },
    destroy() {
      tray.destroy();
    },
  };
}
