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
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute("content", isDark ? "#111827" : "#e01f36");
}

function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    const themeStr = isDark ? 'dark' : 'light';
    localStorage.setItem('genTheme', isDark ? 'dark' : 'light');
    actualizarIconoTema(isDark);
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute("content", isDark ? "#111827" : "#e01f36");
    const iframe = document.getElementById('appViewer');
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'THEME_UPDATE', theme: themeStr }, '*');
    }
}

function actualizarIconoTema(isDark) {
    const mobileBtn = document.getElementById('theme-toggle-btn-mobile');
    const desktopBtn = document.getElementById('theme-toggle-btn-desktop');
    
    if (mobileBtn) {
        mobileBtn.innerHTML = isDark
            ? `<i class="ph ph-sun text-xl text-amber-400"></i><span class="font-medium text-sm text-gray-200">Tema Claro</span>`
            : `<i class="ph ph-moon text-xl text-gray-600"></i><span class="font-medium text-sm">Tema Oscuro</span>`;
    }
    
    if (desktopBtn) {
        desktopBtn.innerHTML = isDark
            ? `<i class="ph-fill ph-sun text-xl text-amber-400 pointer-events-none"></i>`
            : `<i class="ph-fill ph-moon text-xl text-gray-500 pointer-events-none"></i>`;
    }
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

// === LOGIN ===
function bindLoginEvents() {
    const form = document.getElementById('loginForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (document.activeElement) document.activeElement.blur(); // Ocultar teclado en móviles
        
        const btn = document.getElementById('btnSubmit');
        const err = document.getElementById('errorMsg');

        btn.innerHTML = '<i class="ph ph-spinner animate-spin text-xl"></i> Conectando...';
        btn.disabled = true;
        err.classList.add('hidden');

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
        card.onclick = () => loadApp(app, currentUser);
        card.innerHTML = `
            <!-- Fondo Cinematográfico (Imagen con zoom) -->
            <div class="absolute inset-0 z-0 transition-transform duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] group-hover:scale-110 flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-950">
                <img src="${urlImagenOptimizada}" alt="${app.titulo}" class="w-full h-full object-cover opacity-80 dark:opacity-60 group-hover:opacity-100 transition-opacity duration-700 mix-blend-multiply dark:mix-blend-normal" style="image-rendering: crisp-edges;" onerror="this.outerHTML='<i class=\\'ph ph-app-window text-6xl text-brand-500/30 group-hover:text-brand-400 transition-colors duration-700\\'></i>'">
            </div>
            
            <!-- Gradiente Inferior para Alto Contraste -->
            <div class="absolute inset-x-0 bottom-0 h-[80%] bg-gradient-to-t from-white/95 via-white/80 dark:from-black/95 dark:via-black/50 to-transparent z-10"></div>
            
            <!-- Contenido de la Tarjeta -->
            <div class="relative z-20 p-6 sm:p-8 translate-y-4 group-hover:translate-y-0 transition-transform duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] flex flex-col justify-end h-full w-full">
                <!-- Línea decorativa -->
                <div class="w-8 h-1 bg-brand-500 rounded-full mb-4 opacity-0 group-hover:opacity-100 transition-opacity duration-700 delay-100"></div>
                
                <h3 class="font-black text-xl sm:text-2xl text-gray-800 dark:text-white leading-tight mb-2 tracking-wide drop-shadow-sm group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors duration-300 w-full line-clamp-2">${app.titulo}</h3>
                
                <div class="grid grid-rows-[0fr] group-hover:grid-rows-[1fr] transition-all duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] w-full">
                    <p class="overflow-hidden text-[13px] sm:text-[14px] text-gray-600 dark:text-gray-300 font-medium leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity duration-500 delay-150 line-clamp-3 w-full">
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
            
            <!-- Widgets Laterales Premium -->
            <div class="flex flex-wrap lg:flex-nowrap items-center gap-3 sm:gap-4 z-10 pr-2 pb-2 pointer-events-auto mt-4 md:mt-0">
                <!-- Clima -->
                <a href="https://open-meteo.com/" target="_blank" title="Datos por Open-Meteo" class="flex items-center gap-3 bg-white/60 dark:bg-gray-800/60 backdrop-blur-xl px-4 py-3 rounded-2xl border border-white/60 dark:border-gray-700/50 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.2)] hover:shadow-lg transition-all group transform hover:-translate-y-1 duration-300">
                    <div class="w-10 h-10 rounded-[12px] bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center text-sky-500 dark:text-sky-400 group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300 shadow-inner">
                        <i id="weather-icon" class="ph ph-cloud-sun text-2xl animate-pulse"></i>
                    </div>
                    <div class="flex flex-col">
                        <span class="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1">Tacna <i class="ph ph-drop text-sky-400"></i><span id="weather-hum">--%</span></span>
                        <span id="weather-temp" class="text-[16px] font-black text-gray-800 dark:text-gray-100 leading-tight">--°C</span>
                    </div>
                </a>
                
                <!-- Divisas -->
                <a href="https://www.exchangerate-api.com" target="_blank" title="Datos por ExchangeRate-API" class="flex items-center gap-3 bg-white/60 dark:bg-gray-800/60 backdrop-blur-xl px-4 py-3 rounded-2xl border border-white/60 dark:border-gray-700/50 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.2)] hover:shadow-lg transition-all group transform hover:-translate-y-1 duration-300">
                    <div class="w-10 h-10 rounded-[12px] bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:scale-110 group-hover:-rotate-6 transition-transform duration-300 shadow-inner">
                        <i class="ph ph-currency-dollar text-2xl"></i>
                    </div>
                    <div class="flex flex-col">
                        <span class="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">USD/PEN</span>
                        <span id="currency-rate" class="text-[16px] font-black text-gray-800 dark:text-gray-100 leading-tight">S/ --</span>
                    </div>
                </a>
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
    document.getElementById('appTitle').textContent = "Inicio";
    document.getElementById('appViewer').src = "about:blank";
    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('bg-red-50', 'text-red-700', 'border-red-100', 'dark:bg-gray-800'));
    sessionStorage.removeItem('genCurrentApp');

    // Restaurar header en móviles
    const headerEl = document.querySelector('header');
    const sidebar = document.getElementById('sidebar');
    const sidebarLogo = document.getElementById('sidebar-logo');
    const floatingBtn = document.getElementById('floating-menu-btn');
    
    if (headerEl) {
        headerEl.classList.add('flex');
        headerEl.classList.remove('hidden', 'sm:flex');
    }
    
    if (sidebarLogo) {
        sidebarLogo.classList.add('hidden');
        sidebarLogo.classList.remove('flex');
    }
    
    if (floatingBtn) {
        floatingBtn.classList.add('hidden');
        floatingBtn.classList.remove('flex');
    }
    
    // Devolvemos el margen superior al menú para que baje por debajo del Header central
    if (sidebar) sidebar.classList.add('pt-16');

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

    // Ocultar header en móviles para dar 100% de espacio
    const headerEl = document.querySelector('header');
    const sidebar = document.getElementById('sidebar');
    const sidebarLogo = document.getElementById('sidebar-logo');
    const floatingBtn = document.getElementById('floating-menu-btn');
    
    if (headerEl) {
        headerEl.classList.remove('flex');
        headerEl.classList.add('hidden', 'sm:flex');
    }
    
    if (sidebarLogo) {
        sidebarLogo.classList.remove('hidden');
        sidebarLogo.classList.add('flex');
    }
    
    if (floatingBtn) {
        floatingBtn.classList.remove('hidden');
        floatingBtn.classList.add('flex');
    }
    
    // Reducimos el margen superior de la franja lateral ya que la bloqueamos
    if (sidebar) sidebar.classList.remove('pt-16');

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

// AI Feature Removed

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

// === BOTÓN FLOTANTE DRAGGABLE (MÓVILES) ===
const floatBtn = document.getElementById('floating-menu-btn');
if (floatBtn) {
    let isBtnDragging = false;
    let startBtnTouchX, startBtnTouchY;
    let startBtnX, startBtnY;

    floatBtn.addEventListener('touchstart', (e) => {
        isBtnDragging = false;
        startBtnTouchX = e.touches[0].clientX;
        startBtnTouchY = e.touches[0].clientY;
        
        const rect = floatBtn.getBoundingClientRect();
        startBtnX = rect.left;
        startBtnY = rect.top;
        
        floatBtn.style.transition = 'none'; // Quitar transición al arrastrar para seguir el dedo instantaneamente
    }, {passive: true});

    floatBtn.addEventListener('touchmove', (e) => {
        const dx = e.touches[0].clientX - startBtnTouchX;
        const dy = e.touches[0].clientY - startBtnTouchY;
        
        // Umbral de 8px para considerar que es un "arrastre" y no un "toque rápido"
        if (!isBtnDragging && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
            isBtnDragging = true;
        }

        if (isBtnDragging) {
            e.preventDefault(); // Evitar scroll de la página debajo
            let newX = startBtnX + dx;
            let newY = startBtnY + dy;
            
            // Delimitar coordenadas dentro de la pantalla
            const maxX = window.innerWidth - floatBtn.offsetWidth;
            const maxY = window.innerHeight - floatBtn.offsetHeight;
            
            floatBtn.style.left = `${Math.max(0, Math.min(newX, maxX))}px`;
            floatBtn.style.top = `${Math.max(0, Math.min(newY, maxY))}px`;
            floatBtn.style.right = 'auto'; // Anular right absoluto
            floatBtn.style.bottom = 'auto'; // Anular bottom absoluto
        }
    }, {passive: false});

    floatBtn.addEventListener('touchend', (e) => {
        floatBtn.style.transition = ''; // Recuperar transiciones fluidas de clases CSS
        if (!isBtnDragging) {
            toggleMenu(); // Si solo tocó el botón, abre el panel
        }
    });
}

// === GESTOS TÁCTILES (SWIPE NATIVO LATERAL PARA PANELES) ===
let touchStartX = 0;
let touchStartY = 0;

document.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
}, {passive: true});

document.addEventListener('touchend', e => {
    const touchEndX = e.changedTouches[0].screenX;
    const touchEndY = e.changedTouches[0].screenY;
    handleSwipeGesture(touchEndX, touchEndY);
}, {passive: true});

function handleSwipeGesture(endX, endY) {
    const diffX = endX - touchStartX;
    const diffY = endY - touchStartY;
    const absDiffX = Math.abs(diffX);
    const absDiffY = Math.abs(diffY);
    
    // Si el movimiento fue más vertical que horizontal (ej. scrolling natural)
    if (absDiffY > absDiffX) {
        return;
    }

    // Umbral mínimo de swipe (evita toques accidentales)
    if (absDiffX < 50) return;

    const sidebar = document.getElementById('sidebar');
    
    // Verificamos si el modal existe en el DOM
    if (!sidebar) return;

    const isSidebarOpen = !sidebar.classList.contains('-translate-x-full');

    if (diffX > 0) {
        // SWIPE RIGHT (Hacia la derecha -> )
        if (!isSidebarOpen && touchStartX < 30) {
            // Abrir menú principal arrastrando desde el borde izquierdo
            toggleMenu();
        }
    } else {
        // SWIPE LEFT (Hacia la izquierda <- )
        if (isSidebarOpen) {
            // Cerrar menú principal arrastrándolo a la izquierda
            toggleMenu();
        }
    }
}
