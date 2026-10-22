// The same pre-cutoff team model is used by research and live forecasts.
var CorrectedTeam=(function(){
  var cachedData=null,cachedIndex=null;
  function index(data){
    if(cachedData===data)return cachedIndex;
    var players=Util.group(data.games,function(g){return g.playerId;}),teams={};
    data.games.forEach(function(g){var key=g.eventId+'|'+g.team;
      if(!teams[key])teams[key]={eventId:g.eventId,team:g.team,playerId:'TEAM|'+g.team,position:'TEAM',season:g.season,week:g.week,kickoffAt:g.kickoffAt,availableAt:g.availableAt,completed:g.completed,active:true,attempts:g.teamAttempts,targets:g.teamTargets,carries:Number.isFinite(g.teamCarries)?g.teamCarries:g.teamDesignedRushes,members:[]};
      teams[key].members.push(g);
    });
    cachedData=data;cachedIndex={players:players,teams:Object.keys(teams).map(function(k){return teams[k];})};return cachedIndex;
  }
  function context(data,eventId,team,playerId,cutoff,extra){
    var out={};(data.contexts||[]).concat(extra||[]).filter(function(c){return c.eventId===eventId&&c.team===team&&(!c.playerId||c.playerId===playerId)&&Number.isFinite(c.observedAt)&&c.observedAt<=cutoff;}).sort(function(a,b){return a.observedAt-b.observedAt;}).forEach(function(c){Object.assign(out,c);});return out;
  }
  function cohort(data,event,team,cutoff,liveTargets,extra){
    var idx=index(data),latest={};
    Object.keys(idx.players).forEach(function(id){var prior=idx.players[id].filter(function(g){return g.kickoffAt<cutoff&&(g.availableAt===undefined||g.availableAt<=cutoff);}).sort(function(a,b){return b.kickoffAt-a.kickoffAt;})[0];if(prior&&prior.team===team&&cutoff-prior.kickoffAt<400*86400000)latest[id]=prior;});
    var source=liveTargets||Object.keys(latest).map(function(id){var g=latest[id];return {playerId:id,playerName:g.playerName,position:g.position,team:team};});
    return source.filter(function(r){return r.team===team&&['QB','RB','WR','TE'].indexOf(r.position)>=0;}).map(function(r){
      var c=context(data,event.eventId,team,r.playerId,cutoff,extra),t=Object.assign({},r,{eventId:event.eventId,season:event.season,week:event.week,kickoffAt:event.kickoffAt,cutoffAt:cutoff,context:c});
      ['active','starter','qbId','systemId','lineupId','rushingRole','opportunityShare','priorSimilarity'].forEach(function(k){if(c[k]!==undefined)t[k]=c[k];});
      if(liveTargets&&r.rosterStatus&&r.rosterWeek>=event.week&&Number.isFinite(r.rosterObservedAt)&&r.rosterObservedAt<=cutoff&&['RES','RET','CUT','INA'].indexOf(r.rosterStatus)>=0)t.active=false;
      return t;
    });
  }
  function build(data,event,team,cutoff,candidate,options){
    options=options||{};var idx=index(data),targets=cohort(data,event,team,cutoff,options.liveTargets,options.contexts);
    var teamTarget={playerId:'TEAM|'+team,team:team,position:'TEAM',season:event.season,kickoffAt:event.kickoffAt,cutoffAt:cutoff};
    var th=CorrectedHistory.select(idx.teams,teamTarget,candidate);
    if(!th.length)return {players:[],warnings:['NO_TEAM_HISTORY'],role:{confirmed:false,status:'NO_TEAM_HISTORY'}};
    var budget={},variance={};['attempts','targets','carries'].forEach(function(k){var h=HistoryEngine.summary(th,k);budget[k]=h?Math.max(0,h.mean):0;variance[k]=h&&h.sd!==null?h.sd*h.sd:Math.max(1,budget[k]);});
    budget.targets=Math.min(budget.targets,budget.attempts);
    var recent=th.slice().sort(function(a,b){return b.game.kickoffAt-a.game.kickoffAt;}).slice(0,3),models=[];
    targets.forEach(function(t){
      if(t.active===false)return;
      var recentAppearance=recent.some(function(s){return s.game.members.some(function(g){return g.playerId===t.playerId;});});
      var explicitlyListed=(options.listedPlayerIds||[]).indexOf(t.playerId)>=0;
      var confirmedRole=t.active===true||t.starter===true||(options.qbRoles||[]).some(function(q){return q.eventId===event.eventId&&q.team===team&&q.starterId===t.playerId&&q.observedAt<=cutoff;});
      if(!recentAppearance&&!explicitlyListed&&!confirmedRole)return;
      var h=CorrectedHistory.select(idx.players[t.playerId]||[],t,candidate);if(h.length<Config.defaults.minHistory)return;
      var stats={};Config.stats(t.position).forEach(function(k){stats[k]=HistoryEngine.summary(h,k);});
      function ratio(n,d,f){return HistoryEngine.ratio(h,n,d,f);}
      var expected={attempts:0,targets:0,carries:0,receptions:0,receivingYards:0,rushingYards:0,passingYards:0};
      ['targets','carries'].forEach(function(k){var den=k==='targets'?'teamTargets':'teamDesignedRushes',base=Util.clamp(ratio(k,den,0),0,1),num=0,total=0;
        recent.forEach(function(s,i){var weight=3-i,g=s.game.members.filter(function(g){return g.playerId===t.playerId;})[0];if(g&&Number.isFinite(s.game[k])){total+=weight*s.game[k];num+=weight*g[k];}});
        var recentShare=total>0?num/total:base;
        // Presence controls role-pool eligibility. Conditional active-game
        // workload never treats a DNP/missing appearance as zero production.
        var blend=candidate.opportunityPolicy==='history'?0:.5;
        var share=(1-blend)*base+blend*recentShare;expected[k]=budget[k]*share;
      });
      var catchRate=Util.clamp(ratio('receptions','targets',.65),.01,.99),eff={passing:ratio('passingYards','attempts',7),rushing:ratio('rushingYards','carries',4.2),receiving:ratio('receivingYards','receptions',t.position==='RB'?7:12)};
      models.push({playerId:t.playerId,target:t,history:h,stats:stats,expected:expected,catchRate:catchRate,efficiency:eff,team:budget});
    });
    var qbTargets=targets.filter(function(t){return t.position==='QB'&&t.active!==false;}),confirmations=[];
    (options.qbRoles||[]).filter(function(r){return r.eventId===event.eventId&&r.team===team&&r.observedAt<=cutoff;}).sort(function(a,b){return b.observedAt-a.observedAt;}).forEach(function(r,i,all){if(r.observedAt===all[0].observedAt)confirmations.push(r.starterId);});
    qbTargets.filter(function(t){return t.starter===true&&Number.isFinite(t.context.observedAt)&&t.context.observedAt<=cutoff;}).forEach(function(t){confirmations.push(t.playerId);});
    confirmations=Array.from(new Set(confirmations));
    var conflict=confirmations.length>1,primary=confirmations.length===1?confirmations[0]:null;
    if(!primary&&!conflict){
      var latest=th.slice().sort(function(a,b){return b.game.kickoffAt-a.game.kickoffAt;})[0].game;
      var previous=latest.members.filter(function(g){return g.position==='QB';}).sort(function(a,b){return Number(b.starter===true)-Number(a.starter===true)||b.attempts-a.attempts;});
      primary=previous.length&&qbTargets.some(function(t){return t.playerId===previous[0].playerId;})?previous[0].playerId:null;
    }
    var role={starterId:primary,confirmed:confirmations.length===1&&!conflict,status:conflict?'STARTER_CONFLICT':confirmations.length===1?'CONFIRMED':'STARTER_UNCONFIRMED'};
    var leagueStarts=idx.teams.filter(function(g){return g.kickoffAt<cutoff&&(g.availableAt===undefined||g.availableAt<=cutoff)&&g.season>=event.season-1;}).flatMap(function(g){return g.members.filter(function(p){return p.position==='QB'&&p.starter===true&&g.attempts>0;}).map(function(p){return {share:Util.clamp(p.attempts/g.attempts,0,1)};});});
    var leagueShare=leagueStarts.length?Util.mean(leagueStarts.map(function(s){return s.share;})):1;
    var primaryModel=models.filter(function(m){return m.playerId===primary;})[0],starterRows=primaryModel?primaryModel.history.filter(function(s){return s.game.starter===true&&s.game.teamAttempts>0;}):[];
    if(primaryModel&&starterRows.length>=2){['attempts','passingYards'].forEach(function(k){primaryModel.stats[k]=HistoryEngine.summary(starterRows,k);});primaryModel.efficiencyHistory=starterRows;}
    var n=Util.sum(starterRows.map(function(s){return s.weight;})),share=starterRows.length?(Util.sum(starterRows.map(function(s){return s.weight*s.game.attempts/s.game.teamAttempts;}))+candidate.priorStrength*leagueShare)/(n+candidate.priorStrength):leagueShare;
    role.attemptShare=Util.clamp(share,0,1);role.shareDonors=starterRows.map(function(s){return {share:Util.clamp(s.game.attempts/s.game.teamAttempts,0,1),weight:s.weight};});
    var backups=models.filter(function(m){return m.target.position==='QB'&&m.playerId!==primary;});
    models.forEach(function(m){
      if(m.target.position==='QB')m.expected.attempts=conflict?0:primary?(m.playerId===primary?budget.attempts*role.attemptShare:backups.length?budget.attempts*(1-role.attemptShare)/backups.length:0):0;
    });
    var warnings=[];
    ['targets','carries'].forEach(function(k){var total=Util.sum(models.map(function(m){return m.expected[k];}));if(total>budget[k]&&total>0){warnings.push(k.toUpperCase()+'_SHARES_RECONCILED');models.forEach(function(m){m.expected[k]*=budget[k]/total;});}});
    models.forEach(function(m){m.expected.receptions=m.expected.targets*m.catchRate;m.expected.receivingYards=m.expected.receptions*m.efficiency.receiving;m.expected.rushingYards=m.expected.carries*m.efficiency.rushing;m.expected.passingYards=m.expected.attempts*m.efficiency.passing;});
    return {event:event,team:team,cutoffAt:cutoff,players:models,budget:budget,variance:variance,role:role,warnings:warnings,candidate:candidate};
  }
  return {index:index,context:context,cohort:cohort,build:build};
})();
