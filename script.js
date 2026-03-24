const API_URL = "https://script.google.com/macros/s/AKfycbxLJYQe6QZCiDARD1I5ngkqS3hjfzT1oYki9rlClbNpFf-fjLwXv_Lhp_TOcjLgOTZt/exec";

// === CICLO DE VIDA ===
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    checkAuthState();
    bindLoginEvents();
    bindOnboardingEvents(); // Nueva llamada
    bindCredentialsEvents();

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').catch(err => console.error(err));
        });
    }
});

function initTheme() {
    const isDark = localStorage.getItem('genTheme') === 'dark';
    if (isDark) document.documentElement.classList.add('dark');
    actualizarIconoTema(isDark);
}

function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    const themeStr = isDark ? 'dark' : 'light';
    localStorage.setItem('genTheme', isDark ? 'dark' : 'light');
    actualizarIconoTema(isDark);
    const iframe = document.getElementById('appViewer');
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'THEME_UPDATE', theme: themeStr }, '*');
    }
}

function actualizarIconoTema(isDark) {
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (!themeBtn) return;
    themeBtn.innerHTML = isDark
        ? `<i class="ph ph-sun text-xl text-amber-400"></i><span class="font-medium text-sm text-gray-200">Tema Claro</span>`
        : `<i class="ph ph-moon text-xl text-gray-600"></i><span class="font-medium text-sm">Tema Oscuro</span>`;
}

// === MÁQUINA DE ESTADOS ===
function checkAuthState() {
    const userStr = localStorage.getItem('genUser');
    const loginView = document.getElementById('login-view');
    const hubView = document.getElementById('hub-view');

    if (userStr) {
        loginView.classList.add('hidden');
        hubView.classList.remove('hidden');
        initHub(JSON.parse(userStr));
    } else {
        hubView.classList.add('hidden');
        loginView.classList.remove('hidden');
        const form = document.getElementById('loginForm');
        if (form) form.reset();
    }
}

// === FEEDBACK HÁPTICO (UX MÓVIL) ===
function triggerHaptic(duration = 50) {
    if (navigator.vibrate) {
        navigator.vibrate(duration);
    }
}

// === LOGIN ===
function bindLoginEvents() {
    const form = document.getElementById('loginForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btnSubmit');
        const err = document.getElementById('errorMsg');

        btn.innerHTML = '<i class="ph ph-spinner animate-spin text-xl"></i> Conectando...';
        btn.disabled = true;
        err.classList.add('hidden');
        triggerHaptic(50);

        const payload = {
            action: 'login',
            user: document.getElementById('username').value,
            pass: document.getElementById('password').value
        };

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error("Error al conectar con el servidor.");
            const data = await response.json();

            if (data.status === 'success') {
                localStorage.setItem('genUser', JSON.stringify(data.user));
                localStorage.setItem('genAppsCatalog', JSON.stringify(data.apps));
                checkAuthState();
            } else if (data.status === 'require_profile') {
                // SE ACTIVA EL ONBOARDING
                abrirModalOnboarding(data.tempUser);
            } else {
                throw new Error(data.message);
            }
        } catch (error) {
            err.textContent = error.message || "Error inesperado.";
            err.classList.remove('hidden');
        } finally {
            btn.innerHTML = 'Ingresar';
            btn.disabled = false;
        }
    });
}

// === ONBOARDING (NUEVO) ===
function abrirModalOnboarding(usuario) {
    document.getElementById('onboardUserTemp').value = usuario;
    const modal = document.getElementById('onboardingModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function bindOnboardingEvents() {
    const form = document.getElementById('formOnboarding');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btnOnboardSubmit');
        const originalText = btn.innerHTML;

        const payload = {
            action: 'completeProfile',
            user: document.getElementById('onboardUserTemp').value,
            nombre: document.getElementById('onboardNombre').value,
            correo: document.getElementById('onboardCorreo').value
        };

        btn.innerHTML = '<i class="ph ph-spinner animate-spin text-xl"></i> Guardando...';
        btn.disabled = true;

        try {
            const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) });
            const data = await response.json();

            if (data.status === 'success') {
                document.getElementById('onboardingModal').classList.add('hidden');
                document.getElementById('onboardingModal').classList.remove('flex');

                // AUTOLOGIN TRUCO: Volvemos a presionar el botón de Iniciar Sesión automáticamente
                document.getElementById('btnSubmit').click();
            } else {
                throw new Error(data.message);
            }
        } catch (error) {
            alert("Error: " + error.message);
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });
}

