var Util = (function () {
  function assert(ok, msg) {
    if (!ok) throw Error(msg);
  }
  function time(v) {
    var t = typeof v === 'number' ? v : Date.parse(v);
    assert(Number.isFinite(t), 'Invalid timestamp: ' + v);
    return t;
  }
  function sum(a) {
    return a.reduce(function (s, x) {
      return s + x;
    }, 0);
  }
  function mean(a) {
    return a.length ? sum(a) / a.length : null;
  }
  function clamp(x, a, b) {
    return Math.max(a, Math.min(b, x));
  }
  function quantile(a, p) {
    if (!a.length) return null;
    var b = a.slice().sort(function (x, y) {
      return x - y;
    });
    return b[Math.floor((b.length - 1) * p)];
  }
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s += 0x6d2b79f5;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }
  function group(a, key) {
    var g = {};
    a.forEach(function (x) {
      var k = key(x);
      (g[k] || (g[k] = [])).push(x);
    });
    return g;
  }
  function stable(x) {
    if (Array.isArray(x)) return '[' + x.map(stable).join(',') + ']';
    if (x && typeof x === 'object')
      return (
        '{' +
        Object.keys(x)
          .sort()
          .map(function (k) {
            return JSON.stringify(k) + ':' + stable(x[k]);
          })
          .join(',') +
        '}'
      );
    return JSON.stringify(x);
  }
  function csv(text) {
    var rows = [],
      row = [],
      s = '',
      q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (c === '"') {
        if (q && text[i + 1] === '"') {
          s += '"';
          i++;
        } else q = !q;
      } else if (c === ',' && !q) {
        row.push(s);
        s = '';
      } else if (c === '\n' && !q) {
        row.push(s.replace(/\r$/, ''));
        rows.push(row);
        row = [];
        s = '';
      } else s += c;
    }
    assert(!q, 'Unclosed CSV quote');
    if (s || row.length) {
      row.push(s.replace(/\r$/, ''));
      rows.push(row);
    }
    if (!rows.length) return [];
    var h = rows.shift().map(function (v) {
      return v.replace(/^\uFEFF/, '');
    });
    return rows
      .filter(function (r) {
        return r.some(function (v) {
          return v !== '';
        });
      })
      .map(function (r) {
        assert(r.length === h.length, 'CSV column mismatch');
        var o = {};
        h.forEach(function (k, j) {
          o[k] = r[j];
        });
        return o;
      });
  }
  function num(v, fallback) {
    return v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v))
      ? Number(v)
      : fallback;
  }
  return {
    assert: assert,
    time: time,
    sum: sum,
    mean: mean,
    clamp: clamp,
    quantile: quantile,
    rng: rng,
    hash: hash,
    group: group,
    stable: stable,
    csv: csv,
    num: num,
  };
})();
