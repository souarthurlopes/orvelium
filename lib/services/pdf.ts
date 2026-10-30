import type { jsPDF } from 'jspdf';
import { createPdfDocument, drawMark } from '../pdf/base';
import { formatDocument } from '../clients/types';
import { dateLabel, decimalInput, lineSubtotal, money, quoteNumber, totals } from '../quotes/types';
import { changeText, overdue, serviceNumber } from './rules';
import { servicePriorities, serviceStatuses, type ServiceOrder } from './types';
export async function buildServicePdf(order: ServiceOrder): Promise<Blob> {
  const [doc,{default:autoTable}]=await Promise.all([createPdfDocument(),import('jspdf-autotable')]);
  doc.setProperties({title:`${serviceNumber(order.number)} — ${order.companySnapshot.name}`,author:'Orvelium One',subject:'Ordem de serviço demonstrativa local'});
  const pages=new Set<number>();
  const header=()=>{const page=doc.getCurrentPageInfo().pageNumber;if(pages.has(page))return;pages.add(page);drawMark(doc,15,13,9);doc.setFont('Manrope','bold');doc.setTextColor(0);doc.setFontSize(14);doc.text('ORVELIUM ONE',28,20);doc.setFontSize(10);doc.text(serviceNumber(order.number),195,17,{align:'right'});doc.setFont('Manrope','normal');doc.setFontSize(8);doc.setTextColor(75);doc.text('ORDEM DE SERVIÇO · DEMONSTRAÇÃO',15,31);doc.text(`${serviceStatuses[order.status]}${overdue(order)?' · Atrasada':''}`,195,31,{align:'right'});doc.setDrawColor(220);doc.line(15,36,195,36);};
  const base={margin:{top:43,bottom:22,left:15,right:15},styles:{font:'Manrope',fontSize:9,cellPadding:3.5,textColor:35 as const,lineColor:230 as const,overflow:'linebreak' as const},headStyles:{fillColor:35 as const,textColor:255 as const,fontStyle:'bold' as const},didDrawPage:header};
  const end=()=>(doc as jsPDF&{lastAutoTable?:{finalY:number}}).lastAutoTable?.finalY??43;
  const client=order.clientSnapshot;
  autoTable(doc,{...base,startY:43,head:[['EMPRESA','CLIENTE · DADOS HISTÓRICOS']],body:[[`${order.companySnapshot.name}\nDemais dados da empresa não informados.`,[client.name,`${client.type==='individual'?'CPF':'CNPJ'}: ${formatDocument(client.document,client.type)}`,client.phone,client.email,client.address,[client.city,client.state].filter(Boolean).join(' / ')].filter(Boolean).join('\n')]],columnStyles:{0:{cellWidth:80},1:{cellWidth:100}},theme:'grid'});
  autoTable(doc,{...base,startY:end()+6,head:[['SERVIÇO','RESPONSÁVEL','PRIORIDADE']],body:[[`${order.title}\n${order.serviceType}`,order.assignee,servicePriorities[order.priority]]],theme:'grid'});
  autoTable(doc,{...base,startY:end()+6,head:[['ABERTURA','INÍCIO PREVISTO','CONCLUSÃO PREVISTA']],body:[[dateLabel(order.openedDate),dateLabel(order.plannedStart),dateLabel(order.plannedEnd)]],theme:'grid'});
  const section=(title:string,text:string)=>autoTable(doc,{...base,startY:end()+7,head:[[title]],body:[[text]],theme:'plain',headStyles:{fillColor:242,textColor:35,fontStyle:'bold'},rowPageBreak:'auto'});
  section('DESCRIÇÃO E ESCOPO',order.description);
  if(order.items.length)autoTable(doc,{...base,startY:end()+7,head:[['ITEM / MATERIAL','QTD.','UN.','UNITÁRIO','SUBTOTAL']],body:order.items.map(item=>[item.description,decimalInput(item.quantityMilli,3).replace('.',','),item.unit,money(item.unitPriceCents),money(lineSubtotal(item))]),columnStyles:{0:{cellWidth:72},1:{cellWidth:20,halign:'right'},2:{cellWidth:16},3:{cellWidth:35,halign:'right'},4:{cellWidth:37,halign:'right'}},theme:'striped',alternateRowStyles:{fillColor:247},rowPageBreak:'auto'});
  else section('ITENS PREVISTOS','Nenhum item informado.');
  section('VALOR PREVISTO',`${money(order.expectedValueCents)}\nValor de planejamento. Não gera cobrança nem movimentação de estoque.`);
  if(order.origin)section('ORÇAMENTO DE ORIGEM · CÓPIA PRESERVADA',`${quoteNumber(order.origin.number)} · Revisão ${order.origin.revision}\nCliente: ${order.origin.clientSnapshot.name}\nValor aprovado na conversão: ${money(totals(order.origin).total)}\nAlterações posteriores do orçamento não atualizam esta OS.`);
  section('OBSERVAÇÕES INTERNAS',order.internalNotes||'Não informadas.');
  autoTable(doc,{...base,startY:end()+7,head:[['HISTÓRICO LOCAL · SEM AUTORIA AUTENTICADA']],body:order.history.map(event=>[`${dateLabel(event.effectiveDate)} · ${event.kind==='created'?'Abertura':event.kind==='status'?'Mudança de status':'Edição'}\n${event.note}\n${event.changes.map(change=>`${change.label}: ${changeText(change.field,change.before)} → ${changeText(change.field,change.after)}`).join('\n')}\nGravado em ${new Date(event.recordedAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}`]),theme:'striped',rowPageBreak:'auto'});
  for(let page=1;page<=doc.getNumberOfPages();page++){doc.setPage(page);doc.setFont('Manrope','normal');doc.setFontSize(7);doc.setTextColor(95);doc.text('Dados fictícios · Armazenamento local · Inclui observações internas. Revise antes de compartilhar.',15,282);doc.text(`Página ${page} de ${doc.getNumberOfPages()}`,195,282,{align:'right'});}
  return doc.output('blob');
}
