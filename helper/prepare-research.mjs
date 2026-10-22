import fs from 'node:fs';import path from 'node:path';import {gzipSync,gunzipSync} from 'node:zlib';import {load} from '../tools/load.mjs';
const dir=path.resolve(process.argv[2]||'work/v14/prepared'),a=load(),parts=fs.readdirSync(dir).filter(n=>/^20\d\d\.json.gz$/.test(n)).sort().map(n=>JSON.parse(gunzipSync(fs.readFileSync(path.join(dir,n)))));
const data=a.StatsProvider.merge(parts.map(p=>p.data));data.roster=[];const facts=parts.flatMap(p=>p.facts).sort((x,y)=>x.kickoffAt-y.kickoffAt||x.team.localeCompare(y.team)),byTeam={},against={},observations=new Map();data.games.forEach(g=>{const k=g.eventId+'|'+g.team;if(!observations.has(k))observations.set(k,[]);observations.get(k).push(g.playerId);});
let count=0;
for(const f of facts){const cutoff=f.kickoffAt-3600000,own=(byTeam[f.team]||[]).filter(g=>g.availableAt<=cutoff),def=(against[f.opponent]||[]).filter(g=>g.availableAt<=cutoff);
 f.positions=Object.fromEntries(['RB','WR','TE','UNASSIGNED'].map(p=>[p,a.MatchupData.pos(f,p)]));f.before=a.MatchupData.offense(own,f.season);f.faced={100:a.MatchupData.defense(def,f.season,100),300:a.MatchupData.defense(def,f.season,300)};
 const t=a.CorrectedTeam.build(data,f,f.team,cutoff,a.PackagedCorrectedConfig.candidate);
 f.roles=a.MatchupData.roles(t);f.activeIds=observations.get(f.eventId+'|'+f.team)||[];
 f.base={event:{eventId:f.eventId,season:f.season,week:f.week,kickoffAt:f.kickoffAt},team:t.team,cutoffAt:cutoff,budget:t.budget||{},variance:t.variance||{},role:t.role,players:t.players.map(m=>({playerId:m.playerId,target:{playerId:m.playerId,playerName:m.target.playerName,position:m.target.position,eventId:f.eventId,team:f.team,season:f.season,week:f.week,kickoffAt:f.kickoffAt,cutoffAt:cutoff},expected:m.expected,efficiency:m.efficiency,catchRate:m.catchRate,stats:m.stats,matchupHistory:m.history.map(s=>({eventId:s.game.eventId,team:s.game.team,season:s.game.season,kickoffAt:s.game.kickoffAt,availableAt:s.game.availableAt,weight:s.weight}))}))};
 (byTeam[f.team]||=[]).push(f);(against[f.opponent]||=[]).push(f);if(++count%100===0)console.log('PREPARED',count,f.season,f.week);
}
const output={schema:'NFL_MATCHUP_RESEARCH_V1',facts,paths:parts.flatMap(p=>p.paths),data,sources:parts.flatMap(p=>p.sources),limitations:parts[0].limitations};
const indexed=new Map(facts.map(f=>[f.eventId+'|'+f.team,f]));output.paths.forEach(p=>{p.homePace=indexed.get(p.eventId+'|'+p.homeTeam)?.before.plays;p.awayPace=indexed.get(p.eventId+'|'+p.awayTeam)?.before.plays;});
fs.writeFileSync(path.join(dir,'research.json.gz'),gzipSync(JSON.stringify(output)));console.log('READY',facts.length,output.paths.length,data.games.length);
