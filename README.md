# Public NFL matchup feed

Daily 11:23 UTC GitHub Actions helper. Sources: public nflverse data. Contains no PropLine keys, sportsbook odds, Google credentials, overrides or paper bets. Standard Node 24; no npm dependencies. Enable Actions, then run Update public NFL matchup data manually once. The successful run publishes https://raw.githubusercontent.com/OWNER/REPO/data/latest.json. Configure that URL as MATCHUP_MANIFEST_URL in Google Apps Script. The current GAS model is fitted separately; this job only updates public data.
