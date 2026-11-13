import test from 'node:test';
import assert from 'node:assert/strict';
import {ParkWorld} from '../park.mjs';
import {RULES} from '../public/js/customize.mjs';

test('park goal effects are validated, assigned and preserved across matches',()=>{
 const world=new ParkWorld(),player=world.connect('Fire player',null,false,'plain','fire');
 assert.equal(player.goalEffectId,'fire');assert.equal(player.avatar.goalEffectId,'fire');
 assert.equal(world.join(player,2,'blue'),null);
 const field=world.fields.find(f=>f.size===2),slot=()=>field.game.players.find(p=>p.id===player.slot);
 assert.equal(slot().goalEffectId,'fire');assert.equal(world.state(player).state.players.find(p=>p.id===player.slot).goalEffectId,'fire');
 field.game.goalInfo={goalEffectId:'fire'};
 assert.throws(()=>world.setGoalEffect(player,'classic'),/full time/);field.game.state='ended';world.setGoalEffect(player,'classic');
 assert.equal(slot().goalEffectId,'classic');assert.equal(player.avatar.goalEffectId,'classic');
 assert.equal(field.game.goalInfo.goalEffectId,'fire','a choice during a celebration changes future goals only');
 world.setGoalEffect(player,'https://example.invalid/effect.js');
 assert.equal(slot().goalEffectId,'classic');
 world.setGoalEffect(player,'fire');world.restart(field,'warmup');
 assert.equal(slot().goalEffectId,'fire','the equipped effect survives automatic match replacement');
 world.leave(player);assert.equal(player.goalEffectId,'fire');
 assert.equal(world.join(player,3,'red'),null);assert.equal(world.state(player).state.players.find(p=>p.id===player.slot).goalEffectId,'fire');
 const untrusted=world.connect('Invalid player',null,false,'plain',{id:'fire'});
 assert.equal(untrusted.goalEffectId,'classic');assert.equal(untrusted.avatar.goalEffectId,'classic');
});

test('the park countdown follows the server intermission and clears on the next kickoff',()=>{
 const world=new ParkWorld(),player=world.connect('Countdown player');world.join(player,1,'red');
 const field=world.fields.find(f=>f.size===1),before=field.matchId;
 assert.equal(world.state(player).state.nextMatchIn,null);
 field.game.finish();
 assert.equal(world.state(player).state.nextMatchIn,RULES.intermissionSeconds);
 assert.equal(world.overview().fields.find(f=>f.size===1).nextMatchIn,RULES.intermissionSeconds);
 world.tick(1.25);
 assert.equal(world.state(player).state.nextMatchIn,RULES.intermissionSeconds-1.25);
 world.tick(RULES.intermissionSeconds-1.5);
 assert.ok(world.state(player).state.nextMatchIn>0);
 assert.equal(field.matchId,before);
 world.tick(.25);
 assert.notEqual(field.matchId,before);
 assert.equal(world.state(player).state.state,'kickoff');assert.equal(world.state(player).state.nextMatchIn,null);
 assert.equal(world.overview().fields.find(f=>f.size===1).nextMatchIn,null);
});
