// ==========================================
// CONFIGURACIÓN DE GOOGLE APPS SCRIPT
// ==========================================
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzYcfPzxhhlU4WOC0g8UvOUTQtypRNTvPYGGGpcMPPw9PuJPxsKirGPrg2G1csBDVdH/exec';

// ==========================================
// 0. RECUPERACIÓN INMEDIATA DEL TEMA (Anti-FOUC)
// ==========================================
// Ejecutamos esto inmediatamente para evitar el parpadeo blanco al recargar
const savedTheme = sessionStorage.getItem('moduloResiduosTheme');
if (savedTheme === 'dark') {
    document.documentElement.classList.add('dark');
}
// ==========================================
// CONFIGURACIÓN DE PROCESAMIENTO DE IMÁGENES (HACCP OPTIMIZED)
// ==========================================
const MAX_IMAGE_WIDTH = 1024; // Ancho máximo en px (Suficiente para ver detalles)
const IMAGE_QUALITY = 0.7;    // Calidad de compresión JPEG (0.0 a 1.0)

// ==========================================
// 1. ESTADO CENTRALIZADO Y COMUNICACIÓN HUB
// ==========================================
const AppState = {
  user: null,
  isSessionVerified: false
};

let chartAreaInstancia = null;
let chartTipoInstancia = null;
let datosCargados = false; 
let isFetchingDashboard = false;
let todosLosRegistros = []; 
let registrosFiltradosActuales = []; 

// ESCUCHADOR DE MENSAJES (WINDOW.PARENT)
window.addEventListener('message', (event) => {
  const { type, user, theme } = event.data || {};
  
  if (type === 'THEME_UPDATE') {
      document.documentElement.classList.toggle('dark', theme === 'dark');
      sessionStorage.setItem('moduloResiduosTheme', theme); // Persistimos el tema
  }

  if (type === 'SESSION_SYNC' && user) {
      document.documentElement.classList.toggle('dark', theme === 'dark');
      if (theme) sessionStorage.setItem('moduloResiduosTheme', theme); // Persistimos el tema
      
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

  // Avisar al Hub que estamos listos para recibir credenciales
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
      if (txtUsuario) {
          txtUsuario.innerHTML = `<i class="ph ph-user-check"></i> ${nombreMostrar} | ${rolMostrar}`;
      }
      
      // FIX: Uso de Optional Chaining para evitar el TypeError
      const displayRole = document.getElementById('displayUserRole');
      if (displayRole) displayRole.textContent = rolMostrar; 
  }

  // REGLA: Ocultar Dashboard a roles operativos puros
  const rolesPrivilegiados = ['JEFE', 'GERENTE', 'ADMINISTRADOR', 'CALIDAD'];
  const rolUser = (AppState.user?.rol || '').toUpperCase();
  const tabDash = document.getElementById('tabDashboard');
  
  if (tabDash) {
      if (rolesPrivilegiados.includes(rolUser)) {
          tabDash.classList.remove('hidden');
      } else {
          tabDash.classList.add('hidden'); 
      }
  }

  // PRE-CARGA EN SEGUNDO PLANO
  if (!datosCargados && !isFetchingDashboard) {
      setTimeout(() => {
          cargarDatosDashboard();
      }, 300); 
  }
}

// ==========================================
// MOTOR DUAL OFFLINE-FIRST (INDEXEDDB) & REFRESH MANAGER
// ==========================================
const IDB_NAME = 'GenApps_DB_Residuos';
const STORE_NAME = 'sync_queue';
const IDB_VERSION = 1;

// Wrapper asíncrono en O(1) para IndexedDB (Cero dependencias)
const dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onerror = () => reject('Error al abrir IndexedDB');
    request.onsuccess = (e) => resolve(e.target.result);
    request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: '_localId' });
        }
    };
});

