// 名蛆堂跨层契约：主进程服务与游戏 overlay 必须共用同一份请求名与字段，
// 任何一侧改名都会在测试里立刻暴露（tests/cabinet-contract.test.mjs）。
export const CABINET_CHANNEL = 'cabinet-request';
export const CABINET_REPLY_CHANNEL = 'cabinet-reply';

export const CABINET_REQUESTS = Object.freeze({
  // 交回已消费身份（恢复核对用），游戏据此把不该留在瓶内的个体清掉
  ORIGINS: 'origins',
  // 列出可制作的瓶内活成虫
  LIST: 'list',
  // 锁定并冻结一个个体，返回成年个体资料 + 外观快照 + 制作前完整存档快照
  PREPARE: 'prepare',
  // 提交：核对事务三元组后移除该个体
  COMMIT: 'commit',
  // 恢复核对：按身份移除残留个体
  RECONCILE: 'reconcile',
  // 取消未提交的 prepare
  ABORT: 'abort',
  // 上架消耗：把已上架的活体从瓶内移除
  REMOVE_LISTED: 'remove-listed',
});

export const CABINET_REQUEST_NAMES = Object.freeze(Object.values(CABINET_REQUESTS));

// prepare 的入参与出参（服务与 overlay 必须一致）
export const PREPARE_ARG_FIELDS = Object.freeze(['transactionId', 'runId', 'originId', 'captureId']);
export const PREPARE_RESULT_FIELDS = Object.freeze(['adult', 'image', 'beforeSnapshot']);
// commit / reconcile 的入参
export const IDENTITY_FIELDS = Object.freeze(['transactionId', 'runId', 'originId', 'captureId']);
// commit / reconcile 的出参
export const REMOVE_RESULT_FIELDS = Object.freeze(['removed', 'afterSnapshot']);

export function missingFields(object, fields) {
  if (!object || typeof object !== 'object') return [...fields];
  return fields.filter((field) => object[field] === undefined || object[field] === null);
}
