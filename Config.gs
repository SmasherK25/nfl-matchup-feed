var Config = (function () {
  var defaults = {
    version: '1.4.1',
    ttlMs: 14400000,
    dailyLimit: 900,
    simulations: 10000,
    seed: 7319,
    stake: 1,
    threshold: 0.03,
    books: ['betmgm', 'betonlineag', 'bovada', 'draftkings', 'espnbet', 'fanduel', 'pinnacle'],
    baseUrl: 'https://api.prop-line.com/v1',
    sport: 'football_nfl',
    targetMarket: '',
    softMs: 280000,
    minHistory: 4,
    bootstrap: 1000,
    minWeeks: 12,
    maxOfferAgeMs: 14400000,
  };
  var markets = {
    passingYards: 'player_pass_yds',
    rushingYards: 'player_rush_yds',
    receivingYards: 'player_reception_yds',
    receptions: 'player_receptions',
    carries: 'player_rush_attempts',
    targets: null,
  };
  function load() {
    var c = Object.assign({}, defaults),
      p = PropertiesService.getScriptProperties();
    ['simulations', 'stake', 'dailyLimit'].forEach(function (k) {
      var v = p.getProperty('CFG_' + k);
      if (v !== null) c[k] = Number(v);
    });
    var b = p.getProperty('CFG_books');
    if (b) c.books = JSON.parse(b);
    c.targetMarket = p.getProperty('CONFIRMED_TARGET_MARKET') || '';
    if (c.targetMarket) {
      var confirmed = JSON.parse(p.getProperty('PROPLINE_MARKET_CAPABILITIES') || '[]');
      Util.assert(
        confirmed.indexOf(c.targetMarket) >= 0,
        'Target market is not in discovered provider capabilities',
      );
      markets.targets = c.targetMarket;
    }
    if (!Number.isInteger(c.simulations) || c.simulations < 100 || c.simulations > 20000)
      throw Error('Invalid simulations');
    if (
      !(c.dailyLimit > 0 && c.dailyLimit <= 900) ||
      !(c.stake > 0) ||
      !Array.isArray(c.books) ||
      !c.books.length
    )
      throw Error('Invalid configuration');
    return c;
  }
  function stats(position) {
    return position === 'QB'
      ? ['passingYards', 'attempts']
      : position === 'RB'
        ? ['carries', 'rushingYards', 'targets', 'receptions', 'receivingYards']
        : ['targets', 'receptions', 'receivingYards'];
  }
  return { defaults: defaults, markets: markets, load: load, stats: stats };
})();
