import { getActiveClient, setActiveClient } from '../state/clientContext.js';
import { clientRepository } from '../repositories/clientRepository.js';
import { getCollection } from '../storage.js';
import { getNextActionsForClient } from '../services/nextActionService.js';
import { markStepComplete } from '../services/claimStepService.js';
import { setEventPreselectClaim } from './claimEventUI.js';
import { openStepEventModal } from './claimEventModal.js';
import { startAutoRefresh, stopAutoRefresh } from './autoRefresh.js';

/** Huella de datos para detectar avances de otros dispositivos. */
function guiaSignature() {
    const ev = getCollection('claimEvents').length;
    const st = getCollection('claimSteps').map(s => s.id + s.estado).join();
    const pay = getCollection('payments').length;
    const vu = getCollection('vueltas').map(v => v.id + v.estado).join();
    const cl = getCollection('claims').map(c => c.id + c.estado).join();
    return `e${ev}|s${st}|p${pay}|v${vu}|c${cl}`;
}

const ESTADO_GENERAL = {
    hecho:        { bg: '#064e3b', color: '#34d399', label: '✓ Hecho' },
    pendiente:    { bg: '#78350f', color: '#fbbf24', label: '◷ Pendiente' },
    proximamente: { bg: '#1f2937', color: '#9ca3af', label: 'Próximamente' },
};
const ESTADO_PASO = {
    completado: { color: '#10b981', label: '✓ Completado' },
    en_curso:   { color: '#f59e0b', label: '◷ En curso' },
    pendiente:  { color: '#9ca3af', label: 'Pendiente' },
};

export function renderGuiaSection(container) {
    stopAutoRefresh();
    const active = getActiveClient();
    if (!active) {
        renderPicker(container);
        return;
    }
    renderForClient(container, active);
    startAutoRefresh('#guia', ['claims', 'claimEvents', 'claimSteps', 'payments', 'vueltas', 'incidents'],
        guiaSignature, () => renderGuiaSection(container), 8000);
}

function renderPicker(container) {
    const clients = clientRepository.getAll();
    container.innerHTML = `
        <div class="section">
            <h2 class="section-title">🧭 Guía / Secretaria</h2>
            <p style="color:#9ca3af;">Selecciona un cliente para ver qué hacer ahora con su trámite.</p>
            <div class="form-group" style="max-width:420px;">
                <label for="guia-client">Cliente</label>
                <input type="text" id="guia-client" list="guia-client-list" autocomplete="off" placeholder="Escribe nombre o DNI...">
                <datalist id="guia-client-list">
                    ${clients.map(c => `<option value="${esc(c.nombreCompleto)} ${esc(c.apellidosCompletos)} — ${esc(c.dni)}" data-id="${esc(c.id)}"></option>`).join('')}
                </datalist>
            </div>
        </div>`;
    const input = container.querySelector('#guia-client');
    input.addEventListener('change', () => {
        const opt = [...container.querySelectorAll('#guia-client-list option')].find(o => o.value === input.value);
        const id = opt?.getAttribute('data-id');
        if (id) { setActiveClient(id); renderGuiaSection(container); }
    });
}

function renderForClient(container, client) {
    const { generales, porBanco } = getNextActionsForClient(client.id);

    const generalesHtml = generales.map(g => {
        const cfg = ESTADO_GENERAL[g.estado] || ESTADO_GENERAL.pendiente;
        const clickable = g.hash && g.estado !== 'proximamente';
        return `<div class="guia-gen-step" ${clickable ? `data-hash="${esc(g.hash)}" style="cursor:pointer;"` : ''}
            style="display:flex;align-items:center;gap:0.75rem;padding:0.55rem 0.75rem;border-bottom:1px solid #1f2937;">
            <span style="width:22px;height:22px;border-radius:50%;background:#1f2937;color:#9ca3af;display:inline-flex;align-items:center;justify-content:center;font-size:0.78rem;flex:0 0 auto;">${g.orden}</span>
            <div style="flex:1;">
                <div style="color:#f1f5f9;">${esc(g.label)}</div>
                ${g.detalle ? `<div style="font-size:0.78rem;color:#9ca3af;">${esc(g.detalle)}</div>` : ''}
            </div>
            <span style="background:${cfg.bg};color:${cfg.color};border-radius:99px;padding:2px 10px;font-size:0.76rem;font-weight:700;white-space:nowrap;">${cfg.label}</span>
        </div>`;
    }).join('');

    const bancosHtml = porBanco.length === 0
        ? '<div class="empty-state">Este cliente aún no tiene reclamos. Inicia uno en Reclamos.</div>'
        : porBanco.map(b => renderBancoCard(b)).join('');

    container.innerHTML = `
        <div class="section">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
                <h2 class="section-title" style="margin:0;">🧭 Guía: ${esc(client.nombreCompleto)} ${esc(client.apellidosCompletos)}</h2>
                <button type="button" class="btn btn-secondary" id="guia-cambiar">Cambiar cliente</button>
            </div>
            <h3 style="color:#cbd5e1;font-size:0.95rem;margin:1rem 0 0.25rem;">Pasos generales</h3>
            <div style="background:#111827;border:1px solid #1f2937;border-radius:8px;overflow:hidden;">${generalesHtml}</div>
            <h3 style="color:#cbd5e1;font-size:0.95rem;margin:1.25rem 0 0.5rem;">Trámite por banco</h3>
            <div style="display:flex;flex-direction:column;gap:0.75rem;">${bancosHtml}</div>
        </div>`;

    container.querySelector('#guia-cambiar').addEventListener('click', () => { setActiveClient(null); renderGuiaSection(container); });
    container.querySelectorAll('.guia-gen-step[data-hash]').forEach(el => {
        el.addEventListener('click', () => { window.location.hash = el.getAttribute('data-hash'); });
    });

    // Acciones por banco
    porBanco.forEach(b => {
        const card = container.querySelector(`[data-claim="${b.claimId}"]`);
        if (!card) return;
        card.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.getAttribute('data-action');
                const stepId = btn.getAttribute('data-step');
                const paso = b.steps.find(s => s.id === stepId) || b.pasoActual;
                if (action === 'registrar') {
                    openStepEventModal({ claimId: b.claimId, paso, onDone: () => renderGuiaSection(container) });
                } else if (action === 'completar') {
                    markStepComplete(stepId);
                    renderGuiaSection(container);
                } else if (action === 'historial') {
                    setEventPreselectClaim(b.claimId);
                    window.location.hash = '#eventos';
                }
            });
        });
    });
}

