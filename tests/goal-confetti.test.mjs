import test from 'node:test';
import assert from 'node:assert/strict';
import {Renderer} from '../public/js/renderer.mjs';
import {createPitch} from '../public/js/config.mjs';
import {GOAL_EFFECT_OPTIONS,normalizeGoalEffect} from '../public/js/goal-effects.mjs';

function fixture({team='red',swapped=false,size=3}={}){
  const calls=[],renderer=new Renderer({getContext:()=>({save(){},restore(){},rotate(){},translate(x,y){calls.push({type:'position',x,y});},fillRect(){calls.push({type:'paper',color:this.fillStyle});},
    beginPath(){},arc(...values){calls.push({type:'arc',values});},ellipse(...values){calls.push({type:'ellipse',values});},
    moveTo(...values){calls.push({type:'move',values});},lineTo(...values){calls.push({type:'line',values});},
    fill(){calls.push({type:'fill',color:this.fillStyle});},stroke(){calls.push({type:'stroke',color:this.strokeStyle});},
    createRadialGradient(){return {addColorStop(offset,color){calls.push({type:'glow',offset,color});}};}
  })});
  const pitch=createPitch(size),right=(team==='red')!==swapped;
  const match={state:'goal',round:1,score:{red:1,blue:0},goalTeam:team,sidesSwapped:swapped,pitch,
    engine:{ball:{x:right?pitch.right+9:pitch.left-9,y:pitch.height/2}}};
  return {renderer,match,calls};
}

test('a goal makes a small black and white burst at the scoring ball in either half',()=>{
  for(const team of ['red','blue'])for(const swapped of [false,true]){
    const {renderer,match,calls}=fixture({team,swapped});renderer.goalConfetti(match,100);
    const paper=calls.filter(c=>c.type==='paper');
    assert.equal(paper.length,22);assert.equal(new Set(paper.map(p=>p.color)).size,2);
    const origin=calls.find(c=>c.type==='position');
    assert.equal(origin.x,match.engine.ball.x);assert.equal(origin.y,match.engine.ball.y);
    assert.deepEqual(match.score,{red:1,blue:0},'the effect must not change match physics or scoring');
  }
});

test('repeated goal snapshots animate once, expire, and reset for the next goal',()=>{
  const {renderer,match,calls}=fixture();renderer.goalConfetti(match,0);
  calls.length=0;renderer.goalConfetti(structuredClone(match),400);
  const moved=calls.find(c=>c.type==='position');assert.notEqual(moved.x,match.engine.ball.x);
  calls.length=0;renderer.goalConfetti(structuredClone(match),1400);renderer.goalConfetti(structuredClone(match),1800);
  assert.equal(calls.length,0,'a lingering goal snapshot must not restart expired confetti');
  match.score.red++;renderer.goalConfetti(match,2000);
  assert.equal(calls.filter(c=>c.type==='paper').length,22,'a second score should start a new burst');
  calls.length=0;match.state='kickoff';renderer.goalConfetti(match,2500);
  match.state='goal';renderer.goalConfetti(match,3000);
  assert.equal(calls.filter(c=>c.type==='paper').length,22,'a new match may repeat the previous score');
});

test('park pitches keep independent bursts when sharing the renderer',()=>{
  const {renderer,match,calls}=fixture({size:1}),other=fixture({size:5}).match;
  renderer.goalConfetti(match,0);renderer.goalConfetti(other,100);
  calls.length=0;renderer.goalConfetti(match,1300);
  assert.equal(calls.length,0,'drawing a different pitch cannot restart this pitch effect');
  renderer.goalConfetti(other,500);
  assert.equal(calls.filter(c=>c.type==='paper').length,22);
});

test('goal confetti honors reduced motion and accepts non-match overlay fixtures',()=>{
  const {renderer,match,calls}=fixture();renderer.motionQuery={matches:true};renderer.goalConfetti(match,0);
  assert.equal(calls.length,0);renderer.motionQuery={matches:false};match.reducedMotion=true;renderer.goalConfetti(match,0);
  assert.equal(calls.length,0);assert.doesNotThrow(()=>renderer.goalConfetti({state:'goal',pitch:match.pitch},0));
});

test('the goal effect catalog accepts only known cosmetic IDs',()=>{
  assert.deepEqual(GOAL_EFFECT_OPTIONS.map(effect=>effect.id),['classic','fire','black-hole']);
  assert.equal(normalizeGoalEffect('fire'),'fire');assert.equal(normalizeGoalEffect('classic'),'classic');
  for(const value of [null,undefined,{},'unknown','https://example.invalid/effect.js'])assert.equal(normalizeGoalEffect(value),'classic');
});

test('fiery goals emit warm flames, sparks and a ring from the scoring ball in either half',()=>{
  for(const team of ['red','blue'])for(const swapped of [false,true]){
    const {renderer,match,calls}=fixture({team,swapped});match.goalInfo={goalEffectId:'fire'};
    const before=structuredClone(match);renderer.goalConfetti(match,100);
    const origin=calls.find(call=>call.type==='position');assert.equal(origin.x,match.engine.ball.x);assert.equal(origin.y,match.engine.ball.y);
    assert.ok(calls.some(call=>call.type==='glow'&&call.color==='#ff6b20'),'fire has a glowing orange center');
    assert.ok(calls.some(call=>call.type==='ellipse'),'fire has flame tongues');
    assert.ok(calls.some(call=>call.type==='line'),'fire has outward spark trails');
    assert.equal(calls.some(call=>call.type==='paper'),false,'the fiery effect does not draw paper confetti');
    assert.deepEqual(match,before,'cosmetic rendering never changes gameplay');
    calls.length=0;renderer.goalConfetti(structuredClone(match),450);
    assert.ok(calls.some(call=>call.type==='position'&&(call.x!==origin.x||call.y!==origin.y)),'flames move away from the ball');
    for(const call of calls){if(call.values)assert.ok(call.values.every(Number.isFinite));if(call.type==='position')assert.ok(Number.isFinite(call.x+call.y));}
  }
});

test('a fiery effect is captured once per goal and old or unknown styles use classic confetti',()=>{
  const {renderer,match,calls}=fixture();match.goalInfo={goalEffectId:'fire'};renderer.goalConfetti(match,0);
  calls.length=0;match.goalInfo.goalEffectId='classic';renderer.goalConfetti(match,300);
  assert.equal(calls.some(call=>call.type==='paper'),false,'changing a menu choice cannot change an ongoing goal effect');
  calls.length=0;renderer.goalConfetti(match,1400);renderer.goalConfetti(match,1800);assert.equal(calls.length,0,'fire does not restart while the goal snapshot lingers');
  match.score.red++;match.goalInfo.goalEffectId='unknown';renderer.goalConfetti(match,2000);
  assert.equal(calls.filter(call=>call.type==='paper').length,22);
});

test('intermission overlay shows a finite next-match countdown',()=>{
  const {renderer,match}=fixture();match.state='intermission';match.wait=2.4;
  const labels=[];renderer.ctx=new Proxy({fillText:text=>labels.push(text)},{get:(object,key)=>key in object?object[key]:()=>{}});
  renderer.overlay(match);assert.ok(labels.some(text=>text.includes('Next match in 0:03')));
  labels.length=0;match.nextMatchIn=Infinity;renderer.overlay(match);assert.ok(labels.some(text=>text.includes('Next match in 0:00')));
});
