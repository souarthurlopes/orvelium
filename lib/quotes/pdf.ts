import { type Quote, dateLabel, decimalInput, effectiveStatus, lineSubtotal, money, quoteNumber, quoteStatuses, totals } from './types';
import { formatDocument } from '../clients/types';
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
function drawMark(doc: jsPDF, x: number, y: number, size: number) {
  const points: [number,number][]=[];
  for(let i=0;i<=60;i++){const a=(-49-172*i/60)*Math.PI/180;points.push([50+46*Math.cos(a),50+46*Math.sin(a)]);}
  for(let i=0;i<=60;i++){const a=(145+160*i/60)*Math.PI/180;points.push([50+26*Math.cos(a),50+26*Math.sin(a)]);}
  for(const mirrored of [false,true]) {
    const polygon=points.map(([a,b])=>[x+(mirrored?100-a:a)*size/100,y+(mirrored?100-b:b)*size/100]);
    doc.setFillColor(0,0,0);doc.path(polygon.map(([a,b],index)=>({op:index?'l':'m',c:[a,b]})).concat([{op:'h',c:[]}])).fill();
  }
}
export async function buildQuotePdf(quote: Quote): Promise<Blob> {
  const [{ jsPDF }, { default: autoTable }, [normal,bold]] = await Promise.all([import('jspdf'),import('jspdf-autotable'),fontData()]);
  const doc = new jsPDF({ unit:'mm',format:'a4',compress:true });
  doc.addFileToVFS('Manrope-Regular.ttf',normal);doc.addFont('Manrope-Regular.ttf','Manrope','normal');
  doc.addFileToVFS('Manrope-Bold.ttf',bold);doc.addFont('Manrope-Bold.ttf','Manrope','bold');
  doc.setFont('Manrope');doc.setProperties({title:`${quoteNumber(quote.number)} — ${quote.companySnapshot.name}`,author:'Orvelium One',subject:'Proposta demonstrativa local'});
  const headerPages=new Set<number>();
  const header=()=>{
    const page=doc.getCurrentPageInfo().pageNumber;if(headerPages.has(page))return;headerPages.add(page);
    drawMark(doc,15,13,9);doc.setFont('Manrope','bold');doc.setFontSize(14);doc.setTextColor(0);doc.text('ORVELIUM ONE',28,20);
    doc.setFontSize(10);doc.text(quoteNumber(quote.number),195,17,{align:'right'});doc.setFont('Manrope','normal');doc.setFontSize(8);doc.setTextColor(75);doc.text('PROPOSTA COMERCIAL · DEMONSTRAÇÃO',15,31);doc.text(quoteStatuses[effectiveStatus(quote)],195,31,{align:'right'});doc.setDrawColor(220);doc.line(15,36,195,36);
  };
  const base={margin:{top:43,bottom:22,left:15,right:15},styles:{font:'Manrope',fontSize:9,cellPadding:3.5,textColor:35 as const,lineColor:230 as const,overflow:'linebreak' as const},headStyles:{fillColor:35 as const,textColor:255 as const,fontStyle:'bold' as const},didDrawPage:header};
  const end=()=> (doc as jsPDF & { lastAutoTable?: {finalY:number} }).lastAutoTable?.finalY ?? 43;
  const client=quote.clientSnapshot;
  const customer=[client.name,`${client.type==='individual'?'CPF':'CNPJ'}: ${formatDocument(client.document,client.type)}`,client.phone&&`Telefone: ${client.phone}`,client.email,client.address,[client.city,client.state].filter(Boolean).join(' / ')].filter(Boolean).join('\n');
  autoTable(doc,{...base,startY:43,head:[['EMPRESA EMITENTE','CLIENTE · DADOS PRESERVADOS']],body:[[`${quote.companySnapshot.name}\nDemais dados da empresa não informados.`,customer]],columnStyles:{0:{cellWidth:80},1:{cellWidth:100}},theme:'grid'});
  autoTable(doc,{...base,startY:end()+6,head:[['DATA','VALIDADE','REGISTRO']],body:[[dateLabel(quote.date),dateLabel(quote.validUntil),quote.issuedAt?'Dados preservados desde a emissão':'Rascunho demonstrativo']],theme:'grid'});
  autoTable(doc,{...base,startY:end()+7,head:[['DESCRIÇÃO','QTD.','UN.','UNITÁRIO','SUBTOTAL']],body:quote.items.map(item=>[item.description,decimalInput(item.quantityMilli,3).replace('.',','),item.unit,money(item.unitPriceCents),money(lineSubtotal(item))]),columnStyles:{0:{cellWidth:72},1:{cellWidth:20,halign:'right'},2:{cellWidth:16},3:{cellWidth:35,halign:'right'},4:{cellWidth:37,halign:'right'}},theme:'striped',alternateRowStyles:{fillColor:247},rowPageBreak:'auto'});
  const total=totals(quote);
  autoTable(doc,{...base,startY:end()+5,body:[['Subtotal',money(total.subtotal)],[`Desconto${quote.discount.kind==='percent'?` (${decimalInput(quote.discount.value).replace('.',',')}%)`:''}`,money(total.discount)],['TOTAL DA PROPOSTA',money(total.total)]],columnStyles:{0:{cellWidth:130},1:{cellWidth:50,halign:'right'}},theme:'plain',didParseCell:data=>{if(data.row.index===2){data.cell.styles.fontStyle='bold';data.cell.styles.fillColor=240;}}});
  for(const [label,text] of [['CONDIÇÕES DE PAGAMENTO',quote.paymentTerms||'Não informadas.'],['OBSERVAÇÕES',quote.notes||'Não informadas.']])autoTable(doc,{...base,startY:end()+7,head:[[label]],body:[[text]],theme:'plain',headStyles:{fillColor:242,textColor:35,fontStyle:'bold'},rowPageBreak:'auto'});
  for(let page=1;page<=doc.getNumberOfPages();page++){doc.setPage(page);doc.setFont('Manrope','normal');doc.setTextColor(95);doc.setFontSize(7);doc.text('Dados fictícios · Armazenamento local · Sem aceite externo ou envio automático.',15,282);doc.text(`Página ${page} de ${doc.getNumberOfPages()}`,195,282,{align:'right'});}
  return doc.output('blob');
}
export function whatsappUrl(quote: Quote) {
  const text=`Olá! Segue o resumo demonstrativo do orçamento ${quoteNumber(quote.number)} de ${quote.companySnapshot.name} para ${quote.clientSnapshot.name}. Total: ${money(totals(quote).total)}. Validade: ${dateLabel(quote.validUntil)}. Esta mensagem não inclui arquivo ou link público. O PDF pode ser anexado manualmente após o download.`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
