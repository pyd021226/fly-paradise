import {specimenProfile, fmtDuration, sexName} from '../src/cabinet-specimen-view.mjs';
import {canNameColor, normalizeName} from '../src/cabinet-naming.mjs';
import { rarityForColor } from '../src/cabinet-rarity.mjs';
import { morphName, deriveProfile, passwordFor } from '../src/cabinet-profile.mjs';

const status = document.getElementById('status');
const empty = document.getElementById('empty');
const grid = document.getElementById('grid');
const refresh = document.getElementById('refresh');
const count = document.getElementById('count');

const SWATCH = { wild: '#d4a056', mid: '#aa743c', deep: '#4a2c12', white: '#f3eee4', green: '#1aa85a', green2: '#3dff88', red: '#c0392b', red2: '#ff5a4a', yellow: '#e6c84a', yellow2: '#ffe566', mut: '#c8932a' };
const SOURCE_TEXT = { appeared: '自然出现', eclose: '本机羽化', purchase: '购买到账', restore: '存档恢复', release: '瓶内放回', unlist: '下架返瓶', breed: '繁殖获得', import: '导入', unknown: '来源未知' };

function swatchColor(color) {
  return SWATCH[color] || '#c9c4b8';
}

function fmtTime(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '未知';
  const d = new Date(t);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function row(key, value, known) {
  const v = document.createElement('span');
  v.className = known === false ? 'v unknown' : 'v';
  v.textContent = value;
  const k = document.createElement('span');
  k.className = 'k';
  k.textContent = key;
  const wrap = document.createElement('div');
  wrap.className = 'row';
  wrap.append(k, v);
  return wrap;
}

function card(entry) {
  const profile = deriveProfile(entry);
  const codon = profile.codon;
  const geno = profile.geno;
  const password = passwordFor(entry.color, codon, profile.genoVerified);
  const node = document.createElement('article');
  node.className = 'card';
  node.dataset.color = entry.color;

  const head = document.createElement('div');
  head.className = 'card-head';
  const swatch = document.createElement('span');
  swatch.className = 'swatch';
  swatch.style.background = swatchColor(entry.color);
  const name = document.createElement('span');
  name.className = 'card-name';
  name.textContent = morphName(entry.color);
  const grade = document.createElement('span');
  grade.className = 'card-grade';
  grade.textContent = `${rarityForColor(entry.color).grade} 级`;
  head.append(swatch, name, grade);

  const shot = document.createElement('div');
  shot.className = 'card-shot';
  if (entry.image) {
    const img = document.createElement('img');
    img.src = entry.image;
    img.alt = morphName(entry.color) + ' 成虫外观快照';
    shot.append(img);
  } else {
    const slot = document.createElement('div');
    slot.className = 'noimg';
    slot.textContent = '外观快照缺失';
    shot.append(slot);
  }

  const meta = document.createElement('div');
  meta.className = 'card-meta';
  meta.append(row('显隐性写法', geno || '未知', !!geno));
  meta.append(row('基因码', codon || '未知', !!codon));
  meta.append(row('提供密码', password || '未知', !!password));

  const foot = document.createElement('div');
  foot.className = 'card-foot';
  const src = document.createElement('span');
  src.textContent = SOURCE_TEXT[entry.source] || SOURCE_TEXT.unknown;
  const seen = document.createElement('span');
  seen.textContent = '首次遇见 ' + fmtTime(entry.firstSeenAt);
  foot.append(src, seen);

  node.append(head, shot, meta, foot);
  return node;
}

let loadVersion = 0;
async function load() {
  const version = ++loadVersion;
  refresh.disabled = true;
  status.textContent = '正在读取遇见索引';
  try {
    const data = await window.cabinet.list();
    if (version !== loadVersion) return;
    if (!data || !Array.isArray(data.encounters)) throw Error('遇见索引无法读取');
    const list = data.encounters;
    count.textContent = String(list.length);
    renderSpecimens(Array.isArray(data.specimens) ? data.specimens : []);
    grid.replaceChildren(...list.map(card));
    // 只显示已经遇见的体色：没有空卡片、轮廓，也没有固定总数分母。
    grid.hidden = list.length === 0;
    empty.hidden = list.length !== 0;
    status.textContent = '';
  } catch (error) {
    if (version !== loadVersion) return;
    grid.replaceChildren();
    grid.hidden = true;
    empty.hidden = true;
    status.textContent = (error && error.message) || '遇见索引读取失败 请重试';
  } finally {
    if (version === loadVersion) refresh.disabled = false;
  }
}


const specimenGrid = document.getElementById('specimenGrid');
const dialog = document.getElementById('makeDialog');
const adultSelect = document.getElementById('adultSelect');
const makeStatus = document.getElementById('makeStatus');
const confirmMake = document.getElementById('confirmMake');
const cancelMake = document.getElementById('cancelMake');
let making = false;
let adults = [];
let lastSpecimens = null;
function textElement(tag, text, className) {
  const el = document.createElement(tag); el.textContent = text;
  if (className) el.className = className;
  return el;
}
function parentText(parent) {
  return parent ? `${parent.color} · ${parent.geno} · 基因码 ${parent.codon}` : '未知';
}
function renderSpecimens(records) {
  document.getElementById('specimenCount').textContent = records.length;
  document.getElementById('specimenEmpty').hidden = records.length > 0;
  const serialized = JSON.stringify(records);
  if (serialized === lastSpecimens) return;
  lastSpecimens = serialized;
  specimenGrid.replaceChildren(...records.map(specimenCard));
}
function specimenCard(record) {
  const profile = specimenProfile(record);
  const node = card({...record, source: 'manual', firstSeenAt: record.collectedAt});
  const grade = rarityForColor(record.color);
  node.dataset.grade = grade.grade;
  const head = node.querySelector('.card-head');
  const kind = document.createElement('span');
  kind.className = 'card-kind';
  kind.textContent = record.serverId ? '活体' : '标本';
  head.append(kind);
  node.querySelector('.card-name').textContent = profile.name || profile.color;
  node.querySelector('.card-foot').replaceChildren(textElement('span',record.source === 'capture-snapshot' ? '捕捉快照 · 活体保留' : '手动标本'),textElement('span',fmtTime(record.collectedAt)));
  const meta = node.querySelector('.card-meta');
  meta.replaceChildren(row('体色 / 性别', `${profile.color} / ${profile.sex}`),row('显隐性写法',profile.geno),row('基因码',profile.codon),row('提供密码',profile.password),row('寿命',`${fmtDuration(profile.lifespanMs)}${profile.mates == null ? '' : ' · 交配 ' + profile.mates + ' 次'}`),row('母本',parentText(profile.mother)),row('父本',profile.parentsMode === 'clone' ? '孤雌繁殖' : parentText(profile.father)));
  const message = textElement('p','','save-message'); message.setAttribute('role','status');
  if (canNameColor(record.color)) {
    const form = document.createElement('form'); form.className='edit-form';
    const label=textElement('label','标本命名 · 最多 20 字');
    const input=document.createElement('input');input.type='text';input.value=profile.name || '';input.setAttribute('aria-label','标本名称');label.append(input);
    const save=textElement('button','保存名称');save.type='submit';
    form.append(label,save);form.addEventListener('submit',async event=>{event.preventDefault();save.disabled=true;try{const name=normalizeName(input.value);const result=await window.cabinet.name({specimenId:record.specimenId,name});if(!result?.ok)throw Error(result?.error || '名称保存失败');input.value=name;node.querySelector('.card-name').textContent=name || profile.color;message.textContent='名称已保存';lastSpecimens=null;}catch(error){message.textContent=error.message;}finally{save.disabled=false;}});node.append(form);
  }
  const form=document.createElement('form');form.className='edit-form';
  const label=textElement('label','收藏备注');
  const note=document.createElement('textarea');note.maxLength=2000;note.rows=3;note.value=profile.note;note.setAttribute('aria-label','收藏备注');label.append(note);
  const counter=textElement('span',`${note.value.length}/2000`,'quiet');note.addEventListener('input',()=>counter.textContent=`${note.value.length}/2000`);
  const save=textElement('button','保存备注');save.type='submit';form.append(label,counter,save);
  form.addEventListener('submit',async event=>{event.preventDefault();save.disabled=true;try{const result=await window.cabinet.note({specimenId:record.specimenId,note:note.value});if(!result?.ok)throw Error(result?.error || '备注保存失败');message.textContent='备注已保存';lastSpecimens=null;}catch(error){message.textContent=error.message;}finally{save.disabled=false;}});
  const sellBtn=textElement('button','上架');sellBtn.type='button';sellBtn.className='edit-form button';sellBtn.addEventListener('click',()=>openSell(record,profile));
  node.append(form,sellBtn,message);return node;
}
const tabs=[document.getElementById('tabEncounters'),document.getElementById('tabSpecimens')];
function selectTab(index) {
  tabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;});
  document.getElementById('encounterSection').hidden=index!==0;
  document.getElementById('specimenSection').hidden=index!==1;
}
tabs.forEach((tab,index)=>{tab.addEventListener('click',()=>selectTab(index));tab.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?1:1-index;selectTab(next);tabs[next].focus();});});
function previewAdult() {
  const unit=adults.find(item=>item.captureId===adultSelect.value);
  const preview=document.getElementById('adultPreview');preview.replaceChildren();
  confirmMake.disabled=making || !unit;
  if (!unit) return;
  const snapshotOnly=unit.collectionMode === 'snapshot';
  document.getElementById('makeTitle').textContent=snapshotOnly ? '收藏捕捉快照' : '留下一份标本';
  document.getElementById('collectionIntro').textContent=snapshotOnly ? '保存这个已捕捉个体的外观与档案，活体继续留在瓶中' : '确认后，该个体将从瓶内移除，永久保存外观和档案';
  confirmMake.textContent=snapshotOnly ? '确认收藏快照 · 保留活体' : '确认制作标本 · 移除活体';
  const profile=deriveProfile({...unit,geneD:unit.gene_d,geneP:unit.gene_p});
  const liveMs = Number.isFinite(unit.liveMs) && unit.liveMs >= 0 ? unit.liveMs : null;
  const remaining = liveMs == null ? null : Math.max(0, 15 * 60 * 1000 - liveMs);
  const mates = Number.isInteger(unit.mates) && unit.mates >= 0 ? unit.mates : null;
  preview.append(row('体色 / 性别',`${morphName(unit.color)} / ${sexName(unit.sex)}`),row('显隐性写法',profile.geno || '未知'),row('基因码',unit.codon || '未知'),row('寿命',`${fmtDuration(remaining)}${mates == null ? '' : ' · 交配 ' + mates + ' 次'}`));
}
adultSelect.addEventListener('change',previewAdult);
document.getElementById('makeSpecimen').addEventListener('click',async()=>{
  makeStatus.textContent='正在读取瓶内个体';adults=[];adultSelect.replaceChildren();previewAdult();dialog.showModal();
  try{const result=await window.cabinet.adults();if(!result?.ok)throw Error(result?.error || '读取瓶内个体失败');if(!dialog.open)return;adults=result.adults || [];for(const unit of adults){const option=textElement('option',`${morphName(unit.color)} · ${sexName(unit.sex)} · ${unit.collectionMode === 'snapshot' ? '快照 / 保留活体' : '标本 / 移除活体'}`);option.value=unit.captureId;adultSelect.append(option);}makeStatus.textContent=adults.length?'请确认要留下的个体':'没有可收藏的自行捕捉活成虫。旧版本已入瓶的个体，请先放回桌面再重新捕捉一次';previewAdult();}catch(error){makeStatus.textContent=error.message;}
});
function cancelDialog(){if(!making)dialog.close();}
cancelMake.addEventListener('click',cancelDialog);dialog.addEventListener('cancel',event=>{event.preventDefault();cancelDialog();});
confirmMake.addEventListener('click',async()=>{
  if(making || !adults.some(unit=>unit.captureId===adultSelect.value))return;
  making=true;confirmMake.disabled=true;cancelMake.disabled=true;adultSelect.disabled=true;makeStatus.textContent='正在保存收藏';
  try{const result=await window.cabinet.make({captureId:adultSelect.value});if(!result?.ok)throw Error(result?.error || '制作失败');dialog.close();await load();status.textContent=result.warning || (result.retainedAlive ? '捕捉快照已收入展柜，活体仍保留在瓶中' : '标本已收藏');selectTab(1);}catch(error){makeStatus.textContent=error.message;}finally{making=false;cancelMake.disabled=false;adultSelect.disabled=false;previewAdult();}
});

