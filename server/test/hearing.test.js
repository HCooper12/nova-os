// Nova's own ears: audio arrives from the app's recorder or a Shortcut and is
// pulled out of whatever shape the client sent. The Whisper call itself needs
// a real key and a real voice and is exercised live, not here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { multipartBoundary, firstMultipartFile, audioFromRequest } from '../lib/hearing.js';
import { audioExtension, cleanTranscript } from '../lib/transcribe.js';

const AUDIO = Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x0d, 0x0a, 0x2d, 0x2d, 0xff, 0x00]); // binary, with a CRLF and dashes inside

function multipart(boundary, parts) {
  const chunks = [];
  for (const p of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n${p.head}\r\n\r\n`));
    chunks.push(Buffer.isBuffer(p.body) ? p.body : Buffer.from(p.body));
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(chunks);
}

test('the boundary is read quoted or bare, and a non-multipart type has none', () => {
  assert.equal(multipartBoundary('multipart/form-data; boundary=abc123'), 'abc123');
  assert.equal(multipartBoundary('multipart/form-data; charset=utf-8; boundary="Boundary-XYZ"'), 'Boundary-XYZ');
  assert.equal(multipartBoundary('audio/mp4'), null);
  assert.equal(multipartBoundary(undefined), null);
});

test('a Shortcut Form body yields the file bytes exactly, binary intact, text fields skipped', () => {
  const b = 'Boundary-7F3A';
  const body = multipart(b, [
    { head: 'Content-Disposition: form-data; name="note"', body: 'hello' },
    { head: 'Content-Disposition: form-data; name="file"; filename="Recording.m4a"\r\nContent-Type: audio/x-m4a', body: AUDIO },
  ]);
  const part = firstMultipartFile(body, b);
  assert.ok(part);
  assert.deepEqual([...part.buf], [...AUDIO]);
  assert.equal(part.mime, 'audio/x-m4a');
  assert.equal(part.name, 'Recording.m4a');
});

test('a raw File body is the recording; the app hint beats a generic type', () => {
  const raw = audioFromRequest(AUDIO, 'application/octet-stream');
  assert.equal(raw.mime, 'audio/mp4');
  assert.equal(raw.buf, AUDIO);
  assert.equal(audioFromRequest(AUDIO, 'audio/webm;codecs=opus').mime, 'audio/webm');
  assert.equal(audioFromRequest(AUDIO, 'application/octet-stream', 'audio/mp4').mime, 'audio/mp4');
});

test('an empty body, a text body and a file-less form each fail in words', () => {
  assert.match(audioFromRequest(Buffer.alloc(0), 'audio/mp4').error, /empty/);
  assert.match(audioFromRequest(undefined, 'audio/mp4').error, /empty/);
  assert.match(audioFromRequest(Buffer.from('{"question":"hi"}'), 'application/json').error, /Request Body to File/);
  const b = 'B1';
  const noFile = multipart(b, [{ head: 'Content-Disposition: form-data; name="q"', body: 'hi' }]);
  assert.match(audioFromRequest(noFile, `multipart/form-data; boundary=${b}`).error, /no audio file/);
});

test('Whisper judges by filename, so every type an iPhone or browser records gets its real extension', () => {
  assert.equal(audioExtension('audio/mp4'), 'm4a');
  assert.equal(audioExtension('audio/x-m4a'), 'm4a');
  assert.equal(audioExtension('audio/webm;codecs=opus'), 'webm');
  assert.equal(audioExtension('audio/ogg'), 'ogg');
  assert.equal(audioExtension('audio/wav'), 'wav');
  assert.equal(audioExtension('audio/mpeg'), 'mp3');
  assert.equal(audioExtension(''), 'm4a');
});

test("Whisper's lines for silence are dropped only when they are the whole transcript", () => {
  assert.equal(cleanTranscript('Thank you.'), '');
  assert.equal(cleanTranscript(' Thanks for watching! '), '');
  assert.equal(cleanTranscript('you'), '');
  assert.equal(cleanTranscript('Thank you. Thank you.'), '', 'silence comes back repeated');
  assert.equal(cleanTranscript('Thank you. Bye.'), '');
  assert.equal(cleanTranscript(''), '');
  assert.equal(cleanTranscript(null), '');
  assert.equal(cleanTranscript('Thank you, add eggs to the list.'), 'Thank you, add eggs to the list.');
  assert.equal(cleanTranscript('  what did   I eat today  '), 'what did I eat today');
});
