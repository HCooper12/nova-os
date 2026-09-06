// Attachments: photos and short videos that ride with a question. Stored as
// files, named to the model as absolute paths it reads with its Read tool,
// video as evenly spaced stills with the missing transcript said out loud,
// bad input refused before anything is written, old material pruned.
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-attach-'));
import test from 'node:test';
import assert from 'node:assert/strict';
const { storeAttachments, loadAttachment, attachmentPreamble, pruneOld } = await import('../lib/attachments.js');

// a 1×1 PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

test.after(async () => { await rm(process.env.NOVA_DATA_DIR, { recursive: true, force: true }); });

test('images are stored as files and named to the model with the Read instruction', async () => {
  const stored = await storeAttachments([PNG, PNG.replace('image/png', 'image/jpeg')]);
  assert.equal(stored.items.length, 2);
  assert.ok(existsSync(stored.items[0].path));
  assert.match(stored.items[1].path, /\.jpg$/);
  const again = await loadAttachment(stored.id);
  assert.equal(again.items.length, 2);
  const pre = attachmentPreamble(again);
  assert.match(pre, /He attached 2 images/);
  assert.match(pre, /READ EACH with the Read tool/);
  assert.ok(pre.includes(stored.items[0].path));
  assert.match(pre, /\[END ATTACHED MATERIAL\]/);
});

test('bad input is refused before anything is written; an unknown id is null', async () => {
  await assert.rejects(() => storeAttachments([]), /nothing was attached/);
  await assert.rejects(() => storeAttachments(['data:text/plain;base64,aGk=']), /not a supported image or video/);
  await assert.rejects(() => storeAttachments(new Array(7).fill(PNG)), /up to 6/);
  assert.equal(await loadAttachment('nope'), null);
  assert.equal(await loadAttachment('../etc'), null);
  assert.equal(attachmentPreamble(null), '');
});

test('a video that cannot be read into frames says so in the preamble instead of guessing', async () => {
  // a few bytes that are not a real video: ffmpeg fails, the preamble is honest
  const stored = await storeAttachments(['data:video/mp4;base64,AAAAHGZ0eXBtcDQyAAAAAA==']);
  assert.equal(stored.items[0].kind, 'video');
  const pre = attachmentPreamble(stored);
  assert.match(pre, /could not be extracted|these \d+ stills/);
  if (!stored.items[0].frames.length) assert.match(pre, /do not guess its contents/);
});

test('prune removes only old material', async () => {
  const before = (await readdir(process.env.NOVA_DATA_DIR + '/attachments')).length;
  const removed = await pruneOld();
  assert.equal(removed, 0);
  assert.equal((await readdir(process.env.NOVA_DATA_DIR + '/attachments')).length, before);
});
