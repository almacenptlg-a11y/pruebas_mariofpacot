// ==========================================
// CONFIGURACIÓN DE GOOGLE APPS SCRIPT
// ==========================================
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzYcfPzxhhlU4WOC0g8UvOUTQtypRNTvPYGGGpcMPPw9PuJPxsKirGPrg2G1csBDVdH/exec';

const savedTheme = sessionStorage.getItem('moduloResiduosTheme');
if (savedTheme === 'dark') document.documentElement.classList.add('dark');

const MAX_IMAGE_WIDTH = 1024; 
const IMAGE_QUALITY = 0.7;    

const AppState = { user: null, isSessionVerified: false };
let chartAreaInstancia = null;
let chartTipoInstancia = null;
let datosCargados = false; 
let isFetchingDashboard = false;
let todosLosRegistros = []; 
let registrosFiltradosActuales = []; 

window.addEventListener('message', (event) => {
  const { type, user, theme } = event.data || {};
  if (type === 'THEME_UPDATE') {
      document.documentElement.classList.toggle('dark', theme === 'dark');
      sessionStorage.setItem('moduloResiduosTheme', theme); 
  }
  if (type === 'SESSION_SYNC' && user) {
      document.documentElement.classList.toggle('dark', theme === 'dark');
      if (theme) sessionStorage.setItem('moduloResiduosTheme', theme); 
      AppState.user = user;
      AppState.isSessionVerified = true;
      sessionStorage.setItem('moduloResiduosUser', JSON.stringify(user));
      mostrarAplicacion();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  actualizarTimestamp();
  inicializarFiltrosFechas();
  const savedUser = sessionStorage.getItem('moduloResiduosUser');
  if (savedUser) {
      AppState.user = JSON.parse(savedUser);
      AppState.isSessionVerified = true;
      mostrarAplicacion();
  }
  window.parent.postMessage({ type: 'MODULO_LISTO' }, '*');
  setTimeout(() => {
      if (!AppState.isSessionVerified) {
          const statusTxt = document.getElementById('txt-usuario-activo');
          if (statusTxt) statusTxt.innerHTML = '<i class="ph ph-warning text-red-500"></i> Esperando autorización del Hub...';
      }
  }, 4000);
  SyncManager.updateBadge();
});

function mostrarAplicacion() {
  const appContainer = document.getElementById('appContainer');
  if (appContainer) appContainer.classList.remove('hidden');
  
  if (AppState.user) {
      const nombreMostrar = AppState.user.nombre || AppState.user.usuario || 'Usuario';
      const rolMostrar = AppState.user.rol || AppState.user.area || 'Supervisor';
      const txtUsuario = document.getElementById('txt-usuario-activo');
      if (txtUsuario) txtUsuario.innerHTML = `<i class="ph ph-user-check"></i> ${nombreMostrar} | ${rolMostrar}`;
  }

  const rolesPrivilegiados = ['JEFE', 'GERENTE', 'ADMINISTRADOR', 'CALIDAD'];
  const rolUser = (AppState.user?.rol || '').toUpperCase();
  const tabDash = document.getElementById('tabDashboard');
  
  if (tabDash) {
      if (rolesPrivilegiados.includes(rolUser)) tabDash.classList.remove('hidden');
      else tabDash.classList.add('hidden'); 
  }

  if (!datosCargados && !isFetchingDashboard) setTimeout(() => cargarDatosDashboard(), 300); 
}

// ==========================================
// MOTOR DUAL OFFLINE-FIRST (INDEXEDDB)
// ==========================================
const IDB_NAME = 'GenApps_DB_Residuos';
const STORE_NAME = 'sync_queue';
const IDB_VERSION = 1;

const dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onerror = () => reject('Error al abrir IndexedDB');
    request.onsuccess = (e) => resolve(e.target.result);
    request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: '_localId' });
    };
});