// === CREDENCIALES ===
function bindCredentialsEvents() {
    const form = document.getElementById('formCredenciales');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;

        const userStr = localStorage.getItem('genUser');
        if (!userStr) return;
        const currentUser = JSON.parse(userStr);

        const payload = {
            action: 'updateCredentials',
            currentUser: currentUser.usuario,
            newUser: document.getElementById('newUsername').value,
            newPass: document.getElementById('newPassword').value
        };

        btn.innerHTML = '<i class="ph ph-spinner animate-spin"></i> Guardando...';
        btn.disabled = true;

        try {
            const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) });
            const data = await response.json();

            if (data.status === 'success') {
                alert("¡Credenciales actualizadas!\nPor seguridad, tu sesión se cerrará ahora.");
                closeCredentialsModal();
                logout();
            } else {
                throw new Error(data.message);
            }
        } catch (error) {
            alert("Error: " + error.message);
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });
}

// === LÓGICA DEL HUB ===
function initHub(currentUser) {
    document.getElementById('userName').textContent = currentUser.nombre;
    document.getElementById('userRole').textContent = currentUser.rol || currentUser.area;

    const menu = document.getElementById('appMenu');
    const cardsContainer = document.getElementById('cards-container');
    const APPS_CATALOG = JSON.parse(localStorage.getItem('genAppsCatalog')) || [];

    menu.innerHTML = '';
    cardsContainer.innerHTML = '';
    renderWelcomeBanner(currentUser.nombre.split(' ')[0]);

    // NUEVO BLOQUE (Sin el botón de inicio redundante)
    menu.innerHTML += `
        <p class="px-3 mt-2 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Módulos Activos</p>
    `;

    APPS_CATALOG.forEach(app => {
        const urlImagenOptimizada = optimizarLinkImagen(app.imagen);

        const btn = document.createElement('button');
        btn.className = 'w-full flex items-center gap-3 p-2.5 mb-1 rounded-2xl text-gray-600 dark:text-gray-400 hover:bg-brand-50 dark:hover:bg-gray-800 hover:text-brand-700 dark:hover:text-brand-400 transition-all group menu-btn border border-transparent hover:border-brand-100 dark:hover:border-gray-700';
        btn.dataset.id = app.id;
        btn.innerHTML = `<div class="w-10 h-10 rounded-xl bg-white dark:bg-gray-700 shadow-sm border border-gray-100 dark:border-gray-600 flex-shrink-0 overflow-hidden flex items-center justify-center group-hover:border-brand-300 transition-all"><img src="${urlImagenOptimizada}" class="w-full h-full object-contain p-1.5 transition-transform duration-300 group-hover:scale-110 group-active:scale-95" style="image-rendering: crisp-edges;" onerror="this.outerHTML='<i class=\\'ph ph-app-window text-xl\\'></i>'"></div><div class="flex flex-col items-start text-left overflow-hidden flex-1"><span class="text-[13px] font-bold truncate w-full transition-transform duration-300 group-hover:translate-x-1">${app.titulo}</span></div>`;
        btn.onclick = () => { loadApp(app, currentUser); toggleMenu(); };
        menu.appendChild(btn);

        // APLICANDO DISEÑO CINEMATOGRÁFICO EN LAS TARJETAS (Adaptado a tema oscuro y claro)
        const card = document.createElement('div');
        card.className = 'group relative aspect-[4/5] sm:aspect-[3/4] bg-white dark:bg-gray-900 rounded-[2rem] sm:rounded-[2.5rem] overflow-hidden shadow-lg hover:shadow-[0_20px_50px_-10px_rgba(224,31,54,0.15)] dark:hover:shadow-[0_20px_50px_-10px_rgba(0,0,0,0.5)] cursor-pointer transition-all duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] border border-gray-200 dark:border-white/10 flex flex-col justify-end transform hover:-translate-y-3';
        card.onclick = () => { triggerHaptic(30); loadApp(app, currentUser); };
        card.innerHTML = `
            <!-- Fondo Cinematográfico (Imagen con zoom) -->
            <div class="absolute inset-0 z-0 transition-transform duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] group-hover:scale-110 flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-950">
                <img src="${urlImagenOptimizada}" alt="${app.titulo}" class="w-full h-full object-cover opacity-100 lg:opacity-80 dark:lg:opacity-60 lg:group-hover:opacity-100 transition-opacity duration-700 mix-blend-multiply dark:mix-blend-normal" style="image-rendering: crisp-edges;" onerror="this.outerHTML='<i class=\\'ph ph-app-window text-6xl text-brand-500/30 group-hover:text-brand-400 transition-colors duration-700\\'></i>'">
            </div>
            
            <!-- Gradiente Inferior para Alto Contraste -->
            <div class="absolute inset-x-0 bottom-0 h-[80%] bg-gradient-to-t from-white/95 via-white/80 dark:from-black/95 dark:via-black/50 to-transparent z-10"></div>
            
            <!-- Contenido de la Tarjeta -->
            <div class="relative z-20 p-6 sm:p-8 translate-y-0 lg:translate-y-4 lg:group-hover:translate-y-0 transition-transform duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] flex flex-col justify-end h-full w-full">
                <!-- Línea decorativa -->
                <div class="w-8 h-1 bg-brand-500 rounded-full mb-4 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-700 delay-100"></div>
                
                <h3 class="font-black text-xl sm:text-2xl text-gray-800 dark:text-white leading-tight mb-2 tracking-wide drop-shadow-sm group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors duration-300 w-full line-clamp-2">${app.titulo}</h3>
                
                <div class="grid grid-rows-[1fr] lg:grid-rows-[0fr] lg:group-hover:grid-rows-[1fr] transition-all duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] w-full">
                    <p class="overflow-hidden text-[13px] sm:text-[14px] text-gray-600 dark:text-gray-300 font-medium leading-relaxed opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-500 delay-150 line-clamp-3 w-full">
                        ${app.info || 'Gestión centralizada de este módulo operativo para La Genovesa.'}
                    </p>
                </div>
            </div>
            
            <!-- Brillo Reflejo Superior (Glimmer Cinematográfico) -->
            <div class="absolute inset-0 z-30 pointer-events-none bg-gradient-to-tr from-white/0 via-white/40 dark:via-white/10 to-white/0 opacity-0 group-hover:opacity-100 transform -translate-x-full group-hover:translate-x-full transition-all duration-[1200ms] ease-in-out"></div>
        `;
        cardsContainer.appendChild(card);
    });

    const appGuardada = sessionStorage.getItem('genCurrentApp');

    if (appGuardada) {
        // Buscamos la app en el catálogo por su ID
        const appToLoad = APPS_CATALOG.find(a => a.id === appGuardada);
        if (appToLoad) {
            loadApp(appToLoad, currentUser);
        } else {
            showHome(); // Fallback por si acaso el ID ya no existe
        }
    } else {
        showHome(); // Comportamiento normal si es la primera vez que entra
    }
}

