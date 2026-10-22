var HistoryEngine = (function () {
  function weight(age, policy) {
    if (policy === 'equal') return 1;
    if (policy.indexOf('exp') === 0) return 0.2 + 0.8 * Math.pow(2, -age / Number(policy.slice(3)));
    var w = policy === 'tierFast' ? [5, 3, 2, 1] : [3, 2, 1.5, 1];
    return w[age < 3 ? 0 : age < 6 ? 1 : age < 10 ? 2 : 3];
  }
  function similarity(a, b, override) {
    if (Number.isFinite(override)) return Util.clamp(override, 0, 1);
    var score = 0;
    function same(k, w) {
      if (
        a[k] !== undefined &&
        a[k] !== null &&
        b[k] !== undefined &&
        b[k] !== null &&
        a[k] === b[k]
      )
        score += w;
    }
    same('team', 0.2);
    same(a.position === 'QB' ? 'lineupId' : a.position === 'RB' ? 'rushingRole' : 'qbId', 0.2);
    same('systemId', 0.15);
    same('starter', 0.2);
    if (Number.isFinite(a.opportunityShare) && Number.isFinite(b.opportunityShare))
      score += 0.25 * Math.max(0, 1 - Math.abs(a.opportunityShare - b.opportunityShare) / 0.25);
    return score;
  }
  function select(logs, target, candidate) {
    var cutoff = target.cutoffAt || target.kickoffAt,
      history = logs.filter(function (g) {
        return (
          g.playerId === target.playerId &&
          g.active !== false &&
          g.completed !== false &&
          g.kickoffAt < cutoff &&
          (g.availableAt === undefined || g.availableAt <= cutoff) &&
          g.season <= target.season &&
          g.season >= target.season - 1
        );
      });
    var current = history
        .filter(function (g) {
          return g.season === target.season;
        })
        .sort(function (a, b) {
          return b.kickoffAt - a.kickoffAt;
        }),
      prior = history
        .filter(function (g) {
          return g.season === target.season - 1;
        })
        .sort(function (a, b) {
          return b.kickoffAt - a.kickoffAt;
        });
    var out = current.map(function (g, i) {
        return { game: g, weight: weight(i, candidate.policy) };
      }),
      priorRaw = prior.map(function (g, i) {
        return {
          game: g,
          weight: weight(i, candidate.policy) * similarity(target, g, target.priorSimilarity),
        };
      }),
      total = Util.sum(
        priorRaw.map(function (x) {
          return x.weight;
        }),
      );
    // Prior counts are equivalent games; current weights have mean one.
    var curSum = Util.sum(
      out.map(function (x) {
        return x.weight;
      }),
    );
    if (curSum)
      out.forEach(function (x) {
        x.weight *= current.length / curSum;
      });
    if (total)
      priorRaw.forEach(function (x) {
        x.weight =
          (x.weight / total) *
          candidate.priorStrength *
          (total /
            Math.max(
              1,
              Util.sum(
                prior.map(function (g, i) {
                  return weight(i, candidate.policy);
                }),
              ),
            ));
        if (x.weight > 0) out.push(x);
      });
    return out;
  }
  function summary(samples, stat) {
    var a = samples
        .filter(function (s) {
          return Number.isFinite(s.game[stat]) && s.weight > 0;
        })
        .map(function (s) {
          return { x: s.game[stat], w: s.weight };
        }),
      total = Util.sum(
        a.map(function (s) {
          return s.w;
        }),
      );
    if (!total) return null;
    a.forEach(function (s) {
      s.w /= total;
    });
    var mean = Util.sum(
        a.map(function (s) {
          return s.x * s.w;
        }),
      ),
      ss = Util.sum(
        a.map(function (s) {
          return s.w * s.w;
        }),
      );
    function median(items) {
      items = items.slice().sort(function (a, b) {
        return a.x - b.x;
      });
      var c = 0;
      for (var i = 0; i < items.length; i++) {
        c += items[i].w;
        if (c >= 0.5 - 1e-12) return items[i].x;
      }
      return items[items.length - 1].x;
    }
    var med = median(a),
      variance =
        ss < 1
          ? Util.sum(
              a.map(function (s) {
                return s.w * Math.pow(s.x - mean, 2);
              }),
            ) /
            (1 - ss)
          : null;
    return {
      mean: mean,
      median: med,
      sd: variance === null ? null : Math.sqrt(variance),
      mad: median(
        a.map(function (s) {
          return { x: Math.abs(s.x - med), w: s.w };
        }),
      ),
      effectiveN: 1 / ss,
      n: a.length,
    };
  }
  function ratio(samples, numerator, denominator, fallback) {
    var n = 0,
      d = 0;
    samples.forEach(function (s) {
      if (Number.isFinite(s.game[numerator]) && Number.isFinite(s.game[denominator])) {
        n += s.weight * s.game[numerator];
        d += s.weight * s.game[denominator];
      }
    });
    return d > 0 ? n / d : fallback;
  }
  function candidates() {
    var out = [];
    ['equal', 'exp3', 'exp6', 'exp10', 'tierBalanced', 'tierFast'].forEach(function (p) {
      [2, 4, 8].forEach(function (pr) {
        [false, true].forEach(function (d) {
          [false, true].forEach(function (s) {
            [0.25, 0.75].forEach(function (pool) {
              out.push({
                id: [p, pr, d ? 1 : 0, s ? 1 : 0, pool].join('_'),
                policy: p,
                priorStrength: pr,
                defense: d,
                script: s,
                pooling: pool,
                complexity: (p === 'equal' ? 0 : 1) + pr / 8 + (d ? 1 : 0) + (s ? 1 : 0),
              });
            });
          });
        });
      });
    });
    return out;
  }
  return {
    weight: weight,
    similarity: similarity,
    select: select,
    summary: summary,
    ratio: ratio,
    candidates: candidates,
  };
})();
