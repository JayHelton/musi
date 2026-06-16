import { getScaleNotes } from './scales.js';

export const COF = [
  {maj:'C',  min:'Am',  sig:'None'},
  {maj:'G',  min:'Em',  sig:'1\u266F (F\u266F)'},
  {maj:'D',  min:'Bm',  sig:'2\u266F (F\u266F, C\u266F)'},
  {maj:'A',  min:'F\u266Fm',sig:'3\u266F (F\u266F, C\u266F, G\u266F)'},
  {maj:'E',  min:'C\u266Fm',sig:'4\u266F (F\u266F, C\u266F, G\u266F, D\u266F)'},
  {maj:'B',  min:'G\u266Fm',sig:'5\u266F (F\u266F, C\u266F, G\u266F, D\u266F, A\u266F)'},
  {maj:'F\u266F/G\u266D',min:'D\u266Fm/E\u266Dm',sig:'6\u266F / 6\u266D'},
  {maj:'D\u266D',min:'B\u266Dm',sig:'5\u266D (B\u266D, E\u266D, A\u266D, D\u266D, G\u266D)'},
  {maj:'A\u266D',min:'Fm', sig:'4\u266D (B\u266D, E\u266D, A\u266D, D\u266D)'},
  {maj:'E\u266D',min:'Cm', sig:'3\u266D (B\u266D, E\u266D, A\u266D)'},
  {maj:'B\u266D',min:'Gm', sig:'2\u266D (B\u266D, E\u266D)'},
  {maj:'F',  min:'Dm',  sig:'1\u266D (B\u266D)'},
];
export const COF_ROOTS = ['C','G','D','A','E','B','F#','Db','Ab','Eb','Bb','F'];
// 12-hue wheel anchored to the app accent (orange, ~16deg) at C, stepping 30deg
// per fifth. Uniform saturation (58%) and lightness (30%) keep every segment
// cohesive with the warm palette and legible behind the light text.
export const COF_COLORS = [
  '#793820','#796420','#617920','#357920','#207938','#207964',
  '#206179','#203579','#382079','#642079','#792061','#792035'
];

export function drawCoF() {
  const svg = document.getElementById('circle-svg');
  if (svg.children.length > 0) return;
  const cx=250, cy=250;
  const ri1=100, ro1=165, ri2=165, ro2=225;

  function arcPath(ri,ro,a1,a2) {
    const r1=a1*Math.PI/180, r2=a2*Math.PI/180;
    const ix1=cx+ri*Math.cos(r1), iy1=cy+ri*Math.sin(r1);
    const ox1=cx+ro*Math.cos(r1), oy1=cy+ro*Math.sin(r1);
    const ox2=cx+ro*Math.cos(r2), oy2=cy+ro*Math.sin(r2);
    const ix2=cx+ri*Math.cos(r2), iy2=cy+ri*Math.sin(r2);
    return `M${ix1},${iy1} L${ox1},${oy1} A${ro},${ro} 0 0,1 ${ox2},${oy2} L${ix2},${iy2} A${ri},${ri} 0 0,0 ${ix1},${iy1}Z`;
  }

  for (let i = 0; i < 12; i++) {
    const a1 = -90 + i*30 - 15, a2 = a1 + 30;
    const aMid = (a1+a2)/2 * Math.PI/180;

    const gOuter = document.createElementNS('http://www.w3.org/2000/svg','g');
    gOuter.classList.add('cof-seg');
    gOuter.onclick = () => cofSelect(i);
    const pO = document.createElementNS('http://www.w3.org/2000/svg','path');
    pO.setAttribute('d', arcPath(ri2,ro2,a1,a2));
    pO.setAttribute('fill', COF_COLORS[i]);
    pO.setAttribute('stroke', '#30363d');
    pO.setAttribute('stroke-width','1');
    gOuter.appendChild(pO);
    const tO = document.createElementNS('http://www.w3.org/2000/svg','text');
    tO.setAttribute('x', cx + (ri2+ro2)/2 * Math.cos(aMid));
    tO.setAttribute('y', cy + (ri2+ro2)/2 * Math.sin(aMid));
    tO.classList.add('cof-text');
    tO.textContent = COF[i].maj;
    gOuter.appendChild(tO);
    svg.appendChild(gOuter);

    const gInner = document.createElementNS('http://www.w3.org/2000/svg','g');
    gInner.classList.add('cof-seg');
    gInner.onclick = () => cofSelect(i);
    const pI = document.createElementNS('http://www.w3.org/2000/svg','path');
    pI.setAttribute('d', arcPath(ri1,ro1,a1,a2));
    pI.setAttribute('fill', COF_COLORS[i]+'88');
    pI.setAttribute('stroke', '#30363d');
    pI.setAttribute('stroke-width','1');
    gInner.appendChild(pI);
    const tI = document.createElementNS('http://www.w3.org/2000/svg','text');
    tI.setAttribute('x', cx + (ri1+ro1)/2 * Math.cos(aMid));
    tI.setAttribute('y', cy + (ri1+ro1)/2 * Math.sin(aMid));
    tI.classList.add('cof-text','minor');
    tI.textContent = COF[i].min;
    gInner.appendChild(tI);
    svg.appendChild(gInner);
  }
}

function cofSelect(i) {
  const d = COF[i];
  const rootStr = COF_ROOTS[i];
  const notes = getScaleNotes(rootStr, 'Major (Ionian)');
  const noteStr = notes ? notes.join('  ') : '';
  document.getElementById('cof-info').innerHTML =
    `<h3>${d.maj} Major / ${d.min}</h3>
     <div class="detail">Key Signature: ${d.sig}</div>
     <div class="detail">Relative Minor: ${d.min}</div>
     <div class="notes">${noteStr}</div>`;
}

window.drawCoF = drawCoF;
