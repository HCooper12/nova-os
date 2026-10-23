import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { carouselFromInfo, fetchCarousel, carouselBrief } from '../lib/carousel.js';

const slide = (id) => ({ id, formats: [], thumbnail: `https://cdn.example/${id}.jpg`, uploader: 'someone' });

test('a playlist of image slides with no video formats is a carousel', () => {
  const c = carouselFromInfo({ _type: 'playlist', description: 'Protect your power', entries: [slide('a'), slide('b')] });
  assert.equal(c.caption, 'Protect your power');
  assert.deepEqual(c.slides, ['https://cdn.example/a.jpg', 'https://cdn.example/b.jpg']);
});

test('a post with any video is not a carousel, and neither is a single video', () => {
  assert.equal(carouselFromInfo({ _type: 'playlist', entries: [slide('a'), { ...slide('b'), formats: [{ format_id: 'mp4' }] }] }), null);
  assert.equal(carouselFromInfo({ _type: 'video', formats: [] }), null);
  assert.equal(carouselFromInfo(null), null);
});

test('slides are saved in order, a failed slide is skipped, and the brief lists them', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'carousel-test-'));
  const got = await fetchCarousel('https://www.instagram.com/p/x/', dir, {
    info: async () => ({ _type: 'playlist', description: 'cap', entries: [slide('a'), slide('bad'), slide('c')] }),
    fetchImage: async (u) => { if (u.includes('bad')) throw new Error('404'); return Buffer.from('img'); },
  });
  assert.deepEqual((await readdir(dir)).sort(), ['slide-01.jpg', 'slide-03.jpg']);
  const brief = carouselBrief(got);
  assert.match(brief, /PHOTO CAROUSEL of 2 image slides/);
  assert.match(brief, /slide-03\.jpg/);
});

test('a carousel whose slides all fail is an error, never an empty success', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'carousel-test-'));
  await assert.rejects(fetchCarousel('u', dir, {
    info: async () => ({ _type: 'playlist', entries: [slide('a')] }),
    fetchImage: async () => { throw new Error('403'); },
  }), /none of its slides/);
});