function renderBancoCard(b) {
    const cur = b.pasoActual;
    let pasosHtml;
    if (b.sinPasos) {
        pasosHtml = `<div style="color:#9ca3af;font-size:0.85rem;padding:0.5rem 0;">Sin pasos configurados para este banco. Configúralos en <a href="#plantillasPasos" style="color:#7c3aed;">Pasos por Banco</a>.</div>`;
    } else {
        pasosHtml = b.steps.map(s => {
            const cfg = ESTADO_PASO[s.estado] || ESTADO_PASO.pendiente;
            const esActual = cur && s.id === cur.id;
            return `<div style="display:flex;align-items:center;gap:0.6rem;padding:0.4rem 0;border-top:1px solid #1f2937;${esActual ? 'background:#0b1220;' : ''}">
                <span style="width:20px;text-align:center;color:#64748b;font-size:0.78rem;">${s.orden}</span>
                <div style="flex:1;">
                    <span style="color:${esActual ? '#f1f5f9' : '#cbd5e1'};${esActual ? 'font-weight:600;' : ''}">${esc(s.nombre)}</span>
                    ${esActual ? `<div style="font-size:0.8rem;color:${b.accion.color};margin-top:2px;">➜ ${esc(b.accion.texto)}</div>` : ''}
                </div>
                <span style="color:${cfg.color};font-size:0.76rem;white-space:nowrap;">${cfg.label}</span>
            </div>`;
        }).join('');
    }

    // Botones de acción del paso actual
    let botones = '';
    if (cur) {
        const btns = [];
        if (cur.estado === 'pendiente') {
            btns.push(`<button type="button" class="btn btn-primary" data-action="registrar" data-step="${esc(cur.id)}" style="padding:0.3rem 0.7rem;font-size:0.8rem;">Registrar paso</button>`);
        } else if (cur.estado === 'en_curso') {
            if (cur.tipoPaso === 'peticion_parcial') {
                btns.push(`<button type="button" class="btn btn-secondary" data-action="registrar" data-step="${esc(cur.id)}" style="padding:0.3rem 0.7rem;font-size:0.8rem;">Registrar parte</button>`);
                btns.push(`<button type="button" class="btn btn-primary" data-action="completar" data-step="${esc(cur.id)}" style="padding:0.3rem 0.7rem;font-size:0.8rem;">Marcar completo</button>`);
            } else {
                btns.push(`<button type="button" class="btn btn-secondary" data-action="registrar" data-step="${esc(cur.id)}" style="padding:0.3rem 0.7rem;font-size:0.8rem;">Registrar evento</button>`);
                btns.push(`<button type="button" class="btn btn-primary" data-action="completar" data-step="${esc(cur.id)}" style="padding:0.3rem 0.7rem;font-size:0.8rem;">Marcar respondido</button>`);
            }
        }
        btns.push(`<button type="button" class="btn btn-secondary" data-action="historial" style="padding:0.3rem 0.7rem;font-size:0.8rem;">Ver historial</button>`);
        botones = `<div style="display:flex;gap:0.4rem;flex-wrap:wrap;margin-top:0.6rem;">${btns.join('')}</div>`;
    } else if (!b.sinPasos) {
        botones = `<div style="margin-top:0.5rem;color:#10b981;font-size:0.85rem;">✓ Trámite completo en este banco.</div>
            <div style="margin-top:0.4rem;"><button type="button" class="btn btn-secondary" data-action="historial" style="padding:0.3rem 0.7rem;font-size:0.8rem;">Ver historial</button></div>`;
    }

    const estadoColor = b.estadoReclamo === 'Culminado' ? '#10b981' : b.estadoReclamo === 'En Proceso' ? '#3b82f6' : '#f59e0b';
    return `<div data-claim="${esc(b.claimId)}" style="background:#111827;border:1px solid #1f2937;border-radius:8px;padding:0.85rem 1rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;">
            <strong style="color:#f1f5f9;">🏦 ${esc(b.bancoNombre)}</strong>
            <span style="color:${estadoColor};font-size:0.8rem;font-weight:700;">${esc(b.estadoReclamo)}</span>
        </div>
        <div style="margin-top:0.4rem;">${pasosHtml}</div>
        ${botones}
    </div>`;
}

function esc(str) { const d = document.createElement('div'); d.textContent = str ?? ''; return d.innerHTML; }
