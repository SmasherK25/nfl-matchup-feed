import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {createGunzip,gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {load} from '../tools/load.mjs';
const [rawArg,outArg]=process.argv.slice(2),rawDir=path.resolve(rawArg||'work/v14/raw'),outDir=path.resolve(outArg||'work/v14/prepared');fs.mkdirSync(outDir,{recursive:true});
const a=load(),now=Date.now(),num=v=>v===''||v==='NA'||v===undefined?0:Number(v)||0;
function eastern(date,time){const local=Date.parse(date+'T'+(time||'13:00')+':00Z');let guess=local+5*3600000;for(let i=0;i<3;i++){const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(guess)).map(p=>[p.type,p.value]));guess+=local-Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);}return guess;}
// CSV parser handles quotes without allocating an object for every unused PBP column.
function fields(line){const out=[];let value='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){out.push(value);value='';}else value+=c;}out.push(value);return out;}
const canonical=v=>v==='OAK'?'LV':v==='SD'?'LAC':v==='STL'?'LA':a.Identity.team(v);
const schedules=a.Util.csv(fs.readFileSync(path.join(rawDir,'all-schedule.csv'),'utf8')).filter(r=>r.game_type==='REG');schedules.forEach(r=>{r.kickoffAt=eastern(r.gameday,r.gametime);r.home_team=canonical(r.home_team);r.away_team=canonical(r.away_team);});
const manifests=JSON.parse(fs.readFileSync(path.join(rawDir,'download-manifest.json'))),years=[...new Set(manifests.filter(m=>m.key==='pbp'&&!m.error).map(m=>m.year))].sort();
const countKeys=['plays','dropbacks','attempts','targets','receptions','passingYards','carries','rushingYards','kneels','sacks','scrambles','spikes','passN','passEPA','passSuccess','rushN','rushEPA','rushSuccess','passExplosive','rushExplosive','drives'];
const playerKeys=['attempts','passingYards','targets','receptions','receivingYards','carries','rushingYards'];
function blank(){return Object.fromEntries(countKeys.map(k=>[k,0]));}
function actor(cell,id,position){id=id||'UNASSIGNED';if(!cell.players[id])cell.players[id]={playerId:id,position:position||'UNASSIGNED',...Object.fromEntries(playerKeys.map(k=>[k,0]))};return cell.players[id];}
for(const season of years){
 const output=path.join(outDir,season+'.json.gz'),sources=manifests.filter(m=>m.year===season||m.key==='schedule'),inputHash=createHash('sha256').update(JSON.stringify(sources.map(s=>s.sha256))).update(fs.readFileSync(new URL(import.meta.url))).digest('hex');
 if(fs.existsSync(output+'.meta.json')&&JSON.parse(fs.readFileSync(output+'.meta.json')).inputHash===inputHash){console.log('UNCHANGED_AGGREGATE',season);continue;}
 const raw={schedule:schedules,players:a.Util.csv(fs.readFileSync(path.join(rawDir,season+'-players.csv'),'utf8')),teams:a.Util.csv(fs.readFileSync(path.join(rawDir,season+'-teams.csv'),'utf8')),roster:a.Util.csv(fs.readFileSync(path.join(rawDir,season+'-roster.csv'),'utf8')),snaps:fs.existsSync(path.join(rawDir,season+'-snaps.csv'))?a.Util.csv(fs.readFileSync(path.join(rawDir,season+'-snaps.csv'),'utf8')):[]};
 [raw.players,raw.teams,raw.roster,raw.snaps].forEach(rows=>rows.forEach(r=>{if(r.team)r.team=canonical(r.team);if(r.recent_team)r.recent_team=canonical(r.recent_team);}));
 const data=a.StatsProvider.build(season,raw,now),schedule=new Map(data.schedule.map(g=>[g.eventId,g])),originalSchedule=new Map(schedules.filter(g=>+g.season===season).map(g=>[g.game_id,g]));
 const positions=new Map(data.games.map(g=>[g.eventId+'|'+g.playerId,g.position])),gameFacts=new Map();
 const input=fs.createReadStream(path.join(rawDir,season+'-pbp.csv.gz')).pipe(createGunzip()),lines=readline.createInterface({input,crlfDelay:Infinity});let header,index,buffer='',quotes=0,processed=0;
 for await(const line of lines){if(!header){header=fields(line.replace(/^\uFEFF/,''));index=Object.fromEntries(header.map((h,i)=>[h,i]));continue;}
  buffer+=(buffer?'\n':'')+line;quotes+=(line.match(/"/g)||[]).length;if(quotes%2)continue;
  const row=fields(buffer);buffer='';quotes=0;const get=k=>row[index[k]],n=k=>num(get(k));
  if(get('season_type')!=='REG'||n('no_play')||n('two_point_attempt')||n('extra_point_attempt')||!get('posteam')||!get('defteam'))continue;
  const kneel=!!n('qb_kneel'),scramble=!!n('qb_scramble'),sack=!!n('sack'),spike=!!n('qb_spike'),drop=!!n('qb_dropback')||sack||scramble||!!n('pass_attempt'),rush=!!n('rush_attempt')&&!kneel&&!scramble;
  if(!drop&&!rush&&!kneel)continue;
  const eventId=get('game_id'),g=schedule.get(eventId);if(!g||!g.completed||g.kickoffAt>=now)continue;
  const team=a.Identity.team(get('posteam')),opponent=a.Identity.team(get('defteam')),key=eventId+'|'+team,score=n('score_differential'),scoreBand=score<=-17?-2:score<=-9?-1:score>=17?2:score>=9?1:0;
  const phase=n('qtr')>=5?5:n('qtr')===4?(n('game_seconds_remaining')<=300?4:3):Math.max(0,n('qtr')-1),cellKey=phase*5+scoreBand+2;
  if(!gameFacts.has(key))gameFacts.set(key,{eventId,team,opponent,season,week:g.week,kickoffAt:g.kickoffAt,availableAt:g.kickoffAt+86400000,cells:{},...blank(),seenDrives:new Set(),yardDonors:{pass:[],rush:[]}});
  const f=gameFacts.get(key);if(!f.cells[cellKey])f.cells[cellKey]={cell:cellKey,phase,scoreBand,...blank(),players:{}};const c=f.cells[cellKey];processed++;
  const passer=actor(c,get('passer_player_id'),positions.get(eventId+'|'+get('passer_player_id'))||(get('passer_player_id')?'QB':'UNASSIGNED'));
  c.plays++;if(drop)c.dropbacks++;if(kneel)c.kneels++;if(sack)c.sacks++;if(scramble)c.scrambles++;if(spike)c.spikes++;
  const drive=get('fixed_drive')||get('drive');if(!f.seenDrives.has(drive)){f.seenDrives.add(drive);c.drives++;}
  if(drop&&!sack&&!scramble){c.attempts++;passer.attempts++;const receiverId=get('receiver_player_id');if((receiverId||n('complete_pass'))&&!spike){const rec=actor(c,receiverId,positions.get(eventId+'|'+receiverId));c.targets++;rec.targets++;if(n('complete_pass')){const yards=num(get('passing_yards')||get('receiving_yards')||get('yards_gained'));c.receptions++;c.passingYards+=yards;rec.receptions++;rec.receivingYards+=yards;passer.passingYards+=yards;f.yardDonors.pass.push({position:rec.position,yards,passerId:get('passer_player_id')});}}}
  if(rush){const rusher=actor(c,get('rusher_player_id'),positions.get(eventId+'|'+get('rusher_player_id')));const yards=num(get('rushing_yards')||get('yards_gained'));c.carries++;c.rushingYards+=yards;rusher.carries++;rusher.rushingYards+=yards;c.rushExplosive+=yards>=10?1:0;f.yardDonors.rush.push({position:rusher.position,yards});}
  if(drop){c.passExplosive+=n('yards_gained')>=20?1:0;}
  if(get('epa')!==''&&get('epa')!=='NA'&&Number.isFinite(Number(get('epa')))){if(drop&&!spike){c.passN++;c.passEPA+=n('epa');c.passSuccess+=n('epa')>0?1:0;}if(rush){c.rushN++;c.rushEPA+=n('epa');c.rushSuccess+=n('epa')>0?1:0;}}
 }
 if(buffer)throw Error('Unterminated PBP CSV record');
 const facts=[...gameFacts.values()].map(f=>{f.cells=Object.values(f.cells).sort((x,y)=>x.cell-y.cell).map(c=>({...c,players:Object.values(c.players).filter(p=>playerKeys.some(k=>p[k]!==0))}));for(const c of f.cells)for(const k of countKeys)f[k]+=c[k];delete f.seenDrives;return f;});
 const grouped=a.Util.group(facts,f=>f.eventId),paths=[];
 for(const [id,fs1]of Object.entries(grouped)){const g=schedule.get(id),s=originalSchedule.get(id),home=fs1.find(f=>f.team===g.homeTeam),away=fs1.find(f=>f.team===g.awayTeam);if(!home||!away)continue;
  // nflverse spread_line is points by which the HOME team was favored.
  const spread=s.spread_line!==''&&s.spread_line!=='NA'?-Number(s.spread_line):null,total=s.total_line!==''&&s.total_line!=='NA'?Number(s.total_line):null;
  paths.push({eventId:id,season,week:g.week,kickoffAt:g.kickoffAt,availableAt:g.kickoffAt+86400000,homeTeam:g.homeTeam,awayTeam:g.awayTeam,homeSpread:spread,total,reconstructedLines:true,home:home.cells.map(c=>({cell:c.cell,plays:c.plays})),away:away.cells.map(c=>({cell:c.cell,plays:c.plays})),homePlays:home.plays,awayPlays:away.plays});
 }
 const out={schema:'NFL_MATCHUP_RESEARCH_V1',season,sources,data,facts,paths,limitations:['RECONSTRUCTED: historical availability approximated kickoff +24h','Historical schedule lines lack verified T-minus-60 observation times','Missing active-zero appearances and historical roster/availability vintages remain limitations'],processed};
 fs.writeFileSync(output,gzipSync(JSON.stringify(out)));fs.writeFileSync(output+'.meta.json',JSON.stringify({season,inputHash,facts:facts.length,paths:paths.length,processed}));console.log('AGGREGATED',season,facts.length,paths.length,processed);
}
