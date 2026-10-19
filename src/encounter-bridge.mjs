// 主进程侧：把渲染进程上报的成虫出现事件落盘到遇见索引。
// 只有可信的游戏渲染进程主框架可以读写；其他窗口与子框架一律拒绝。
export function registerEncounterBridge({ ipcMain, createStore, trustedSender = () => null, onCountChanged = () => {} }) {
  let store = null;
  let disposed = false;

  function ensure() {
    if (disposed) throw Error('遇见索引已关闭');
    if (!store) store = createStore();
    return store;
  }

  // 上报来源必须是当前游戏 overlay 的主框架，防止其他窗口或子框架伪造遇见记录。
  function trusted(event) {
    if (disposed) throw Error('遇见索引已关闭');
    const sender = trustedSender();
    if (!sender || sender.isDestroyed()) throw Error('遇见索引通道不可用');
    if (event.sender !== sender || event.senderFrame !== sender.mainFrame) {
      throw Error('不允许的遇见上报来源');
    }
  }

  function onSeenColors(event) {
    let colors = [];
    try {
      trusted(event);
      const current = ensure();
      colors = current.list().filter(record => !current.needsImageRefresh?.(record.color)).map(record => record.color);
    } catch {
      colors = [];
    }
    if (!event.sender.isDestroyed()) event.sender.send('encounter-seen-colors-result', colors);
  }

  function onSeen(event, payload) {
    const reply = (message) => {
      if (!event.sender.isDestroyed()) event.sender.send('encounter-result', message);
    };
    try {
      trusted(event);
      const color = String((payload && payload.color) || '').trim();
      if (!color) throw Error('缺少体色');
      const current = ensure();
      if (current.has(color) && !current.needsImageRefresh?.(color)) {
        reply({ ok: true, color, already: true });
        return;
      }
      current.record({
        color,
        source: payload && payload.source,
        codon: payload && payload.codon,
        sex: payload && payload.sex,
        geno: payload && payload.geno,
        geneD: payload && payload.geneD,
        geneP: payload && payload.geneP,
        genoVerified: payload && payload.genoVerified === true,
        image: payload && payload.image,
      });
      reply({ ok: true, color, already: false });
      onCountChanged(current.count());
    } catch (error) {
      reply({ ok: false, color: (payload && payload.color) || null, error: (error && error.message) || '遇见记录失败' });
    }
  }

  ipcMain.on('encounter-seen-colors', onSeenColors);
  ipcMain.on('encounter-seen', onSeen);

  return {
    has: (color) => { try { return ensure().has(color); } catch { return false; } },
    count: () => { try { return ensure().count(); } catch { return 0; } },
    list: () => ensure().list(),
    listColors: () => ensure().list().map((record) => record.color),
    readImage: (name) => ensure().readImage(name),
    dispose: () => {
      disposed = true;
      store = null;
      ipcMain.removeListener('encounter-seen-colors', onSeenColors);
      ipcMain.removeListener('encounter-seen', onSeen);
    },
  };
}
