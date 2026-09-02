// A small PDF with link annotations, built in memory for the tests of the
// in-app PDF view. The file has one page of 200 x 400 units and four links:
//
// 1. a link to the web with a rectangle only;
// 2. a link with a "javascript:" address, which the view must not open;
// 3. a link to the web with quadrilaterals for two lines of text;
// 4. a link to page 2 of the same file.

/**
 * Build the bytes of the test file.
 *
 * @returns {Uint8Array}
 */
export function buildLinkPdf() {
  const objects = [];
  /** Add an object and give back its number. */
  const add = (body) => objects.push(body);

  const content = 'BT /F1 12 Tf 10 360 Td (Open example) Tj ET';
  const contentId = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const webId = add('<< /Type /Annot /Subtype /Link /Rect [10 20 30 40] /Border [0 0 0] '
    + '/A << /S /URI /URI (https://example.com/one) >> >>');
  const scriptId = add('<< /Type /Annot /Subtype /Link /Rect [10 60 90 80] /Border [0 0 0] '
    + '/A << /S /URI /URI (javascript:alert\\(1\\)) >> >>');
  const quadId = add('<< /Type /Annot /Subtype /Link /Rect [10 100 90 140] /Border [0 0 0] '
    + '/QuadPoints [10 140 90 140 10 120 90 120 10 120 90 120 10 100 90 100] '
    + '/A << /S /URI /URI (https://example.com/two) >> >>');
  // The numbers of the two pages come below, so reserve the places first.
  const insideId = add('');
  const pageOneId = add('');
  const pageTwoId = add('');
  const pagesId = add('');
  const rootId = add('');

  objects[insideId - 1] = `<< /Type /Annot /Subtype /Link /Rect [10 200 90 220] /Border [0 0 0] `
    + `/Dest [${pageTwoId} 0 R /XYZ 0 300 null] >>`;
  objects[pageOneId - 1] = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 200 400] `
    + `/Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> `
    + `/Annots [${webId} 0 R ${scriptId} 0 R ${quadId} 0 R ${insideId} 0 R] >>`;
  objects[pageTwoId - 1] = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 200 400] `
    + `/Resources << >> >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageOneId} 0 R ${pageTwoId} 0 R] /Count 2 >>`;
  objects[rootId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;

  let text = '%PDF-1.7\n%\xe2\xe3\xcf\xd3\n';
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(text.length);
    text += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const startXref = text.length;
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((offset) => {
    text += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  text += `trailer\n<< /Size ${objects.length + 1} /Root ${rootId} 0 R >>\n`;
  text += `startxref\n${startXref}\n%%EOF\n`;

  const bytes = new Uint8Array(text.length);
  for (let at = 0; at < text.length; at += 1) bytes[at] = text.charCodeAt(at) & 0xff;
  return bytes;
}
