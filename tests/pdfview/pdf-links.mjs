// Node test of the whole path from a PDF file to the link boxes of a page.
// pdf.js reads the annotations of the page, and js/pdfDocView.js turns them
// into boxes. The test builds a small file with links, so it needs no fixture
// on disk.
// Run: node tests/pdfview/pdf-links.mjs

import assert from 'node:assert/strict';
import { linkBoxesFromAnnotations } from '../../js/pdfDocView.js';
import { buildLinkPdf } from './fixture.mjs';

// pdf.js writes notes about the canvas of a browser, which Node does not have.
// The notes say nothing about this test, so keep them out of the report.
async function quiet(run) {
  const log = console.log;
  console.log = () => {};
  try {
    return await run();
  } finally {
    console.log = log;
  }
}

function test(name, fn) {
  fn();
  console.log(`ok  ${name}`);
}

const { doc, boxes } = await quiet(async () => {
  const lib = await import('../../js/vendor/pdfjs/pdf.mjs');
  const loaded = await lib.getDocument({
    data: buildLinkPdf(),
    isEvalSupported: false,
    useWorkerFetch: false,
    verbosity: 0,
  }).promise;
  const page = await loaded.getPage(1);
  const annotations = await page.getAnnotations({ intent: 'display' });
  return {
    doc: loaded,
    boxes: linkBoxesFromAnnotations(annotations, page.getViewport({ scale: 1 })),
  };
});

test('the page gives one box for each link the view can open', () => {
  // The file holds five link rectangles: one to the web, one with a
  // "javascript:" address, two lines of one link, and one into the same file.
  // The view drops the "javascript:" link, so four boxes stay.
  assert.equal(boxes.length, 4);
});

test('a link to the web keeps its address and its place', () => {
  const box = boxes.find((item) => item.url === 'https://example.com/one');
  assert.ok(box, 'the file has a link to https://example.com/one');
  assert.deepEqual(
    [box.left, box.top, box.width, box.height],
    [5, 90, 10, 5],
  );
});

test('the view drops a "javascript:" link', () => {
  assert.equal(boxes.some((box) => box.url.startsWith('javascript')), false);
});

test('a link on two lines gives two boxes', () => {
  const lines = boxes.filter((box) => box.url === 'https://example.com/two');
  assert.equal(lines.length, 2);
  assert.deepEqual(
    lines.map((box) => [box.left, box.top, box.width, box.height]),
    [[5, 65, 40, 5], [5, 70, 40, 5]],
  );
});

test('a link into the same file keeps a destination and no address', () => {
  const inside = boxes.filter((box) => !box.url);
  assert.equal(inside.length, 1);
  assert.ok(Array.isArray(inside[0].dest), 'the box holds the destination of the link');
  assert.equal(inside[0].dest[1]?.name, 'XYZ');
});

const index = await quiet(() => doc.getPageIndex(boxes.find((box) => !box.url).dest[0]));
test('the destination names the second page of the file', () => {
  assert.equal(index, 1);
});

await quiet(() => doc.destroy());
console.log('pdf links: ok');
