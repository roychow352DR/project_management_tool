import http from 'node:http';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validTaskSchedule} from './public/task-schedule.js';
import {validateTaskHierarchy} from './public/task-hierarchy.js';
import {migrateTaskIds,nextTaskId} from './public/task-ids.js';
const root=path.dirname(fileURLToPath(import.meta.url));
const dir=process.env.DATA_DIR||path.join(root,'data');await mkdir(dir,{recursive:true});
const file=path.join(dir,'workspace.json');
let state;try{state=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;state=JSON.parse(await readFile(path.join(root,'seed.json'),'utf8'));}
const beforeIdMigration=JSON.stringify(state,null,2);
if(migrateTaskIds(state)){
 await writeFile(path.join(dir,'workspace.before-numeric-ids.json'),beforeIdMigration,{flag:'wx'}).catch(error=>{if(error.code!=='EEXIST')throw error;});
 await writeFile(file+'.tmp',JSON.stringify(state,null,2));await rename(file+'.tmp',file);
}
// A transport safeguard, independent of task or subtask counts.
const maxWorkspaceBytes=Number(process.env.MAX_WORKSPACE_BYTES)||50*1024*1024;
let queue=Promise.resolve();
http.createServer(async(req,res)=>{try{
 res.setHeader('Cache-Control','no-store');
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/workspace'){
 if(req.method==='GET'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(state));}
 if(req.method==='PUT'){const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>maxWorkspaceBytes){res.writeHead(413);return res.end('Workspace size limit exceeded');}chunks.push(chunk);}const body=Buffer.concat(chunks).toString('utf8');
 let next;try{next=JSON.parse(body);if(!Array.isArray(next.projects)||!Array.isArray(next.tasks)||next.tasks.some(t=>!t.id||!t.title||!validTaskSchedule(t)||(t.backlog!==undefined&&typeof t.backlog!=='boolean')))throw Error();validateTaskHierarchy(next.tasks);if(next.projects.some(p=>p.ganttShowSubtasks!==undefined&&typeof p.ganttShowSubtasks!=='boolean'))throw Error();}catch{res.writeHead(400);return res.end('Invalid workspace');}
 migrateTaskIds(next);
 await (queue=queue.catch(()=>{}).then(async()=>{next.nextTaskNumber=nextTaskId({...next,nextTaskNumber:state.nextTaskNumber});await writeFile(file+'.tmp',JSON.stringify(next,null,2));await rename(file+'.tmp',file);state=next;}));res.writeHead(204);return res.end();}
 res.writeHead(405);return res.end();}
 const target=path.join(root,'public',url.pathname==='/'?'index.html':decodeURIComponent(url.pathname));
 if(!target.startsWith(path.join(root,'public')+path.sep)){res.writeHead(403);return res.end();}
 const content=await readFile(target);res.setHeader('Content-Type',({' .html':'text/html','.html':'text/html','.css':'text/css','.js':'text/javascript','.woff2':'font/woff2'})[path.extname(target)]||'application/octet-stream');res.end(content);
 }catch(e){res.writeHead(e.code==='ENOENT'?404:500);res.end('Request failed');}
}).listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('QA Projects is ready at http://localhost:3000'));
