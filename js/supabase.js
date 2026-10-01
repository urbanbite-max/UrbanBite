// ============================================================
// URBANBITE · FASE 7.3
// Conexión única a Supabase
// ============================================================

// Pega aquí SOLO estos dos datos de Supabase:
// 1) Project URL
// 2) Publishable key (o anon key si tu proyecto aún usa la clave antigua)
//
// NUNCA pongas aquí service_role, sb_secret_... ni la contraseña de la BD.
const SUPABASE_URL = "https://ewftunkrmrpdsoiephxd.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Dx844uK8qPj9cml0swLkGA_jbAM0ZJT";

function configuracionSupabaseLista() {
    return Boolean(
        SUPABASE_URL &&
        SUPABASE_PUBLISHABLE_KEY &&
        !SUPABASE_URL.includes("PEGA_AQUI") &&
        !SUPABASE_PUBLISHABLE_KEY.includes("PEGA_AQUI")
    );
}

window.URBANBITE_SUPABASE_CONFIGURADO = configuracionSupabaseLista();
window.urbanbiteSupabase = null;

if (!window.URBANBITE_SUPABASE_CONFIGURADO) {
    console.warn(
        "UrbanBite: falta configurar Project URL y Publishable Key en js/supabase.js"
    );
} else if (!window.supabase?.createClient) {
    console.error("UrbanBite: no se cargó la librería de Supabase.");
} else {
    // Usamos sessionStorage para que el proyecto ya no dependa de localStorage.
    // La sesión permanece mientras la pestaña esté abierta y se comparte entre
    // las páginas de UrbanBite dentro de esa misma pestaña.
    window.urbanbiteSupabase = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY,
        {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true,
                storage: window.sessionStorage
            },
            realtime: {
                params: {
                    eventsPerSecond: 10
                }
            }
        }
    );
}

window.urbanbiteStoragePublicUrl = function urbanbiteStoragePublicUrl(path) {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    if (!window.urbanbiteSupabase) return path;

    const { data } = window.urbanbiteSupabase
        .storage
        .from("productos")
        .getPublicUrl(path);

    return data?.publicUrl || path;
};

window.urbanbiteRequiereSupabase = function urbanbiteRequiereSupabase() {
    if (window.urbanbiteSupabase) return true;

    const mensaje = document.createElement("div");
    mensaje.className = "supabase-config-alert";
    mensaje.innerHTML = `
        <strong>Falta conectar Supabase</strong>
        <span>Abre <code>js/supabase.js</code> y pega tu Project URL y tu Publishable Key.</span>
    `;
    document.body.prepend(mensaje);
    return false;
};