const dbUtil = {
    async getAll() {
        const db = await dbPromise;
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const req = tx.objectStore(STORE_NAME).getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },
    async put(item) {
        const db = await dbPromise;
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const req = tx.objectStore(STORE_NAME).put(item);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },
    async delete(key) {
        const db = await dbPromise;
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const req = tx.objectStore(STORE_NAME).delete(key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }
};

const SyncManager = {
    isSyncing: false,
    
    // Ahora devuelve una Promesa
    async getQueue() {
        try {
            return await dbUtil.getAll();
        } catch (e) {
            console.error("Error leyendo IndexedDB:", e);
            return [];
        }
    },
    
    // Inserción asíncrona sin bloquear el DOM
    async enqueue(record) {
        record._localId = Date.now().toString(); 
        await dbUtil.put(record);
        await this.updateBadge();
    },
    
    async remove(localId) {
        await dbUtil.delete(localId);
    },
    
    async sync(forcePull = false) {
        if (!navigator.onLine || this.isSyncing) return;
        
        const queue = await this.getQueue();
        
        if (queue.length === 0 && !forcePull) {
            this.updateBadge();
            return;
        }

        this.isSyncing = true; 
        
        // UI: Configurar estado de carga
        const badge = document.getElementById('syncStatusBadge');
        const badgeText = document.getElementById('syncStatusText');
        const badgeIcon = document.getElementById('syncStatusIcon');
        const btnForce = document.getElementById('btnForceSync');
        const iconForce = document.getElementById('iconForceSync');
        
        if (badge) badge.classList.remove('hidden');
        if (badgeIcon) badgeIcon.className = 'ph-fill ph-arrows-clockwise text-blue-400 animate-spin inline-block text-xl';
        
        if (btnForce) {
            btnForce.disabled = true;
            iconForce.classList.add('animate-spin');
        }

        let hasErrors = false;

        // FASE 1: PUSH (Subir a GAS)
        if (queue.length > 0) {
            if (badgeText) badgeText.textContent = `Subiendo ${queue.length} registro(s)...`;
            for (const record of queue) {
                try {
                    const payload = { ...record };
                    delete payload._localId; 
                    
                    const response = await fetch(SCRIPT_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: JSON.stringify(payload)
                    });
                    
                    const res = await response.json();
                    if (res.status === 'success') {
                        await this.remove(record._localId); // Borrado en DB
                        const localTag = document.getElementById(`sync-tag-${record._localId}`);
                        if (localTag) localTag.innerHTML = '<i class="ph-fill ph-cloud-check text-green-500" title="Sincronizado"></i>';
                    } else {
                        hasErrors = true;
                    }
                } catch (e) {
                    hasErrors = true;
                    break; 
                }
            }
        }

        // FASE 2: PULL (Refrescar Dashboard)
        if (!hasErrors && (forcePull || queue.length > 0)) {
            if (badgeText) badgeText.textContent = 'Actualizando panel...';
            try {
                datosCargados = false; 
                isFetchingDashboard = false; 
                await cargarDatosDashboard(forcePull); 
            } catch (e) {
                hasErrors = true;
            }
        }

        // Restaurar UI
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
        
        if (!badge || !badgeIcon) return; // Defensive programming

        if (queue.length > 0) {
            if (!this.isSyncing) {
                badge.classList.remove('hidden');
                badgeIcon.className = 'ph-fill ph-cloud-slash text-yellow-400 text-xl';
                if (badgeText) badgeText.textContent = `${queue.length} registro(s) pendiente(s)`;
            }
            
            if (btnForce) {
                btnForce.className = 'flex bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-700/50 px-3 py-1.5 rounded-lg items-center gap-2 text-sm font-medium transition-all shadow-sm hover:bg-amber-100 dark:hover:bg-amber-900/50';
                if (txtForce) txtForce.textContent = "Sincronizar";
                if (countForce) {
                    countForce.classList.remove('hidden');
                    countForce.textContent = queue.length;
                }
            }
        } else {
            if (!badgeIcon.classList.contains('animate-spin') && badgeText && !badgeText.textContent.includes('actualizados')) {
                 badge.classList.add('hidden');
            }
            if (btnForce && !this.isSyncing) {
                btnForce.className = 'flex bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-lg items-center gap-2 text-sm font-medium transition-all shadow-sm hover:bg-gray-100 dark:hover:bg-gray-700/80';
                if (txtForce) txtForce.textContent = "Actualizar";
                if (countForce) countForce.classList.add('hidden');
            }
        }
    }
};


// ==========================================
// TRIGGERS DE SINCRONIZACIÓN (BLINDAJE TRIPLE)
// ==========================================
window.addEventListener('online', () => SyncManager.sync(false));
window.addEventListener('offline', () => SyncManager.updateBadge());

document.addEventListener('DOMContentLoaded', () => {
    const btnForce = document.getElementById('btnForceSync');
    if(btnForce) {
        btnForce.addEventListener('click', () => SyncManager.sync(true));
    }
    // Inicializar el badge en la carga de la página
    SyncManager.updateBadge();
});

// Polling asíncrono
setInterval(async () => {
    if (navigator.onLine && !SyncManager.isSyncing) {
        const queue = await SyncManager.getQueue();
        if (queue.length > 0) {
            SyncManager.sync(false);
        }
    }
}, 20000);

