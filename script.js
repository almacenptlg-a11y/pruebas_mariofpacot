/**
 * @fileoverview CORE GENAPP - Sistema POE Industrial (SPA + DICCIONARIO AVANZADO + ACORDEON + LINKS)
 * VERSIÓN EXPANDIDA Y DEPURADA
 */

const GAS_ENDPOINT = "https://script.google.com/macros/s/AKfycbylXo9sXzLBYCdyB1AiDOa7-cyvPutjmy0XCun33Ic1YSFM0YdruE6WfkSt0SCz_PSO2Q/exec"; 
const GAS_DICT_ENDPOINT = "https://script.google.com/macros/s/AKfycbxAHJeIS_Dq91olhikoJpRPZEVPf-wPOCs_NGQ796oowVOQRRX8jeOeiNeFeDw3zrxE/exec"; 

let state = { 
    poes: [], 
    areas: [], 
    config: [], 
    form: { 
        advancedSteps: [], 
        editingId: null, 
        editingStepId: null 
    }, 
    user: null, 
    isSessionVerified: false, 
    activeAreaFilter: 'TODAS', 
    savedRange: null 
};

// ==========================================
// RECUPERAR TEMA INMEDIATAMENTE AL CARGAR EL SCRIPT
// ==========================================
const savedTheme = localStorage.getItem('genapp_theme');
if (savedTheme === 'dark') {
    document.documentElement.classList.add('dark');
}

window.addEventListener('message', (event) => {
    const { type, user, theme } = event.data || {};
    
    if ((type === 'THEME_UPDATE' || type === 'SESSION_SYNC') && theme) {
        document.documentElement.classList.toggle('dark', theme === 'dark');
        localStorage.setItem('genapp_theme', theme);
    }
    
    if (type === 'SESSION_SYNC' && user) {
        const isNewUser = !state.user || state.user.usuario !== user.usuario;
        state.user = user; 
        state.isSessionVerified = true;
        sessionStorage.setItem('moduloUserPOE', JSON.stringify(user)); 
        if (isNewUser) {
            window.refreshUI();
        }
    }
});

// ==========================================
// MOTOR DE POPUPS DEL SISTEMA
// ==========================================
window.sysAlert = function(message, type = 'info') {
    return new Promise(resolve => {
        const colors = { 
            error: 'bg-red-50 text-red-600 border-red-200', 
            warning: 'bg-amber-50 text-amber-600 border-amber-200', 
            success: 'bg-green-50 text-green-600 border-green-200', 
            info: 'bg-blue-50 text-blue-600 border-blue-200' 
        };
        const icons = { error: '✖', warning: '⚠️', success: '✓', info: 'ℹ️' };
        
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 max-w-sm w-full overflow-hidden animate-[fadeIn_0.2s]">
                <div class="p-6 text-center">
                    <div class="w-16 h-16 mx-auto rounded-full flex items-center justify-center text-3xl mb-4 border ${colors[type]}">${icons[type]}</div>
                    <h3 class="text-lg font-black text-gray-900 dark:text-white mb-2">Mensaje del Sistema</h3>
                    <p class="text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-pre-line">${message}</p>
                </div>
                <div class="p-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-700 flex justify-center">
                    <button class="bg-gray-900 hover:bg-black dark:bg-gray-700 dark:hover:bg-gray-600 text-white px-8 py-3 rounded-xl text-sm font-bold w-full transition-colors" id="btnAlertOk">Entendido</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        document.getElementById('btnAlertOk').onclick = () => { 
            modal.remove(); 
            resolve(); 
        };
    });
};

window.sysConfirm = function(message) {
    return new Promise(resolve => {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 max-w-sm w-full overflow-hidden animate-[fadeIn_0.2s]">
                <div class="p-6 text-center">
                    <div class="w-16 h-16 mx-auto rounded-full flex items-center justify-center text-3xl mb-4 bg-amber-50 text-amber-600 border border-amber-200">⚠️</div>
                    <h3 class="text-lg font-black text-gray-900 dark:text-white mb-2">Confirmación</h3>
                    <p class="text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-pre-line">${message}</p>
                </div>
                <div class="p-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-700 flex gap-3">
                    <button class="flex-1 bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 py-3 rounded-xl text-sm font-bold transition-all" id="btnConfCancel">Cancelar</button>
                    <button class="flex-1 bg-red-700 hover:bg-red-800 text-white py-3 rounded-xl text-sm font-bold transition-colors" id="btnConfOk">Confirmar</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        document.getElementById('btnConfOk').onclick = () => { 
            modal.remove(); 
            resolve(true); 
        };
        document.getElementById('btnConfCancel').onclick = () => { 
            modal.remove(); 
            resolve(false); 
        };
    });
};

// ==========================================
// LÓGICA DE ENLACES (MÁSCARA)
// ==========================================
window.openLinkModal = function() {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
        state.savedRange = selection.getRangeAt(0);
        document.getElementById("linkText").value = selection.toString();
    }
    document.getElementById("linkUrl").value = "";
    const m = document.getElementById("linkModal"); 
    if(m) {
        m.classList.remove("hidden"); 
        m.classList.add("flex");
    }
};

window.closeLinkModal = function() { 
    const m = document.getElementById("linkModal"); 
    if(m) {
        m.classList.add("hidden"); 
        m.classList.remove("flex"); 
    }
};

window.insertLink = function() {
    const url = document.getElementById("linkUrl").value.trim();
    let text = document.getElementById("linkText").value.trim();
    
    if (!url) { 
        window.sysAlert("Debe ingresar una URL válida.", "warning"); 
        return; 
    }
    if (!text) {
        text = "Ver Enlace";
    }

    const selection = window.getSelection();
    selection.removeAllRanges();
    if (state.savedRange) {
        selection.addRange(state.savedRange);
    }

    const linkHTML = `<a href="${url}" target="_blank">${text}</a>`;
    document.execCommand('insertHTML', false, linkHTML);
    window.closeLinkModal();
};

// ==========================================
// NAVEGACIÓN Y MENÚ
// ==========================================
window.switchTab = function(tabId) {
    // 1. Actualizar Nav Buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('bg-red-50', 'text-red-700', 'dark:bg-red-900/30', 'dark:text-red-400');
        btn.classList.add('text-gray-600', 'dark:text-gray-400');
    });
    const activeBtn = document.getElementById(`nav-${tabId}`);
    if (activeBtn) {
        activeBtn.classList.remove('text-gray-600', 'dark:text-gray-400');
        activeBtn.classList.add('bg-red-50', 'text-red-700', 'dark:bg-red-900/30', 'dark:text-red-400');
    }
    
    // 2. Ocultar todas las secciones
    document.querySelectorAll('.view-section').forEach(sec => {
        sec.classList.remove('active');
    });
    
    // 3. Mostrar sección activa
    const activeView = document.getElementById(`view-${tabId}`);
    if (activeView) {
        activeView.classList.add('active');
    }

    // 4. Lógica de Títulos y Botones en Topbar
    const topTitle = document.getElementById('topbar-title');
    const topSub = document.getElementById('topbar-subtitle');
    const btnNuevo = document.getElementById('btn-nuevo-poe');
    const btnArea = document.getElementById('btn-nueva-area');
    const permisos = window.getPermisos();
    
    if (tabId === 'dashboard') { 
        if(topTitle) topTitle.textContent = "Dashboard Operativo"; 
        if(topSub) topSub.textContent = "Resumen del Sistema"; 
        if(btnNuevo) btnNuevo.classList.add('hidden'); 
        if(btnArea) btnArea.classList.add('hidden'); 
        window.renderDashboard(); 
    } 
    else if (tabId === 'poes') { 
        if(topTitle) topTitle.textContent = "Procedimientos Operativos"; 
        if(topSub) topSub.textContent = "Matriz Documental GFSI"; 
        if(btnNuevo) {
            if(permisos.canEditAll || permisos.canEditOwn) {
                btnNuevo.classList.remove('hidden');
            } else {
                btnNuevo.classList.add('hidden');
            }
        }
        if(btnArea) btnArea.classList.add('hidden'); 
        window.renderPOEs(); 
    } 
    else if (tabId === 'areas') { 
        if(topTitle) topTitle.textContent = "Áreas de la Planta"; 
        if(topSub) topSub.textContent = "Organización Estructural"; 
        if(btnNuevo) btnNuevo.classList.add('hidden'); 
        
        // 🛡️ Verificación de permisos para el botón Nueva Área
        if(btnArea) {
            const permisos = window.getPermisos();
            if(permisos.canManageAreas) {
                btnArea.classList.remove('hidden');
            } else {
                btnArea.classList.add('hidden');
            }
        }
        window.renderMapaAreas(); 
    }
};

window.toggleMobileMenu = function(forceClose = false) {
    const sidebar = document.getElementById('sidebar'); 
    const overlay = document.getElementById('mobileOverlay'); 
    if (!sidebar || !overlay) return;
    
    if (forceClose || !sidebar.classList.contains('-translate-x-full')) { 
        sidebar.classList.add('-translate-x-full'); 
        overlay.classList.add('hidden'); 
    } else { 
        sidebar.classList.remove('-translate-x-full'); 
        overlay.classList.remove('hidden'); 
    }
};

window.toggleCompactMenu = function() {
    const sidebar = document.getElementById('sidebar'); 
    const texts = document.querySelectorAll('.sidebar-text'); 
    if (!sidebar) return;
    
    if (sidebar.classList.contains('w-64')) { 
        sidebar.classList.replace('w-64', 'w-[72px]'); 
        texts.forEach(el => el.classList.add('hidden')); 
    } else { 
        sidebar.classList.replace('w-[72px]', 'w-64'); 
        texts.forEach(el => el.classList.remove('hidden')); 
    }
};

