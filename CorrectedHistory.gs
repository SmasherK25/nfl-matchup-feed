// Independent v1.3 history policy. Legacy HistoryEngine remains unchanged.
var CorrectedHistory=(function(){
  function similarity(target,game){
    if(Number.isFinite(target.priorSimilarity))return Util.clamp(target.priorSimilarity,0,1);
    var score=0;
    [['team',.2],[target.position==='QB'?'lineupId':target.position==='RB'?'rushingRole':'qbId',.2],['systemId',.15],['starter',.2]].forEach(function(pair){
      var a=target[pair[0]],b=game[pair[0]];
      score+=pair[1]*(a===undefined||a===null||b===undefined||b===null?.5:a===b?1:0);
    });
    score+=.25*(Number.isFinite(target.opportunityShare)&&Number.isFinite(game.opportunityShare)?Math.max(0,1-Math.abs(target.opportunityShare-game.opportunityShare)/.25):.5);
    return score;
  }
  function select(logs,target,candidate){
    var cutoff=target.cutoffAt||target.kickoffAt;
    var rows=logs.filter(function(g){return g.playerId===target.playerId&&g.active!==false&&g.completed!==false&&g.kickoffAt<cutoff&&(g.availableAt===undefined||g.availableAt<=cutoff)&&g.season<=target.season&&g.season>=target.season-1;}).sort(function(a,b){return b.kickoffAt-a.kickoffAt;});
    var current=rows.filter(function(g){return g.season===target.season;}),prior=rows.filter(function(g){return g.season===target.season-1;});
    var out=current.map(function(g,i){return {game:g,weight:HistoryEngine.weight(i,candidate.policy)};});
    var currentSum=Util.sum(out.map(function(s){return s.weight;}));
    if(currentSum)out.forEach(function(s){s.weight*=current.length/currentSum;});
    var priorBase=Util.sum(prior.map(function(g,i){return HistoryEngine.weight(i,candidate.policy);}));
    prior.forEach(function(g,i){var w=priorBase?candidate.priorStrength*HistoryEngine.weight(i,candidate.policy)*similarity(target,g)/priorBase:0;if(w>0)out.push({game:g,weight:w});});
    return out;
  }
  function candidates(){var out=[];['equal','exp3','exp6','exp10','tierBalanced','tierFast'].forEach(function(policy){[2,4,8].forEach(function(prior){['history','recentBlend'].forEach(function(workload){out.push({id:'v13_'+policy+'_'+prior+'_'+workload,policy:policy,priorStrength:prior,opportunityPolicy:workload,pooling:.5});});});});return out;}
  return {similarity:similarity,select:select,candidates:candidates};
})();
