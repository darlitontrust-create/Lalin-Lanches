// Caixa de motivo: toda exclusão pede um motivo e fica registrada no Log de exclusões
import { useState, type ReactNode } from 'react';
import { useApp } from '../store';
import type { Why } from '../types';
import { isOn } from '../utils';
import { ModalHead } from './ui';

export function DeleteReasonModal({ title, details, ok = 'Excluir', onConfirm, onBack }: {
  title: string; details?: ReactNode; ok?: string; onConfirm: (why: Why) => Promise<void>; onBack?: () => void;
}) {
  const { cfg, ui } = useApp();
  return <>
    <ModalHead title={title} onClose={onBack || (() => ui.modal(null))} />
    {details && <div style={{ marginBottom: 10 }}>{details}</div>}
    <ReasonFields reasons={cfg.delReasons.filter(x => isOn(cfg, 'delReasons', x))} ok={ok} onBack={onBack || (() => ui.modal(null))} onConfirm={onConfirm} />
  </>;
}

/** Campos de motivo + observação, reaproveitados também dentro de outras telas. */
export function ReasonFields({ reasons, ok, onConfirm, onBack }: { reasons: string[]; ok: string; onConfirm: (why: Why) => Promise<void>; onBack: () => void }) {
  const { ui } = useApp();
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const needNote = reason === 'Outro';
  const go = async () => {
    if (!reason) return ui.toast('Escolha o motivo da exclusão');
    if (needNote && !note.trim()) return ui.toast('Descreva o motivo');
    setBusy(true);
    try { await onConfirm({ reason, note }); } catch (e) { ui.toast('Erro: ' + (e as Error).message); setBusy(false); }
  };
  return <>
    <div className="note" style={{ marginBottom: 10 }}>
      <b>Motivo da exclusão *</b>
      <div className="chips" style={{ marginTop: 8 }}>{reasons.map(r => <button key={r} className={'chip' + (reason === r ? ' on' : '')} onClick={() => setReason(r)}>{r}</button>)}</div>
      <label style={{ marginTop: 10 }}>Observação{needNote ? ' *' : ' (opcional)'}<input value={note} onChange={e => setNote(e.target.value)} placeholder="Ex.: lançado duas vezes no balcão" /></label>
    </div>
    <p className="mute" style={{ margin: 0 }}>A exclusão fica registrada em Log de exclusões com seu nome, data e motivo.</p>
    <div className="row end"><button className="btn" onClick={onBack}>Voltar</button><button className="btn p" disabled={busy} onClick={go}>{ok}</button></div>
  </>;
}
