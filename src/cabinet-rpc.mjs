// 主进程 -> 游戏 overlay 的请求/应答通道。
// 名蛆堂页面住在独立渲染进程里，拿不到瓶内数据，必须经主进程中转到游戏渲染进程。
// 只有可信的游戏 overlay 主框架可以应答。
export function createCabinetRpc({ipcMain, trustedSender, timeoutMs = 10000}) {
  const pending = new Map();
  let disposed = false;

  function trusted(event) {
    const sender = trustedSender();
    if (!sender || sender.isDestroyed()) return false;
    return event.sender === sender && event.senderFrame === sender.mainFrame;
  }

  function onReply(event, data) {
    if (!trusted(event)) return;
    const item = pending.get(data && data.requestId);
    if (!item) return;
    clearTimeout(item.timer);
    pending.delete(data.requestId);
    if (data.error) item.reject(Error(String(data.error)));
    else item.resolve(data.result);
  }

  ipcMain.on('cabinet-reply', onReply);

  return {
    request(name, arg = {}) {
      if (disposed) return Promise.reject(Error('名蛆堂通道已关闭'));
      const sender = trustedSender();
      if (!sender || sender.isDestroyed()) return Promise.reject(Error('游戏窗口不可用'));
      return new Promise((resolve, reject) => {
        const requestId = Math.random().toString(36).slice(2) + Date.now().toString(36);
        const timer = setTimeout(() => {
          pending.delete(requestId);
          reject(Error('游戏没有在 ' + timeoutMs + ' ms 内回应'));
        }, timeoutMs);
        pending.set(requestId, {resolve, reject, timer});
        sender.send('cabinet-request', {requestId, name, arg});
      });
    },
    dispose() {
      disposed = true;
      for (const item of pending.values()) {
        clearTimeout(item.timer);
        item.reject(Error('名蛆堂通道已关闭'));
      }
      pending.clear();
      ipcMain.removeListener('cabinet-reply', onReply);
    },
  };
}
