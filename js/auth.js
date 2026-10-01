// ============================================================
// URBANBITE · FASE 7.3
// Sesión, roles y control de acceso
// ============================================================

const UB_CLAVE_MODO = "urbanbite_modo_sesion";
const UB_USUARIOS_EMAIL = {
    admin: "admin@urbanbite.local",
    cocineros: "cocineros@urbanbite.local"
};

window.urbanbiteSesion = {
    rol: null,
    nombre: null,
    usuario: null,
    autenticado: false
};

function ubNormalizarRol(rol) {
    if (rol === "cocinero" || rol === "cocineros") return "cocina";
    return rol || null;
}

async function ubResolverSesion() {
    const sb = window.urbanbiteSupabase;

    if (sb) {
        const { data, error } = await sb.auth.getSession();
        if (!error && data?.session?.user) {
            const user = data.session.user;
            const { data: perfil, error: perfilError } = await sb
                .from("perfiles")
                .select("nombre, rol, activo")
                .eq("id", user.id)
                .maybeSingle();

            if (!perfilError && perfil?.activo !== false && perfil?.rol) {
                window.urbanbiteSesion = {
                    rol: ubNormalizarRol(perfil.rol),
                    nombre: perfil.nombre || user.email || "Usuario",
                    usuario: user,
                    autenticado: true
                };
                sessionStorage.removeItem(UB_CLAVE_MODO);
                return window.urbanbiteSesion;
            }

            // Si existe una sesión de Auth pero aún no existe el perfil,
            // la mantenemos marcada para mostrar un mensaje útil en login.
            window.urbanbiteSesion = {
                rol: null,
                nombre: user.email || "Usuario",
                usuario: user,
                autenticado: true,
                perfilFaltante: true
            };
            return window.urbanbiteSesion;
        }
    }

    if (sessionStorage.getItem(UB_CLAVE_MODO) === "invitado") {
        window.urbanbiteSesion = {
            rol: "invitado",
            nombre: "Invitado",
            usuario: null,
            autenticado: false
        };
    }

    return window.urbanbiteSesion;
}

function ubRolesPermitidosPagina() {
    const texto = document.body?.dataset?.roles || "";
    return texto
        .split(",")
        .map(r => r.trim())
        .filter(Boolean);
}

function ubAplicarNavegacion() {
    const rol = window.urbanbiteSesion.rol;
    const nav = document.querySelector(".prototype-nav");

    document.querySelectorAll(".nav-admin, [data-admin-only]").forEach(enlace => {
        enlace.hidden = rol !== "admin";
    });

    if (!nav) {
        if (!rol || rol === "invitado") document.body.classList.remove("has-prototype-nav");
        return;
    }

    if (!rol || rol === "invitado") {
        nav.hidden = true;
        document.body.classList.remove("has-prototype-nav");
        return;
    }

    nav.hidden = false;
    document.body.classList.add("has-prototype-nav");

    nav.querySelectorAll("a").forEach(enlace => {
        const href = enlace.getAttribute("href") || "";
        let visible = true;

        // Invitado: sin navegación interna.
        // Admin: solo Admin + Menú.
        // Cocina: Caja + Cocina + Menú.
        if (rol === "admin" && (href.includes("caja.html") || href.includes("cocina.html"))) visible = false;
        if (rol === "cocina" && href.includes("admin.html")) visible = false;
        if (rol !== "admin" && rol !== "cocina" && (href.includes("admin.html") || href.includes("caja.html") || href.includes("cocina.html"))) visible = false;

        enlace.hidden = !visible;
    });
}

function ubAgregarControlSesion() {
    if (document.querySelector(".ub-session-control")) return;
    if (document.body?.classList.contains("login-page")) return;

    const rol = window.urbanbiteSesion.rol;
    if (!rol) return;

    const control = document.createElement("div");
    control.className = "ub-session-control";
    control.innerHTML = `
        <span>${rol === "invitado" ? "Invitado" : rol === "admin" ? "Administrador" : "Cocina"}</span>
        <button type="button" data-ub-salir>Salir</button>
    `;
    document.body.appendChild(control);
    control.querySelector("[data-ub-salir]")?.addEventListener("click", ubCerrarSesion);
}

async function ubProtegerPagina() {
    const permitidos = ubRolesPermitidosPagina();
    if (!permitidos.length) return true;

    const rol = window.urbanbiteSesion.rol;
    if (!rol || !permitidos.includes(rol)) {
        const destino = rol ? "menu.html" : "index.html";
        window.location.replace(destino);
        return false;
    }

    ubAplicarNavegacion();
    ubAgregarControlSesion();
    document.documentElement.classList.add("ub-auth-listo");
    return true;
}

async function ubEntrarInvitado() {
    if (window.urbanbiteSupabase) {
        try {
            await window.urbanbiteSupabase.auth.signOut();
        } catch (_) {}
    }
    sessionStorage.setItem(UB_CLAVE_MODO, "invitado");
    window.location.href = "menu.html";
}

async function ubIniciarSesion(usuario, clave) {
    const sb = window.urbanbiteSupabase;
    if (!sb) {
        return {
            ok: false,
            mensaje: "Primero configura Supabase en js/supabase.js."
        };
    }

    const nombreUsuario = String(usuario || "").trim().toLowerCase();
    const password = String(clave || "");
    const email = nombreUsuario.includes("@")
        ? nombreUsuario
        : UB_USUARIOS_EMAIL[nombreUsuario];

    if (!email) {
        return {
            ok: false,
            mensaje: "Usuario no reconocido. Usa admin o cocineros."
        };
    }

    const { data, error } = await sb.auth.signInWithPassword({
        email,
        password
    });

    if (error || !data?.user) {
        return {
            ok: false,
            mensaje: "Usuario o contraseña incorrectos."
        };
    }

    sessionStorage.removeItem(UB_CLAVE_MODO);
    await ubResolverSesion();

    if (!window.urbanbiteSesion.rol) {
        await sb.auth.signOut();
        return {
            ok: false,
            mensaje: "El usuario existe en Auth, pero aún no tiene rol en la tabla perfiles. Ejecuta el SQL de Fase 7.3."
        };
    }

    if (nombreUsuario === "admin" && window.urbanbiteSesion.rol !== "admin") {
        await sb.auth.signOut();
        return { ok: false, mensaje: "Ese usuario no tiene rol de administrador." };
    }

    if (nombreUsuario === "cocineros" && window.urbanbiteSesion.rol !== "cocina") {
        await sb.auth.signOut();
        return { ok: false, mensaje: "Ese usuario no tiene rol de cocina." };
    }

    return {
        ok: true,
        rol: window.urbanbiteSesion.rol,
        destino: window.urbanbiteSesion.rol === "admin" ? "admin.html" : "cocina.html"
    };
}

async function ubCerrarSesion() {
    sessionStorage.removeItem(UB_CLAVE_MODO);
    sessionStorage.removeItem("urbanbite_carrito_sesion");
    if (window.urbanbiteSupabase) {
        try {
            await window.urbanbiteSupabase.auth.signOut();
        } catch (_) {}
    }
    window.location.replace("index.html");
}

window.ubEntrarInvitado = ubEntrarInvitado;
window.ubIniciarSesion = ubIniciarSesion;
window.ubCerrarSesion = ubCerrarSesion;
window.ubResolverSesion = ubResolverSesion;

window.urbanbiteAuthReady = (async () => {
    await ubResolverSesion();
    return ubProtegerPagina();
})();
