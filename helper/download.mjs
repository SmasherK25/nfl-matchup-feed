import fs from 'node:fs';
import path from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createHash} from 'node:crypto';
const dir=path.resolve(process.argv[2]||'work/v14/raw'),years=(process.argv[3]||'2018:2026').split(':').map(Number);
fs.mkdirSync(dir,{recursive:true});
const jobs=[];
for(let y=years[0];y<=(years[1]||years[0]);y++)for(const [key,url]of Object.entries({pbp:`https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${y}.csv.gz`,players:`https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${y}.csv`,teams:`https://github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_week_${y}.csv`,roster:`https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${y}.csv`,snaps:`https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_${y}.csv`}))jobs.push({year:y,key,url});
jobs.push({year:'all',key:'schedule',url:'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv'});
const results=[];
async function worker(){while(jobs.length){const j=jobs.shift(),file=path.join(dir,`${j.year}-${j.key}${j.key==='pbp'?'.csv.gz':'.csv'}`),meta=file+'.meta.json';try{
 const old=fs.existsSync(meta)?JSON.parse(fs.readFileSync(meta)):null;
 const r=await fetch(j.url,{headers:old?.etag?{'If-None-Match':old.etag}:{}});
 if(r.status===304&&fs.existsSync(file)){results.push(old);console.log('UNCHANGED',j.year,j.key);continue;}
 if(!r.ok)throw Error('HTTP '+r.status);
 await pipeline(Readable.fromWeb(r.body),fs.createWriteStream(file+'.partial'));fs.renameSync(file+'.partial',file);
 const hash=createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);
 const m={...j,sha256:hash.digest('hex'),bytes:fs.statSync(file).size,retrievedAt:new Date().toISOString(),etag:r.headers.get('etag'),lastModified:r.headers.get('last-modified')};fs.writeFileSync(meta,JSON.stringify(m,null,2));results.push(m);console.log('DOWNLOADED',j.year,j.key,m.bytes);
 }catch(e){const m={...j,error:String(e)};results.push(m);console.log('MISSING',j.year,j.key,String(e));}}}
await Promise.all([worker(),worker(),worker()]);fs.writeFileSync(path.join(dir,'download-manifest.json'),JSON.stringify(results,null,2));
// Do not publish a falsely fresh in-season packet after a required feed fails.
const current=new Date(),activeSeason=current.getUTCFullYear()-(current.getUTCMonth()<2?1:0);
if(results.some(m=>m.error&&(m.key==='schedule'||Number(m.year)<activeSeason||Number(m.year)===activeSeason&&current.getUTCMonth()>=8)))process.exitCode=1;
