// ============================================================
// URBANBITE · FASE 7.3
// Cocina online + Realtime
// ============================================================

let cocinaPedidos = [];
let cocinaTabActual = "nuevo";
let canalCocina = null;

const pedidosCocinaGrid = document.getElementById("pedidosCocinaGrid");
const cocinaVacia = document.getElementById("cocinaVacia");
const cocinaVaciaTexto = document.getElementById("cocinaVaciaTexto");

function cocinaEscaparHtml(texto) {
    return String(texto ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function cocinaNumero(p) {
    return `UB-${String(p.numero_pedido || 0).padStart(3, "0")}`;
}

function estadoVisual(pedido) {
    const mapa = {
        confirmado: "nuevo",
        preparando: "preparando",
        listo: "listo",
        entregado: "entregado"
    };
    return mapa[pedido.estado] || null;
}

function textoEstadoCocina(estado) {
    return ({ nuevo: "NUEVO", preparando: "PREPARANDO", listo: "LISTO", entregado: "ENTREGADO" })[estado] || estado;
}

function esHoyCocina(fecha) {
    if (!fecha) return false;
    const d = new Date(fecha), h = new Date();
    return d.getFullYear() === h.getFullYear() && d.getMonth() === h.getMonth() && d.getDate() === h.getDate();
}

function productoCatalogoCocina(id) {
    return (window.productos || []).find(p => String(p.id) === String(id)) || null;
}

function normalizarPedidoCocina(p) {
    const productos = (p.detalle_pedido || []).map(d => {
        const producto = productoCatalogoCocina(d.producto_id);
        const cfg = d.configuracion || {};
        return {
            id: d.producto_id,
            nombre: d.producto_nombre,
            cantidad: Number(d.cantidad || 1),
            imagen: producto?.imagen || "img/comida-rapida.png",
            nota: d.notas || "",
            extras: (cfg.extras || []).map(id => producto?.extras?.find(e => String(e.id) === String(id))).filter(Boolean),
            removidos: (cfg.removibles || []).map(id => producto?.removibles?.find(r => String(r.id) === String(id))).filter(Boolean)
        };
    });
    return { ...p, productos, cocinaEstado: estadoVisual(p) };
}

async function cargarPedidosCocina() {
    const sb = window.urbanbiteSupabase;
    const { data, error } = await sb
        .from("pedidos")
        .select(`
            id, numero_pedido, nombre_cliente, tipo_entrega, numero_mesa,
            estado, estado_pago, notas, creado_en, actualizado_en, fecha_pago,
            detalle_pedido (
                id, producto_id, producto_nombre, cantidad, precio_unitario,
                subtotal, notas, configuracion
            )
        `)
        .eq("estado_pago", "pagado")
        .in("estado", ["confirmado", "preparando", "listo", "entregado"])
        .order("creado_en", { ascending: true });

    if (error) {
        console.error("UrbanBite Cocina:", error);
        return;
    }

    cocinaPedidos = (data || []).map(normalizarPedidoCocina);
    actualizarResumenCocina();
    renderizarPedidosCocina();
}

function pedidosVisiblesCocina() {
    return cocinaPedidos.filter(p => p.cocinaEstado === cocinaTabActual && (cocinaTabActual !== "entregado" || esHoyCocina(p.actualizado_en)));
}

function actualizarResumenCocina() {
    const contar = estado => cocinaPedidos.filter(p => p.cocinaEstado === estado && (estado !== "entregado" || esHoyCocina(p.actualizado_en))).length;
    document.getElementById("resumenNuevos").textContent = contar("nuevo");
    document.getElementById("resumenPreparando").textContent = contar("preparando");
    document.getElementById("resumenListos").textContent = contar("listo");
    document.getElementById("resumenEntregados").textContent = contar("entregado");
    document.getElementById("badgeNuevos").textContent = contar("nuevo");
    document.getElementById("badgePreparando").textContent = contar("preparando");
    document.getElementById("badgeListos").textContent = contar("listo");
}

function minutosTranscurridos(pedido) {
    const inicio = new Date(pedido.fecha_pago || pedido.creado_en).getTime();
    if (!Number.isFinite(inicio)) return 0;
    return Math.max(0, Math.floor((Date.now() - inicio) / 60000));
}

function textoTiempoPedido(pedido) {
    if (pedido.cocinaEstado === "entregado") return "Entregado";
    const m = minutosTranscurridos(pedido);
    return m <= 0 ? "Ahora" : `${m} min`;
}

function crearResumenProductoCocina(item) {
    const mods = [
        item.extras?.length ? `<small class="cocina-extra">+ ${item.extras.map(e => cocinaEscaparHtml(e.nombre)).join(", ")}</small>` : "",
        item.removidos?.length ? `<small class="cocina-quitar">− ${item.removidos.map(r => cocinaEscaparHtml(r.nombre)).join(", ")}</small>` : "",
        item.nota ? `<small class="cocina-nota">📝 ${cocinaEscaparHtml(item.nota)}</small>` : ""
    ].join("");
    return `<div class="producto-cocina-item"><strong>${item.cantidad}x ${cocinaEscaparHtml(item.nombre)}</strong>${mods}</div>`;
}

function botonEstadoPedido(p) {
    if (p.cocinaEstado === "nuevo") return `<button class="accion-cocina principal" data-cambiar-estado="${p.id}">Empezar a preparar →</button>`;
    if (p.cocinaEstado === "preparando") return `<button class="accion-cocina listo" data-cambiar-estado="${p.id}">✓ Marcar como listo</button>`;
    if (p.cocinaEstado === "listo") return `<button class="accion-cocina entregar" data-cambiar-estado="${p.id}">🛍 Entregar pedido</button>`;
    return `<div class="pedido-entregado-check">✓ Pedido entregado</div>`;
}

function crearTarjetaCocina(pedido) {
    const tarjeta = document.createElement("article");
    tarjeta.className = "pedido-cocina-card";
    const tipo = pedido.tipo_entrega === "local" ? `Mesa ${pedido.numero_mesa || "—"}` : "Para llevar";
    tarjeta.innerHTML = `
        <div class="pedido-cocina-top">
            <div>
                <span class="cocina-estado ${pedido.cocinaEstado}">${textoEstadoCocina(pedido.cocinaEstado)}</span>
                <h2>${cocinaNumero(pedido)}</h2>
                <p>${cocinaEscaparHtml(tipo)} · ${cocinaEscaparHtml(pedido.nombre_cliente || "Cliente")}</p>
            </div>
            <div class="tiempo-cocina"><span>⏱</span><strong data-tiempo-pedido="${pedido.id}">${textoTiempoPedido(pedido)}</strong></div>
        </div>
        <div class="pedido-cocina-productos">${pedido.productos.map(crearResumenProductoCocina).join("")}</div>
        ${pedido.notas ? `<div class="nota-general-cocina"><strong>📝 Nota general</strong><p>${cocinaEscaparHtml(pedido.notas)}</p></div>` : ""}
        <div class="pedido-cocina-actions">
            <button class="ver-preparacion-cocina" type="button" data-ver-preparacion="${pedido.id}">👨‍🍳 Ver preparación</button>
            ${botonEstadoPedido(pedido)}
        </div>`;

    tarjeta.querySelector("[data-ver-preparacion]")?.addEventListener("click", () => abrirPreparacionPedido(pedido.id));
    tarjeta.querySelector("[data-cambiar-estado]")?.addEventListener("click", () => avanzarEstadoCocina(pedido.id));
    return tarjeta;
}

function renderizarPedidosCocina() {
    const lista = pedidosVisiblesCocina();
    pedidosCocinaGrid.innerHTML = "";
    if (!lista.length) {
        cocinaVacia.style.display = "flex";
        pedidosCocinaGrid.style.display = "none";
        cocinaVaciaTexto.textContent = ({
            nuevo: "Cuando Caja confirme un pago, el pedido aparecerá automáticamente.",
            preparando: "Todavía no hay pedidos en preparación.",
            listo: "Todavía no hay pedidos listos para entregar.",
            entregado: "Los pedidos entregados hoy aparecerán aquí."
        })[cocinaTabActual];
        return;
    }
    cocinaVacia.style.display = "none";
    pedidosCocinaGrid.style.display = "grid";
    lista.forEach(p => pedidosCocinaGrid.appendChild(crearTarjetaCocina(p)));
}

async function avanzarEstadoCocina(idPedido) {
    const pedido = cocinaPedidos.find(p => String(p.id) === String(idPedido));
    if (!pedido) return;
    const siguiente = ({ nuevo: "preparando", preparando: "listo", listo: "entregado" })[pedido.cocinaEstado];
    if (!siguiente) return;

    const { error } = await window.urbanbiteSupabase.rpc("actualizar_estado_cocina", {
        p_pedido_id: pedido.id,
        p_estado: siguiente
    });
    if (error) return alert(error.message || "No se pudo actualizar el pedido.");
    cocinaTabActual = siguiente;
    actualizarTabsCocina();
    await cargarPedidosCocina();
}

function prepararDetalleProducto(item) {
    const producto = productoCatalogoCocina(item.id);
    const removidosIds = new Set((item.removidos || []).map(r => String(r.ingredienteId || "")));
    const receta = producto?.receta || [];

    const recetaHtml = receta.length
        ? receta.map(linea => {
            const removido = linea.tipo === "ingrediente" && removidosIds.has(String(linea.ingredienteId));
            const cantidad = Number(linea.cantidad || 0) * Number(item.cantidad || 1);
            return `<li class="${removido ? "prep-removido" : ""}"><span>${removido ? "✕" : "•"} ${cocinaEscaparHtml(linea.nombre)}</span><strong>${removido ? "NO USAR" : `${cantidad} ${cocinaEscaparHtml(linea.unidad || "und")}`}</strong></li>`;
        }).join("")
        : `<li><span>Preparación no configurada</span></li>`;

    const extrasHtml = item.extras?.length ? `<section class="modal-prep-bloque extra"><span>AGREGAR</span><ul>${item.extras.map(e => `<li><span>+ ${cocinaEscaparHtml(e.nombre)}</span><strong>${Number(e.cantidad || 1) * Number(item.cantidad || 1)} und</strong></li>`).join("")}</ul></section>` : "";
    const quitarHtml = item.removidos?.length ? `<section class="modal-prep-bloque quitar"><span>NO INCLUIR</span><ul>${item.removidos.map(r => `<li><span>✕ ${cocinaEscaparHtml(r.nombre)}</span></li>`).join("")}</ul></section>` : "";
    const notaHtml = item.nota ? `<div class="modal-prep-nota"><strong>📝 Nota del cliente</strong><p>${cocinaEscaparHtml(item.nota)}</p></div>` : "";

    return `<article class="modal-prep-producto">
        <div class="modal-prep-producto-top"><div class="modal-prep-emoji"><img src="${cocinaEscaparHtml(item.imagen)}" alt="${cocinaEscaparHtml(item.nombre)}"></div><div><span>CANTIDAD</span><h3>${item.cantidad}x ${cocinaEscaparHtml(item.nombre)}</h3></div></div>
        <section class="modal-prep-bloque"><span>INGREDIENTES TOTALES</span><ul>${recetaHtml}</ul></section>
        ${extrasHtml}${quitarHtml}${notaHtml}
    </article>`;
}

function abrirPreparacionPedido(id) {
    const p = cocinaPedidos.find(x => String(x.id) === String(id));
    if (!p) return;
    document.getElementById("modalPreparacionPedido").textContent = cocinaNumero(p);
    document.getElementById("modalPreparacionTipo").textContent = p.tipo_entrega === "local" ? `Mesa ${p.numero_mesa || "—"}` : "Para llevar";
    document.getElementById("modalPreparacionProductos").innerHTML = p.productos.map(prepararDetalleProducto).join("");
    document.getElementById("modalPreparacion").classList.add("activo");
    document.body.classList.add("modal-abierto");
}

function cerrarPreparacion() {
    document.getElementById("modalPreparacion").classList.remove("activo");
    document.body.classList.remove("modal-abierto");
}

function actualizarTabsCocina() {
    document.querySelectorAll(".cocina-tab").forEach(btn => btn.classList.toggle("active", btn.dataset.cocinaTab === cocinaTabActual));
}

function actualizarRelojCocina() {
    const el = document.getElementById("cocinaHora");
    if (el) el.textContent = new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
    document.querySelectorAll("[data-tiempo-pedido]").forEach(elm => {
        const p = cocinaPedidos.find(pedido => String(pedido.id) === String(elm.dataset.tiempoPedido));
        if (p) elm.textContent = textoTiempoPedido(p);
    });
}

function suscribirCocina() {
    const sb = window.urbanbiteSupabase;
    if (canalCocina) sb.removeChannel(canalCocina);
    let timer;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(cargarPedidosCocina, 150); };
    canalCocina = sb.channel("urbanbite-cocina")
        .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "detalle_pedido" }, refresh)
        .subscribe();
}

async function iniciarCocina() {
    const acceso = await (window.urbanbiteAuthReady || Promise.resolve(false));
    if (!acceso || !window.urbanbiteRequiereSupabase?.()) return;

    try {
        await window.cargarProductosUrbanBite({ incluirRecetas: true });
        await cargarPedidosCocina();
        suscribirCocina();
    } catch (error) {
        console.error(error);
        alert("No pudimos cargar Cocina. Ejecuta el SQL de la Fase 7.3 y revisa Supabase.");
    }

    document.querySelectorAll(".cocina-tab").forEach(btn => btn.addEventListener("click", () => {
        cocinaTabActual = btn.dataset.cocinaTab;
        actualizarTabsCocina();
        renderizarPedidosCocina();
    }));
    document.getElementById("actualizarCocinaBtn")?.addEventListener("click", cargarPedidosCocina);
    document.getElementById("cerrarPreparacionBtn")?.addEventListener("click", cerrarPreparacion);
    document.getElementById("cerrarPreparacionFondo")?.addEventListener("click", cerrarPreparacion);
    actualizarRelojCocina();
    setInterval(actualizarRelojCocina, 30000);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciarCocina, { once: true });
} else {
    iniciarCocina();
}
