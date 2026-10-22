// 恢复缓存按调用顺序提交，避免旧的待保存缓存晚于清理动作写回。
let queue=Promise.resolve();
export function recoveryCache(projectId,operation,payload){
 const task=queue.then(async()=>{
  const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('cardstudio-unified-recovery',1);q.onupgradeneeded=()=>q.result.createObjectStore('drafts');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);q.onblocked=()=>reject(new Error('恢复缓存被其他窗口占用'));});
  try{return await new Promise((resolve,reject)=>{
   const tx=db.transaction('drafts',operation==='get'?'readonly':'readwrite'),store=tx.objectStore('drafts');
   const q=operation==='get'?store.get(projectId):operation==='delete'?store.delete(projectId):store.put(payload,projectId);
   let result;q.onsuccess=()=>{result=q.result;};
   tx.oncomplete=()=>resolve(result);tx.onerror=()=>{};tx.onabort=()=>reject(tx.error||new Error('恢复缓存写入被取消'));
  });}finally{db.close();}
 });
 queue=task.catch(()=>{});return task;
}
