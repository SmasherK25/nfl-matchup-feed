var StatsProvider = (function () {
  var root = 'https://github.com/nflverse/nflverse-data/releases/download/';
  function urls(season) {
    return {
      players: root + 'stats_player/stats_player_week_' + season + '.csv',
      teams: root + 'stats_team/stats_team_week_' + season + '.csv',
      roster: root + 'rosters/roster_' + season + '.csv',
      snaps: root + 'snap_counts/snap_counts_' + season + '.csv',
      schedule: 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv',
    };
  }
  function kickoff(row) {
    if (row.kickoffAt) return Util.time(row.kickoffAt);
    if (typeof Utilities !== 'undefined' && Utilities.parseDate)
      return Utilities.parseDate(
        row.gameday + ' ' + (row.gametime || '13:00'),
        'America/New_York',
        'yyyy-MM-dd HH:mm',
      ).getTime();
    throw Error('Schedule rows require kickoffAt outside GAS');
  }
  function build(season, raw, now) {
    var schedule = raw.schedule
        .filter(function (g) {
          return Number(g.season) === season && g.game_type === 'REG';
        })
        .map(function (g) {
          return {
            eventId: g.game_id,
            season: season,
            week: Number(g.week),
            kickoffAt: kickoff(g),
            homeTeam: Identity.team(g.home_team),
            awayTeam: Identity.team(g.away_team),
            completed: g.home_score !== '' && g.home_score !== undefined && g.home_score !== 'NA',
            // Completed-game labels are outcomes, never pregame starter features.
            resultHomeQbId: g.home_score !== '' && g.home_score !== undefined && g.home_score !== 'NA' ? g.home_qb_id || null : null,
            resultAwayQbId: g.home_score !== '' && g.home_score !== undefined && g.home_score !== 'NA' ? g.away_qb_id || null : null,
          };
        }),
      index = {};
    schedule.forEach(function (g) {
      index[g.week + '|' + g.homeTeam] = g;
      index[g.week + '|' + g.awayTeam] = g;
    });
    var teams = {};
    (raw.teams || []).forEach(function (t) {
      if ((t.season_type || 'REG') !== 'REG') return;
      teams[Number(t.week) + '|' + Identity.team(t.team || t.recent_team)] = t;
    });
    var roster = (raw.roster || [])
      .filter(function (r) {
        return ['QB', 'RB', 'WR', 'TE'].indexOf(r.position) >= 0;
      })
      .map(function (r) {
        return {
          playerId: r.gsis_id || r.player_id,
          playerName: r.full_name || r.player_name,
          position: r.position,
          team: Identity.team(r.team),
          espnId: r.espn_id || null,
          season: season,
          rosterWeek: Util.num(r.week,0),
          rosterStatus: r.status || null,
          rosterObservedAt: now,
        };
      })
      .filter(function (r) {
        return !!r.playerId;
      });
    var games = [],
      seen = {},
      rejected = [];
    function add(r, snap) {
      var position = r.position || r.position_group;
      if (['QB', 'RB', 'WR', 'TE'].indexOf(position) < 0) return;
      var team = Identity.team(r.team || r.recent_team),
        week = Number(r.week),
        s = index[week + '|' + team];
      if (!s || !s.completed || s.kickoffAt >= now) return;
      var id = r.player_id || r.gsis_id;
      if (!id) {
        id = Identity.resolve(null, r.player, roster, {});
        if (!id) {
          rejected.push({ reason: 'UNRESOLVED_SNAP', name: r.player });
          return;
        }
      }
      var k = s.eventId + '|' + id;
      if (seen[k]) {
        if (snap) {
          seen[k].snapPct = Util.num(r.offense_pct, null);
          seen[k].snaps = Util.num(r.offense_snaps, null);
        }
        return;
      }
      var tm = teams[week + '|' + team] || {},
        num = function (k) {
          return Util.num(r[k], 0);
        };
      var g = {
        eventId: s.eventId,
        playerId: id,
        playerName: r.player_display_name || r.player_name || r.player || id,
        position: position,
        season: season,
        week: week,
        team: team,
        opponent: team === s.homeTeam ? s.awayTeam : s.homeTeam,
        kickoffAt: s.kickoffAt,
        availableAt: s.kickoffAt + 86400000,
        active: true,
        completed: true,
        attempts: num('attempts'),
        passingYards: num('passing_yards'),
        carries: num('carries'),
        rushingYards: num('rushing_yards'),
        targets: num('targets'),
        receptions: num('receptions'),
        receivingYards: num('receiving_yards'),
        teamAttempts: Util.num(tm.attempts, null),
        teamCarries: Util.num(tm.carries, null),
        teamTargets: Util.num(tm.targets, null),
        teamDesignedRushes: Util.num(tm.carries, null),
        teamDropbacks:
          Util.num(tm.attempts, null) === null
            ? null
            : Number(tm.attempts) + Util.num(tm.sacks_suffered, 0),
        source: 'nflverse',
        vintage: 'RECONSTRUCTED',
        sourceUpdatedAt: now,
      };
      if(position==='QB'){
        var actualStarter=team===s.homeTeam?s.resultHomeQbId:s.resultAwayQbId;
        if(actualStarter){g.starter=id===actualStarter;g.starterSource='COMPLETED_GAME_SCHEDULE';}
      }
      if (snap) {
        g.snapPct = Util.num(r.offense_pct, null);
        g.snaps = Util.num(r.offense_snaps, null);
      }
      seen[k] = g;
      games.push(g);
    }
    (raw.players || [])
      .filter(function (r) {
        return (r.season_type || 'REG') === 'REG';
      })
      .forEach(function (r) {
        add(r, false);
      });
    (raw.snaps || [])
      .filter(function (r) {
        return Util.num(r.offense_snaps, 0) > 0;
      })
      .forEach(function (r) {
        add(r, true);
      });
    games.forEach(function (g) {
      var den =
          g.position === 'QB'
            ? g.teamAttempts
            : g.position === 'RB'
              ? g.teamDesignedRushes
              : g.teamTargets,
        num = g.position === 'QB' ? g.attempts : g.position === 'RB' ? g.carries : g.targets;
      g.opportunityShare = den > 0 ? num / den : null;
    });
    return {
      games: games,
      roster: Object.values(roster.slice().sort(function(a,b){return a.rosterWeek-b.rosterWeek;}).reduce(function(out,r){out[r.playerId]=r;return out;},{})),
      schedule: schedule,
      rejected: rejected,
      sources: urls(season),
      preparedAt: now,
      limitations: [
        'RECONSTRUCTED: availability approximated as kickoff +24h',
        'Missing snaps may omit active zero-opportunity games',
        'Carries include QB kneels until PBP enrichment',
        'Routes, starter, coaching and QB continuity require dated context imports',
      ],
    };
  }
  function fetchSeason(season) {
    var u = urls(season),
      raw = {};
    Object.keys(u).forEach(function (k) {
      var r = FetchAPI.request(u[k], false);
      Util.assert(r.status === 200, 'nflverse ' + k + ' HTTP ' + r.status);
      raw[k] = Util.csv(r.body);
    });
    return build(season, raw, Date.now());
  }
  function importOdds(rows, roster, aliases) {
    var accepted = [],
      rejected = [],
      seen = {};
    rows.forEach(function (r, i) {
      try {
        var id = Identity.resolve(
            r.playerId || r.player,
            r.playerName || r.player,
            roster,
            aliases,
          ),
          eventId = String(r.eventId || r.event || ''),
          market = r.market,
          side = r.side,
          line = Number(r.line),
          observed = Util.time(r.observedAt),
          kick = Util.time(r.kickoffAt),
          odds = MarketEngine.decimal(
            Number(r.odds || r.decimalOdds),
            r.oddsFormat || (r.decimalOdds ? 'decimal' : 'american'),
          );
        Util.assert(id, 'UNRESOLVED_PLAYER');
        Util.assert(
          !r.oddsFormat || ['american', 'decimal'].indexOf(r.oddsFormat) >= 0,
          'INVALID_ODDS_FORMAT',
        );
        Util.assert(eventId && market && r.bookmaker && r.source, 'MISSING_FIELDS');
        Util.assert(side === 'Over' || side === 'Under', 'INVALID_SIDE');
        Util.assert(r.line !== '' && Number.isFinite(line) && odds > 1, 'INVALID_LINE_OR_PRICE');
        Util.assert(observed < kick, 'NOT_PREGAME');
        Util.assert(
          ['ACTION_IF_ACTIVE', 'VOID_IF_NOT_STARTER', 'VOID'].indexOf(
            r.settlementRule || 'ACTION_IF_ACTIVE',
          ) >= 0,
          'UNSUPPORTED_SETTLEMENT_RULE',
        );
        var k = [eventId, id, market, r.bookmaker, side, line, observed].join('|');
        Util.assert(!seen[k], 'DUPLICATE');
        seen[k] = true;
        accepted.push({
          eventId: eventId,
          playerId: id,
          market: market,
          bookmaker: r.bookmaker,
          side: side,
          line: line,
          decimalOdds: odds,
          observedAt: observed,
          kickoffAt: kick,
          source: r.source,
          lineType: r.lineType || 'main',
          available: r.available !== false && r.available !== 'false',
          settlementRule: r.settlementRule || 'ACTION_IF_ACTIVE',
          voided: r.voided === true || r.voided === 'true',
        });
      } catch (e) {
        rejected.push({ row: i + 2, reason: e.message, record: r });
      }
    });
    return { accepted: accepted, rejected: rejected };
  }
  function validate(data) {
    Util.assert(data && Array.isArray(data.games), 'Dataset requires games array');
    var seen = {};
    data.games.forEach(function (g) {
      ['kickoffAt', 'season', 'week'].forEach(function (k) {
        Util.assert(Number.isFinite(g[k]), 'Invalid game ' + k);
      });
      Util.assert(g.playerId && g.eventId && g.position && g.team, 'Missing game identifiers');
      var k = g.eventId + '|' + g.playerId;
      Util.assert(!seen[k], 'Duplicate player-game ' + k);
      seen[k] = true;
      Config.stats(g.position).forEach(function (s) {
        Util.assert(Number.isFinite(g[s]), 'Missing outcome ' + s + ' for ' + k);
        if (['attempts', 'carries', 'targets', 'receptions'].indexOf(s) >= 0)
          Util.assert(Number.isInteger(g[s]) && g[s] >= 0, 'Invalid count ' + s);
      });
      ['attempts', 'carries', 'targets', 'receptions'].forEach(function (s) {
        if (g[s] !== undefined)
          Util.assert(Number.isInteger(g[s]) && g[s] >= 0, 'Invalid count ' + s);
      });
      Util.assert(g.receptions <= g.targets, 'Receptions exceed targets');
    });
    return data;
  }
  function merge(parts) {
    var games = {},
      roster = {},
      schedule = {},
      rejected = [],
      limitations = [],
      contexts = [],
      defenseGames = [],
      offers = [];
    parts.forEach(function (d) {
      (d.games || []).forEach(function (g) {
        games[g.eventId + '|' + g.playerId] = g;
      });
      (d.roster || []).forEach(function (r) {
        roster[r.playerId] = r;
      });
      (d.schedule || []).forEach(function (g) {
        schedule[g.eventId] = g;
      });
      rejected = rejected.concat(d.rejected || []);
      limitations = limitations.concat(d.limitations || []);
      contexts = contexts.concat(d.contexts || []);
      defenseGames = defenseGames.concat(d.defenseGames || []);
      offers = offers.concat(d.offers || []);
    });
    return {
      games: Object.keys(games).map(function (k) {
        return games[k];
      }),
      roster: Object.keys(roster).map(function (k) {
        return roster[k];
      }),
      schedule: Object.keys(schedule).map(function (k) {
        return schedule[k];
      }),
      offers: offers,
      contexts: contexts,
      defenseGames: defenseGames,
      rejected: rejected,
      limitations: Array.from(new Set(limitations)),
      preparedAt: Date.now(),
      sources: parts.map(function (part) {
        return part.sources || null;
      }),
    };
  }
  return {
    urls: urls,
    build: build,
    fetchSeason: fetchSeason,
    importOdds: importOdds,
    validate: validate,
    merge: merge,
  };
})();
