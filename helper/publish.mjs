import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
const folder=path.resolve(process.argv[2]||'public-feed'),repo=process.env.GITHUB_REPOSITORY;if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo||''))throw Error('GITHUB_REPOSITORY is required');
function gh(args,input,optional=false){const r=spawnSync('gh',args,{input:input===undefined?undefined:JSON.stringify(input),encoding:'utf8'});if(r.status!==0){if(optional)return null;throw Error('GitHub publish failed: '+r.stderr);}return r.stdout?JSON.parse(r.stdout):{};}
const manifest=JSON.parse(fs.readFileSync(path.join(folder,'latest.json'),'utf8')),tag=manifest.packetUrl.split('/').slice(-2,-1)[0],filename=manifest.packetUrl.split('/').at(-1);
let release=gh(['api',`repos/${repo}/releases/tags/${tag}`],undefined,true);if(!release)release=gh(['api',`repos/${repo}/releases`,'--input','-'],{tag_name:tag,name:tag,body:'Public nflverse-derived matchup data. No sportsbook odds, API keys, or paper bets.',draft:false,prerelease:false});
if(!release.assets.some(a=>a.name===filename)){const r=spawnSync('gh',['release','upload',tag,path.join(folder,filename),'--repo',repo],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);}
// Publish the manifest with git transport; avoid Git Database API redirects.
function git(args,input){const r=spawnSync('git',args,{input,encoding:'utf8'});if(r.status!==0)throw Error('Manifest git publish failed: '+r.stderr);return r.stdout.trim();}
git(['config','user.name','github-actions[bot]']);
git(['config','user.email','41898282+github-actions[bot]@users.noreply.github.com']);
const lookup=spawnSync('git',['ls-remote','--heads','origin','refs/heads/data'],{encoding:'utf8'});
if(lookup.status!==0)throw Error('Cannot inspect manifest branch: '+lookup.stderr);
let parent='';
if(lookup.stdout.trim()){
  git(['fetch','--no-tags','origin','refs/heads/data']);
  parent=git(['rev-parse','FETCH_HEAD']);
}
const blob=git(['hash-object','-w','--stdin'],JSON.stringify(manifest,null,2)+'\n');
const tree=git(['mktree'],`100644 blob ${blob}\tlatest.json\n`);
const commit=git(['commit-tree',tree,...(parent?['-p',parent]:[]),'-m','Publish public NFL matchup manifest '+manifest.version]);
git(['push','origin',`${commit}:refs/heads/data`]);
console.log(`Manifest ready: https://raw.githubusercontent.com/${repo}/data/latest.json`);

