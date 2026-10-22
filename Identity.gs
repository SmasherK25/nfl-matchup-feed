var Identity = (function () {
  var teams = {
    ARI: 'Arizona Cardinals',
    ATL: 'Atlanta Falcons',
    BAL: 'Baltimore Ravens',
    BUF: 'Buffalo Bills',
    CAR: 'Carolina Panthers',
    CHI: 'Chicago Bears',
    CIN: 'Cincinnati Bengals',
    CLE: 'Cleveland Browns',
    DAL: 'Dallas Cowboys',
    DEN: 'Denver Broncos',
    DET: 'Detroit Lions',
    GB: 'Green Bay Packers',
    HOU: 'Houston Texans',
    IND: 'Indianapolis Colts',
    JAX: 'Jacksonville Jaguars',
    KC: 'Kansas City Chiefs',
    LA: 'Los Angeles Rams',
    LAC: 'Los Angeles Chargers',
    LV: 'Las Vegas Raiders',
    MIA: 'Miami Dolphins',
    MIN: 'Minnesota Vikings',
    NE: 'New England Patriots',
    NO: 'New Orleans Saints',
    NYG: 'New York Giants',
    NYJ: 'New York Jets',
    PHI: 'Philadelphia Eagles',
    PIT: 'Pittsburgh Steelers',
    SEA: 'Seattle Seahawks',
    SF: 'San Francisco 49ers',
    TB: 'Tampa Bay Buccaneers',
    TEN: 'Tennessee Titans',
    WAS: 'Washington Commanders',
  };
  function team(v) {
    if (v === 'LAR') return 'LA';
    if (v === 'JAC') return 'JAX';
    if (v === 'WSH') return 'WAS';
    if (teams[v]) return v;
    return (
      Object.keys(teams).filter(function (k) {
        return teams[k] === v;
      })[0] || v
    );
  }
  function name(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/\s*\([A-Z]+\)$/i, '')
      .replace(/[^a-z0-9]/g, '');
  }
  function resolve(id, label, roster, aliases) {
    if (aliases && aliases[id || label]) return aliases[id || label];
    var exact = roster.filter(function (r) {
      return id && (r.playerId === id || r.providerPlayerId === id || 'espn:' + r.espnId === id);
    });
    if (exact.length === 1) return exact[0].playerId;
    var byName = roster.filter(function (r) {
      return name(r.playerName) === name(label);
    });
    return byName.length === 1 ? byName[0].playerId : null;
  }
  return { team: team, name: name, resolve: resolve };
})();