// ==========================================
// BASE DE DATOS Y PERMISOS
// ==========================================
window.getPermisos = function() {
    if (!state.user) {
        return { rol: 'GUEST', areas: [], canViewAll: false, canEditAll: false, canEditOwn: false, canManageAreas: false };
    }
    
    const rol = String(state.user.rol).toUpperCase();
    let assignedAreas = [];
    
    if (Array.isArray(state.user.area)) {
        assignedAreas = state.user.area.map(a => String(a).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
    } else if (typeof state.user.area === 'string') {
        assignedAreas = state.user.area.split(',').map(a => a.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
    }

    return { 
        rol: rol, 
        areas: assignedAreas, 
        canViewAll: ['SUPERVISOR', 'JEFE', 'GERENTE', 'ADMINISTRADOR', 'ADMIN', 'SISTEMAS'].includes(rol),
        canEditAll: ['JEFE', 'ADMINISTRADOR', 'ADMIN', 'SISTEMAS'].includes(rol), 
        canEditOwn: rol === 'SUPERVISOR', 
        canManageAreas: ['JEFE', 'ADMINISTRADOR', 'ADMIN', 'SISTEMAS'].includes(rol)
    };
};

const POEDB = {
    db: null, 
    useRAM: false, 
    ramDB: { poes: [], sync_queue: [], sys_config: [], areas: [] },
    init() { 
        return new Promise((resolve) => { 
            try { 
                const req = indexedDB.open("POE_DB_V8", 2); 
                req.onupgradeneeded = (e) => { 
                    const db = e.target.result; 
                    if (!db.objectStoreNames.contains("poes")) db.createObjectStore("poes", { keyPath: "id" }); 
                    if (!db.objectStoreNames.contains("sync_queue")) db.createObjectStore("sync_queue", { keyPath: "id" }); 
                    if (!db.objectStoreNames.contains("sys_config")) db.createObjectStore("sys_config", { keyPath: "key" }); 
                    if (!db.objectStoreNames.contains("areas")) db.createObjectStore("areas", { keyPath: "id" }); 
                }; 
                req.onsuccess = (e) => { 
                    this.db = e.target.result; 
                    resolve(); 
                }; 
                req.onerror = () => { 
                    this.useRAM = true; 
                    resolve(); 
                }; 
            } catch (e) { 
                this.useRAM = true; 
                resolve(); 
            } 
        }); 
    },
    save(store, data) { 
        return new Promise((r) => { 
            if (this.useRAM) { 
                const idx = this.ramDB[store].findIndex((i) => i.id === data.id || i.key === data.key); 
                if (idx > -1) {
                    this.ramDB[store][idx] = data; 
                } else {
                    this.ramDB[store].push(data); 
                }
                return r(); 
            } 
            const tx = this.db.transaction(store, "readwrite"); 
            tx.objectStore(store).put(data); 
            tx.oncomplete = r; 
        }); 
    },
    getAll(store) { 
        return new Promise((r) => { 
            if (this.useRAM) return r(this.ramDB[store]); 
            const tx = this.db.transaction(store, "readonly"); 
            const req = tx.objectStore(store).getAll(); 
            req.onsuccess = () => r(req.result); 
        }); 
    },
    delete(store, id) { 
        return new Promise((r) => { 
            if (this.useRAM) { 
                this.ramDB[store] = this.ramDB[store].filter((i) => i.id !== id && i.key !== id); 
                return r(); 
            } 
            const tx = this.db.transaction(store, "readwrite"); 
            tx.objectStore(store).delete(id); 
            tx.oncomplete = r; 
        }); 
    },
    clearStore(store) { 
        return new Promise((r) => { 
            if (this.useRAM) { 
                this.ramDB[store] = []; 
                return r(); 
            } 
            const tx = this.db.transaction(store, "readwrite"); 
            tx.objectStore(store).clear(); 
            tx.oncomplete = r; 
        }); 
    }
};

window.refreshUI = async function () {
    state.config = await POEDB.getAll("sys_config");
    state.areas = await POEDB.getAll("areas"); 
    const allPoes = await POEDB.getAll("poes");
    const permisos = window.getPermisos();

    // Filtro general de visibilidad
    state.poes = allPoes.filter((p) => {
        const s = String(p.status || "").trim().toUpperCase();
        if (!["ACT", "REV", "ACTIVO", "EN REVISION", "EN REVISIÓN"].includes(s)) return false;
        
        if (!permisos.canViewAll) {
            const areaDef = state.areas.find(a => a.areaAbbr === p.subCategory);
            const catStr = areaDef ? `${areaDef.macroName} ${areaDef.areaName} ${areaDef.macroAbbr} ${areaDef.areaAbbr} ${areaDef.id}`.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
            if (!permisos.areas.some(userArea => catStr.includes(userArea))) return false; 
        }
        return true;
    });

    const safeSet = (id, val) => { 
        const el = document.getElementById(id); 
        if (el) el.textContent = val; 
    };
    
    safeSet("totalPOEs", state.poes.length);
    safeSet("produccionCount", state.poes.filter((p) => p.category === "PROD").length);
    safeSet("logisticaCount", state.poes.filter((p) => p.category === "LOG").length);
    safeSet("calidadCount", state.poes.filter((p) => p.category === "CAL").length);

    if (state.user) {
        safeSet('userName', state.user.nombre);
        const areaNames = permisos.areas.map(val => { 
            const a = state.areas.find(x => x.id === val || x.areaAbbr === val); 
            return a ? a.areaName : val; 
        });
        const areasFormat = areaNames.length > 0 ? `<span class="text-gray-400 dark:text-gray-500 font-medium block truncate mt-0.5" title="${areaNames.join(', ')}">📍 ${areaNames.join(', ')}</span>` : '';
        
        const userRoleEl = document.getElementById('userRole');
        if(userRoleEl) {
            userRoleEl.innerHTML = `<span class="font-black text-gray-700 dark:text-gray-300 block truncate">${permisos.rol}</span>${areasFormat}`;
        }
        safeSet('userAvatar', state.user.nombre.substring(0, 2).toUpperCase());
    }

    const filterAreaSelect = document.getElementById('filterArea');
    if(filterAreaSelect && state.areas.length > 0 && filterAreaSelect.options.length === 1) {
        state.areas.forEach(a => { 
            filterAreaSelect.innerHTML += `<option value="${a.areaAbbr}">${a.areaName}</option>`; 
        });
    }

    window.buildDynamicDictionaries();
    window.renderDashboard();
    window.renderPOEs();
    window.renderMapaAreas();
};

// ==========================================
// RENDERIZADO DE VISTAS (DASHBOARD Y POES)
// ==========================================
window.renderDashboard = function() {
    const revCount = state.poes.filter(p => p.status === 'REV' || p.status === 'En Revisión').length;
    const revEl = document.getElementById("dashRevCount");
    if(revEl) revEl.textContent = `${revCount} pendientes de revisión`;

    const container = document.getElementById("dashboard-areas-list"); 
    if(!container) return;
    
    let html = '';
    state.areas.forEach(area => {
        const count = state.poes.filter(p => p.subCategory === area.areaAbbr).length;
        html += `
        <div class="flex items-center justify-between p-3 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition" onclick="window.switchTab('poes'); document.getElementById('filterArea').value = '${area.areaAbbr}'; window.renderPOEs();">
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-400">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-7h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                </div>
                <div>
                    <p class="text-xs font-bold text-gray-900 dark:text-white leading-tight">${area.areaName}</p>
                    <p class="text-[10px] text-gray-500">${area.macroName}</p>
                </div>
            </div>
            <span class="text-xs font-black bg-white dark:bg-gray-900 px-2 py-1 rounded-md border border-gray-200 dark:border-gray-600">${count}</span>
        </div>`;
    });
    container.innerHTML = html || `<p class="text-sm text-gray-400 col-span-2">No hay áreas configuradas.</p>`;
};

window.renderPOEs = function () {
    const tbody = document.getElementById("table-body"); 
    if (!tbody) return;
    
    const query = document.getElementById("searchInput")?.value.toLowerCase() || "";
    const filterStat = document.getElementById("filterStatus")?.value || "ALL";
    const filterAr = document.getElementById("filterArea")?.value || "ALL";
    const permisos = window.getPermisos(); 

    const filtered = state.poes.filter((p) => {
        const areaObj = state.areas.find(a => a.areaAbbr === p.subCategory);
        const srch = p.code + p.title + (areaObj ? areaObj.areaName : p.subCategory);
        const matchQuery = srch.toLowerCase().includes(query);
        const matchStatus = filterStat === "ALL" || p.status === filterStat || (filterStat === 'ACT' && p.status === 'Activo');
        const matchArea = filterAr === "ALL" || p.subCategory === filterAr;
        return matchQuery && matchStatus && matchArea;
    });

    const countLabel = document.getElementById("lblPoeCount"); 
    if(countLabel) countLabel.textContent = filtered.length;
    
    if (filtered.length === 0) { 
        tbody.innerHTML = `<tr><td colspan="7" class="text-center p-8 text-gray-500 font-medium">Sin resultados para la búsqueda.</td></tr>`; 
        return; 
    }

    tbody.innerHTML = filtered.slice().reverse().map((poe) => {
        const areaObj = state.areas.find((a) => a.areaAbbr === poe.subCategory);
        const areaName = areaObj ? areaObj.areaName : poe.subCategory;

        let badge = `<span class="bg-gray-100 text-gray-600 px-3 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1.5 w-max"><div class="w-1.5 h-1.5 rounded-full bg-gray-400"></div> Borrador</span>`;
        if (poe.status === 'ACT' || poe.status === 'Activo') {
            badge = `<span class="bg-green-50 text-green-700 border border-green-200 px-3 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 w-max"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg> Aprobado</span>`;
        }
        if (poe.status === 'REV' || poe.status === 'En Revisión') {
            badge = `<span class="bg-yellow-50 text-yellow-700 border border-yellow-200 px-3 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 w-max"><div class="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse"></div> En Revisión</span>`;
        }

        const catStr = areaObj ? `${areaObj.macroName} ${areaObj.areaName} ${areaObj.macroAbbr} ${areaObj.areaAbbr} ${areaObj.id}`.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
        const isMyArea = permisos.areas.some(userArea => catStr.includes(userArea));
        
        const actionButtons = (permisos.canEditAll || (permisos.canEditOwn && isMyArea)) ? `
            <button onclick="window.clonePOE('${poe.id}')" class="text-gray-400 hover:text-green-600 dark:hover:text-green-400 transition p-1" title="Clonar (Crear Copia)"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg></button>
            <button onclick="window.editPOE('${poe.id}')" class="text-gray-400 hover:text-blue-600 transition p-1" title="Editar"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg></button>
            <button onclick="window.deletePOE('${poe.id}')" class="text-gray-400 hover:text-red-600 transition p-1" title="Eliminar"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
        ` : '';

        return `
        <tr class="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group">
            <td class="px-6 py-4 text-xs font-black text-red-700 dark:text-red-400">${poe.code}</td>
            <td class="px-6 py-4 text-xs font-bold text-gray-900 dark:text-gray-100">${poe.title}</td>
            <td class="px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400">${areaName}</td>
            <td class="px-6 py-4 text-xs font-bold text-gray-400">v${poe.version}</td>
            <td class="px-6 py-4">${badge}</td>
            <td class="px-6 py-4 text-xs font-medium text-gray-500">${new Date(poe.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</td>
            <td class="px-6 py-4 text-right flex justify-end gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                <button onclick="window.viewPOE('${poe.id}', true)" class="text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition p-1" title="Ver Flujograma"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012-2v2M7 7h10"></path></svg></button>
                <button onclick="window.viewPOE('${poe.id}')" class="text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition p-1" title="Ver Documento"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg></button>
                ${actionButtons}
            </td>
        </tr>`;
    }).join("");
};

window.setAreaFilter = function(macro) { 
    state.activeAreaFilter = macro; 
    window.renderMapaAreas(); 
};

window.renderMapaAreas = function() {
    const grid = document.getElementById('grid-areas'); 
    const filterContainer = document.getElementById('area-filters'); 
    if (!grid || !filterContainer) return;
    
    const macrosMap = new Map(); 
    state.areas.forEach(a => macrosMap.set(a.macroAbbr, a.macroName));
    
    const pillBase = "px-5 py-2 rounded-lg text-xs transition-all outline-none font-bold";
    const pillInact = "text-gray-500 hover:bg-white hover:text-gray-800 hover:shadow-sm dark:hover:bg-gray-700 dark:hover:text-white";
    const pillAct = "bg-gray-900 text-white shadow-md dark:bg-gray-100 dark:text-gray-900";
    
    let filtersHTML = `<button onclick="window.setAreaFilter('TODAS')" class="${pillBase} ${state.activeAreaFilter === 'TODAS' ? pillAct : pillInact}">Todas</button>`;
    for (let [abbr, name] of macrosMap.entries()) {
        filtersHTML += `<button onclick="window.setAreaFilter('${abbr}')" class="${pillBase} ${abbr === state.activeAreaFilter ? pillAct : pillInact}">${name}</button>`;
    }
    filterContainer.innerHTML = filtersHTML;

    let areasToRender = state.activeAreaFilter === 'TODAS' ? state.areas : state.areas.filter(a => a.macroAbbr === state.activeAreaFilter);
    const groups = {}; 
    areasToRender.forEach(a => { 
        if(!groups[a.macroName]) groups[a.macroName] = []; 
        groups[a.macroName].push(a); 
    });

    let gridHTML = '';
    for (let macro in groups) {
        gridHTML += `
        <div class="col-span-full mt-6 mb-2 flex items-center gap-2">
            <div class="w-3 h-3 rounded-full bg-red-600"></div>
            <h3 class="text-xl font-black text-gray-900 dark:text-white">${macro}</h3>
        </div>`;
        
        groups[macro].forEach(area => {
            const btnConfig = window.getPermisos().canManageAreas ? `<button onclick="window.openAreaForm('${area.id}'); event.stopPropagation();" class="mt-4 text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-800 transition relative z-10">Configurar Datos</button>` : '';
            gridHTML += `
            <div class="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-lg transition-all cursor-pointer group" onclick="window.switchTab('poes'); document.getElementById('searchInput').value = '${area.areaName}'; window.renderPOEs();">
                <div class="flex gap-4">
                    <div class="w-12 h-12 rounded-xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center text-red-600 dark:text-red-400 group-hover:scale-110 transition shrink-0">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    </div>
                    <div>
                        <h4 class="font-bold text-gray-900 dark:text-white text-lg leading-tight mb-1">${area.areaName}</h4>
                        <p class="text-[10px] text-gray-500 font-mono tracking-widest uppercase mb-2 bg-gray-100 dark:bg-gray-700 inline-block px-2 py-0.5 rounded">${area.poePrefix}-XXX</p>
                        <p class="text-xs text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-2">${area.desc || 'Área estructural.'}</p>
                        ${btnConfig}
                    </div>
                </div>
            </div>`;
        });
    }
    grid.innerHTML = areasToRender.length === 0 ? `<div class="col-span-full py-10 text-center text-gray-400">No hay áreas operativas.</div>` : gridHTML;
};

// ==========================================
// FORMULARIOS DE POE Y HERRAMIENTAS WYSIWYG
// ==========================================
const getFieldValue = (id) => { 
    const el = document.getElementById(id); 
    return el ? (el.classList.contains("rich-editor") ? el.innerHTML.trim() : el.value.trim()) : ""; 
};
const setFieldValue = (id, val) => { 
    const el = document.getElementById(id); 
    if (!el) return; 
    if (el.classList.contains("rich-editor")) el.innerHTML = val || ""; 
    else el.value = val || ""; 
};

window.initRichEditors = function() {
    document.querySelectorAll('.rich-editor').forEach(editor => {
        if (editor.classList.contains('initialized')) return;
        editor.classList.add("initialized");
        
        editor.addEventListener('paste', function(e) { 
            e.preventDefault(); 
            const text = (e.originalEvent || e).clipboardData.getData('text/plain'); 
            document.execCommand('insertText', false, text); 
        });
        
        editor.addEventListener('keydown', function(e) { 
            if (e.key === 'Enter' && !document.queryCommandState('insertOrderedList') && !document.queryCommandState('insertUnorderedList')) { 
                document.execCommand('insertLineBreak'); 
                e.preventDefault(); 
            } 
        });
    });
};

window.setListType = function(type) { 
    let node = document.getSelection().anchorNode; 
    while(node && node.nodeName !== 'OL' && node.nodeName !== 'DIV') { 
        node = node.parentNode; 
    } 
    if(node && node.nodeName === 'OL') {
        node.type = type; 
    }
};

window.buildDynamicDictionaries = function () { 
    const selectCategory = document.getElementById("category"); 
    if (!selectCategory || state.areas.length === 0) return; 
    
    const cv = selectCategory.value; 
    const macrosMap = new Map(); 
    state.areas.forEach(a => macrosMap.set(a.macroAbbr, a.macroName)); 
    
    let options = '<option value="" disabled selected>Seleccione Macro-Área...</option>'; 
    for (let [abbr, name] of macrosMap.entries()) {
        options += `<option value="${abbr}">${name}</option>`; 
    }
    selectCategory.innerHTML = options; 
    if (cv) selectCategory.value = cv; 
};

window.updateSubCategories = function () { 
    const catSelect = document.getElementById("category").value; 
    const subSelect = document.getElementById("poeSubCategory"); 
    if (!subSelect) return; 
    
    const subs = state.areas.filter(a => a.macroAbbr === catSelect); 
    if(subs.length > 0) {
        subSelect.innerHTML = '<option value="" disabled selected>Seleccione Sub-Área...</option>' + subs.map((s) => `<option value="${s.areaAbbr}">${s.areaName}</option>`).join("");
    } else {
        subSelect.innerHTML = `<option value="GEN">General</option>`; 
    }
    window.generatePoeCode(); 
};

window.generatePoeCode = function () {
    if (state.form.editingId) return; 
    
    const cat = document.getElementById("category")?.value; 
    const sub = document.getElementById("poeSubCategory")?.value; 
    if (!cat || !sub) return;
    
    const areaDef = state.areas.find(a => a.macroAbbr === cat && a.areaAbbr === sub); 
    const prefix = areaDef && areaDef.poePrefix ? areaDef.poePrefix : `${cat}-${sub}`;
    
    const isPOES = (areaDef ? areaDef.areaName.toUpperCase() : '').match(/SANEAMIENTO|LIMPIEZA|TÓXICO|TOXICO/) || sub === 'SAN'; 
    const docType = isPOES ? 'POES' : 'POE';
    const count = state.poes.filter((p) => p.category === cat && p.subCategory === sub).length;
    
    const codeEl = document.getElementById("code"); 
    if (codeEl) codeEl.value = `${docType}-${prefix}-${String(count + 1).padStart(3, "0")}`;
    
    const modalTitle = document.getElementById("modalTitle"); 
    if (modalTitle && !state.form.editingId) modalTitle.textContent = `Registrar ${docType} (GFSI)`;
    
    const btnTemplate = document.getElementById("btnTemplatePOES"); 
    if (btnTemplate) { 
        if(isPOES) {
            btnTemplate.classList.remove('hidden');
            btnTemplate.classList.add('flex');
        } else {
            btnTemplate.classList.add('hidden');
            btnTemplate.classList.remove('flex');
        }
    }
};

window.openModal = function () {
    const form = document.getElementById("poe-form"); 
    if (form) form.reset(); 
    
    state.form.editingId = null; 
    const modalTitle = document.getElementById("modalTitle");
    if(modalTitle) modalTitle.textContent = "Registrar Procedimiento"; 
    
    document.querySelectorAll('.rich-editor').forEach(el => el.innerHTML = ""); 
    
    ["category", "poeSubCategory"].forEach(id => { 
        const el = document.getElementById(id); 
        if (el) { 
            el.disabled = false; 
            el.classList.remove("bg-gray-100", "dark:bg-gray-600", "cursor-not-allowed"); 
        }
    }); 
    
    const versionInput = document.getElementById("poeVersion"); 
    if (versionInput) { 
        versionInput.value = "1.0"; 
        versionInput.classList.remove("bg-blue-50", "text-blue-800"); 
    } 
    
    state.form.advancedSteps = []; 
    window.renderAdvancedSteps(); 
    window.updateSubCategories(); 
    
    const m = document.getElementById("modal"); 
    if (m) { 
        m.classList.remove("hidden"); 
        m.classList.add("flex"); 
    }
};

window.closeModal = function () { 
    const m = document.getElementById("modal"); 
    if (m) { 
        m.classList.add("hidden"); 
        m.classList.remove("flex"); 
    } 
};

window.closeViewModal = function () { 
    const m = document.getElementById("viewModal"); 
    if (m) { 
        m.classList.add("hidden"); 
        m.classList.remove("flex"); 
    } 
};

window.handleFormSubmit = async function (e) {
    e.preventDefault(); 
    const permisos = window.getPermisos();
    
    if (!state.isSessionVerified || !state.user) {
        return await window.sysAlert("Acción bloqueada: Esperando sincronización con el HUB central.", "error");
    }
    if (!permisos.canEditAll && !permisos.canEditOwn) {
        return await window.sysAlert("Acción denegada. Nivel de acceso insuficiente.", "error");
    }
    if (state.form.advancedSteps.length === 0) {
        return await window.sysAlert("El procedimiento debe incluir al menos 1 paso operativo.", "warning");
    }

    if (permisos.canEditOwn && !permisos.canEditAll) {
        const cat = getFieldValue("category"); 
        const sub = getFieldValue("poeSubCategory"); 
        const areaDef = state.areas.find(a => a.macroAbbr === cat && a.areaAbbr === sub);
        const catStr = areaDef ? `${areaDef.macroName} ${areaDef.areaName} ${areaDef.macroAbbr} ${areaDef.areaAbbr} ${areaDef.id}`.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
        
        if (!permisos.areas.some(userArea => catStr.includes(userArea))) {
            const areaNamesForAlert = permisos.areas.map(val => { 
                const a = state.areas.find(x => x.id === val || x.areaAbbr === val); 
                return a ? a.areaName : val; 
            });
            return await window.sysAlert(`BLOQUEO DE SEGURIDAD:\nNo tiene permisos para crear o modificar procedimientos en el área seleccionada.\n\nÁreas autorizadas:\n📍 ${areaNamesForAlert.join(', ')}`, "error");
        }
    }
    
    const isEditing = !!state.form.editingId; 
    const poeId = isEditing ? state.form.editingId : `UUID-${Date.now()}`;
    let originalDate = new Date().toISOString(); 
    let autorOriginal = state.user.nombre; 
    let ultimoEditor = "";
    
    if (isEditing) { 
        const existing = state.poes.find((p) => p.id === poeId); 
        if (existing) { 
            originalDate = existing.date; 
            autorOriginal = existing.author || autorOriginal; 
            ultimoEditor = state.user.nombre; 
        } 
    }
    
    const poeData = { 
        id: poeId, 
        code: getFieldValue("code"), 
        category: getFieldValue("category"), 
        subCategory: getFieldValue("poeSubCategory"), 
        title: getFieldValue("title"), 
        version: getFieldValue("poeVersion"), 
        status: getFieldValue("poeStatus"), 
        objective: getFieldValue("objective"), 
        scope: getFieldValue("scope"), 
        frequency: getFieldValue("monitoring"), 
        responsibles: getFieldValue("responsibles"), 
        definitions: getFieldValue("definitions"), 
        materials: getFieldValue("materials"), 
        monitoring: getFieldValue("monitoring"), 
        corrective_actions: getFieldValue("correctiveActions"), 
        records: getFieldValue("records"), 
        references: getFieldValue("references"), 
        author: autorOriginal, 
        lastEditor: ultimoEditor, 
        procedure: JSON.stringify(state.form.advancedSteps), 
        date: originalDate, 
        _syncStatus: "pending" 
    };
    
    await POEDB.save("poes", poeData); 
    await POEDB.save("sync_queue", { id: poeData.id, payload: poeData });
    window.closeModal(); 
    await window.refreshUI(); 
    window.pushSync(); 
    await window.sysAlert("Procedimiento guardado y encolado para la nube.", "success");
};

window.deletePOE = async function (id) {
    if (!window.getPermisos().canEditAll && !window.getPermisos().canEditOwn) {
        return await window.sysAlert("Acción denegada por políticas de seguridad.", "error");
    }
    
    const confirmed = await window.sysConfirm("¿Está seguro de marcar como obsoleto este procedimiento?\n\nSe ocultará permanentemente de la matriz operativa."); 
    if (!confirmed) return;
    
    const poe = state.poes.find((p) => p.id === id); 
    if (poe) { 
        poe.status = "OBS"; 
        poe._syncStatus = "pending"; 
        await POEDB.save("sync_queue", { id, payload: poe }); 
        await POEDB.delete("poes", id); 
        await window.refreshUI(); 
        window.pushSync(); 
    }
};

window.editPOE = function (id) {
    const poe = state.poes.find((p) => p.id === id); 
    if (!poe) return;
    
    state.form.editingId = poe.id; 
    const modalTitle = document.getElementById("modalTitle");
    if(modalTitle) modalTitle.textContent = `Editar Documento: ${poe.code}`;
    
    const catSelect = document.getElementById("category"); 
    const subCatSelect = document.getElementById("poeSubCategory");
    
    if(catSelect) {
        catSelect.value = poe.category; 
        catSelect.disabled = true; 
        catSelect.classList.add("bg-gray-100", "dark:bg-gray-600", "cursor-not-allowed"); 
    }
    window.updateSubCategories();
    
    setTimeout(() => { 
        if(subCatSelect) {
            subCatSelect.value = poe.subCategory; 
            subCatSelect.disabled = true; 
            subCatSelect.classList.add("bg-gray-100", "dark:bg-gray-600", "cursor-not-allowed"); 
        }
        const codeEl = document.getElementById("code");
        if(codeEl) codeEl.value = poe.code; 
    }, 50);
    
    let nextVersion = (parseFloat(poe.version || 1.0) + 0.1).toFixed(1); 
    if (isNaN(nextVersion)) nextVersion = "1.1";
    
    const vInput = document.getElementById("poeVersion"); 
    if(vInput) {
        vInput.value = nextVersion; 
        vInput.classList.add("bg-blue-50", "text-blue-800", "font-bold");
    }
    
    setFieldValue("title", poe.title); 
    setFieldValue("poeStatus", poe.status || "ACT"); 
    setFieldValue("objective", poe.objective); 
    setFieldValue("scope", poe.scope); 
    setFieldValue("responsibles", poe.responsibles); 
    setFieldValue("definitions", poe.definitions); 
    setFieldValue("materials", poe.materials); 
    setFieldValue("monitoring", poe.monitoring || poe.frequency); 
    setFieldValue("correctiveActions", poe.corrective_actions); 
    setFieldValue("records", poe.records); 
    setFieldValue("references", poe.references);
    
    try { 
        state.form.advancedSteps = JSON.parse(poe.procedure); 
    } catch (e) { 
        state.form.advancedSteps = []; 
    } 
    window.renderAdvancedSteps();
    
    const m = document.getElementById("modal"); 
    if (m) { 
        m.classList.remove("hidden"); 
        m.classList.add("flex"); 
    }
};

window.clonePOE = function (id) {
    const poe = state.poes.find((p) => p.id === id); 
    if (!poe) return;
    
    state.form.editingId = null; 
    const modalTitle = document.getElementById("modalTitle");
    if(modalTitle) modalTitle.textContent = `Clonar Procedimiento (Copia de ${poe.code})`;
    
    const catSelect = document.getElementById("category"); 
    const subCatSelect = document.getElementById("poeSubCategory");
    
    if(catSelect) {
        catSelect.value = ""; 
        catSelect.disabled = false; 
        catSelect.classList.remove("bg-gray-100", "dark:bg-gray-600", "cursor-not-allowed"); 
    }
    
    if(subCatSelect) {
        subCatSelect.innerHTML = '<option value="" disabled selected>Seleccione área...</option>'; 
        subCatSelect.disabled = false; 
        subCatSelect.classList.remove("bg-gray-100", "dark:bg-gray-600", "cursor-not-allowed"); 
    }
    
    const codeEl = document.getElementById("code");
    if(codeEl) codeEl.value = ""; 
    
    const vInput = document.getElementById("poeVersion"); 
    if(vInput) {
        vInput.value = "1.0"; 
        vInput.classList.remove("bg-blue-50", "text-blue-800", "font-bold");
    }
    
    setFieldValue("title", ""); 
    setFieldValue("poeStatus", "ACT"); 
    setFieldValue("objective", poe.objective); 
    setFieldValue("scope", poe.scope); 
    setFieldValue("responsibles", poe.responsibles); 
    setFieldValue("definitions", poe.definitions); 
    setFieldValue("materials", poe.materials); 
    setFieldValue("monitoring", poe.monitoring || poe.frequency); 
    setFieldValue("correctiveActions", poe.corrective_actions); 
    setFieldValue("records", poe.records); 
    setFieldValue("references", poe.references);
    
    try { 
        const pasosCopiados = JSON.parse(poe.procedure); 
        state.form.advancedSteps = pasosCopiados.map((s, idx) => ({ ...s, id: Date.now() + idx })); 
    } catch (e) { 
        state.form.advancedSteps = []; 
    } 
    window.renderAdvancedSteps();
    
    const m = document.getElementById("modal"); 
    if (m) { 
        m.classList.remove("hidden"); 
        m.classList.add("flex"); 
    }
};

// ==========================================
// 🎨 MOTOR DE RUTEADO SVG PARA FLUJOGRAMAS
// ==========================================
window.drawFlowchartArrows = function(steps) {
    const canvas = document.getElementById('flowchart-canvas');
    const svgLayer = document.getElementById('svg-layer');
    
    if (!canvas || !svgLayer) {
        return;
    }

    const canvasRect = canvas.getBoundingClientRect();
    
    // Definimos las cabezas de flecha (Markers)
    let svgContent = `
        <defs>
            <marker id="arrowhead-red" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#dc2626" />
            </marker>
            <marker id="arrowhead-amber" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#d97706" />
            </marker>
        </defs>
    `;

    steps.forEach(step => {
        if ((step.type === 'PC' || step.type === 'PCC') && step.devRoute) {
            
            const devBox = document.getElementById(`dev-${step.id}`);
            
            let targetNodeId = `node-${step.devRoute}`;
            if (step.devRoute === "FIN") {
                targetNodeId = "node-fin";
            }
            
            const targetNode = document.getElementById(targetNodeId);

            if (devBox && targetNode) {
                // Seleccionamos la caja visual interna de la alerta de desviación
                const devBoxContent = devBox.lastElementChild;
                
                if (devBoxContent) {
                    const devRect = devBoxContent.getBoundingClientRect();
                    const targetRect = targetNode.getBoundingClientRect();

                    // Coordenada Inicial: Borde derecho de la desviación
                    const startX = devRect.right - canvasRect.left;
                    const startY = devRect.top + (devRect.height / 2) - canvasRect.top;

                    // Coordenada Final: Borde derecho del nodo de destino
                    const endX = targetRect.right - canvasRect.left;
                    const endY = targetRect.top + (targetRect.height / 2) - canvasRect.top;

                    const color = step.type === 'PCC' ? '#dc2626' : '#d97706';
                    const marker = step.type === 'PCC' ? 'url(#arrowhead-red)' : 'url(#arrowhead-amber)';

                    // Calculamos el "codo" de la flecha (40px a la derecha del punto más lejano)
                    const elbowX = Math.max(startX, endX) + 40; 
                    
                    // Trazamos la línea: -> Derecha, -> Arriba/Abajo, -> Izquierda
                    const path = `M ${startX},${startY} L ${elbowX},${startY} L ${elbowX},${endY} L ${endX + 5},${endY}`;

                    svgContent += `<path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-dasharray="5,5" marker-end="${marker}" class="animate-[fadeIn_1s_ease-in-out]" />`;
                }
            }
        }
    });

    svgLayer.innerHTML = svgContent;
};


// ==========================================
// 👁️ VISOR MODULAR CON AUTO-FLUJOGRAMA
// ==========================================
window.viewPOE = function (id, scrollToFlowchart = false) {
    const poe = state.poes.find((p) => p.id === id); 
    
    if (!poe) {
        return;
    }
    
    const btnExportWord = document.getElementById("btnExportWord"); 
    if (btnExportWord) {
        btnExportWord.onclick = () => window.exportPOEToWord(poe.id);
    }
    
    let stepsHTML = "";
    
    // Contenedor principal del Canvas del Flujograma
    let flowchartHTML = `
        <div id="flowchart-canvas" class="relative flex flex-col items-center py-6 font-sans w-full min-w-max">
            <div class="bg-blue-900 text-white px-8 py-3 rounded-[50px] font-black text-xs shadow-md border-4 border-blue-200 z-10 w-48 text-center uppercase tracking-widest shrink-0">
                INICIO
            </div>
    `;
    
    try {
        const arr = JSON.parse(poe.procedure);
        
        // ----------------------------------------------------
        // 1. CONSTRUIR AUTO-FLUJOGRAMA WEB
        // ----------------------------------------------------
        arr.forEach((step, i) => {
            // Parser del DOM para extraer texto limpio
            const tempDiv = document.createElement('div'); 
            tempDiv.innerHTML = step.desc;
            
            let stepTitle = `Paso ${i + 1}`;
            const h3 = tempDiv.querySelector('h3'); 
            const b = tempDiv.querySelector('b');
            
            if (h3) { 
                stepTitle = h3.innerText; 
                h3.remove(); 
            } else if (b) { 
                stepTitle = b.innerText; 
                b.remove(); 
            }
            
            const listItems = Array.from(tempDiv.querySelectorAll('li')).map(li => `• ${li.innerText}`);
            
            tempDiv.querySelectorAll('ul, ol').forEach(list => list.remove());
            
            const remainingText = tempDiv.innerText.trim().substring(0, 95) + (tempDiv.innerText.length > 95 ? "..." : "");
            
            let bodyHtml = "";
            if (listItems.length > 0) {
                bodyHtml = `
                    <ul class="text-[10px] text-left list-none mt-1.5 space-y-0.5 text-gray-700 dark:text-gray-300 w-full pl-2">
                        ${listItems.slice(0,3).map(li => `<li class="truncate" title="${li}">${li}</li>`).join('')}
                        ${listItems.length > 3 ? `<li class="text-gray-400 italic text-center">...</li>` : ''}
                    </ul>
                `;
            } else if (remainingText) {
                bodyHtml = `<p class="text-[10px] font-medium text-gray-700 dark:text-gray-300 leading-tight line-clamp-3 mt-1.5">${remainingText}</p>`;
            }

            // Flecha vertical de conexión entre pasos
            flowchartHTML += `
                <div class="flex flex-col items-center my-1">
                    <div class="w-1 h-8 bg-gray-400"></div>
                    <div class="w-3 h-3 border-b-2 border-r-2 border-gray-400 transform rotate-45 -mt-1.5"></div>
                </div>
            `;
            
            if (step.type === 'PCC' || step.type === 'PC') {
                const color = step.type === 'PCC' ? 'red' : 'amber'; 
                const label = step.type === 'PCC' ? 'PCC' : 'PC';
                const devActionText = step.devAction || "Acción Correctiva";
                
                // Traductor de ID de Ruta a Nombre de Paso
                let routeName = step.devRoute;
                if (step.devRoute === "FIN") {
                    routeName = "Fin / Desecho";
                } else if (step.devRoute) {
                    const targetIdx = arr.findIndex(x => String(x.id) === String(step.devRoute));
                    if (targetIdx > -1) {
                        routeName = `Paso ${targetIdx + 1}`;
                    }
                }
                
                const devRouteText = routeName || "Siguiente paso";
                const limitHtml = step.devLimit ? `<span class="font-bold text-[10px] text-${color}-700 dark:text-${color}-400 bg-white dark:bg-gray-800 rounded px-1 mb-1 border border-${color}-200">${step.devLimit}</span>` : '';

                flowchartHTML += `
                <div class="relative flex items-center z-10 shrink-0 w-[450px] justify-center">
                    <div id="node-${step.id}" class="relative w-48 h-48 flex items-center justify-center shrink-0">
                        <div class="absolute inset-0 bg-${color}-50 border-4 border-${color}-500 transform rotate-45 rounded-2xl shadow-md dark:bg-${color}-900/20 dark:border-${color}-600"></div>
                        <div class="relative z-10 text-center px-3 w-full flex flex-col items-center max-w-[140px]">
                            <span class="font-black text-${color}-700 dark:text-${color}-400 text-[13px] mb-1 drop-shadow-sm">${label}</span>
                            <span class="font-bold text-[11px] text-gray-900 dark:text-white leading-tight uppercase truncate w-full border-b border-${color}-200 dark:border-${color}-700 pb-1 mb-1" title="${stepTitle}">${stepTitle}</span>
                            ${limitHtml}
                            ${bodyHtml}
                        </div>
                    </div>
                    
                    <div id="dev-${step.id}" class="absolute left-[calc(50%+6rem)] flex items-center w-40 hidden sm:flex shrink-0">
                        <div class="w-10 h-1 bg-gray-400"></div>
                        <div class="w-3 h-3 border-t-2 border-r-2 border-gray-400 transform rotate-45 -ml-1.5 bg-white dark:bg-gray-800"></div>
                        
                        <div class="bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 p-2.5 rounded-lg flex flex-col gap-1 text-left ml-2 w-36 shadow-sm border-l-4 ${step.type === 'PCC' ? 'border-l-red-500' : 'border-l-yellow-500'}">
                            <span class="text-[9px] font-black ${step.type === 'PCC' ? 'text-red-600 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-400'} uppercase">⚠️ NO CONFORME:</span>
                            <span class="text-[10px] font-bold text-gray-700 dark:text-gray-300 leading-tight line-clamp-2" title="${devActionText}">⚡ ${devActionText}</span>
                            <span class="text-[10px] font-bold text-gray-700 dark:text-gray-300 leading-tight line-clamp-1" title="${devRouteText}">🔄 ${devRouteText}</span>
                        </div>
                    </div>
                </div>`;
                
            } else if (step.type === 'SEG') {
                flowchartHTML += `
                <div id="node-${step.id}" class="relative w-64 min-h-[5.5rem] flex items-center justify-center z-10 shrink-0">
                    <div class="absolute inset-0 bg-green-50 border-2 border-green-500 skew-x-[-15deg] rounded-xl shadow-md dark:bg-green-900/20 dark:border-green-600"></div>
                    <div class="relative z-10 text-center px-6 py-3 w-full flex flex-col items-center">
                        <span class="font-black text-green-700 dark:text-green-400 text-[11px] mb-0.5 block uppercase tracking-wider">Seguridad</span>
                        <span class="font-bold text-[11px] text-gray-900 dark:text-white block uppercase truncate w-full border-b border-green-200 dark:border-green-700 pb-1 mb-1" title="${stepTitle}">${stepTitle}</span>
                        ${bodyHtml}
                    </div>
                </div>`;
                
            } else {
                flowchartHTML += `
                <div id="node-${step.id}" class="bg-white dark:bg-gray-800 border-2 border-blue-600 dark:border-blue-500 rounded-xl p-4 w-64 text-center shadow-md z-10 shrink-0 flex flex-col items-center">
                    <span class="font-black text-blue-800 dark:text-blue-400 text-[11px] mb-1 block uppercase tracking-wider">Paso ${i+1}</span>
                    <span class="font-bold text-[11px] text-gray-900 dark:text-white block uppercase truncate w-full border-b border-gray-200 dark:border-gray-700 pb-1 mb-1" title="${stepTitle}">${stepTitle}</span>
                    ${bodyHtml}
                </div>`;
            }
        });
        
        // Cierre del Flujograma y Capa SVG
        flowchartHTML += `
                <div class="flex flex-col items-center my-1">
                    <div class="w-1 h-8 bg-gray-400"></div>
                    <div class="w-3 h-3 border-b-2 border-r-2 border-gray-400 transform rotate-45 -mt-1.5"></div>
                </div>
                <div id="node-fin" class="rounded-full bg-gray-800 text-white px-8 py-3 font-black shadow-md border-4 border-gray-300 z-10 w-48 text-center uppercase tracking-widest text-xs shrink-0">
                    FIN
                </div>
                
                <svg id="svg-layer" class="absolute inset-0 w-full h-full pointer-events-none z-0"></svg>
            </div>
        `;

        // ----------------------------------------------------
        // 2. CONSTRUIR DETALLE DE PASOS (ACORDEÓN WEB)
        // ----------------------------------------------------
        stepsHTML = arr.map((step, i) => {
            const bColor = step.type === "PCC" ? "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800" : step.type === "PC" ? "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800" : "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700";
            const img = step.image ? `<img src="${step.image}" class="mt-4 max-h-64 object-cover rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">` : "";
            const truncDesc = step.desc.replace(/<[^>]*>?/gm, '').substring(0, 50) + "...";
            
            let routeName = step.devRoute;
            if (step.devRoute === "FIN") {
                routeName = "Fin / Desecho";
            } else if (step.devRoute) { 
                const targetIdx = arr.findIndex(x => String(x.id) === String(step.devRoute)); 
                if (targetIdx > -1) routeName = `Paso ${targetIdx + 1}`; 
            }

            let devHtml = '';
            if ((step.type === 'PC' || step.type === 'PCC') && (step.devAction || step.devRoute)) {
                devHtml = `
                    <div class="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/50 rounded-xl text-xs text-red-900 dark:text-red-200 flex flex-col gap-1.5">
                        <span class="font-black uppercase tracking-widest text-[10px] text-red-600 dark:text-red-400">Medidas ante Desviación</span>
                        ${step.devLimit ? `<span><strong>🎯 Límite:</strong> ${step.devLimit}</span>` : ''}
                        ${step.devAction ? `<span><strong>⚡ Acción:</strong> ${step.devAction}</span>` : ''}
                        ${routeName ? `<span><strong>🔄 Ruta:</strong> ${routeName}</span>` : ''}
                    </div>
                `;
            }
            
            return `
            <details class="group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm mb-3" open>
                <summary class="flex items-center justify-between p-4 font-bold cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition rounded-xl outline-none select-none">
                    <div class="flex items-center gap-4 w-full pr-4">
                        <div class="w-8 h-8 rounded-full bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400 font-black flex items-center justify-center shrink-0 text-sm border border-red-100 dark:border-red-900/50">${i + 1}</div>
                        <span class="text-[10px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${bColor} shrink-0">${step.type}</span>
                        <span class="text-sm text-gray-800 dark:text-gray-200 truncate hidden sm:block">${truncDesc}</span>
                    </div>
                    <svg class="w-5 h-5 text-gray-400 group-open:rotate-180 transition-transform shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                </summary>
                <div class="p-4 pt-0 md:p-6 md:pt-0 ml-2 md:ml-12 border-t border-transparent group-open:border-gray-100 dark:group-open:border-gray-700 mt-2">
                    <div class="text-sm font-medium text-gray-800 dark:text-gray-200 leading-relaxed rich-text-content">${step.desc}</div>
                    ${devHtml}
                    ${img}
                </div>
            </details>`;
          }).join("");
          
    } catch (e) { 
        stepsHTML = `<div class="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700"><p class="text-base font-medium text-gray-800 dark:text-gray-200 leading-relaxed">${poe.procedure}</p></div>`; 
        flowchartHTML = `<p class="text-center text-gray-500 my-8">Flujograma no disponible.</p>`;
    }

    const catObj = state.areas.find((c) => c.areaAbbr === poe.subCategory); 
    const catName = catObj ? catObj.areaName : poe.subCategory;
    const statusColor = poe.status === "ACT" || poe.status === "Activo" ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800" : "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800";
    const statusText = poe.status === "ACT" ? "ACTIVO" : "EN REVISIÓN";

    const vContent = document.getElementById("viewContent");
    if (vContent) {
        vContent.innerHTML = `
        <div class="bg-white dark:bg-gray-800 p-6 md:p-10 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-xl mb-8">
            
            <div class="flex flex-col md:flex-row justify-between items-start border-b-2 border-gray-100 dark:border-gray-700 pb-8 mb-8 gap-6">
                <div class="w-full md:w-2/3">
                    <span class="inline-block px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold text-xs rounded-lg uppercase tracking-wider mb-3 border border-gray-200 dark:border-gray-600">${catName}</span>
                    <h2 class="text-3xl md:text-4xl font-black text-gray-900 dark:text-white uppercase tracking-tight leading-tight">${poe.title}</h2>
                </div>
                <div class="md:text-right flex flex-col md:items-end bg-gray-50 dark:bg-gray-900/50 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 w-full md:w-1/3">
                    <p class="text-2xl font-black font-mono text-red-700 dark:text-red-400 tracking-wider">${poe.code}</p>
                    <div class="flex items-center md:justify-end gap-3 mt-2 text-sm font-bold text-gray-500 dark:text-gray-400">
                        <span>v${poe.version}</span><span>•</span><span>${new Date(poe.date).toLocaleDateString('es-ES', {day: 'numeric', month: 'long', year: 'numeric'})}</span>
                    </div>
                    <div class="mt-4 flex flex-col items-end gap-2">
                        <span class="inline-flex items-center px-3 py-1 rounded-md text-xs font-black uppercase tracking-widest border ${statusColor}">${statusText}</span>
                        <div class="text-xs text-gray-500 dark:text-gray-400 font-medium mt-2">✍️ Creado por: <span class="font-bold text-gray-800 dark:text-gray-200">${poe.author || 'S/N'}</span></div>
                    </div>
                </div>
            </div>

            <details class="group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm mb-4" open>
                <summary class="flex items-center justify-between p-5 font-black cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition rounded-2xl outline-none select-none">
                    <div class="flex items-center gap-3 text-gray-800 dark:text-gray-200 uppercase tracking-widest text-sm"><span class="text-lg">📘</span> 1. Contexto Operativo</div>
                    <svg class="w-5 h-5 text-gray-400 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                </summary>
                <div class="p-6 pt-0 border-t border-gray-100 dark:border-gray-700 mt-2">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div><h4 class="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">🎯 Objetivo General</h4><div class="text-sm text-gray-700 dark:text-gray-300 font-medium leading-relaxed bg-gray-50 dark:bg-gray-900/50 p-5 rounded-xl border border-gray-100 dark:border-gray-700 h-full rich-text-content">${poe.objective || "No especificado"}</div></div>
                        <div><h4 class="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">📏 Alcance Operativo</h4><div class="text-sm text-gray-700 dark:text-gray-300 font-medium leading-relaxed bg-gray-50 dark:bg-gray-900/50 p-5 rounded-xl border border-gray-100 dark:border-gray-700 h-full rich-text-content">${poe.scope || "No especificado"}</div></div>
                        <div><h4 class="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">👤 Responsabilidades</h4><div class="text-sm text-gray-700 dark:text-gray-300 font-medium leading-relaxed bg-gray-50 dark:bg-gray-900/50 p-5 rounded-xl border border-gray-100 dark:border-gray-700 h-full rich-text-content">${poe.responsibles || "No especificadas"}</div></div>
                        <div><h4 class="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">📝 Definiciones</h4><div class="text-sm text-gray-700 dark:text-gray-300 font-medium leading-relaxed bg-gray-50 dark:bg-gray-900/50 p-5 rounded-xl border border-gray-100 dark:border-gray-700 h-full rich-text-content">${poe.definitions || "Ninguna"}</div></div>
                        <div class="md:col-span-2"><h4 class="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">🛠️ Equipos, Materiales y EPPs</h4><div class="text-sm text-gray-700 dark:text-gray-300 font-medium leading-relaxed bg-gray-50 dark:bg-gray-900/50 p-5 rounded-xl border border-gray-100 dark:border-gray-700 h-full rich-text-content">${poe.materials || "No especificados"}</div></div>
                    </div>
                </div>
            </details>

            <details class="group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm mb-6" open>
                <summary class="flex items-center justify-between p-5 font-black cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition rounded-2xl outline-none select-none">
                    <div class="flex items-center gap-3 text-gray-800 dark:text-gray-200 uppercase tracking-widest text-sm"><span class="text-lg">🛡️</span> 2. Control y Referencias</div>
                    <svg class="w-5 h-5 text-gray-400 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                </summary>
                <div class="p-6 pt-0 border-t border-gray-100 dark:border-gray-700 mt-2">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div><h4 class="text-xs font-black text-red-700 dark:text-red-400 uppercase tracking-widest mb-2">⏱️ Frecuencia / Monitoreo</h4><div class="text-sm text-gray-900 dark:text-gray-100 font-bold leading-relaxed bg-red-50 dark:bg-red-900/20 p-5 rounded-xl border border-red-100 dark:border-red-900/50 h-full rich-text-content">${poe.monitoring || poe.frequency || "No especificada"}</div></div>
                        <div><h4 class="text-xs font-black text-red-700 dark:text-red-400 uppercase tracking-widest mb-2">⚠️ Acciones Correctivas</h4><div class="text-sm text-gray-900 dark:text-gray-100 font-bold leading-relaxed bg-red-50 dark:bg-red-900/20 p-5 rounded-xl border border-red-100 dark:border-red-900/50 h-full rich-text-content">${poe.corrective_actions || "No especificadas"}</div></div>
                        <div><h4 class="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">📎 Registros Asociados</h4><div class="text-sm text-gray-700 dark:text-gray-300 font-medium leading-relaxed bg-gray-50 dark:bg-gray-900/50 p-5 rounded-xl border border-gray-100 dark:border-gray-700 h-full rich-text-content">${poe.records || "Ninguno"}</div></div>
                        <div><h4 class="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">📚 Referencias / Anexos</h4><div class="text-sm text-gray-700 dark:text-gray-300 font-medium leading-relaxed bg-gray-50 dark:bg-gray-900/50 p-5 rounded-xl border border-gray-100 dark:border-gray-700 h-full rich-text-content">${poe.references || "Ninguna"}</div></div>
                    </div>
                </div>
            </details>

            <details id="acc-flowchart" class="group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm mb-6" ${scrollToFlowchart ? 'open' : ''}>
                <summary class="flex items-center justify-between p-5 font-black cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition rounded-2xl outline-none select-none">
                    <div class="flex items-center gap-3 text-gray-800 dark:text-gray-200 uppercase tracking-widest text-sm"><span class="text-lg">🗺️</span> 3. Flujograma del Proceso</div>
                    <svg class="w-5 h-5 text-gray-400 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                </summary>
                <div class="border-t border-gray-100 dark:border-gray-700 mt-2 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9IiNlNWU3ZWIiLz48L3N2Zz4=')] dark:bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9IiMzNzQxNTEiLz48L3N2Zz4=')] rounded-b-2xl overflow-auto max-h-[600px] custom-scrollbar shadow-inner relative">
                    <div class="min-w-max px-20 py-8 flex justify-center">
                        ${flowchartHTML}
                    </div>
                </div>
            </details>

            <div>
                <h4 class="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest mb-4 border-b-2 border-gray-100 dark:border-gray-700 pb-3 flex items-center gap-2"><span class="text-lg">⚙️</span> 4. Desarrollo Detallado</h4>
                <div class="space-y-2 pl-2 md:pl-4">
                    ${stepsHTML}
                </div>
            </div>

        </div>`;
    }
  
    const viewTitleEl = document.getElementById("viewTitle");
    if (viewTitleEl) {
        viewTitleEl.textContent = `${poe.code} - ${poe.title}`;
        viewTitleEl.title = `${poe.code} - ${poe.title}`;
    }

    const m = document.getElementById("viewModal"); 
    if (m) { 
        m.classList.remove("hidden"); 
        m.classList.add("flex"); 
        
        // 🧠 Disparamos el Motor SVG
        setTimeout(() => {
            if (poe.procedure) {
                try { 
                    window.drawFlowchartArrows(JSON.parse(poe.procedure)); 
                } catch(e) {}
            }
            if (scrollToFlowchart) {
                const el = document.getElementById("acc-flowchart");
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 300);
    }
};

window.exportPOEToWord = function (id) {
    const poe = state.poes.find((p) => p.id === id); 
    if (!poe) return;
    
    let stepsHTML = "";
    let flowWord = "";
  
    try {
        const arr = JSON.parse(poe.procedure);
        
        // 1. FLUJOGRAMA PARA MS WORD
        flowWord = `<div style="text-align: center; margin: 30px 0; font-family: Arial, sans-serif;">
            <div style="display: inline-block; background-color: #1e3a5f; color: #fff; padding: 8px 30px; border-radius: 20px; font-weight: bold; font-size: 13px; margin-bottom: 5px;">INICIO DEL PROCESO</div><br>`;
        
        arr.forEach((s, i) => {
            let fCol = "#888888"; let fBg = "#ffffff"; let fLbl = "";
            let devHtmlWord = "";
            if (s.type === 'PCC') { fCol = "#dc2626"; fBg = "#fef2f2"; fLbl = "<strong style='color:#dc2626; font-size: 11px;'>🛑 PUNTO CRÍTICO DE CONTROL</strong><br>"; }
            else if (s.type === 'PC') { fCol = "#d97706"; fBg = "#fffbeb"; fLbl = "<strong style='color:#d97706; font-size: 11px;'>⚠️ PUNTO DE CONTROL</strong><br>"; }
            else if (s.type === 'SEG') { fCol = "#16a34a"; fBg = "#f0fff4"; fLbl = "<strong style='color:#16a34a; font-size: 11px;'>🛡️ SEGURIDAD</strong><br>"; }
            
            if ((s.type === 'PC' || s.type === 'PCC') && (s.devAction || s.devRoute)) {
                let routeName = s.devRoute;
                if (s.devRoute === "FIN") {
                    routeName = "Fin / Desecho";
                } else if (s.devRoute) {
                    const targetIdx = arr.findIndex(x => String(x.id) === String(s.devRoute));
                    if (targetIdx > -1) routeName = `Paso ${targetIdx + 1}`;
                }
                
                devHtmlWord = `<br><div style="margin-top: 8px; font-size: 10px; color: #991b1b; background-color: #fee2e2; padding: 5px; border-radius: 4px; text-align: left;">
                    <strong>Medidas ante Desviación:</strong><br>
                    ${s.devLimit ? `• Límite: ${s.devLimit}<br>` : ''}
                    ${s.devAction ? `• Acción: ${s.devAction}<br>` : ''}
                    ${routeName ? `• Ruta: ${routeName}` : ''}
                </div>`;
            }

            const tempDiv = document.createElement('div'); tempDiv.innerHTML = s.desc;
            let stepTitle = `Paso ${i + 1}`;
            const h3 = tempDiv.querySelector('h3'); const b = tempDiv.querySelector('b');
            if (h3) { stepTitle = h3.innerText; h3.remove(); } else if (b) { stepTitle = b.innerText; b.remove(); }
            
            const listItems = Array.from(tempDiv.querySelectorAll('li')).map(li => `• ${li.innerText}`);
            tempDiv.querySelectorAll('ul, ol').forEach(list => list.remove());
            const remainingText = tempDiv.innerText.trim().substring(0, 90) + (tempDiv.innerText.length > 90 ? "..." : "");
            
            let bodyText = "";
            if (listItems.length > 0) bodyText = listItems.slice(0,4).join('<br>');
            else if (remainingText) bodyText = remainingText;
            
            flowWord += `
            <div style="margin: 0 auto; width: 2px; height: 25px; background-color: #555;"></div>
            <div style="margin: 0 auto; width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 6px solid #555;"></div>
            <div style="display: inline-block; border: 2px solid ${fCol}; background-color: ${fBg}; padding: 12px; width: 280px; text-align: center; font-size: 12px; margin-top: 3px; border-radius: 8px; box-shadow: 2px 2px 5px #ddd;">
                ${fLbl}
                <strong style="display: block; margin-bottom: 5px; border-bottom: 1px solid #ccc; padding-bottom: 5px; color: #111;">${stepTitle}</strong>
                <div style="font-size: 11px; color: #444; text-align: left; line-height: 1.4;">${bodyText}</div>
                ${devHtmlWord}
            </div><br>`;
        });
        
        flowWord += `
        <div style="margin: 0 auto; width: 2px; height: 25px; background-color: #555;"></div>
        <div style="margin: 0 auto; width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 6px solid #555;"></div>
        <div style="display: inline-block; background-color: #1e3a5f; color: #fff; padding: 8px 30px; border-radius: 20px; font-weight: bold; font-size: 13px; margin-top: 3px;">FIN DEL PROCESO</div></div>`;

        // 2. DESARROLLO DEL PROCEDIMIENTO
        stepsHTML = arr.map((s, i) => {
            let routeName = s.devRoute;
            if (s.devRoute === "FIN") {
                routeName = "Fin / Desecho";
            } else if (s.devRoute) {
                const targetIdx = arr.findIndex(x => String(x.id) === String(s.devRoute));
                if (targetIdx > -1) routeName = `Paso ${targetIdx + 1}`;
            }

            const devHtmlDoc = (s.type === 'PC' || s.type === 'PCC') && (s.devAction || s.devRoute) ? 
                `<div style="margin-top: 10px; padding: 10px; background-color: #fef2f2; border: 1px solid #fecaca; font-size: 12px; color: #991b1b;">
                    <strong>MEDIDAS ANTE DESVIACIÓN:</strong><br>
                    ${s.devLimit ? `<strong>Límite:</strong> ${s.devLimit}<br>` : ''}
                    ${s.devAction ? `<strong>Acción Correctiva:</strong> ${s.devAction}<br>` : ''}
                    ${routeName ? `<strong>Direccionamiento:</strong> ${routeName}` : ''}
                </div>` : '';

            return `<div style="margin-bottom: 25px;"><p><strong>Paso ${i + 1}</strong> <span style="color: #666; font-size: 12px;">[${s.type}]</span></p><div style="margin-top: 5px; line-height: 1.5;">${s.desc}</div>${devHtmlDoc}${s.image ? `<img src="${s.image}" width="400" style="border: 1px solid #ccc; margin-top: 10px; border-radius: 8px;">` : ""}</div>`;
        }).join("");
    } catch (e) { 
        stepsHTML = `<p>${poe.procedure}</p>`; 
    }

    const catObj = state.areas.find((c) => c.areaAbbr === poe.subCategory); 
    const catName = catObj ? catObj.areaName : poe.subCategory;
    const isPOES = poe.code.startsWith('POES'); 
    const docTitle = isPOES ? 'Procedimiento Operativo Estandarizado de Saneamiento' : 'Procedimiento Operativo Estandarizado';

    // 🧠 INYECCIÓN DE SALTOS DE PÁGINA: <br clear=all style='mso-special-character:line-break;page-break-before:always'>
    const htmlStr = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>${poe.code}</title><style>body { font-family: 'Arial'; color: #000; } table { width: 100%; border-collapse: collapse; margin-bottom: 20px; } th, td { border: 1px solid #000; padding: 8px; text-align: left; vertical-align: top; } th { background-color: #f2f2f2; width: 25%; } h1 { color: #1e3a5f; font-size: 24px; text-transform: uppercase; text-align: center; border-bottom: 2px solid #1e3a5f; padding-bottom: 10px; margin-bottom: 20px; } h2 { color: #2d5a87; font-size: 16px; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-top: 25px; } ul { list-style-type: disc; margin-left: 20px; margin-bottom: 5px; } ol { list-style-type: decimal; margin-left: 20px; margin-bottom: 5px; } a { color: #0000EE; text-decoration: underline; } h3 { color: #1e3a5f; font-size: 14px; margin-top: 15px; margin-bottom: 5px; text-transform: uppercase; }</style></head><body>
        <h1>La Genovesa Agroindustrias S.A.<br><span style="font-size:16px;">${docTitle}</span></h1>
        <table><tr><th>Código:</th><td>${poe.code}</td><th>Versión:</th><td>v${poe.version} - ${poe.status}</td></tr><tr><th>Título:</th><td colspan="3"><strong>${poe.title}</strong></td></tr><tr><th>Área:</th><td>${catName}</td><th>Fecha:</th><td>${new Date(poe.date).toLocaleDateString()}</td></tr></table>
        <h2>1. Contexto Operativo</h2><p><strong>Objetivo:</strong></p> ${poe.objective || "N/A"}<p><strong>Alcance:</strong></p> ${poe.scope || "N/A"}<p><strong>Responsabilidades:</strong></p> ${poe.responsibles || "N/A"}
        <h2>2. Control y Recursos</h2><p><strong>Frecuencia:</strong></p> ${poe.monitoring || poe.frequency || "N/A"}<p><strong>Acciones Correctivas:</strong></p> ${poe.corrective_actions || "N/A"}<p><strong>Equipos y Materiales:</strong></p> ${poe.materials || "N/A"}<p><strong>Definiciones:</strong></p> ${poe.definitions || "N/A"}<p><strong>Registros:</strong></p> ${poe.records || "N/A"} | ${poe.references || ""}
        
        <br clear=all style='mso-special-character:line-break;page-break-before:always'>
        <h2>3. Flujograma del Proceso</h2>${flowWord}
        
        <br clear=all style='mso-special-character:line-break;page-break-before:always'>
        <h2>4. Desarrollo Detallado</h2><div style="border: 1px solid #000; padding: 15px;">${stepsHTML}</div>
        
        <table style="border: none; margin-top: 50px;"><tr style="border: none;">
        <td style="border: none; text-align: center; width: 50%;">_________________________<br><strong>Elaborado/Editado por:</strong><br>${poe.lastEditor || poe.author || 'Responsable de Área'}</td>
        <td style="border: none; text-align: center; width: 50%;">_________________________<br><strong>Aprobación Calidad</strong></td></tr></table></body></html>`;

    const blob = new Blob(["\ufeff", htmlStr], { type: "application/msword" }); 
    const a = document.createElement("a"); 
    a.href = URL.createObjectURL(blob); 
    a.download = `${poe.code}_${poe.title.replace(/[^a-z0-9]/gi, "_")}.doc`; 
    document.body.appendChild(a); 
    a.click(); 
    document.body.removeChild(a);
};

// ==========================================
// BUILDER DE PASOS WYSIWYG
// ==========================================
window.updateFileText = function (input) { 
    const d = document.getElementById("fileNameDisplay"); 
    if (!d) return; 
    if (input.files.length > 0) { 
        d.textContent = "📸 " + input.files[0].name; 
        d.classList.add("text-blue-600", "font-bold"); 
    } else { 
        d.textContent = "Cámara o Archivo"; 
        d.classList.remove("text-blue-600", "font-bold"); 
    } 
};

// 🧠 NUEVA FUNCIÓN: Actualiza el <select> de rutas con los pasos existentes
window.updateRouteSelect = function(selectedId = "") {
    const routeSelect = document.getElementById("stepDeviationRoute");
    if (!routeSelect) return;
    
    let options = '<option value="">Seleccione destino...</option>';
    state.form.advancedSteps.forEach((step, index) => {
        options += `<option value="${step.id}">Volver al Paso ${index + 1} - [${step.type}]</option>`;
    });
    options += '<option value="FIN" class="font-bold text-red-600">Fin del Proceso / Desecho</option>';
    
    routeSelect.innerHTML = options;
    if (selectedId) routeSelect.value = selectedId;
};

window.toggleDeviationFields = function() {
    const type = document.getElementById("stepType").value;
    const container = document.getElementById("deviationContainer");
    
    if (type === "PC" || type === "PCC") {
        container.classList.remove("hidden");
        container.classList.add("grid");
        window.updateRouteSelect(); // Cargamos los pasos en el select
    } else {
        container.classList.add("hidden");
        container.classList.remove("grid");
        document.getElementById("stepDeviationLimit").value = "";
        document.getElementById("stepDeviationAction").value = "";
        document.getElementById("stepDeviationRoute").value = "";
    }
};

window.addAdvancedStep = async function () {
    const desc = getFieldValue("stepDesc"); 
    if (!desc || desc === "<br>") {
        return await window.sysAlert("Describa el paso operativo.", "warning");
    }
    
    const type = document.getElementById("stepType") ? document.getElementById("stepType").value : "INFO";
    const devLimit = document.getElementById("stepDeviationLimit")?.value.trim() || "";
    const devAction = document.getElementById("stepDeviationAction")?.value.trim() || "";
    const devRoute = document.getElementById("stepDeviationRoute")?.value.trim() || "";

    // 🛡️ Validación Estricta Normativa GFSI
    if ((type === "PC" || type === "PCC") && (!devLimit || !devAction || !devRoute)) {
        return await window.sysAlert("Los Puntos Críticos (PCC) o de Control (PC) requieren definir:\n1. Límite Crítico\n2. Acción Correctiva\n3. Direccionamiento", "warning");
    }

    const processStep = (imgB64) => { 
        if (state.form.editingStepId) { 
            const idx = state.form.advancedSteps.findIndex(s => s.id === state.form.editingStepId); 
            if (idx > -1) { 
                state.form.advancedSteps[idx].desc = desc; 
                state.form.advancedSteps[idx].type = type; 
                state.form.advancedSteps[idx].devLimit = devLimit; 
                state.form.advancedSteps[idx].devAction = devAction; 
                state.form.advancedSteps[idx].devRoute = devRoute; 
                if (imgB64 !== undefined) {
                    state.form.advancedSteps[idx].image = imgB64; 
                }
            } 
        } else { 
            state.form.advancedSteps.push({ 
                id: Date.now(), 
                desc, type, devLimit, devAction, devRoute, 
                image: imgB64 || null 
            }); 
        } 
        _resetStepUI(); 
    };

    const fileInput = document.getElementById("stepImage");
    if (fileInput && fileInput.files.length > 0) { 
        const reader = new FileReader(); 
        reader.onload = (e) => { 
            const img = new Image(); 
            img.onload = () => { 
                const cvs = document.createElement("canvas"); 
                let w = img.width, h = img.height; 
                if (w > 800) { 
                    h = Math.round((h * 800) / w); w = 800; 
                } 
                cvs.width = w; 
                cvs.height = h; 
                cvs.getContext("2d").drawImage(img, 0, 0, w, h); 
                processStep(cvs.toDataURL("image/jpeg", 0.7)); 
            }; 
            img.src = e.target.result; 
        }; 
        reader.readAsDataURL(fileInput.files[0]); 
    } else { 
        processStep(undefined); 
    }
};

function _resetStepUI() { 
    setFieldValue("stepDesc", ""); 
    const f = document.getElementById("stepImage"); 
    if (f) { f.value = ""; window.updateFileText(f); } 
    
    document.getElementById("stepType").value = "INFO";
    document.getElementById("stepDeviationLimit").value = "";
    document.getElementById("stepDeviationAction").value = "";
    document.getElementById("stepDeviationRoute").value = "";
    window.toggleDeviationFields();

    state.form.editingStepId = null; 
    const btn = document.getElementById("btnAddStep"); 
    if(btn) { 
        btn.innerHTML = `Añadir Paso`; 
        btn.classList.replace("bg-green-600", "bg-blue-600"); 
        btn.classList.replace("hover:bg-green-800", "hover:bg-blue-800"); 
    } 
    window.renderAdvancedSteps(); 
}

window.removeAdvancedStep = function (id) { 
    state.form.advancedSteps = state.form.advancedSteps.filter((s) => s.id !== id); 
    window.renderAdvancedSteps(); 
};

window.editStep = function(id) { 
    const s = state.form.advancedSteps.find(s => s.id === id); 
    if (!s) return; 
    
    setFieldValue("stepDesc", s.desc); 
    document.getElementById("stepType").value = s.type; 
    
    document.getElementById("stepDeviationLimit").value = s.devLimit || "";
    document.getElementById("stepDeviationAction").value = s.devAction || "";
    window.toggleDeviationFields(); 
    window.updateRouteSelect(s.devRoute);

    state.form.editingStepId = id; 
    const btn = document.getElementById("btnAddStep"); 
    if(btn) { 
        btn.innerHTML = `Actualizar Paso`; 
        btn.classList.replace("bg-blue-600", "bg-green-600"); 
        btn.classList.replace("hover:bg-blue-800", "hover:bg-green-800"); 
    } 
    document.getElementById("stepDesc").focus(); 
};

window.moveStep = function(index, dir) { 
    if (dir === 'up' && index > 0) { 
        const temp = state.form.advancedSteps[index]; 
        state.form.advancedSteps[index] = state.form.advancedSteps[index - 1]; 
        state.form.advancedSteps[index - 1] = temp; 
    } else if (dir === 'down' && index < state.form.advancedSteps.length - 1) { 
        const temp = state.form.advancedSteps[index]; 
        state.form.advancedSteps[index] = state.form.advancedSteps[index + 1]; 
        state.form.advancedSteps[index + 1] = temp; 
    } 
    window.renderAdvancedSteps(); 
};

window.loadPoesTemplate = async function() {
    if (state.form.advancedSteps.length > 0) { 
        const ok = await window.sysConfirm("Se reemplazarán los pasos actuales. ¿Cargar plantilla?"); 
        if (!ok) return; 
    }
    const t = Date.now();
    // Vinculamos las rutas con los IDs reales
    const id1 = t+1, id2 = t+2, id3 = t+3, id4 = t+4, id5 = t+5, id6 = t+6, id7 = t+7;
    
    state.form.advancedSteps = [ 
        { id: id1, type: 'INFO', desc: '<b>PASO 1: Limpieza en Seco.</b> Retirar restos gruesos, desarmar y proteger componentes eléctricos.', image: null }, 
        { id: id2, type: 'INFO', desc: '<b>PASO 2: Pre-enjuague.</b> Aplicar agua a presión para remover suciedad suelta.', image: null }, 
        { id: id3, type: 'PC', desc: '<b>PASO 3: Lavado (Acción Mecánica).</b> Aplicar detergente y fregar con escobillas.', devLimit: 'Superficie sin grasa visible', devAction: 'Volver a lavar', devRoute: String(id3), image: null }, 
        { id: id4, type: 'INFO', desc: '<b>PASO 4: Enjuague Final.</b> Aplicar agua potable hasta eliminar químicos.', image: null }, 
        { id: id5, type: 'PC', desc: '<b>PASO 5: Inspección.</b> Verificación visual minuciosa.', devLimit: 'Ausencia total de residuos', devAction: 'Re-lavado localizado', devRoute: String(id3), image: null }, 
        { id: id6, type: 'PCC', desc: '<b>PASO 6: Sanitización.</b> Aplicar desinfectante respetando PPM y tiempo.', devLimit: '150-200 ppm, 10 min', devAction: 'Ajustar dosis PPM', devRoute: String(id6), image: null }, 
        { id: id7, type: 'INFO', desc: '<b>PASO 7: Secado y Montaje.</b> Retirar humedad y re-ensamblar.', image: null } 
    ];
    window.renderAdvancedSteps();
};

window.renderAdvancedSteps = function () {
    const container = document.getElementById("advancedStepsList"); 
    if (!container) return;
    
    if (state.form.advancedSteps.length === 0) { 
        container.innerHTML = `<div class="py-6 text-center text-gray-400 text-sm">Historial vacío.</div>`; 
        return; 
    }
    
    container.innerHTML = state.form.advancedSteps.map((s, i) => {
        const bColor = s.type === "PCC" ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" : s.type === "PC" ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300";
        const imgHTML = s.image ? `<img src="${s.image}" class="mt-2 h-16 object-cover rounded border dark:border-gray-600">` : "";
        
        // 🧠 Traductor de ID a Nombre de Paso para la vista previa
        let routeName = s.devRoute;
        if (s.devRoute === "FIN") {
            routeName = "Fin / Desecho";
        } else if (s.devRoute) {
            const targetIdx = state.form.advancedSteps.findIndex(x => String(x.id) === String(s.devRoute));
            if (targetIdx > -1) routeName = `Paso ${targetIdx + 1}`;
        }
        
        const devHtml = (s.type === 'PC' || s.type === 'PCC') ? 
            `<div class="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/50 rounded-lg text-[10px] text-red-800 dark:text-red-300 flex flex-col gap-0.5">
                ${s.devLimit ? `<span><strong>🎯 Límite:</strong> ${s.devLimit}</span>` : ''}
                ${s.devAction ? `<span><strong>⚡ Acción:</strong> ${s.devAction}</span>` : ''}
                ${routeName ? `<span><strong>🔄 Ruta:</strong> ${routeName}</span>` : ''}
            </div>` : '';

        return `
        <div class="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl border border-gray-200 dark:border-gray-700 mb-2 flex gap-3 group">
            <div class="flex flex-col items-center gap-1 shrink-0">
                <div class="w-6 h-6 rounded-full bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 font-bold flex items-center justify-center text-xs border dark:border-gray-600">${i + 1}</div>
                <div class="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100">
                    ${i > 0 ? `<button type="button" onclick="window.moveStep(${i}, 'up')" class="bg-white dark:bg-gray-700 border dark:border-gray-600 rounded px-1 text-[10px]">⬆️</button>` : ''}
                    ${i < state.form.advancedSteps.length - 1 ? `<button type="button" onclick="window.moveStep(${i}, 'down')" class="bg-white dark:bg-gray-700 border dark:border-gray-600 rounded px-1 text-[10px]">⬇️</button>` : ''}
                </div>
            </div>
            <div class="flex-grow">
                <div class="flex justify-between items-center mb-1">
                    <span class="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${bColor}">${s.type}</span>
                    <div class="flex gap-2 opacity-0 group-hover:opacity-100">
                        <button type="button" onclick="window.editStep(${s.id})" class="text-blue-600 dark:text-blue-400 font-bold text-[10px] uppercase">Editar</button>
                        <button type="button" onclick="window.removeAdvancedStep(${s.id})" class="text-red-500 dark:text-red-400 font-bold">✖</button>
                    </div>
                </div>
                <div class="text-sm font-medium leading-relaxed rich-text-content">${s.desc}</div>
                ${devHtml}
                ${imgHTML}
            </div>
        </div>`;
    }).join("");
};

// ==========================================
// RED Y SINCRONIZACIÓN
// ==========================================
window.updateNet = function (status) {
    const ind = document.getElementById("network-indicator"); 
    const txt = document.getElementById("network-text"); 
    if (!ind || !txt) return;
    
    if (status === "online") { 
        ind.className = "w-2.5 h-2.5 rounded-full bg-green-500 shadow-sm"; 
        txt.textContent = "ONLINE"; 
    } else if (status === "sync") { 
        ind.className = "w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse"; 
        txt.textContent = "SYNC..."; 
    } else { 
        ind.className = "w-2.5 h-2.5 rounded-full bg-red-500 shadow-sm"; 
        txt.textContent = "OFFLINE"; 
    }
};

window.pushSync = async function () {
    if (!navigator.onLine) { 
        window.updateNet("offline"); 
        return; 
    }
    const q = await POEDB.getAll("sync_queue"); 
    if (q.length === 0) { 
        window.updateNet("online"); 
        return; 
    }
    window.updateNet("sync");
    
    for (let t of q) {
        try { 
            const res = await fetch(GAS_ENDPOINT, { 
                method: "POST", 
                body: JSON.stringify(t.payload) 
            }); 
            const r = await res.json(); 
            if (r.status === "success") { 
                t.payload._syncStatus = "synced"; 
                await POEDB.save("poes", t.payload); 
                await POEDB.delete("sync_queue", t.id); 
            } 
        } catch (e) { 
            break; 
        }
    }
    window.updateNet(navigator.onLine ? "online" : "offline"); 
    window.refreshUI();
};

window.pullSync = async function () {
    if (!navigator.onLine) return;
    try {
        const ts = Date.now(); 
        const fetchOpts = { cache: "no-store" };
        
        const rA = await fetch(GAS_DICT_ENDPOINT + "?action=get_areas&t=" + ts, fetchOpts); 
        const jA = await rA.json(); 
        if (jA.status === "success") { 
            await POEDB.clearStore("areas"); 
            for (let a of jA.data) await POEDB.save("areas", a); 
        }
        
        const rC = await fetch(GAS_ENDPOINT + "?action=get_config&t=" + ts, fetchOpts); 
        const jC = await rC.json(); 
        if (jC.status === "success") { 
            await POEDB.clearStore("sys_config"); 
            for (let i of jC.data) await POEDB.save("sys_config", i); 
        }
        
        const rP = await fetch(GAS_ENDPOINT + "?action=get_poes&t=" + ts, fetchOpts); 
        const jP = await rP.json(); 
        if (jP.status === "success") { 
            const q = await POEDB.getAll("sync_queue"); 
            const localPoes = await POEDB.getAll("poes"); 
            for (let local of localPoes) {
                if (!q.find((x) => x.id === local.id)) await POEDB.delete("poes", local.id); 
            }
            for (let p of jP.data) {
                if (!q.find((x) => x.id === p.id)) await POEDB.save("poes", p); 
            }
        }
        await window.refreshUI();
    } catch (e) { 
        console.error(e); 
    }
};

window.forceSync = async function () {
    if (!navigator.onLine) {
        return await window.sysAlert("El sistema detecta pérdida de conexión. Las funciones de sincronización están pausadas.", "warning");
    }
    const syncBtn = document.querySelector('button[onclick="window.forceSync()"]'); 
    const syncIcon = syncBtn ? syncBtn.querySelector('svg') : null;
    
    if (syncIcon) { 
        syncIcon.classList.add("animate-spin", "text-blue-500"); 
        syncBtn.disabled = true; 
    }
    try { 
        window.updateNet("sync"); 
        await window.pushSync(); 
        await window.pullSync(); 
        await window.sysAlert("Base de datos sincronizada y caché actualizado correctamente.", "success"); 
    } catch (error) { 
        await window.sysAlert("Ocurrió un error al intentar sincronizar con los servidores de Google.", "error"); 
    } finally { 
        window.updateNet(navigator.onLine ? "online" : "offline"); 
        if (syncIcon) { 
            syncIcon.classList.remove("animate-spin", "text-blue-500"); 
            syncBtn.disabled = false; 
        } 
    }
};

window.addEventListener("online", () => window.pushSync());
window.addEventListener("offline", () => window.updateNet("offline"));

document.addEventListener("DOMContentLoaded", async () => {
    window.updateNet(navigator.onLine ? "online" : "offline"); 
    await POEDB.init(); 
    
    // 1. Intentamos recuperar el usuario si la página se recargó (F5)
    const savedUser = sessionStorage.getItem('moduloUserPOE'); 
    if (savedUser) { 
        state.user = JSON.parse(savedUser); 
        state.isSessionVerified = true; 
        await window.refreshUI(); // Renderizamos la UI solo si hay usuario en caché
    }
    
    // 2. Inicializamos componentes visuales
    setTimeout(() => { 
        window.initRichEditors(); 
        window.switchTab('dashboard'); 
    }, 100); 
    
    // 3. 📡 AVISAMOS AL HUB PADRE QUE ESTAMOS LISTOS PARA RECIBIR EL USUARIO
    window.parent.postMessage({ type: 'MODULO_LISTO' }, '*');
    
    // 4. Arrancamos rutinas de sincronización en segundo plano
    setTimeout(async () => { 
        await window.pullSync(); 
        window.pushSync(); 
    }, 1000);
});