// ==========================================
// UTILIDADES DE EXTRACCIÓN Y FORMATO 
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
  const lowerHora = horaStr.toLowerCase();
  const isPM = lowerHora.includes('pm');
  const isAM = lowerHora.includes('am');
  
  let timeStr = lowerHora.replace(/[a-z]/ig, '').trim(); 
  let partes = timeStr.split(':');
  
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
  if (reg['IMAGEN']) return String(reg['IMAGEN']);
  if (reg['Imagen']) return String(reg['Imagen']);
  if (reg['imagen']) return String(reg['imagen']);
  
  for (const key in reg) {
    const kLower = key.toLowerCase();
    if (kLower.includes('imagen') || kLower.includes('foto') || kLower.includes('link') || kLower.includes('url')) {
       const val = reg[key];
       if (val && String(val).trim() !== '') {
           return String(val);
       }
    }
  }
  return '';
}

function obtenerObservaciones(reg) {
  if (!reg) return '';
  if (reg['OBSERVACIONES:'] !== undefined) return reg['OBSERVACIONES:'];
  if (reg['OBSERVACIONES'] !== undefined) return reg['OBSERVACIONES'];
  if (reg['observaciones:'] !== undefined) return reg['observaciones:'];
  if (reg['observaciones'] !== undefined) return reg['observaciones'];
  if (reg['Observaciones'] !== undefined) return reg['Observaciones'];

  for (const key in reg) {
    const kLower = key.toLowerCase();
    if (kLower.includes('observacion') || kLower.includes('detalle') || kLower.includes('comentario')) {
       return reg[key] || '';
    }
  }
  return '';
}

function actualizarTimestamp() {
  const now = new Date();
  
  // Formato ISO para el input type="date" (YYYY-MM-DD)
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const dateStr = `${year}-${month}-${day}`;
  
  // Formato para el input type="time" (HH:MM:SS)
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const timeStr = `${hours}:${minutes}:${seconds}`;
  
  const inputFecha = document.getElementById('fechaRegistro');
  const inputHora = document.getElementById('horaRegistro');
  
  if (inputFecha) inputFecha.value = dateStr;
  if (inputHora) inputHora.value = timeStr;
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
  document.getElementById('filtroArea').addEventListener('change', aplicarFiltros);
  document.getElementById('filtroTipo').addEventListener('change', aplicarFiltros);
}


// ==========================================
// NAVEGACIÓN (TABS)
// ==========================================
const tabs = {
  registro: { btn: document.getElementById('tabRegistro'), vista: document.getElementById('vistaRegistro') },
  revision: { btn: document.getElementById('tabRevision'), vista: document.getElementById('vistaRevision') },
  dashboard: { btn: document.getElementById('tabDashboard'), vista: document.getElementById('vistaDashboard') }
};

function cambiarVista(vistaActiva) {
  Object.values(tabs).forEach(tab => {
    tab.btn.classList.remove('text-green-600', 'dark:text-green-400', 'border-b-2', 'border-green-600', 'dark:border-green-400');
    tab.btn.classList.add('text-gray-500', 'dark:text-gray-400');
    tab.vista.classList.add('hidden');
  });

  tabs[vistaActiva].btn.classList.add('text-green-600', 'dark:text-green-400', 'border-b-2', 'border-green-600', 'dark:border-green-400');
  tabs[vistaActiva].btn.classList.remove('text-gray-500', 'dark:text-gray-400');
  tabs[vistaActiva].vista.classList.remove('hidden');
}

tabs.registro.btn.addEventListener('click', () => cambiarVista('registro'));

tabs.revision.btn.addEventListener('click', async () => {
  cambiarVista('revision');
  if (!datosCargados) {
    await cargarDatosDashboard();
  } else {
    // Si ya cargaron de fondo, simplemente inyectamos a la tabla
    renderizarMisRegistros();
  }
});

tabs.dashboard.btn.addEventListener('click', () => {
  cambiarVista('dashboard');
  if (!datosCargados) {
    cargarDatosDashboard();
  } else {
    aplicarFiltros(); 
    // FIX: Obligamos a revelar el contenedor que fue cargado en segundo plano
    const dashContent = document.getElementById('dashboardContent');
    if(dashContent) dashContent.classList.remove('hidden');
  }
});

