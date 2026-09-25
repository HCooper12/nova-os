// WHEN A REQUEST IS SEVERAL JOBS, NOT ONE.
//
// His example, 16 Sep — the Claude advertisement: one spoken instruction
// carrying four deliverables. The old gate needed two of four keyword families
// and one of them watch/research/shelf; that instruction names none of them, so
// the single-lane router would have taken the first thing it recognised and
// dropped the rest of the sentence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planWorthy } from '../../src/chatLanes.js';

const AD = 'Open the design mockup on my desktop and build me a pixel-perfect website from it, '
  + 'then open Instagram, pull the analytics from the last 30 days and read the comments on my last 20 posts, '
  + 'then write me a strategy report and organise my desktop';

test('the instruction from the advertisement reaches the planner', () => {
  assert.equal(planWorthy(AD), true);
});

test('several things to produce is a plan — joined by "then", or simply three of them', () => {
  for (const t of [
    'research creatine timing then write me a one-page summary',
    'build me a landing page, write the copy for it and design a logo',
    'pull my Instagram analytics then compare them to last month and write it up',
    'find the papers on sleep and magnesium, review them, and summarise what changes for me',
  ]) assert.equal(planWorthy(t), true, t);
});

test('the original route still works — two families, one of them real work', () => {
  assert.equal(planWorthy('watch this video and check it against my notes'), true);
  assert.equal(planWorthy('research the evidence and compare it to my shelf'), true);
});

test('a question stays a question, however long', () => {
  for (const t of [
    'what did I train yesterday and how many steps did I do',
    'how many calories have I had today and what is left',
    'should I deload this week or push through the block',
    'is my protein average actually under the floor or does it just look that way',
  ]) assert.equal(planWorthy(t), false, t);
});

test('...unless he strings jobs together, in which case the question mark is decoration', () => {
  assert.equal(planWorthy('Can you build me a site from the mockup, then pull my Instagram analytics and write a report?'), true);
});

test('one job is not a plan, and neither is chat', () => {
  for (const t of [
    'build me a website',
    'thanks nova that was helpful',
    'compare my bench to last month',
    'research creatine timing for me please',
    'I was thinking about how I should plan my week and maybe review my numbers',
    'write it up',
  ]) assert.equal(planWorthy(t), false, t);
});

test('the same verb asked twice is one job, not two', () => {
  assert.equal(planWorthy('research creatine timing and research beta alanine timing'), false,
    'distinct verbs, not verb mentions — a plan needs different work, not repetition');
});

// The Clicky reel (22 Sep 2026): asking for an agent IS the delegation — the
// plan card still waits for his yes before anything runs.
test('"start an agent and go work on it in the background" is a plan', () => {
  for (const s of [
    'Double this revenue by end of day — start a Google Ads campaign by starting an agent and go work on it in the background',
    'start an agent to research the best creatine timing and work on it in the background',
    'put an agent on finding me three gyms near work and report back',
    'Can you spin up an agent to compare the two mortgage offers?',
  ]) assert.equal(planWorthy(s), true, s);
});

test('...but a question about the background is still a question', () => {
  for (const s of [
    'what are you working on in the background right now',
    'is the researcher agent still running in the background',
    'how many agents do you have running',
  ]) assert.equal(planWorthy(s), false, s);
});
