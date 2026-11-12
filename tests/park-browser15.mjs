// Optional real-browser smoke test. Install playwright-core separately, then set
// TEAMBALL_PLAYWRIGHT_MODULE to its package path when not using the QA temp dir.
// This serves an isolated in-memory park on an ephemeral port; it never starts,
// stops or changes the user's server, accounts or bot memory.
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {attachPark} from '../park.mjs';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.TEAMBALL_PLAYWRIGHT_MODULE||path.join(os.tmpdir(),'teamball-browser-qa','node_modules','playwright-core'));
const publicRoot=fileURLToPath(new URL('../public/',import.meta.url));
const screenshotRoot=fileURLToPath(new URL('./screenshots/',import.meta.url));
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.mp3':'audio/mpeg','.json':'application/json'};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  const relative=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname).slice(1);
  const target=path.resolve(publicRoot,relative);
  if(!target.startsWith(publicRoot)){res.writeHead(403).end();return;}
  const body=await readFile(target);
  res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'}).end(body);
 }catch{res.writeHead(404).end();}
});
const closePark=attachPark(server,{duration:60,goldenGoal:false});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
await mkdir(screenshotRoot,{recursive:true});
const checks=[],errors=[];
const check=(name,condition)=>{assert.ok(condition,name);checks.push(name);console.log('PASS '+name);};
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.TEAMBALL_BROWSER||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',args:['--disable-gpu','--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.click('#goal-effect-picker-login [data-goal-effect="fire"]');
 check('the main menu equips the fiery goal explosion',await page.getAttribute('#goal-effect-picker-login [data-goal-effect="fire"]','aria-pressed')==='true');
 await page.reload();
 check('the goal effect preference survives a reload',await page.getAttribute('#goal-effect-picker-login [data-goal-effect="fire"]','aria-pressed')==='true');
 await page.screenshot({path:path.join(screenshotRoot,'park15-effect-picker-desktop.png')});
 await page.setViewportSize({width:390,height:844});
 await page.locator('#goal-effect-picker-login').scrollIntoViewIfNeeded();
 check('the mobile effect picker stays inside the screen',await page.locator('#goal-effect-picker-login').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}));
 await page.screenshot({path:path.join(screenshotRoot,'park15-effect-picker-mobile.png')});
 await page.setViewportSize({width:1440,height:900});
 await page.fill('#username','Park reviewer');await page.selectOption('#movement','keys');await page.click('#play');
 await page.waitForFunction(()=>window.teamballPark?.snapshot().park);
 const snap=()=>page.evaluate(()=>window.teamballPark.snapshot());
 check('all thirteen dedicated fields appear in the park',(await snap()).park.fields.map(f=>f.id).length===13);
 await page.waitForTimeout(350);await page.screenshot({path:path.join(screenshotRoot,'park15-desktop.png')});
 await page.keyboard.press('KeyM');await page.waitForFunction(()=>window.teamballPark.snapshot().mapOpen);
 check('M opens the park overview',await page.getAttribute('#park-map-toggle','aria-pressed')==='true');
 await page.screenshot({path:path.join(screenshotRoot,'park15-overview.png')});
 await page.keyboard.press('KeyM');await page.waitForFunction(()=>!window.teamballPark.snapshot().mapOpen);
 check('M closes the park overview',await page.getAttribute('#park-map-toggle','aria-pressed')==='false');
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(180);
 check('mobile park has no horizontal page overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:path.join(screenshotRoot,'park15-mobile.png')});
 await page.click('#park-map-toggle');await page.waitForFunction(()=>window.teamballPark.snapshot().mapOpen);
 await page.screenshot({path:path.join(screenshotRoot,'park15-mobile-overview.png')});await page.click('#park-map-toggle');
 await page.setViewportSize({width:1440,height:900});
 await page.click('#court-1');await page.click('#join-red');await page.waitForFunction(()=>window.teamballPark.snapshot().field===1);
 check('the equipped goal explosion reaches the authoritative player',(await snap()).state.human.goalEffectId==='fire');
 await page.keyboard.press('KeyM');check('the overview cannot open on a field',!(await snap()).mapOpen);
 // Mutate only this test's Node-owned Match; no production browser mutation API
 // is necessary for goal and final-report visual fixtures.
 const field=closePark.world.fields.find(f=>f.size===1),game=field.game;
 const humanFlags=game.players.map(player=>player.human);
 for(const player of game.players){player.human=true;player.input={x:0,y:0,aimX:1,aimY:0,sprint:false,shoot:false};player.vx=player.vy=0;}
 game.half=2;game.state='playing';game.engine.kickoff=null;game.remaining=.01;
 Object.assign(game.engine.ball,{x:game.pitch.width/2+160,y:game.pitch.height/2,vx:0,vy:0,lastTeam:'red'});
 await page.waitForFunction(()=>window.teamballPark.snapshot().state.fulltimePending);
 check('the last earned attack is transmitted and remains live at zero',(await snap()).state.state==='playing'&&(await page.textContent('#clock'))==='0:00');
 check('the final attack is visible in the match HUD',/LAST ATTACK/.test(await page.textContent('#match-label')));
 await page.screenshot({path:path.join(screenshotRoot,'park15-last-attack.png')});
 game.players.forEach((player,index)=>{player.human=humanFlags[index];});game.clearFulltimeAttack();
 await page.evaluate(async()=>{
  const {Renderer}=await import('/js/renderer.mjs'),drawFire=Renderer.prototype.fireBurst;
  Renderer.prototype.fireBurst=function(burst,age){window.qaFireAge=age;return drawFire.call(this,burst,age);};
 });
 game.state='playing';game.engine.kickoff=null;game.remaining=45;
 const scorer=game.players.find(player=>player.team==='red'&&player.human);
 const kickToGoal=()=>{
  game.tracker.record({type:'kick',player:scorer.id,time:game.engine.time,x:game.pitch.right-70,y:game.pitch.height/2,vx:410,vy:0});
  Object.assign(game.engine.ball,{x:game.pitch.right+game.engine.ball.radius+1,y:game.pitch.height/2,vx:0,vy:0,lastTeam:'red',lastPlayer:scorer.id});
 };
 kickToGoal();
 await page.waitForFunction(()=>window.teamballPark.snapshot().state.state==='goal');
 // Capture promptly: serial protocol assertions can consume much of the short
 // burst on slower software-rendered Chrome installations.
 await page.screenshot({path:path.join(screenshotRoot,'park15-goal-fire.png')});
 console.log(`Captured fire age: ${await page.evaluate(()=>window.qaFireAge)}`);
 const firedState=(await snap()).state;
 check('a credited goal broadcasts the scorers selected fire effect',firedState.goalInfo.scorerId===scorer.id&&firedState.goalInfo.goalEffectId==='fire');
 await page.click('#match-menu');await page.click('#goal-effect-picker-match [data-goal-effect="classic"]');
 await page.waitForFunction(()=>window.teamballPark.snapshot().state.human.goalEffectId==='classic');
 check('changing equipment during a goal preserves the current goal effect',(await snap()).state.goalInfo.goalEffectId==='fire');
 await page.click('#resume-match');
 game.state='playing';game.engine.kickoff=null;kickToGoal();
 await page.waitForFunction(()=>window.teamballPark.snapshot().state.state==='goal'&&window.teamballPark.snapshot().state.score.red===2);
 check('the next credited goal uses newly equipped classic confetti',(await snap()).state.goalInfo.goalEffectId==='classic');
 await page.waitForTimeout(140);await page.screenshot({path:path.join(screenshotRoot,'park15-goal-confetti.png')});
 const endedMatchId=field.matchId;game.finish();
 await page.waitForSelector('#park-summary:not([hidden])');
 check('full time shows the player-relative concise result',(await page.textContent('#park-summary-title'))==='Win 2-0');
 check('full time does not automatically open detailed stats',!await page.isVisible('#match-panel'));
 check('the result overlay keeps a transparent background',await page.locator('#park-summary').evaluate(el=>getComputedStyle(el).backgroundColor==='rgba(0, 0, 0, 0)'));
 await page.waitForFunction(()=>/Next match in 0:08/.test(document.getElementById('park-summary-caption').textContent));
 check('the summary starts the authoritative eight-second countdown',(await page.textContent('#park-summary-caption'))==='Next match in 0:08');
 await page.screenshot({path:path.join(screenshotRoot,'park15-summary.png')});
 await page.waitForFunction(()=>/Next match in 0:07/.test(document.getElementById('park-summary-caption').textContent));
 check('the between-match countdown ticks down without vague text',!((await page.textContent('#park-summary-caption')).includes('shortly'))&&(await page.textContent('#clock'))==='0:07');
 await page.screenshot({path:path.join(screenshotRoot,'park15-summary-countdown.png')});
 await page.click('#park-summary-details');await page.waitForSelector('#match-report:not([hidden])');
 check('match details opens the report on demand',await page.isVisible('#match-panel')&&await page.locator('#stats-table tbody tr').count()===2);
 await page.screenshot({path:path.join(screenshotRoot,'park15-details.png')});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(80);
 check('mobile match details have no horizontal page overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:path.join(screenshotRoot,'park15-mobile-details.png')});
 field.endedFor=7.9;
 await page.waitForFunction(previous=>window.teamballPark.snapshot().matchId!==previous,endedMatchId);
 check('the countdown starts a new match and clears the old summary',!await page.isVisible('#park-summary')&&(await snap()).state.state==='kickoff');
 const whistleSeconds=await page.evaluate(()=>new Promise((resolve,reject)=>{
  const whistle=new Audio('/audio/kickoff.mp3');whistle.preload='metadata';
  whistle.onloadedmetadata=()=>resolve(whistle.duration);whistle.onerror=()=>reject(Error('Kickoff whistle metadata failed'));whistle.load();
 }));
 check('the existing kickoff whistle asset loads',Number.isFinite(whistleSeconds)&&whistleSeconds>0);
 console.log(`Kickoff whistle duration: ${whistleSeconds.toFixed(3)} seconds`);
 const base=`http://127.0.0.1:${server.address().port}`;
 const local=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});local.on('pageerror',error=>errors.push(error.message));
 await local.goto(base+'/local.html');await local.waitForFunction(()=>window.teamball);
 await local.locator('#game-title').scrollIntoViewIfNeeded();
 check('the local menu title stays reachable with the effect picker',await local.locator('#game-title').evaluate(el=>el.getBoundingClientRect().top>=0));
 await local.screenshot({path:path.join(screenshotRoot,'park15-local-effects-desktop.png')});
 await local.locator('#play').scrollIntoViewIfNeeded();
 check('local play remains reachable below customization',await local.locator('#play').isVisible());
 await local.setViewportSize({width:390,height:844});
 await local.locator('#game-title').scrollIntoViewIfNeeded();
 check('the mobile local menu title stays reachable',await local.locator('#game-title').evaluate(el=>el.getBoundingClientRect().top>=0));
 await local.screenshot({path:path.join(screenshotRoot,'park15-local-effects-mobile-top.png')});
 await local.locator('#goal-effect-picker-local').scrollIntoViewIfNeeded();await local.screenshot({path:path.join(screenshotRoot,'park15-local-effects-mobile-picker.png')});
 await local.locator('#play').scrollIntoViewIfNeeded();
 check('mobile local play and effects remain reachable without horizontal overflow',await local.locator('#play').isVisible()&&await local.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 const online=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});online.on('pageerror',error=>errors.push(error.message));
 await online.goto(base+'/online.html');await online.locator('#goal-effect-picker-online').waitFor();
 check('the private room menu includes the goal effect picker',await online.locator('#goal-effect-picker-online [data-goal-effect="fire"]').count()===1);
 await online.locator('#goal-effect-picker-online').scrollIntoViewIfNeeded();await online.screenshot({path:path.join(screenshotRoot,'park15-online-effects-desktop.png')});
 check('the browser reports no runtime errors',errors.length===0);
 await writeFile(path.join(screenshotRoot,'park15-browser-results.json'),JSON.stringify({checks,errors,whistleSeconds},null,2));
 console.log(`${checks.length} real-browser checks passed. Screenshots: ${screenshotRoot}`);
}finally{
 await browser?.close();closePark();await new Promise(resolve=>server.close(resolve));
}