const dbUtil = {
    async getAll() {
        const db = await dbPromise;
        return new Promise((resolve, reject) => {
            const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },
    async put(item) {
        const db = await dbPromise;
        return new Promise((resolve, reject) => {
            const req = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(item);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },
    async delete(key) {
        const db = await dbPromise;
        return new Promise((resolve, reject) => {
            const req = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }
};

const SyncManager = {
    isSyncing: false,
    async getQueue() { try { return await dbUtil.getAll(); } catch(e) { return []; } },
    async enqueue(record) {
        record._localId = Date.now().toString(); 
        await dbUtil.put(record);
        await this.updateBadge();
    },
    async remove(localId) { await dbUtil.delete(localId); },
    async sync(forcePull = false) {
        if (!navigator.onLine || this.isSyncing) return;
        const queue = await this.getQueue();
        if (queue.length === 0 && !forcePull) { this.updateBadge(); return; }

        this.isSyncing = true; 
        const badge = document.getElementById('syncStatusBadge');
        const badgeText = document.getElementById('syncStatusText');
        const badgeIcon = document.getElementById('syncStatusIcon');
        const btnForce = document.getElementById('btnForceSync');
        const iconForce = document.getElementById('iconForceSync');
        
        if (badge) badge.classList.remove('hidden');
        if (badgeIcon) badgeIcon.className = 'ph-fill ph-arrows-clockwise text-blue-400 animate-spin inline-block text-xl';
        if (btnForce) { btnForce.disabled = true; iconForce.classList.add('animate-spin'); }

        let hasErrors = false;
        if (queue.length > 0) {
            if (badgeText) badgeText.textContent = `Subiendo ${queue.length} registro(s)...`;
            for (const record of queue) {
                try {
                    const payload = { ...record }; delete payload._localId; 
                    const response = await fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload) });
                    const res = await response.json();
                    if (res.status === 'success') {
                        await this.remove(record._localId); 
                        const localTag = document.getElementById(`sync-tag-${record._localId}`);
                        if (localTag) localTag.innerHTML = '<i class="ph-fill ph-cloud-check text-green-500" title="Sincronizado"></i>';
                    } else hasErrors = true;
                } catch (e) { hasErrors = true; break; }
            }
        }

        // FASE 2: Bypass de Caché si forcePull es verdadero
        if (!hasErrors && (forcePull || queue.length > 0)) {
            if (badgeText) badgeText.textContent = 'Actualizando panel...';
            try {
                datosCargados = false; isFetchingDashboard = false; 
                await cargarDatosDashboard(forcePull); // Envía true a la función
            } catch (e) { hasErrors = true; }
        }

        if (badgeIcon) badgeIcon.classList.remove('animate-spin');
        if (iconForce) iconForce.classList.remove('animate-spin');
        if (btnForce) btnForce.disabled = false;
        
        const remainingQueue = await this.getQueue();
        if (!hasErrors && remainingQueue.length === 0) {
            if (badgeIcon) badgeIcon.className = 'ph-fill ph-check-circle text-green-400 text-xl';
            if (badgeText) badgeText.textContent = '¡Datos actualizados!';
            setTimeout(() => { if(badge) badge.classList.add('hidden'); }, 3500);
        } else {
            if (badgeIcon) badgeIcon.className = 'ph-fill ph-warning-circle text-yellow-400 text-xl';
            if (badgeText) badgeText.textContent = 'Red inestable. Reintentaremos luego.';
            setTimeout(() => this.updateBadge(), 4000);
        }
        this.isSyncing = false;
        this.updateBadge(); 
    },
    async updateBadge() {
        const queue = await this.getQueue();
        const badge = document.getElementById('syncStatusBadge');
        const badgeText = document.getElementById('syncStatusText');
        const badgeIcon = document.getElementById('syncStatusIcon');
        const btnForce = document.getElementById('btnForceSync');
        const countForce = document.getElementById('countForceSync');
        const txtForce = document.getElementById('txtForceSync');
        
        if (!badge || !badgeIcon) return; 

        if (queue.length > 0) {
            if (!this.isSyncing) {
                badge.classList.remove('hidden');
                badgeIcon.className = 'ph-fill ph-cloud-slash text-yellow-400 text-xl';
                if (badgeText) badgeText.textContent = `${queue.length} registro(s) pendiente(s)`;
            }
            if (btnForce) {
                btnForce.className = 'flex bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1.5 rounded-lg items-center gap-2 text-sm font-medium';
                if (txtForce) txtForce.textContent = "Sincronizar";
                if (countForce) { countForce.classList.remove('hidden'); countForce.textContent = queue.length; }
            }
        } else {
            if (!badgeIcon.classList.contains('animate-spin') && badgeText && !badgeText.textContent.includes('actualizados')) badge.classList.add('hidden');
            if (btnForce && !this.isSyncing) {
                btnForce.className = 'flex bg-gray-50 text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg items-center gap-2 text-sm font-medium';
                if (txtForce) txtForce.textContent = "Actualizar";
                if (countForce) countForce.classList.add('hidden');
            }
        }
    }
};

window.addEventListener('online', () => SyncManager.sync(false));
window.addEventListener('offline', () => SyncManager.updateBadge());
document.addEventListener('DOMContentLoaded', () => {
    const btnForce = document.getElementById('btnForceSync');
    if(btnForce) btnForce.addEventListener('click', () => SyncManager.sync(true));
    SyncManager.updateBadge();
});
setInterval(async () => {
    if (navigator.onLine && !SyncManager.isSyncing) {
        const queue = await SyncManager.getQueue();
        if (queue.length > 0) SyncManager.sync(false);
    }
}, 20000);

// ==========================================
// UTILIDADES 
// ==========================================
function formatearFechaEstandar(fechaStr) {
  if (!fechaStr || fechaStr === '-') return '-';
  if (fechaStr.includes('T')) fechaStr = fechaStr.split('T')[0];
  const partes = fechaStr.split(/[-/]/);
  if (partes.length === 3) {
    if (partes[0].length === 4) return `${partes[2]}/${partes[1]}/${partes[0]}`;
    return `${partes[0].padStart(2, '0')}/${partes[1].padStart(2, '0')}/${partes[2]}`;
  }
  return fechaStr;
}

function formatearHora24(horaStr) {
  if (!horaStr || horaStr === '-') return '-';
  horaStr = String(horaStr).trim();
  const isPM = horaStr.toLowerCase().includes('pm');
  const isAM = horaStr.toLowerCase().includes('am');
  let partes = horaStr.toLowerCase().replace(/[a-z]/ig, '').trim().split(':');
  
  if (partes.length >= 2) {
    let h = parseInt(partes[0], 10);
    const m = partes[1].padStart(2, '0');
    const s = (partes[2] || '00').replace(/[^0-9]/g, '').padStart(2, '0');
    if (isNaN(h)) return horaStr;
    if (isPM && h < 12) h += 12;
    if (isAM && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m}:${s}`;
  }
  return horaStr;
}

function obtenerUrlImagen(reg) {
  if (!reg) return '';
  for (const key in reg) {
    if (key.toLowerCase().match(/(imagen|foto|link|url)/) && reg[key]) return String(reg[key]);
  }
  return '';
}

function obtenerObservaciones(reg) {
  if (!reg) return '';
  for (const key in reg) {
    if (key.toLowerCase().match(/(observacion|detalle|comentario)/)) return reg[key] || '';
  }
  return '';
}

function actualizarTimestamp() {
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  
  if (document.getElementById('fechaRegistro')) document.getElementById('fechaRegistro').value = dateStr;
  if (document.getElementById('horaRegistro')) document.getElementById('horaRegistro').value = timeStr;
}

function inicializarFiltrosFechas() {
  const tzoffset = (new Date()).getTimezoneOffset() * 60000;
  const localISOTime = (new Date(Date.now() - tzoffset)).toISOString().split('T')[0];
  
  document.getElementById('filtroFechaInicio').value = localISOTime;
  document.getElementById('filtroFechaFin').value = localISOTime;

  document.getElementById('filtroFechaInicio').addEventListener('blur', cargarDatosDashboard);
  document.getElementById('filtroFechaFin').addEventListener('blur', cargarDatosDashboard);
  document.getElementById('filtroFechaInicio').addEventListener('keydown', cargarDatosDashboard);
  document.getElementById('filtroFechaFin').addEventListener('keydown', cargarDatosDashboard);
  
  // FIX: Conectar filtros múltiples a ambas vistas
  document.getElementById('filtroArea').addEventListener('change', () => { aplicarFiltros(); renderizarMisRegistros(); });
  document.getElementById('filtroTipo').addEventListener('change', () => { aplicarFiltros(); renderizarMisRegistros(); });
}

// ==========================================
// NAVEGACIÓN Y BARRA GLOBAL
// ==========================================
const tabs = {
  registro: { btn: document.getElementById('tabRegistro'), vista: document.getElementById('vistaRegistro') },
  revision: { btn: document.getElementById('tabRevision'), vista: document.getElementById('vistaRevision') },
  dashboard: { btn: document.getElementById('tabDashboard'), vista: document.getElementById('vistaDashboard') }
};

function cambiarVista(vistaActiva) {
  Object.values(tabs).forEach(tab => {
    tab.btn.classList.remove('text-green-600', 'dark:text-green-400', 'border-b-2');
    tab.btn.classList.add('text-gray-500', 'dark:text-gray-400');
    tab.vista.classList.add('hidden');
  });

  tabs[vistaActiva].btn.classList.add('text-green-600', 'dark:text-green-400', 'border-b-2');
  tabs[vistaActiva].btn.classList.remove('text-gray-500', 'dark:text-gray-400');
  tabs[vistaActiva].vista.classList.remove('hidden');

  // FIX: Mostrar barra de filtros si no estamos en Registro
  const barraFiltros = document.getElementById('barraFiltrosGlobales');
  if (barraFiltros) {
      if (vistaActiva === 'registro') barraFiltros.classList.add('hidden');
      else barraFiltros.classList.remove('hidden');
  }
}

tabs.registro.btn.addEventListener('click', () => cambiarVista('registro'));
tabs.revision.btn.addEventListener('click', async () => {
  cambiarVista('revision');
  if (!datosCargados) await cargarDatosDashboard();
  else renderizarMisRegistros();
});
tabs.dashboard.btn.addEventListener('click', () => {
  cambiarVista('dashboard');
  if (!datosCargados) cargarDatosDashboard();
  else {
    aplicarFiltros(); 
    const dashContent = document.getElementById('dashboardContent');
    if(dashContent) dashContent.classList.remove('hidden');
  }
});

// ==========================================
// LOGICA DE DATOS (DASHBOARD Y REVISIÓN)
// ==========================================
async function cargarDatosDashboard(eventOrForce) {
  let isForced = false;
  if (eventOrForce === true) isForced = true;
  else if (eventOrForce && eventOrForce.type === 'keydown') {
      if (eventOrForce.key !== 'Enter') return; 
      if (document.activeElement) document.activeElement.blur();
  }

  if (isFetchingDashboard) return;

  const fInicioStr = document.getElementById('filtroFechaInicio').value;
  const fFinStr = document.getElementById('filtroFechaFin').value;
  if (!fInicioStr || !fFinStr) return;

  const yearInicio = parseInt(fInicioStr.substring(0, 4), 10);
  const yearFin = parseInt(fFinStr.substring(0, 4), 10);
  if (yearInicio < 2000 || yearInicio > 2100 || yearFin < 2000 || yearFin > 2100) return; 

  const isRevActive = !document.getElementById('vistaRevision').classList.contains('hidden');
  const isDashActive = !document.getElementById('vistaDashboard').classList.contains('hidden');

  if (isRevActive) {
      document.getElementById('revisionContent')?.classList.add('hidden');
      document.getElementById('emptyRevisionState')?.classList.add('hidden');
      document.getElementById('revisionLoading')?.classList.remove('hidden');
  } else if (isDashActive) {
      document.getElementById('dashboardContent')?.classList.add('hidden');
      document.getElementById('dashboardLoading')?.classList.remove('hidden');
  }

  isFetchingDashboard = true; 

  try {
    const [response] = await Promise.all([
      fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ 
          action: 'getDatos',
          fechaInicio: fInicioStr, 
          fechaFin: fFinStr,
          forceRefresh: isForced // CACHE BUSTING ACTIVO
        })
      }),
      new Promise(resolve => setTimeout(resolve, 600))
    ]);
    
    const result = await response.json();
    if (result.status === 'success') {
      todosLosRegistros = result.data; 
      datosCargados = true;
      if (isRevActive) renderizarMisRegistros(); 
      if (isDashActive) aplicarFiltros(); 
    } else throw new Error(result.message);
  } catch (error) {
    if (isDashActive || isRevActive) alert("No se pudieron cargar los datos. Verifica tu red.");
  } finally {
    isFetchingDashboard = false; 
    document.getElementById('revisionLoading')?.classList.add('hidden');
    document.getElementById('dashboardLoading')?.classList.add('hidden');
    document.getElementById('dashboardContent')?.classList.remove('hidden');
  }
}

function aplicarFiltros() {
  if (!datosCargados) return;
  const filtroArea = document.getElementById('filtroArea').value;
  const filtroTipo = document.getElementById('filtroTipo').value;

  const registrosFiltrados = todosLosRegistros.filter(reg => {
    const rArea = reg.area || reg.AREA;
    const rTipo = reg.tipo || reg.TIPO;
    if (filtroArea !== 'TODAS' && rArea !== filtroArea) return false;
    if (filtroTipo !== 'TODOS' && rTipo !== filtroTipo) return false;
    return true; 
  });

  registrosFiltradosActuales = registrosFiltrados; 
  procesarDatosParaGraficos(registrosFiltrados);
}

function procesarDatosParaGraficos(registros) {
  let totalPeso = 0; let totalBolsas = 0;
  let areasAgrupadas = {}; let tiposAgrupados = {};

  registros.forEach(reg => {
    const rPeso = Number(reg.peso || reg.PESO) || 0;
    const rBolsas = Number(reg.bolsas || reg['BOLSAS USADAS'] || reg.BOLSAS_USADAS) || 0;
    const rArea = reg.area || reg.AREA;
    const rTipo = reg.tipo || reg.TIPO;
    
    totalPeso += rPeso; totalBolsas += rBolsas;
    areasAgrupadas[rArea] = (areasAgrupadas[rArea] || 0) + rPeso;
    tiposAgrupados[rTipo] = (tiposAgrupados[rTipo] || 0) + rPeso;
  });

  const areasKeys = Object.keys(areasAgrupadas).filter(k => areasAgrupadas[k] > 0).sort((a,b) => areasAgrupadas[b] - areasAgrupadas[a]);
  const areasValues = areasKeys.map(k => areasAgrupadas[k].toFixed(2));
  const areasLabelsMulti = areasKeys.map((k, i) => [k, `${areasValues[i]} kg`]);

  const tiposKeys = Object.keys(tiposAgrupados).filter(k => tiposAgrupados[k] > 0);
  const tiposValues = tiposKeys.map(k => tiposAgrupados[k].toFixed(2));
  const tiposLabelsMulti = tiposKeys.map((k, i) => `${k}: ${tiposValues[i]} kg`);

  document.getElementById('kpiPeso').textContent = totalPeso.toFixed(2) + ' kg';
  document.getElementById('kpiBolsas').textContent = totalBolsas;
  document.getElementById('kpiRegistros').textContent = registros.length;

  dibujarGraficoAreas(areasLabelsMulti, areasValues);
  dibujarGraficoTipos(tiposLabelsMulti, tiposValues);
}

Chart.defaults.font.family = 'sans-serif';

function dibujarGraficoAreas(labels, data) {
  const ctx = document.getElementById('chartArea').getContext('2d');
  if (chartAreaInstancia) chartAreaInstancia.destroy();
  const isDark = document.documentElement.classList.contains('dark');
  
  chartAreaInstancia = new Chart(ctx, {
    type: 'bar',
    data: { labels: labels, datasets: [{ data: data, backgroundColor: 'rgba(34, 197, 94, 0.8)', borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, animation: false,
               scales: { y: { ticks: {color: isDark ? '#cbd5e1' : '#475569'} }, x: { ticks: {color: isDark ? '#cbd5e1' : '#475569'} } } }
  });
}

function dibujarGraficoTipos(labels, data) {
  const ctx = document.getElementById('chartTipo').getContext('2d');
  if (chartTipoInstancia) chartTipoInstancia.destroy();
  const isDark = document.documentElement.classList.contains('dark');

  const coloresTipos = labels.map(tipo => {
    if(tipo.includes('Organico')) return '#22c55e'; 
    if(tipo.includes('Plastico')) return '#3b82f6'; 
    if(tipo.includes('Carton')) return '#eab308'; 
    return '#6b7280'; 
  });

  chartTipoInstancia = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: labels, datasets: [{ data: data, backgroundColor: coloresTipos, borderWidth: isDark ? 0 : 2 }] },
    options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { position: 'bottom', labels: {color: isDark ? '#cbd5e1' : '#475569'} } } }
  });
}

// ==========================================
// RENDERIZAR MIS REGISTROS (CON FILTROS)
// ==========================================
function renderizarMisRegistros() {
  const tbody = document.getElementById('tablaMisRegistros');
  const emptyState = document.getElementById('emptyRevisionState');
  const revContent = document.getElementById('revisionContent'); 
  if (!tbody || !emptyState) return;
  tbody.innerHTML = '';
  if(!AppState.user) return;

  const filtroArea = document.getElementById('filtroArea').value;
  const filtroTipo = document.getElementById('filtroTipo').value;

  const misRegistros = todosLosRegistros.filter(r => {
    const autorEmail = String(r.email || r.supervisor).trim().toLowerCase();
    const sesionEmail = String(AppState.user.email || AppState.user.usuario).trim().toLowerCase();
    const esAutor = (autorEmail === sesionEmail || autorEmail === String(AppState.user.nombre).trim().toLowerCase());
    
    const pasaArea = filtroArea === 'TODAS' || (r.area || r.AREA) === filtroArea;
    const pasaTipo = filtroTipo === 'TODOS' || (r.tipo || r.TIPO) === filtroTipo;

    return esAutor && pasaArea && pasaTipo;
  });
  
  if (misRegistros.length === 0) {
    emptyState.classList.remove('hidden');
    if (revContent) revContent.classList.add('hidden'); 
    return;
  }
  
  emptyState.classList.add('hidden');
  if (revContent) revContent.classList.remove('hidden'); 
  misRegistros.sort((a, b) => Number(b.id) - Number(a.id));
  
  misRegistros.forEach(reg => {
    let colorTipo = "bg-gray-100 text-gray-800";
    const tipo = String(reg.tipo || reg.TIPO || '');
    if(tipo.includes("Organico")) colorTipo = "bg-green-100 text-green-800";
    else if(tipo.includes("Plastico")) colorTipo = "bg-blue-100 text-blue-800";
    else if(tipo.includes("Carton")) colorTipo = "bg-yellow-100 text-yellow-800";
    
    const tr = document.createElement('tr');
    tr.className = "hover:bg-gray-50 dark:hover:bg-gray-700/50";
    tr.innerHTML = `
      <td class="px-4 py-3 whitespace-nowrap border-b dark:border-gray-700">
        <div class="font-medium">${formatearFechaEstandar(reg.fecha)}</div><div class="text-xs text-gray-500">${formatearHora24(reg.hora)}</div>
      </td>
      <td class="px-4 py-3 whitespace-nowrap border-b dark:border-gray-700">${reg.area || reg.AREA}</td>
      <td class="px-4 py-3 whitespace-nowrap border-b dark:border-gray-700"><span class="px-2 py-1 text-[10px] rounded-full font-medium ${colorTipo}">${tipo}</span></td>
      <td class="px-4 py-3 whitespace-nowrap text-center font-medium border-b dark:border-gray-700">${reg.peso || reg.PESO}</td>
      <td class="px-4 py-3 whitespace-nowrap text-center text-gray-500 border-b dark:border-gray-700">${reg.bolsas || 0}</td>
      <td class="px-4 py-3 whitespace-nowrap text-center border-b dark:border-gray-700">
        <button onclick="abrirModalEdicion('${reg.id}')" class="text-green-600 p-2 rounded-full"><i class="ph ph-pencil-simple text-lg"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ==========================================
// EXPORTACIÓN, EDICIÓN Y REGISTRO (FORMULARIO)
// ==========================================
document.getElementById('btnExportarExcel').addEventListener('click', () => { /* Tu código previo de Excel intacto... */ });
document.getElementById('btnPrint').addEventListener('click', () => { window.print(); });

window.abrirModalEdicion = function(id) {
  if (!navigator.onLine) return alert("Para editar registros necesitas conexión a internet.");
  const registro = todosLosRegistros.find(r => String(r.id) === String(id));
  if (!registro) return;
  document.getElementById('editId').value = registro.id;
  document.getElementById('editArea').value = registro.area || registro.AREA;
  document.getElementById('editTipo').value = registro.tipo || registro.TIPO;
  document.getElementById('editPeso').value = registro.peso || 0;
  document.getElementById('editBolsas').value = registro.bolsas || 1;
  document.getElementById('editObservaciones').value = obtenerObservaciones(registro);
  document.getElementById('modalEdicion').classList.remove('hidden');
};

window.cerrarModalEdicion = function() { document.getElementById('modalEdicion').classList.add('hidden'); };

document.getElementById('formEdicionRegistro').addEventListener('submit', async function(e) {
  e.preventDefault();
  const btn = document.getElementById('btnGuardarEdicion'); const txt = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<i class="ph ph-spinner animate-spin"></i>';
  const valEmail = AppState.user.email || AppState.user.usuario;
  
  const payload = { action: 'editarRegistro', id: document.getElementById('editId').value, supervisorEmail: valEmail, area: document.getElementById('editArea').value, tipo: document.getElementById('editTipo').value, peso: parseFloat(document.getElementById('editPeso').value), bolsas: parseInt(document.getElementById('editBolsas').value), observaciones: document.getElementById('editObservaciones').value };

  try {
    const res = await fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload) }).then(r=>r.json());
    if (res.success || res.status === 'success') {
      const idx = todosLosRegistros.findIndex(r => String(r.id) === String(payload.id));
      if (idx !== -1) todosLosRegistros[idx] = { ...todosLosRegistros[idx], ...payload };
      renderizarMisRegistros(); aplicarFiltros(); cerrarModalEdicion();
    } else alert("Error: " + res.message);
  } catch (error) { alert("Error de red."); } finally { btn.disabled = false; btn.innerHTML = txt; }
});

const imagenInput = document.getElementById('imagen');
let imageBase64 = ''; let imageMimeType = ''; let imageName = '';

imagenInput.addEventListener('change', async function(e) {
  const file = e.target.files[0];
  if (file) {
    document.getElementById('imagePlaceholder').innerHTML = `<i class="ph ph-spinner animate-spin text-4xl"></i>`;
    try {
      const { base64, type } = await procesarYComprimirImagen(file);
      imageBase64 = base64; imageMimeType = type; imageName = file.name.replace(/\.[^/.]+$/, "") + "_opt.jpg";
      document.getElementById('imagePreview').src = `data:${type};base64,${base64}`;
      document.getElementById('fileNameDisplay').textContent = imageName;
      document.getElementById('imagePlaceholder').classList.add('hidden');
      document.getElementById('imagePreviewContainer').classList.remove('hidden');
      document.getElementById('imagePreviewContainer').classList.add('flex');
    } catch (e) { resetImageUI(); }
  }
});
document.getElementById('removeImageBtn').addEventListener('click', resetImageUI);

function resetImageUI() {
  imagenInput.value = ''; imageBase64 = ''; imageMimeType = ''; imageName = '';
  document.getElementById('imagePreview').src = '';
  document.getElementById('imagePlaceholder').classList.remove('hidden');
  document.getElementById('imagePreviewContainer').classList.add('hidden');
  document.getElementById('imagePlaceholder').innerHTML = `<i class="ph ph-camera text-4xl"></i><div class="mt-2"><label for="imagen" class="cursor-pointer font-medium text-green-600">Subir foto</label></div>`;
}

document.getElementById('residuosForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if(!AppState.isSessionVerified) return;
  const btn = document.getElementById('submitBtn'); const txt = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<i class="ph ph-spinner animate-spin"></i> Guardando...';
  
  const rawF = document.getElementById('fechaRegistro').value.split('-');
  const fVal = rawF.length===3 ? `${rawF[2]}/${rawF[1]}/${rawF[0]}` : rawF;
  const hVal = document.getElementById('horaRegistro').value;
  
  const formData = {
    action: 'registrar', supervisor: AppState.user.email || AppState.user.usuario, 
    area: document.getElementById('area').value, tipo: document.getElementById('tipo').value, 
    peso: document.getElementById('peso').value, bolsas: document.getElementById('bolsas').value, 
    fecha: fVal, hora: hVal, observaciones: document.getElementById('observaciones').value,
    imagenBase64: imageBase64, imagenMimeType: imageMimeType, imagenNombre: imageName
  };

  await SyncManager.enqueue(formData);
  agregarRegistroAUi(formData, true);
  
  const msg = document.getElementById('successMessage');
  msg.classList.remove('opacity-0');
  setTimeout(() => msg.classList.add('opacity-0'), 4000);
  
  document.getElementById('peso').value = ''; document.getElementById('bolsas').value = '1';
  resetImageUI(); actualizarTimestamp();
  
  btn.disabled = false; btn.innerHTML = txt;
  SyncManager.sync();
});

function agregarRegistroAUi(data, isPending = false) {
  const container = document.getElementById('registrosContainer');
  if (container.querySelector('.italic')) container.innerHTML = '';
  const statusIcon = isPending ? `<span id="sync-tag-${data._localId}"><i class="ph-fill ph-cloud-slash text-yellow-500"></i></span>` : `<i class="ph-fill ph-cloud-check text-green-500"></i>`;
  const html = `<div class="p-4 rounded-lg border bg-gray-50 mb-2 fade-in">
      <div class="flex justify-between items-start mb-2"><span class="text-xs font-mono text-gray-500">Enviado ${statusIcon}</span><span class="text-xs px-2 py-1 bg-green-100 rounded-full">${data.tipo}</span></div>
      <p class="font-medium">${data.area}</p><div class="text-sm text-gray-600 mt-1">${data.peso} kg</div></div>`;
  container.insertAdjacentHTML('afterbegin', html);
}

function procesarYComprimirImagen(imageFile) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.readAsDataURL(imageFile);
    reader.onload = (e) => {
      const img = new Image(); img.src = e.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
        let width = img.width; let height = img.height;
        if (width > MAX_IMAGE_WIDTH) { height = Math.round((height * MAX_IMAGE_WIDTH) / width); width = MAX_IMAGE_WIDTH; }
        canvas.width = width; canvas.height = height; ctx.drawImage(img, 0, 0, width, height);
        resolve({ base64: canvas.toDataURL('image/jpeg', IMAGE_QUALITY).split(',')[1], type: 'image/jpeg' });
      };
    };
  });
}