refresh.addEventListener('click', load);
if (window.cabinet.onRefresh) window.cabinet.onRefresh(() => { if (!making) load(); });
load();

const backButton = document.getElementById('backToGame');
let returning = false;
async function returnToGame() {
  if (returning || making) return;
  returning = true;
  backButton.disabled = true;
  try {
    document.body.classList.add('leaving');
    await new Promise((resolve) => setTimeout(resolve, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 120));
    await window.cabinet.back();
  } catch (error) {
    status.textContent = (error && error.message) || '返回失败 请重试';
  } finally {
    document.body.classList.remove('leaving');
    returning = false;
    backButton.disabled = false;
  }
}
backButton.addEventListener('click', returnToGame);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !dialog.open) {
    event.preventDefault();
    returnToGame();
  }
});

if (window.cabinet.onEscape) window.cabinet.onEscape(() => { if (dialog.open) cancelDialog(); else returnToGame(); });

// ===== 上架 =====
const sellDialog = document.getElementById('sellDialog');
const sellNote = document.getElementById('sellNote');
const sellPrice = document.getElementById('sellPrice');
const sellStatus = document.getElementById('sellStatus');
let sellingRecord = null;
let selling = false;
function openSell(record, profile) {
  if (selling) return;
  sellingRecord = record;
  document.getElementById('sellTitle').textContent = '上架标本';
  document.getElementById('sellPreview').replaceChildren(
    row('体色', profile.color),
    row('性状', profile.geno),
    row('雌雄', profile.sex),
    row('寿命', `${fmtDuration(profile.lifespanMs)}${profile.mates == null ? '' : ' · 交配 ' + profile.mates + ' 次'}`),
    row('基因码', profile.codon),
  );
  sellNote.value = '';
  sellPrice.value = '';
  sellStatus.textContent = '';
  sellDialog.showModal();
}
function closeSell() { if (!selling) sellDialog.close(); }
document.getElementById('cancelSell').addEventListener('click', closeSell);
sellDialog.addEventListener('cancel', (event) => { event.preventDefault(); closeSell(); });
document.getElementById('confirmSell').addEventListener('click', async () => {
  if (selling || !sellingRecord) return;
  const note = sellNote.value.trim();
  const price = sellPrice.value;
  if (!note) { sellStatus.textContent = '请先写商品名'; return; }
  if (!(Number(price) >= 1)) { sellStatus.textContent = '请设置积分'; return; }
  selling = true;
  sellStatus.textContent = '正在上架…';
  try {
    const result = await window.cabinet.sell({ specimenId: sellingRecord.specimenId, note, price, codon: sellingRecord.codon || '', image: sellingRecord.image || null });
    if (!result || !result.ok) throw Error((result && result.error) || '上架失败');
    sellDialog.close();
    sellStatus.textContent = '';
    lastSpecimens = null;
    await load();
    selectTab(1);
  } catch (error) {
    sellStatus.textContent = error.message;
  } finally {
    selling = false;
  }
});
