// Node tests for the link boxes of the in-app PDF view.
// A canvas holds no links, so js/pdfDocView.js builds one box for each link
// annotation of a page. These tests check the address filter and the boxes.
// Run: node tests/pdfview/link-boxes.mjs

import assert from 'node:assert/strict';
import { safeLinkUrl, linkBoxesFromAnnotations } from '../../js/pdfDocView.js';

/**
 * A page of the given size at scale 1, without rotation.
 * pdf.js turns a point of the PDF into a point of the view with the same x and
 * with y measured from the top of the page.
 */
function viewportOf(width, height) {
  return {
    width,
    height,
    convertToViewportRectangle([x1, y1, x2, y2]) {
      return [x1, height - y1, x2, height - y2];
    },
  };
}

function link(extra) {
  return { subtype: 'Link', annotationFlags: 0, rect: [10, 20, 30, 40], ...extra };
}

function test(name, fn) {
  fn();
  console.log(`ok  ${name}`);
}

test('safeLinkUrl keeps the addresses a learner can open', () => {
  assert.equal(safeLinkUrl('https://example.com/a'), 'https://example.com/a');
  assert.equal(safeLinkUrl('http://example.com/a'), 'http://example.com/a');
  assert.equal(safeLinkUrl('  https://example.com/a  '), 'https://example.com/a');
  assert.equal(safeLinkUrl('mailto:teacher@example.com'), 'mailto:teacher@example.com');
  assert.equal(safeLinkUrl('tel:+15551234567'), 'tel:+15551234567');
});

test('safeLinkUrl drops an address the view must not open', () => {
  assert.equal(safeLinkUrl('javascript:alert(1)'), '');
  assert.equal(safeLinkUrl('JavaScript:alert(1)'), '');
  assert.equal(safeLinkUrl('data:text/html,<b>x</b>'), '');
  assert.equal(safeLinkUrl('file:///etc/passwd'), '');
  assert.equal(safeLinkUrl('lesson-two.pdf'), '');
  assert.equal(safeLinkUrl(''), '');
  assert.equal(safeLinkUrl(null), '');
  assert.equal(safeLinkUrl(42), '');
});

test('a link to the web becomes a box in percent of the page', () => {
  const boxes = linkBoxesFromAnnotations(
    [link({ url: 'https://example.com/one' })],
    viewportOf(200, 400),
  );
  assert.equal(boxes.length, 1);
  assert.deepEqual(boxes[0], {
    left: 5, top: 90, width: 10, height: 5, url: 'https://example.com/one', dest: null,
  });
});

test('a link into the same file keeps its destination', () => {
  const dest = [{ num: 9, gen: 0 }, { name: 'XYZ' }, 0, 300, null];
  const boxes = linkBoxesFromAnnotations([link({ dest })], viewportOf(200, 400));
  assert.equal(boxes.length, 1);
  assert.equal(boxes[0].url, '');
  assert.equal(boxes[0].dest, dest);
});

test('quadrilaterals give one box for each line of a link', () => {
  const quadPoints = Float32Array.from([
    10, 140, 90, 140, 10, 120, 90, 120,
    10, 120, 90, 120, 10, 100, 90, 100,
  ]);
  const boxes = linkBoxesFromAnnotations(
    [link({ url: 'https://example.com/two', rect: [10, 100, 90, 140], quadPoints })],
    viewportOf(200, 400),
  );
  assert.equal(boxes.length, 2);
  assert.deepEqual(
    boxes.map((box) => [box.left, box.top, box.width, box.height]),
    [[5, 65, 40, 5], [5, 70, 40, 5]],
  );
  boxes.forEach((box) => assert.equal(box.url, 'https://example.com/two'));
});

test('the view leaves out a link it cannot use', () => {
  const viewport = viewportOf(200, 400);
  // No address and no destination.
  assert.deepEqual(linkBoxesFromAnnotations([link({})], viewport), []);
  // An address the view must not open.
  assert.deepEqual(linkBoxesFromAnnotations([link({ url: 'javascript:alert(1)' })], viewport), []);
  // Another kind of annotation.
  assert.deepEqual(linkBoxesFromAnnotations(
    [{ subtype: 'Widget', rect: [10, 20, 30, 40], url: 'https://example.com/' }],
    viewport,
  ), []);
  // A page does not show a hidden link.
  assert.deepEqual(linkBoxesFromAnnotations(
    [link({ url: 'https://example.com/', annotationFlags: 0x02 })],
    viewport,
  ), []);
  assert.deepEqual(linkBoxesFromAnnotations(
    [link({ url: 'https://example.com/', annotationFlags: 0x20 })],
    viewport,
  ), []);
  // A rectangle of no height holds no text.
  assert.deepEqual(linkBoxesFromAnnotations(
    [link({ url: 'https://example.com/', rect: [10, 20, 30, 20] })],
    viewport,
  ), []);
  // A rectangle off the page shows nothing.
  assert.deepEqual(linkBoxesFromAnnotations(
    [link({ url: 'https://example.com/', rect: [-90, -80, -10, -20] })],
    viewport,
  ), []);
});

test('a box that leaves the page keeps the part on the page', () => {
  const boxes = linkBoxesFromAnnotations(
    [link({ url: 'https://example.com/', rect: [-40, 20, 60, 40] })],
    viewportOf(200, 400),
  );
  assert.equal(boxes.length, 1);
  assert.equal(boxes[0].left, 0);
  assert.equal(boxes[0].width, 30);
});

test('bad input gives no box', () => {
  assert.deepEqual(linkBoxesFromAnnotations(null, viewportOf(200, 400)), []);
  assert.deepEqual(linkBoxesFromAnnotations([link({ url: 'https://example.com/' })], null), []);
  assert.deepEqual(linkBoxesFromAnnotations([null, undefined], viewportOf(200, 400)), []);
});

console.log('pdf link boxes: ok');
