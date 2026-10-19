import path from 'node:path';

// The archive is a child view of the game window; its game renderer stays alive.
export function registerCabinetPage({WebContentsView,ipcMain,appDirectory,parent,getWorkArea,listEncounters=()=>[],listSpecimens=()=>[],cabinetAdults=async()=>[],cabinetMake=async()=>({ok:false,error:'制作不可用'}),cabinetNote=async()=>{throw Error('备注不可用')},cabinetName=async()=>{throw Error('命名不可用')},cabinetSell=async()=>({ok:false,error:'上架不可用'}),onVisibilityChanged=()=>{},onError=error=>console.error('名蛆堂加载失败',error)}){
 let host=null,view=null,saved=null,attached=false,disposed=false;
 function trusted(event){
  if(disposed||!attached||!view||view.webContents.isDestroyed()||event.sender!==view.webContents||event.senderFrame!==view.webContents.mainFrame){
   throw Error('不允许的名蛆堂请求来源');
  }
 }
 ipcMain.handle('cabinet-list',event=>{trusted(event);return {specimens:listSpecimens(),encounters:listEncounters()};});
 ipcMain.handle('cabinet-adults',async event=>{trusted(event);
  try{return {ok:true,adults:await cabinetAdults()};}catch(error){return {ok:false,error:(error&&error.message)||'读取瓶内个体失败'};}});
 ipcMain.handle('cabinet-make',async(event,arg)=>{trusted(event);
  try{return await cabinetMake(arg);}catch(error){return {ok:false,error:(error&&error.message)||'制作失败'};}});
 ipcMain.handle('cabinet-note',async(event,arg)=>{trusted(event);
  try{return {ok:true,specimen:await cabinetNote(arg)};}catch(error){return {ok:false,error:(error&&error.message)||'备注保存失败'};}});
 ipcMain.handle('cabinet-name',async(event,arg)=>{trusted(event);
  try{return {ok:true,specimen:await cabinetName(arg)};}catch(error){return {ok:false,error:(error&&error.message)||'命名失败'};}});
 ipcMain.handle('cabinet-sell',async(event,arg)=>{trusted(event);
  try{return await cabinetSell(arg);}catch(error){return {ok:false,error:(error&&error.message)||'上架失败'};}});
 ipcMain.handle('cabinet-back',event=>{trusted(event);back();return {ok:true};});
 function refresh(){if(disposed||!attached||!view||view.webContents.isDestroyed())return;view.webContents.send('cabinet-refresh');}
 function layout(){
  if(!attached||!view||!host||host.isDestroyed())return;
  const [width,height]=host.getContentSize();view.setBounds({x:0,y:0,width,height});
 }
 function back(){
  if(!attached)return;
  const retired=view;
  attached=false;view=null;
  if(host&&!host.isDestroyed()){
   host.contentView.removeChildView(retired);
   host.setMinimumSize(...saved.minimum);host.setBounds(saved.bounds);host.setTitle(saved.title);
   host.webContents.focus();
  }
  onVisibilityChanged(false);
  // Finish the IPC response before closing its sender. Never reattach a retired native view.
  if(retired)setImmediate(()=>{if(!retired.webContents.isDestroyed())retired.webContents.close();});
 }
 function open(){
  if(disposed)throw Error('名蛆堂页面已关闭');
  const currentHost=parent();
  if(!currentHost||currentHost.isDestroyed())throw Error('游戏主窗口不可用');
  if(attached){host.show();host.focus();view.webContents.focus();return view;}
  if(!host){host=currentHost;host.on('resize',layout);host.once('closed',dispose);}
  if(host.isMinimized())host.restore();
  saved={bounds:host.getBounds(),minimum:host.getMinimumSize(),title:host.getTitle()};
  let created=false;
  if(!view||view.webContents.isDestroyed()){
   view=new WebContentsView({webPreferences:{preload:path.join(appDirectory,'preload-cabinet.mjs'),contextIsolation:true,nodeIntegration:false,sandbox:false}});
   const current=view;created=true;
   current.webContents.setWindowOpenHandler(()=>({action:'deny'}));
   current.webContents.on('will-navigate',event=>event.preventDefault());
   current.webContents.on('destroyed',()=>{if(view===current){back();view=null;}});
  }
  attached=true;onVisibilityChanged(true);
  const area=getWorkArea(saved.bounds),width=Math.min(1120,area.width),height=Math.min(800,area.height);
  host.setMinimumSize(Math.min(600,area.width),Math.min(480,area.height));
  host.setBounds({x:area.x+Math.floor((area.width-width)/2),y:area.y+Math.floor((area.height-height)/2),width,height});
  host.setTitle('名蛆堂');host.contentView.addChildView(view);layout();host.show();host.focus();view.webContents.focus();
  if(created){
   const current=view;
   current.webContents.loadFile(path.join(appDirectory,'renderer/cabinet.html')).catch(error=>{
    if(view===current){back();if(!current.webContents.isDestroyed())current.webContents.close();view=null;}
    onError(error);
   });
  } else {
   // The retained page cannot fetch while detached; reload only after reattachment.
   refresh();
  }
  return view;
 }
 function dispose(){
  if(disposed)return;
  const current=view;
  back();disposed=true;
  for(const channel of ['cabinet-list','cabinet-adults','cabinet-make','cabinet-note','cabinet-name','cabinet-sell'])ipcMain.removeHandler(channel);
 ipcMain.removeHandler('cabinet-back');
  if(host){host.removeListener('resize',layout);host.removeListener('closed',dispose);}
  if(current&&!current.webContents.isDestroyed())current.webContents.close();
  view=null;host=null;
 }
 function requestEscape(){if(attached&&view&&!view.webContents.isDestroyed())view.webContents.send('cabinet-escape');}
 return {open,back,dispose,refresh,requestEscape};
}