function renderWelcomeBanner(nombre) {
    const horaLocal = new Date().getHours();
    let saludo, svgIcon, colorCls, bgGlow;

    if (horaLocal >= 5 && horaLocal < 12) {
        saludo = "Buenos días"; colorCls = "text-amber-500"; bgGlow = "bg-amber-100 dark:bg-amber-900/30";
        svgIcon = `<svg viewBox="0 0 24 24" fill="none" class="w-16 h-16 sm:w-20 sm:h-20 animate-[spin_12s_linear_infinite] drop-shadow-lg"><path d="M12 4V2M12 22v-2M4 12H2m20 0h-2m-2.05-6.95l1.41-1.41M4.64 19.36l1.41-1.41M19.36 19.36l-1.41-1.41M6.05 6.05L4.64 4.64M16 12a4 4 0 11-8 0 4 4 0 018 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    } else if (horaLocal >= 12 && horaLocal < 19) {
        saludo = "Buenas tardes"; colorCls = "text-orange-500"; bgGlow = "bg-orange-100 dark:bg-orange-900/30";
        svgIcon = `<svg viewBox="0 0 24 24" fill="none" class="w-16 h-16 sm:w-20 sm:h-20 animate-[bounce_3s_infinite] drop-shadow-lg"><path d="M8 17a4 4 0 110-8c0-.44.07-.87.2-1.28A5.5 5.5 0 0113.5 3 5.5 5.5 0 0119 8.5c0 .17 0 .33-.03.5A4 4 0 1116 17H8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    } else {
        saludo = "Buenas noches"; colorCls = "text-indigo-500 dark:text-indigo-400"; bgGlow = "bg-indigo-100 dark:bg-indigo-900/30";
        svgIcon = `<svg viewBox="0 0 24 24" fill="none" class="w-16 h-16 sm:w-20 sm:h-20 animate-pulse drop-shadow-lg"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    }

    // APLICANDO DISEÑO DE TEXTO FLOTANTE SIN BLOQUE DE FONDO Y WIDGETS (Tipografía Premium)
    document.getElementById('welcome-banner').innerHTML = `
        <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sm:gap-6 relative w-full">
            <div class="flex items-center gap-4 sm:gap-6 relative">
                <div class="absolute -left-10 -top-10 w-48 h-48 rounded-full ${bgGlow} opacity-40 blur-3xl pointer-events-none"></div>
                <div class="${colorCls} z-10 transform scale-75 sm:scale-100 origin-left drop-shadow-xl transition-transform hover:scale-110 duration-500 ease-out">${svgIcon}</div>
                <div class="z-10 flex-1">
                    <h2 class="text-3xl sm:text-5xl font-black text-gray-800 dark:text-white tracking-tight leading-none drop-shadow-md">
                        ${saludo}, <span class="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-amber-500 drop-shadow-sm">${nombre}</span>
                    </h2>
                    <p class="text-gray-600 dark:text-gray-300 mt-2 font-bold text-[14px] sm:text-xl drop-shadow-sm">¿Qué módulo vamos a gestionar hoy?</p>
                </div>
            </div>
            
            <!-- Widgets Laterales Premium (Efecto Ruleta en Móviles) -->
            <div class="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide lg:overflow-visible lg:flex-nowrap mt-5 md:mt-0 items-center gap-3 sm:gap-4 z-10 w-full md:w-auto justify-start md:justify-end pb-2 pointer-events-auto" style="-webkit-overflow-scrolling: touch;">
                <!-- Clima -->
                <a href="https://open-meteo.com/" target="_blank" title="Datos por Open-Meteo" class="snap-start shrink-0 w-[85%] sm:w-auto flex flex-1 md:flex-initial items-center justify-start gap-3 bg-white/60 dark:bg-gray-800/60 backdrop-blur-xl px-4 py-3 rounded-2xl border border-white/60 dark:border-gray-700/50 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-lg transition-all group">
                    <div class="w-10 h-10 rounded-[12px] bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center text-sky-500 dark:text-sky-400 group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300 shadow-inner">
                        <i id="weather-icon" class="ph ph-cloud-sun text-2xl animate-pulse"></i>
                    </div>
                    <div class="flex flex-col text-left">
                        <span class="text-[10px] sm:text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1">Tacna <i class="ph ph-drop text-sky-400"></i><span id="weather-hum">--%</span></span>
                        <span id="weather-temp" class="text-[18px] sm:text-[16px] font-black text-gray-800 dark:text-gray-100 leading-tight">--°C</span>
                    </div>
                </a>
                
                <!-- Divisas -->
                <a href="https://www.exchangerate-api.com" target="_blank" title="Datos por ExchangeRate-API" class="snap-start shrink-0 w-[85%] sm:w-auto flex flex-1 md:flex-initial items-center justify-start gap-3 bg-white/60 dark:bg-gray-800/60 backdrop-blur-xl px-4 py-3 rounded-2xl border border-white/60 dark:border-gray-700/50 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-lg transition-all group">
                    <div class="w-10 h-10 rounded-[12px] bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:scale-110 group-hover:-rotate-6 transition-transform duration-300 shadow-inner">
                        <i class="ph ph-currency-dollar text-2xl"></i>
                    </div>
                    <div class="flex flex-col text-left">
                        <span class="text-[10px] sm:text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">USD/PEN</span>
                        <span id="currency-rate" class="text-[18px] sm:text-[16px] font-black text-gray-800 dark:text-gray-100 leading-tight">S/ --</span>
                    </div>
                </a>

                <!-- Asesor IA (Desktop Only, en Móvil está en menú lateral) -->
                <button onclick="toggleAIChat()" class="hidden sm:flex items-center gap-3 bg-white/60 dark:bg-gray-800/60 backdrop-blur-xl border border-white/60 dark:border-gray-700/50 hover:bg-white dark:hover:bg-gray-800 px-4 py-2 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-lg transition-all group transform hover:-translate-y-1 duration-300 ml-2">
                    <div class="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center border border-indigo-200 shadow-inner overflow-hidden group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
                        <img src="guia.svg" class="w-full h-full object-contain" alt="Guia HUB" onerror="this.src='icon.svg'">
                    </div>
                    <div class="flex flex-col text-left">
                        <span class="text-[9px] font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-widest flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> IA Asesor</span>
                        <span class="text-[14px] font-black text-gray-800 dark:text-gray-100 leading-tight">Guía HUB</span>
                    </div>
                </button>
            </div>
        </div>
    `;

    fetchWidgetsData();
}

async function fetchWidgetsData() {
    try {
        const weatherRes = await fetch("https://api.open-meteo.com/v1/forecast?latitude=-18.01&longitude=-70.25&current=temperature_2m,relative_humidity_2m");
        if (weatherRes.ok) {
            const wData = await weatherRes.json();
            document.getElementById('weather-temp').textContent = Math.round(wData.current.temperature_2m) + "°C";
            document.getElementById('weather-hum').textContent = Math.round(wData.current.relative_humidity_2m) + "%";
            document.getElementById('weather-icon').classList.remove('animate-pulse');
        }
    } catch (e) { console.warn("Clima no disponible", e); }

    try {
        const currencyRes = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
        if (currencyRes.ok) {
            const cData = await currencyRes.json();
            if (cData.rates.PEN) {
                document.getElementById('currency-rate').textContent = "S/ " + cData.rates.PEN.toFixed(3);
            }
        }
    } catch (e) { console.warn("Divisas no disponibles", e); }
}

// Añadimos el parámetro "desdeBotonAtras" para evitar bucles infinitos
function showHome(desdeBotonAtras = false) {
    document.getElementById('home-dashboard').classList.remove('hidden');
    document.getElementById('iframe-container').classList.add('hidden');
    
    // Restaurar el Header
    const header = document.getElementById('main-header');
    if (header) header.classList.remove('-translate-y-full');
    const floatBtn = document.getElementById('floating-back-btn');
    if (floatBtn) floatBtn.classList.add('hidden');
    
    document.getElementById('appTitle').textContent = "Inicio";
    document.getElementById('appViewer').src = "about:blank";
    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('bg-red-50', 'text-red-700', 'border-red-100', 'dark:bg-gray-800'));
    sessionStorage.removeItem('genCurrentApp');

    // MAGIA: Registramos el estado "Home" en el historial del celular
    if (!desdeBotonAtras) {
        history.pushState({ vista: 'home' }, '', '#home');
    }
}

function loadApp(app, user) {
    if (!app.link) return alert("Enlace no configurado.");
    sessionStorage.setItem('genCurrentApp', app.id);

    // MAGIA: Le decimos al celular que entramos a un módulo
    history.pushState({ vista: 'modulo', id: app.id }, '', `#${app.id}`);

    let urlSegura = app.link;

    // Tratamiento de URL
    try {
        const urlObj = new URL(app.link);
        urlObj.searchParams.append('email', user.email);
        urlObj.searchParams.append('rol', user.rol);
        urlObj.searchParams.append('t', Date.now());
        urlSegura = urlObj.toString();
    } catch (e) {
        urlSegura = `${app.link}${app.link.includes('?') ? '&' : '?'}email=${encodeURIComponent(user.email)}&rol=${user.rol}&t=${Date.now()}`;
    }

    // =========================================================
    // REGLA ARQUITECTÓNICA: ENRUTAMIENTO EXTERNO (NUEVA PESTAÑA)
    // =========================================================
    // Si la URL contiene appsheet, galaxycont o plesk, abortamos el Iframe y abrimos nueva pestaña
    if (['appsheet.com', 'galaxycont.com', 'plesk.page'].some(dominio => urlSegura.includes(dominio))) {
        window.open(urlSegura, '_blank');
        showHome(true); // Devolvemos el Hub a la vista principal para que no se quede "Cargando"
        return; // Detenemos la función aquí
    }
    // =========================================================

    // === RENDERIZADO EN IFRAME (Solo para módulos propios de Apps Script) ===
    document.getElementById('home-dashboard').classList.add('hidden');
    document.getElementById('iframe-container').classList.remove('hidden');
    
    // Reactivar sensor táctil en móviles para ocultar header
    const touchSensor = document.getElementById('iframe-touch-sensor');
    if (touchSensor) touchSensor.classList.remove('hidden');

    const iframe = document.getElementById('appViewer');
    const loader = document.getElementById('loader');

    loader.classList.remove('hidden');
    document.getElementById('appTitle').textContent = app.titulo;

    document.querySelectorAll('.menu-btn').forEach(btn => {
        btn.classList.remove('bg-brand-50', 'text-brand-700', 'border-brand-100', 'dark:bg-gray-800');
        if (btn.dataset.id === app.id) btn.classList.add('bg-brand-50', 'text-brand-700', 'border-brand-100', 'dark:bg-gray-800');
    });

    iframe.onload = () => {
        loader.classList.add('hidden');
    };

    iframe.src = urlSegura;
}


// === NUEVA LÓGICA HÍBRIDA DEL LOGO ===
function handleLogoClick() {
    const sidebar = document.getElementById('sidebar');
    const estaCerrado = sidebar.classList.contains('-translate-x-full');
    const logo = document.getElementById('main-logo');

    if (estaCerrado) {
        // 1. Si el menú está oculto -> El logo sirve para ABRIRLO
        toggleMenu();
    } else {
        // 2. Si el menú ya está abierto -> El logo sirve para IR A INICIO y CERRARLO
        triggerHaptic(30);
        showHome();

        // Efecto visual de regreso al HUB
        if (logo) {
            logo.classList.add('-scale-x-100');
            setTimeout(() => logo.classList.remove('-scale-x-100'), 700);
        }

        toggleMenu();
    }
}

function toggleMenu() {
    const s = document.getElementById('sidebar'), o = document.getElementById('sidebarOverlay');
    const logo = document.getElementById('main-logo');

    s.classList.toggle('-translate-x-full');
    o.classList.toggle('hidden');

    // Animación Premium al Logo cuando se abre/cierra
    if (logo) {
        logo.classList.toggle('-rotate-90');
        logo.classList.toggle('scale-75');
        logo.classList.toggle('opacity-70');
    }
}

function toggleAIChat() {
    const modal = document.getElementById('aiChatModal');
    const overlay = document.getElementById('aiChatOverlay');
    if (modal && overlay) {
        const isClosing = !modal.classList.contains('translate-x-full');
        modal.classList.toggle('translate-x-full');
        overlay.classList.toggle('hidden');

        // Auto-Focus Inmediato para Uso Fluido
        if (!isClosing) {
            setTimeout(() => {
                const input = document.getElementById('ai-chat-input');
                if (input) input.focus();
            }, 300); // Darle tiempo a la animación (300ms) de la barra lateral
        }
    }
}

// === LÓGICA DEL ASESOR INTELIGENTE IA (CONEXIÓN API GEMINI) ===

// ⚠️ MIGRACIÓN A BACKEND COMPLETADA: 
// La API Key ahora debe residir exclusivamente en las 'Propiedades de Script' de Google Apps Script.
// El aplicativo se conectará al proxy del Backend.

const SYSTEM_PROMPT = `Eres el "Guía HUB", el compañero Inteligente de La Genovesa Agroindustrias S.A. Tu objetivo es guiar a los colaboradores hacia nuestra Visión 2030, asegurando la excelencia técnica, la integridad ética y la transformación digital.

1. Identidad y Enfoque
Rol: Soporte operativo, empático y experto en Agroindustria Cápsica y Cárnica, Seguridad Alimentaria (HACCP/BRCGS), Digitalización (AppSheet) y Desarrollo de Habilidades Blandas.
Filosofía: Operas bajo el concepto de "Un Solo Cuerpo". Eres un compañero amigable que asiste al equipo operativo y administrativo. NUNCA uses la palabra "Senior" o "Asesor". Acércate a la persona desde una mentalidad de crecimiento, empatía y humildad.
Tono: Amigable, colaborativo, didáctico y directo. Ayudas usando palabras motivadoras ("Equipo", "Juntos", "Excelente aporte"), pero cuando hablas de Inocuidad eres firme técnica y éticamente.

2. Áreas de Especialidad y Conocimiento
Desarrollo de las Personas: Dominas totalmente las habilidades blandas: resolución pacífica de conflictos, inteligencia emocional, liderazgo positivo y empatía operativa.
Gestión Documental: Conoces a fondo el LG-MCE-01 (Manual de Cultura y Ética) y los POEs.
Tecnología y Datos: Guías pedagógicamente sobre la trazabilidad digital para que todos vean su utilidad.
Normativa y Procesos: Dominas la Ley de Inocuidad, DIGESA y estándares. Maestro en procesos cárnicos (recepción, desposte, molienda, embutido, estufado, cadena de frío).

3. Reglas de Comportamiento (Directrices)
Inocuidad y Trato Digno: La seguridad física/alimentaria y el respeto al trabajador no son negociables.
Integridad Blanda y Técnica: Promueve siempre la tolerancia ante errores, enseñando cómo corregirlos (Trazabilidad transparente, jamás ocultar fallos).
Formatos Ágiles y Cercanos: Si alguien saluda, preséntate brevemente como el "Guía HUB", dispuesto a ayudar en el turno, fomentando el aprendizaje continuo.

4. Formato de Respuesta
- No uses aperturas largas a menos que te pregunten quién eres. Sé conversacional.
- Usa encabezados (###), negritas y viñetas para que la respuesta sea digerible. Incluye Emojis funcionales.
- Cuando tu consejo sea muy técnico, incluye opcionalmente un "📊 Métrica de Impacto / KPI:" (usa el emoji).
- Cuando el consejo abarque personas, habilidades blandas o el LG-MCE-01, cierra con una "💡 Reflexión Ética corporativa:" o "💡 Reflexión Humana:".`;

// Mantenemos memoria conversacional (Historial)
let chatHistory = [];

async function handleAIChatSubmit(e) {
    if (e) e.preventDefault();
    const input = document.getElementById('ai-chat-input');
    const msg = input.value.trim();
    if (!msg) return;

    // UI Actualización Mensaje Usuario
    appendChatMessage(msg, 'user');
    input.value = '';

    // Agregamos al historial el input del usuario
    chatHistory.push({ role: "user", parts: [{ text: msg }] });

    // Ya no requerimos validación local de API KEY porque se maneja en el Backend seguro.
    // Enviaremos la petición completa a Google Apps Script (nuestro API_URL proxy).


    try {
        const payload = {
            action: 'askAI',
            history: chatHistory,
            prompt: SYSTEM_PROMPT // Instrucción del rol para el proxy de Google AS
        };

        const response = await fetch(API_URL, {
            method: 'POST', // Usar HTTP POST text/plain recomendado para Apps Script CORS
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        removeTypingIndicator(typingId);

        if (data.status === 'success' && data.response) {
            const aiText = data.response;

            // Agregar al historial conversacional (el rol es 'model')
            chatHistory.push({ role: "model", parts: [{ text: aiText }] });
            appendChatMessage(aiText, 'ai');
        } else {
            console.error("Respuesta anómala de Backend/Gemini:", data);
            let errorDetails = "El proxy corporativo de La Genovesa no devolvió una IA válida.";
            if (data.message) {
                errorDetails += `\n**Detalles del servidor proxy:** ${data.message}`;
            }
            appendChatMessage(`### ❌ Error de Procesamiento \n${errorDetails}\n\nRevisa la configuración del Administrador de Apps Script.`, 'ai');
        }

    } catch (error) {
        removeTypingIndicator(typingId);
        console.error("Error al conectar con el servidor Apps Script:", error);
        appendChatMessage("### ⚠️ Error de Red\n\nNo tengo conexión con el servidor interno de Apps Script. Verifica tu conexión de red o los permisos de ejecución del Macro.", 'ai');
    }
}

function appendChatMessage(text, sender) {
    const container = document.getElementById('ai-chat-messages');
    const div = document.createElement('div');

    if (sender === 'user') {
        div.className = 'flex gap-4 max-w-[85%] ml-auto justify-end';
        div.innerHTML = `
            <div class="bg-gradient-to-br from-indigo-600 to-indigo-700 p-4 rounded-[1.5rem] rounded-tr-sm shadow-[0_4px_20px_rgba(79,70,229,0.2)]">
                <p class="text-[14px] text-white font-medium leading-relaxed">${text}</p>
            </div>
            <div class="w-10 h-10 flex-shrink-0 rounded-[14px] bg-white dark:bg-gray-800 flex items-center justify-center text-gray-800 dark:text-gray-200 shadow-sm border border-gray-100 dark:border-gray-700">
                <i class="ph-fill ph-user text-xl"></i>
            </div>
        `;
    } else {
        // Parsing Formato Consultor Genovesa
        let formattedText = text.replace(/\n/g, '<br>');

        // Headers ###
        formattedText = formattedText.replace(/### (.*?)(?:<br>|$)/g, '<h4 class="text-indigo-700 dark:text-indigo-400 font-black text-[15px] tracking-wide mb-3 border-b border-indigo-100 dark:border-indigo-800/50 pb-2 uppercase">$1</h4>');

        // Negritas **
        formattedText = formattedText.replace(/\*\*(.*?)\*\*/g, '<strong class="text-gray-900 dark:text-gray-100 font-black">$1</strong>');

        // Bloques de Reflexión y KPI >
        formattedText = formattedText.replace(/> 💡 (.*?)(?:<br>|$)/g, '<div class="mt-4 bg-indigo-50 dark:bg-indigo-900/30 border-l-[3px] border-indigo-500 p-3.5 text-[13px] text-indigo-900 dark:text-indigo-200 rounded-r-xl shadow-sm leading-relaxed"><span class="font-black text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5 mb-1"><i class="ph-fill ph-lightbulb"></i> Reflexión Ética corporativa:</span>$1</div>');
        formattedText = formattedText.replace(/> 📊 (.*?)(?:<br>|$)/g, '<div class="mt-3 bg-emerald-50 dark:bg-emerald-900/20 border-l-[3px] border-emerald-500 p-3.5 text-[13px] text-emerald-900 dark:text-emerald-200 rounded-r-xl shadow-sm mb-1 leading-relaxed"><span class="font-black text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 mb-1"><i class="ph-fill ph-chart-line-up"></i> Métrica de Impacto:</span>$1</div>');

        div.className = 'flex gap-4 max-w-[90%] w-full group';
        div.innerHTML = `
            <div class="w-12 h-12 flex-shrink-0 rounded-[16px] bg-slate-50 dark:bg-slate-800 flex items-center justify-center shadow-inner overflow-hidden border border-slate-200 dark:border-slate-700">
                <img src="guia.svg" class="w-full h-full object-contain group-hover:scale-110 transition-transform" alt="Tech Guide" onerror="this.src=\\'icon.svg\\'">
            </div>
            <div class="bg-white dark:bg-gray-800 p-5 rounded-[1.5rem] rounded-tl-sm shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.3)] border border-gray-100 dark:border-gray-700/60 transition-all duration-300 transform scale-100">
                <div class="text-[14px] text-gray-700 dark:text-gray-300 font-medium leading-relaxed">${formattedText}</div>
            </div>
        `;
    }
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function appendTypingIndicator() {
    const container = document.getElementById('ai-chat-messages');
    const div = document.createElement('div');
    const id = 'typing-' + Date.now();
    div.id = id;
    div.className = 'flex gap-4 max-w-[90%]';
    div.innerHTML = `
        <div class="w-12 h-12 flex-shrink-0 rounded-[16px] bg-slate-50 dark:bg-slate-800 flex items-center justify-center shadow-inner overflow-hidden border border-slate-200 dark:border-slate-700">
            <img src="guia.svg" class="w-full h-full object-contain animate-bounce" alt="Tech Guide" onerror="this.src=\\'icon.svg\\'">
        </div>
        <div class="bg-white dark:bg-gray-800 px-5 py-4 rounded-[1.5rem] rounded-tl-sm shadow-[0_4px_20px_rgba(0,0,0,0.02)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.2)] border border-gray-100 dark:border-gray-700/60 flex items-center gap-1.5 h-[52px]">
            <span class="w-2.5 h-2.5 bg-indigo-500/70 rounded-full animate-bounce" style="animation-delay: -0.3s"></span>
            <span class="w-2.5 h-2.5 bg-indigo-500/70 rounded-full animate-bounce" style="animation-delay: -0.15s"></span>
            <span class="w-2.5 h-2.5 bg-indigo-500/70 rounded-full animate-bounce"></span>
        </div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return id;
}

function removeTypingIndicator(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function openCredentialsModal() {
    const m = document.getElementById('credentialsModal'), userStr = localStorage.getItem('genUser');
    if (userStr) document.getElementById('newUsername').value = JSON.parse(userStr).usuario;
    document.getElementById('newPassword').value = '';
    m.classList.remove('hidden'); m.classList.add('flex'); toggleMenu();
}

function closeCredentialsModal() {
    document.getElementById('credentialsModal').classList.add('hidden');
    document.getElementById('credentialsModal').classList.remove('flex');
}

function logout() {
    if (confirm("¿Cerrar sesión?")) {
        localStorage.removeItem('genUser'); localStorage.removeItem('genAppsCatalog');
        document.getElementById('appViewer').src = "about:blank"; checkAuthState();
    }
}

function optimizarLinkImagen(url) {
    if (!url) return "";
    if (url.includes("drive.google.com")) {
        const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
        if (match && match[1]) return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w800`;
    }
    return url;
}

// === COMUNICACIÓN CON MICRO-FRONTENDS (HANDSHAKE) ===
window.addEventListener("message", (event) => {
    // Escuchamos si algún iframe nos dice que ya está listo
    if (event.data && event.data.type === 'MODULO_LISTO') {
        console.log("GENAPPS: Módulo Iframe listo. Inyectando sesión...");

        // Buscamos la sesión local
        const sessionStr = localStorage.getItem('genUser');

        if (sessionStr) {
            const iframe = document.getElementById('appViewer'); // ID de tu iframe en GENAPPS

            if (iframe && iframe.contentWindow) {
                // Le enviamos la sesión al Iframe
                iframe.contentWindow.postMessage({
                    type: 'SESSION_SYNC',
                    user: JSON.parse(sessionStr),
                    theme: localStorage.getItem('genTheme') || 'light'
                }, '*');
            }
        } else {
            console.warn("GENAPPS: Iframe pidió sesión, pero no hay usuario logueado.");
        }
    }
});

window.addEventListener('popstate', (event) => {
    showHome(true);
});

// === IFRAME INTERACTIONS ===
function hideHeaderOnInteraction() {
    if (window.innerWidth < 640) {
        const header = document.getElementById('main-header');
        if (header) header.classList.add('-translate-y-full');
        
        const floatBtn = document.getElementById('floating-back-btn');
        if (floatBtn) floatBtn.classList.remove('hidden');
    }
    const touchSensor = document.getElementById('iframe-touch-sensor');
    if (touchSensor) touchSensor.classList.add('hidden');
}
