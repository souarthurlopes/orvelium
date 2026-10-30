'use client';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
/** Native modal supplies focus trapping, Escape, inert background and focus return. */
export function Dialog({ title, children, onClose, alert = false, busy = false }: {
  title: string; children: ReactNode; onClose: () => void; alert?: boolean; busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => { dialog.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={ref} className="client-dialog" aria-labelledby={titleId} role={alert ? 'alertdialog' : 'dialog'} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="client-dialog-heading"><h2 id={titleId}>{title}</h2><button type="button" className="icon-button" aria-label="Fechar painel" disabled={busy} onClick={onClose}><X size={18}/></button></div>
    {children}
  </dialog>;
}