// ==========================================
// LOGICA DEL DASHBOARD Y OBTENCIÓN DE DATOS
// ==========================================
// FIX: Aceptamos boolean (true) desde el botón, o el evento nativo si es un input
async function cargarDatosDashboard(eventOrForce) {
  let isForced = false;
  
  if (eventOrForce === true) {
      isForced = true;
  } else if (eventOrForce && eventOrForce.type === 'keydown') {
      if (eventOrForce.key !== 'Enter') return; 
      if (document.activeElement) document.activeElement.blur();
  }

  // Seguro anti-colisiones
  if (isFetchingDashboard) return;

  const fInicioStr = document.getElementById('filtroFechaInicio').value;
  const fFinStr = document.getElementById('filtroFechaFin').value;

  if (!fInicioStr || !fFinStr) return;

  const extraerAnio = (fecha) => {
    const match = fecha.match(/\d{4}/);
    return match ? parseInt(match[0], 10) : 0;
  };

  const yearInicio = extraerAnio(fInicioStr);
  const yearFin = extraerAnio(fFinStr);

  if (yearInicio < 2000 || yearInicio > 2100) return; 
  if (yearFin < 2000 || yearFin > 2100) return; 

  const containerLoadingDash = document.getElementById('dashboardLoading');
  const containerContentDash = document.getElementById('dashboardContent');
  
  const containerLoadingRev = document.getElementById('revisionLoading');
  const containerContentRev = document.getElementById('revisionContent');
  const emptyStateRev = document.getElementById('emptyRevisionState');

  const isRevActive = !document.getElementById('vistaRevision').classList.contains('hidden');
  const isDashActive = !document.getElementById('vistaDashboard').classList.contains('hidden');

  if (isRevActive) {
      if (containerContentRev) containerContentRev.classList.add('hidden');
      if (emptyStateRev) emptyStateRev.classList.add('hidden');
      if (containerLoadingRev) containerLoadingRev.classList.remove('hidden');
  } else if (isDashActive) {
      if (containerContentDash) containerContentDash.classList.add('hidden');
      if (containerLoadingDash) containerLoadingDash.classList.remove('hidden');
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
          forceRefresh: isForced // FIX: Le avisamos al Backend que destruya la caché
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
      
    } else {
      throw new Error(result.message || "Error al obtener datos");
    }
  } catch (error) {
    console.error("Error Dashboard:", error);
    if (isDashActive || isRevActive) alert("No se pudieron cargar los datos. Verifica tu red.");
  } finally {
    isFetchingDashboard = false; 
    
    if (containerLoadingRev) containerLoadingRev.classList.add('hidden');
    if (containerLoadingDash) containerLoadingDash.classList.add('hidden');
    
    if (containerContentDash) containerContentDash.classList.remove('hidden');
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
  let totalPeso = 0;
  let totalBolsas = 0;
  let areasAgrupadas = {};
  let tiposAgrupados = {};

  registros.forEach(reg => {
    const rPeso = Number(reg.peso || reg.PESO) || 0;
    const rBolsas = Number(reg.bolsas || reg['BOLSAS USADAS'] || reg.BOLSAS_USADAS) || 0;
    const rArea = reg.area || reg.AREA;
    const rTipo = reg.tipo || reg.TIPO;
    
    totalPeso += rPeso;
    totalBolsas += rBolsas;

    if (areasAgrupadas[rArea]) areasAgrupadas[rArea] += rPeso;
    else areasAgrupadas[rArea] = rPeso;

    if (tiposAgrupados[rTipo]) tiposAgrupados[rTipo] += rPeso;
    else tiposAgrupados[rTipo] = rPeso;
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
  const textColor = isDark ? '#cbd5e1' : '#475569';

  chartAreaInstancia = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Kg de Residuos',
        data: data,
        backgroundColor: 'rgba(34, 197, 94, 0.8)',
        borderColor: 'rgb(22, 163, 74)',
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { 
        y: { beginAtZero: true, ticks: {color: textColor} },
        x: { ticks: { font: { weight: '600' }, color: textColor } }
      },
      animation: false
    }
  });
}

function dibujarGraficoTipos(labels, data) {
  const ctx = document.getElementById('chartTipo').getContext('2d');
  if (chartTipoInstancia) chartTipoInstancia.destroy();
  
  const isDark = document.documentElement.classList.contains('dark');
  const textColor = isDark ? '#cbd5e1' : '#475569';

  const coloresTipos = labels.map(tipo => {
    if(tipo.includes('Organico') || tipo.includes('ORGANICO')) return '#22c55e'; 
    if(tipo.includes('Plastico') || tipo.includes('PLASTICO')) return '#3b82f6'; 
    if(tipo.includes('Carton') || tipo.includes('CARTON')) return '#eab308'; 
    return '#6b7280'; 
  });

  chartTipoInstancia = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: coloresTipos,
        borderWidth: isDark ? 0 : 2,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { color: textColor} } },
      animation: false
    }
  });
}

