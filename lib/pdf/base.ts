import type { jsPDF } from 'jspdf';
let fonts: Promise<[string,string]> | undefined;
function fontData() {
  if (!fonts) fonts = Promise.all(['/fonts/Manrope-Regular.ttf','/fonts/Manrope-Bold.ttf'].map(async path => {
    const response = await fetch(path); if (!response.ok) throw new Error('Não foi possível carregar a fonte local do PDF.');
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = ''; for (let i=0;i<bytes.length;i+=32768) binary += String.fromCharCode(...bytes.subarray(i,i+32768));
    return btoa(binary);
  })).then(values => values as [string,string]).catch(error => {fonts=undefined;throw error;});
  return fonts;
}
export function drawMark(doc: jsPDF, x: number, y: number, size: number) {
  const points: [number,number][]=[];
  for(let i=0;i<=60;i++){const a=(-49-172*i/60)*Math.PI/180;points.push([50+46*Math.cos(a),50+46*Math.sin(a)]);}
  for(let i=0;i<=60;i++){const a=(145+160*i/60)*Math.PI/180;points.push([50+26*Math.cos(a),50+26*Math.sin(a)]);}
  for(const mirrored of [false,true]) {
    const polygon=points.map(([a,b])=>[x+(mirrored?100-a:a)*size/100,y+(mirrored?100-b:b)*size/100]);
    doc.setFillColor(0,0,0);doc.path(polygon.map(([a,b],index)=>({op:index?'l':'m',c:[a,b]})).concat([{op:'h',c:[]}])).fill();
  }
}
export async function createPdfDocument() {
  const [{ jsPDF }, [normal,bold]] = await Promise.all([import('jspdf'),fontData()]);
  const doc = new jsPDF({ unit:'mm',format:'a4',compress:true });
  doc.addFileToVFS('Manrope-Regular.ttf',normal);doc.addFont('Manrope-Regular.ttf','Manrope','normal');
  doc.addFileToVFS('Manrope-Bold.ttf',bold);doc.addFont('Manrope-Bold.ttf','Manrope','bold');
  doc.setFont('Manrope');
  return doc;
}
