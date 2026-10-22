import test from 'node:test';
import assert from 'node:assert/strict';
import { artworkFilename } from '../src/lib/download';

test('download filenames identify the creator and preserve the WebP extension', () => {
  assert.equal(artworkFilename('Cikgu Áina Binti Ali'), 'wow-mean-karya-cikgu-aina-binti-ali.webp');
  assert.equal(artworkFilename('林老师 🌸'), 'wow-mean-karya-peserta.webp');
});

test('download filenames cannot inject paths or response headers and stay bounded', () => {
  for (const name of ['../../outside', 'x"\r\nSet-Cookie:secret', 'A'.repeat(200), '']) {
    const filename = artworkFilename(name);
    assert.match(filename, /^wow-mean-karya-[a-z0-9-]+\.webp$/);
    assert.ok(filename.length <= 'wow-mean-karya-'.length + 48 + '.webp'.length);
  }
});