// ==========================================
// EXPORTAR E IMPRIMIR REPORTE
// ==========================================
document.getElementById('btnExportarExcel').addEventListener('click', () => {
  if (registrosFiltradosActuales.length === 0) {
    alert("No hay registros para exportar con los filtros actuales.");
    return;
  }

  const datosExcel = registrosFiltradosActuales.map(reg => {
    return {
      'Fecha': formatearFechaEstandar(reg.fecha || reg.FECHA),
      'Hora': formatearHora24(reg.hora || reg.HORA),
      'Supervisor': reg.supervisor || reg.SUPERVISOR || '-',
      'Área': reg.area || reg.AREA || '-',
      'Tipo de Residuo': reg.tipo || reg.TIPO || '-',
      'Peso (Kg)': reg.peso || reg.PESO || 0,
      'Bolsas Utilizadas': reg.bolsas || reg['BOLSAS USADAS'] || reg.BOLSAS_USADAS || 0,
      'Observaciones': obtenerObservaciones(reg) || '',
      'Imagen (Link)': obtenerUrlImagen(reg) || 'Sin Imagen'
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(datosExcel);
  const workbook = XLSX.utils.book_new();

  worksheet['!cols'] = [
    {wch: 12}, {wch: 10}, {wch: 30}, {wch: 20}, {wch: 20},
    {wch: 12}, {wch: 15}, {wch: 40}, {wch: 50}
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, "Residuos");
  XLSX.writeFile(workbook, `Reporte_Residuos_${new Date().toISOString().split('T')[0]}.xlsx`);
});

document.getElementById('btnPrint').addEventListener('click', () => {
  const selArea = document.getElementById('filtroArea');
  const selTipo = document.getElementById('filtroTipo');

  document.getElementById('printFInicio').textContent = document.getElementById('filtroFechaInicio').value;
  document.getElementById('printFFin').textContent = document.getElementById('filtroFechaFin').value;
  document.getElementById('printFArea').textContent = selArea.options[selArea.selectedIndex].text;
  document.getElementById('printFTipo').textContent = selTipo.options[selTipo.selectedIndex].text;
  
  const nombreAutor = AppState.user ? (AppState.user.nombre || AppState.user.usuario) : "Supervisor";
  document.getElementById('printFirmaNombre').textContent = nombreAutor;

  window.print();
});

// ==========================================
// LÓGICA DE LA VISTA: MIS REGISTROS (EDICIÓN)
// ==========================================
function renderizarMisRegistros() {
  const tbody = document.getElementById('tablaMisRegistros');
  const emptyState = document.getElementById('emptyRevisionState');
  const revContent = document.getElementById('revisionContent'); // NUEVO
  
  if (!tbody || !emptyState) return;
  tbody.innerHTML = '';
  
  if(!AppState.user) return;

  const misRegistros = todosLosRegistros.filter(r => {
    const autorEmail = String(r.email || r.supervisor).trim().toLowerCase();
    const sesionEmail = String(AppState.user.email || AppState.user.usuario).trim().toLowerCase();
    const sesionNombre = String(AppState.user.nombre).trim().toLowerCase();
    return autorEmail === sesionEmail || autorEmail === sesionNombre;
  });
  
  if (misRegistros.length === 0) {
    emptyState.classList.remove('hidden');
    if (revContent) revContent.classList.add('hidden'); // Ocultar tabla si no hay nada
    return;
  }
  
  emptyState.classList.add('hidden');
  if (revContent) revContent.classList.remove('hidden'); // Mostrar tabla si hay datos
  
  misRegistros.sort((a, b) => Number(b.id) - Number(a.id));
  
  // (El resto del forEach() se mantiene exactamente igual...)
  misRegistros.forEach(reg => {
    let colorTipo = "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200";
    const tipo = String(reg.tipo || reg.TIPO || '');
    if(tipo.includes("Organico")) colorTipo = "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400";
    else if(tipo.includes("Plastico")) colorTipo = "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400";
    else if(tipo.includes("Carton")) colorTipo = "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400";
    
    const tr = document.createElement('tr');
    tr.className = "hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors";
    tr.innerHTML = `
      <td class="px-4 py-3 whitespace-nowrap border-b dark:border-gray-700">
        <div class="font-medium text-gray-900 dark:text-gray-100">${formatearFechaEstandar(reg.fecha || reg.FECHA)}</div>
        <div class="text-xs text-gray-500 dark:text-gray-400">${formatearHora24(reg.hora || reg.HORA)}</div>
      </td>
      <td class="px-4 py-3 whitespace-nowrap border-b dark:border-gray-700">${reg.area || reg.AREA}</td>
      <td class="px-4 py-3 whitespace-nowrap border-b dark:border-gray-700">
        <span class="px-2 py-1 text-[10px] rounded-full font-medium ${colorTipo}">${tipo}</span>
      </td>
      <td class="px-4 py-3 whitespace-nowrap text-center font-medium border-b dark:border-gray-700">${reg.peso || reg.PESO}</td>
      <td class="px-4 py-3 whitespace-nowrap text-center text-gray-500 border-b dark:border-gray-700">${reg.bolsas || reg.BOLSAS_USADAS || reg['BOLSAS USADAS'] || 0}</td>
      <td class="px-4 py-3 whitespace-nowrap text-center border-b dark:border-gray-700">
        <button onclick="abrirModalEdicion('${reg.id}')" class="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 hover:bg-green-50 dark:hover:bg-green-900/40 p-2 rounded-full transition-colors" title="Editar">
          <i class="ph ph-pencil-simple text-lg"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.abrirModalEdicion = function(id) {
  if (!navigator.onLine) {
    alert("Para editar registros necesitas conexión a internet.");
    return;
  }

  const registro = todosLosRegistros.find(r => String(r.id) === String(id));
  if (!registro) return;
  
  document.getElementById('editId').value = registro.id;
  document.getElementById('editArea').value = registro.area || registro.AREA;
  document.getElementById('editTipo').value = registro.tipo || registro.TIPO;
  document.getElementById('editPeso').value = registro.peso || registro.PESO || 0;
  document.getElementById('editBolsas').value = registro.bolsas || registro.BOLSAS_USADAS || registro['BOLSAS USADAS'] || 1;
  document.getElementById('editObservaciones').value = obtenerObservaciones(registro);
  
  document.getElementById('modalEdicion').classList.remove('hidden');
};

window.cerrarModalEdicion = function() {
  document.getElementById('modalEdicion').classList.add('hidden');
};

document.getElementById('formEdicionRegistro').addEventListener('submit', async function(e) {
  e.preventDefault();
  
  const btnGuardar = document.getElementById('btnGuardarEdicion');
  const originalText = btnGuardar.innerHTML;
  btnGuardar.disabled = true;
 btnGuardar.innerHTML = '<i class="ph ph-spinner animate-spin inline-block text-xl"></i> Guardando...';
  
  const valEmail = AppState.user.email || AppState.user.usuario; // Fallback por si el hub no manda email
  
  const payload = {
    action: 'editarRegistro',
    id: document.getElementById('editId').value,
    supervisorEmail: valEmail, 
    area: document.getElementById('editArea').value,
    tipo: document.getElementById('editTipo').value,
    peso: parseFloat(document.getElementById('editPeso').value),
    bolsas: parseInt(document.getElementById('editBolsas').value),
    observaciones: document.getElementById('editObservaciones').value
  };

  try {
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    
    if (result.success || result.status === 'success') {
      const index = todosLosRegistros.findIndex(r => String(r.id) === String(payload.id));
      if (index !== -1) {
        todosLosRegistros[index] = { ...todosLosRegistros[index], ...payload };
      }
      renderizarMisRegistros();
      aplicarFiltros(); 
      cerrarModalEdicion();
    } else {
      alert("Error: " + result.message);
    }
  } catch (error) {
    console.error("Error actualizando registro:", error);
    alert("Ocurrió un error de conexión al actualizar.");
  } finally {
    btnGuardar.disabled = false;
    btnGuardar.innerHTML = originalText;
  }
});


// ==========================================
// FORMULARIO DE REGISTRO Y ENVÍO HÍBRIDO
// ==========================================
const imagenInput = document.getElementById('imagen');
const fileNameDisplay = document.getElementById('fileNameDisplay');
const imagePlaceholder = document.getElementById('imagePlaceholder');
const imagePreviewContainer = document.getElementById('imagePreviewContainer');
const imagePreview = document.getElementById('imagePreview');
const removeImageBtn = document.getElementById('removeImageBtn');

let imageBase64 = '';
let imageMimeType = '';
let imageName = '';

// ==========================================
// CAPTURA Y PROCESAMIENTO ASÍNCRONO DE EVIDENCIA
// ==========================================
imagenInput.addEventListener('change', async function(e) {
  const file = e.target.files[0];
  if (file) {
    // UI: Estado de carga en el placeholder (UX Premium)
    imagePlaceholder.innerHTML = `
      <i class="ph ph-spinner animate-spin mx-auto text-4xl text-green-500"></i>
      <p class="text-xs text-gray-500 mt-2">Optimizando evidencia...</p>
    `;
    
    try {
      // --- PASO CLAVE: PROCESAMIENTO EN <CANVAS> ---
      // Ejecutamos la compresión instantánea en el Frontend
      const { base64, type } = await procesarYComprimirImagen(file);
      
      // Actualizamos variables globales con datos ligeros
      imageBase64 = base64;
      imageMimeType = type; // Ahora será 'image/jpeg' siempre
      imageName = file.name.replace(/\.[^/.]+$/, "") + "_opt.jpg"; // Renombramos para trazabilidad
      
      // UI: Actualizar vista previa con la imagen ya COMPRIMIDA
      // Usamos el Base64 ligero para la vista previa, garantizando fluidez del DOM
      imagePreview.src = `data:${type};base64,${base64}`;
      fileNameDisplay.textContent = imageName;
      
      // Restaurar UI de placeholders y mostrar preview
      imagePlaceholder.classList.add('hidden');
      imagePreviewContainer.classList.remove('hidden');
      imagePreviewContainer.classList.add('flex');
      
    } catch (error) {
      console.error("Error procesando imagen:", error);
      alert("No se pudo procesar la imagen. Intenta tomar otra foto o subir un archivo más ligero.");
      resetImageUI();
    } finally {
      // Restaurar el HTML original del placeholder por si acaso
      if (imagePlaceholder.innerHTML.includes('ph-spinner')) {
         imagePlaceholder.innerHTML = `
          <i class="ph ph-camera mx-auto text-4xl text-gray-400 dark:text-gray-500"></i>
          <div class="flex text-sm justify-center">
            <label for="imagen" class="relative cursor-pointer bg-white dark:bg-gray-800 rounded-md font-medium text-green-600 dark:text-green-400 hover:text-green-500 px-3 py-2 border border-green-200 dark:border-gray-600 shadow-sm transition-all hover:shadow">
              <span><i class="ph ph-camera-plus mr-1"></i> Tomar foto o subir</span>
            </label>
          </div>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">Formatos soportados: PNG, JPG</p>
        `;
      }
    }
    
  } else {
    resetImageUI();
  }
});

removeImageBtn.addEventListener('click', () => resetImageUI());

function resetImageUI() {
  imagenInput.value = '';
  imagePreview.src = '';
  imagePlaceholder.classList.remove('hidden');
  imagePreviewContainer.classList.add('hidden');
  imagePreviewContainer.classList.remove('flex');
  imageBase64 = '';
  imageMimeType = '';
  imageName = '';
  document.getElementById('observaciones').value = '';
}

const form = document.getElementById('residuosForm');
const submitBtn = document.getElementById('submitBtn');
const successMessage = document.getElementById('successMessage');
const registrosContainer = document.getElementById('registrosContainer');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  if(!AppState.isSessionVerified) return alert("Sesión no validada por el Hub GenApps.");

  const btnOriginalHtml = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="ph ph-spinner animate-spin inline-block text-xl"></i> <span>Guardando...</span>';
  
  // 1. Extraemos y formateamos la Fecha (De YYYY-MM-DD a DD/MM/YYYY para el Backend)
  const rawFecha = document.getElementById('fechaRegistro').value;
  const partesFecha = rawFecha.split('-');
  const fechaVal = partesFecha.length === 3 ? `${partesFecha[2]}/${partesFecha[1]}/${partesFecha[0]}` : rawFecha;
  
  // 2. Extraemos la hora
  const horaVal = document.getElementById('horaRegistro').value;
  
  const valEmail = AppState.user.email || AppState.user.usuario;

  const formData = {
    action: 'registrar',
    supervisor: valEmail, 
    area: document.getElementById('area').value,
    tipo: document.getElementById('tipo').value,
    peso: document.getElementById('peso').value,
    bolsas: document.getElementById('bolsas').value,
    fecha: fechaVal,
    hora: horaVal,
    observaciones: document.getElementById('observaciones').value,
    imagenBase64: imageBase64,
    imagenMimeType: imageMimeType,
    imagenNombre: imageName
  };

 // 1. UI OPTIMISTA: Encolamos en IndexedDB
  await SyncManager.enqueue(formData);
  agregarRegistroAUi(formData, true);
  
  // 2. Feedback visual persistente (4 segundos)
  successMessage.innerHTML = '<i class="ph-fill ph-check-circle text-xl mr-2 text-green-600 dark:text-green-400"></i> ¡Registro capturado!';
  successMessage.classList.remove('opacity-0');
  
  // Limpiamos timeouts previos por si el usuario presiona "Guardar" varias veces seguidas
  if (window.successTimeout) clearTimeout(window.successTimeout);
  window.successTimeout = setTimeout(() => successMessage.classList.add('opacity-0'), 4000);
  
  // 3. Limpiamos y preparamos para el siguiente registro instantáneamente
  document.getElementById('peso').value = '';
  document.getElementById('bolsas').value = '1';
  resetImageUI();
  actualizarTimestamp();
  
  // HABILITAMOS EL BOTÓN DE INMEDIATO
  submitBtn.disabled = false;
  submitBtn.innerHTML = btnOriginalHtml;

  // 4. Disparamos la sincronización silenciosa (Fire and Forget)
  SyncManager.sync();
});

function agregarRegistroAUi(data, isPending = false) {
  if (registrosContainer.querySelector('.italic')) {
    registrosContainer.innerHTML = '';
  }
  const colorTipo = data.tipo === 'Organico' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
    data.tipo === 'Plastico' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
  
  const supervisorCorto = data.supervisor.split('@')[0];
  const idTemporal = data._localId || Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  const fotoIcon = data.imagenBase64 ? '<i class="ph-fill ph-image text-green-500" title="Foto adjunta"></i>' : '';
  const fechaMostrar = formatearFechaEstandar(data.fecha);
  const horaMostrar = formatearHora24(data.hora);

  const statusIcon = isPending 
    ? `<span id="sync-tag-${idTemporal}"><i class="ph-fill ph-cloud-slash text-yellow-500 ml-1" title="Pendiente de red"></i></span>`
    : `<span id="sync-tag-${idTemporal}"><i class="ph-fill ph-cloud-check text-green-500 ml-1" title="Sincronizado"></i></span>`;

  const html = `
      <div class="p-4 rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors fade-in">
          <div class="flex justify-between items-start mb-2">
              <span class="text-xs font-mono text-gray-500 dark:text-gray-400">#${idTemporal.substring(idTemporal.length - 6)} ${fotoIcon} ${statusIcon}</span>
              <span class="text-xs px-2 py-1 rounded-full font-medium ${colorTipo}">${data.tipo}</span>
          </div>
          <p class="font-medium text-gray-900 dark:text-gray-100">${data.area}</p>
          <div class="mt-2 text-sm text-gray-600 dark:text-gray-400 flex justify-between">
              <span>${data.peso} kg</span>
              <span>${data.bolsas} bolsa(s)</span>
          </div>
          <div class="mt-2 text-xs text-gray-500 flex justify-between items-center border-t border-gray-200 dark:border-gray-700 pt-2">
              <span class="truncate max-w-[120px]" title="${data.supervisor}">${supervisorCorto}</span>
              <span>${fechaMostrar} ${horaMostrar}</span>
          </div>
      </div>
  `;
  registrosContainer.insertAdjacentHTML('afterbegin', html);
}

/**
 * Procesa una imagenFile (File objeto) usando <canvas> para redimensionar y comprimir.
 * @param {File} imageFile - El archivo original capturado del input.
 * @returns {Promise<{base64: string, type: string}>} - Promesa con los datos optimizados.
 */
function procesarYComprimirImagen(imageFile) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    // 1. Leer archivo original como DataURL
    reader.readAsDataURL(imageFile);
    
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      
      img.onload = () => {
        // 2. Crear Canvas Oculto
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        let width = img.width;
        let height = img.height;
        
        // 3. Calcular Redimensionado Proporcional (Aspect Ratio)
        if (width > MAX_IMAGE_WIDTH) {
          height = Math.round((height * MAX_IMAGE_WIDTH) / width);
          width = MAX_IMAGE_WIDTH;
        }
        
        // 4. Configurar dimensiones del Canvas y dibujar
        canvas.width = width;
        canvas.height = height;
        
        // Volcar imagen al canvas (esto ya aplica suavizado nativo)
        ctx.drawImage(img, 0, 0, width, height);
        
        // 5. Exportar a Base64 optimizado (JPEG forzado para máxima compresión)
        // .toDataURL(type, quality) -> quality es clave aquí.
        const optimizedBase64DataUrl = canvas.toDataURL('image/jpeg', IMAGE_QUALITY);
        
        // Extraer solo la cadena Base64 pura para el Backend
        const finalBase64 = optimizedBase64DataUrl.split(',')[1];
        
        // Liberar memoria explícitamente (Buena práctica en móviles)
        canvas.width = 0; canvas.height = 0; 

        resolve({
          base64: finalBase64,
          type: 'image/jpeg' // Forzamos JPEG en la salida optimizada
        });
      };
      
      img.onerror = (err) => reject('Error cargando imagen en objeto Image: ' + err);
    };
    
    reader.onerror = (err) => reject('Error leyendo archivo original: ' + err);
  });
}
