// ============================================================
// URBANBITE · FASE 7.3
// Administrador conectado a Supabase
// ============================================================

let pedidosAdmin = [];
let productoEditandoAdmin = null;
let canalAdmin = null;

const CATEGORIAS_INVENTARIO = [
    { nombre: "Panes", icono: "🍞", nombres: ["Pan de hamburguesa", "Pan de perro"] },
    { nombre: "Proteínas y quesos", icono: "🥩", nombres: ["Carne", "Salchicha", "Queso", "Bacon"] },
    { nombre: "Vegetales", icono: "🥬", nombres: ["Lechuga", "Tomate"] },
    { nombre: "Papas y complementos", icono: "🍟", nombres: ["Papa", "Papa ripio", "Salsa", "Recipiente"] },
    { nombre: "Bebidas", icono: "🥤", nombres: ["Coca-Cola 400 ml", "Sprite 400 ml", "Kola Román 400 ml", "Agua"] }
];

function formatearNumero(valor) {
    return Number(valor || 0).toLocaleString("es-CO");
}

function formatearDinero(valor) {
    return "$" + Math.round(Number(valor || 0)).toLocaleString("es-CO");
}

function adminEscaparHtml(texto) {
    return String(texto ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function adminEsHoy(fecha) {
    if (!fecha) return false;
    const d = new Date(fecha), h = new Date();
    return d.getFullYear() === h.getFullYear() && d.getMonth() === h.getMonth() && d.getDate() === h.getDate();
}

function adminNumeroPedido(p) {
    return `UB-${String(p.numero_pedido || 0).padStart(3, "0")}`;
}

async function cargarPedidosAdmin() {
    const { data, error } = await window.urbanbiteSupabase
        .from("pedidos")
        .select(`
            id, numero_pedido, nombre_cliente, tipo_entrega, numero_mesa,
            estado, estado_pago, metodo_pago, subtotal, total, notas,
            creado_en, actualizado_en, fecha_pago,
            detalle_pedido (id, producto_id, producto_nombre, cantidad, precio_unitario, subtotal)
        `)
        .order("creado_en", { ascending: false });
    if (error) throw error;
    pedidosAdmin = data || [];
}

function pedidosPagados() {
    return pedidosAdmin.filter(p => p.estado_pago === "pagado");
}

function pedidosPagadosHoy() {
    return pedidosPagados().filter(p => adminEsHoy(p.fecha_pago || p.actualizado_en));
}

function costoMovimientosHoy() {
    const mapa = new Map((window.inventarioUrbanBite || []).map(i => [i.id, i]));
    return (window.movimientosUrbanBite || [])
        .filter(m => m.tipo === "venta" && adminEsHoy(m.fecha))
        .reduce((s, m) => s + Number(m.cantidad || 0) * Number(mapa.get(m.ingredienteId)?.costo || 0), 0);
}

function renderizarDashboard() {
    const hoy = pedidosPagadosHoy();
    const todos = pedidosPagados();
    const ventas = hoy.reduce((s, p) => s + Number(p.total || 0), 0);
    const costo = costoMovimientosHoy();
    const ganancia = ventas - costo;
    const ticket = hoy.length ? ventas / hoy.length : 0;
    const margen = ventas ? (ganancia / ventas) * 100 : 0;

    document.getElementById("kpiVentasHoy").textContent = formatearDinero(ventas);
    document.getElementById("kpiPedidosHoy").textContent = `${hoy.length} ${hoy.length === 1 ? "pedido pagado" : "pedidos pagados"}`;
    document.getElementById("kpiTicketPromedio").textContent = formatearDinero(ticket);
    document.getElementById("kpiCostoHoy").textContent = formatearDinero(costo);
    document.getElementById("kpiGananciaHoy").textContent = formatearDinero(ganancia);
    document.getElementById("kpiMargenHoy").textContent = `Margen ${margen.toFixed(1)}%`;
    document.getElementById("ventasHistoricasChip").textContent = `${todos.length} ${todos.length === 1 ? "venta total" : "ventas totales"}`;
    document.getElementById("dashboardFecha").textContent = new Date().toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });

    renderizarProductosVendidos(hoy);
    renderizarMetodosPago(hoy);
    renderizarEstadosCocina();
    renderizarConsumoHoy();
    renderizarUltimasVentas(todos);
}

function renderizarProductosVendidos(pedidos) {
    const mapa = new Map();
    pedidos.forEach(p => (p.detalle_pedido || []).forEach(item => {
        const key = item.producto_id || item.producto_nombre;
        const producto = (window.productos || []).find(x => String(x.id) === String(item.producto_id));
        if (!mapa.has(key)) mapa.set(key, { nombre: item.producto_nombre, imagen: producto?.imagen || "img/comida-rapida.png", cantidad: 0, ventas: 0 });
        const x = mapa.get(key);
        x.cantidad += Number(item.cantidad || 0);
        x.ventas += Number(item.subtotal || 0);
    }));
    const ranking = [...mapa.values()].sort((a, b) => b.cantidad - a.cantidad);
    const total = ranking.reduce((s, x) => s + x.cantidad, 0);
    document.getElementById("totalUnidadesVendidas").textContent = `${total} ${total === 1 ? "unidad" : "unidades"}`;
    const cont = document.getElementById("productosMasVendidos");
    if (!ranking.length) {
        cont.innerHTML = `<div class="dashboard-vacio"><span>🍔</span><p>Aún no hay productos vendidos hoy.</p></div>`;
        return;
    }
    const max = Math.max(...ranking.map(x => x.cantidad), 1);
    cont.innerHTML = ranking.slice(0, 5).map((x, i) => `
        <div class="ranking-item">
            <span class="ranking-posicion">${i + 1}</span>
            <div class="ranking-icono"><img src="${adminEscaparHtml(x.imagen)}" alt=""></div>
            <div class="ranking-info">
                <div class="ranking-info-top"><strong>${adminEscaparHtml(x.nombre)}</strong><span>${x.cantidad} und</span></div>
                <div class="ranking-barra"><div style="width:${Math.round((x.cantidad / max) * 100)}%"></div></div>
                <small>${formatearDinero(x.ventas)} en ventas</small>
            </div>
        </div>`).join("");
}

function renderizarMetodosPago(pedidos) {
    const metodos = [
        { id: "efectivo", nombre: "Efectivo", icono: "💵" },
        { id: "tarjeta", nombre: "Tarjeta", icono: "💳" },
        { id: "transferencia", nombre: "Transferencia", icono: "📲" }
    ];
    const cont = document.getElementById("metodosPagoDashboard");
    cont.innerHTML = metodos.map(m => {
        const lista = pedidos.filter(p => p.metodo_pago === m.id);
        const total = lista.reduce((s, p) => s + Number(p.total || 0), 0);
        return `<div class="metodo-dashboard-item"><div class="metodo-dashboard-icon">${m.icono}</div><div><strong>${m.nombre}</strong><span>${lista.length} pagos</span></div><strong>${formatearDinero(total)}</strong></div>`;
    }).join("");
}

function renderizarEstadosCocina() {
    const hoy = pedidosAdmin.filter(p => adminEsHoy(p.creado_en) && p.estado_pago === "pagado");
    document.getElementById("dashCocinaNuevos").textContent = hoy.filter(p => p.estado === "confirmado").length;
    document.getElementById("dashCocinaPreparando").textContent = hoy.filter(p => p.estado === "preparando").length;
    document.getElementById("dashCocinaListos").textContent = hoy.filter(p => p.estado === "listo").length;
    document.getElementById("dashCocinaEntregados").textContent = hoy.filter(p => p.estado === "entregado").length;
}

function renderizarConsumoHoy() {
    const mapa = new Map();
    (window.movimientosUrbanBite || [])
        .filter(m => m.tipo === "venta" && adminEsHoy(m.fecha))
        .forEach(m => {
            const actual = mapa.get(m.ingredienteId) || { nombre: m.ingrediente, unidad: m.unidad, cantidad: 0 };
            actual.cantidad += Number(m.cantidad || 0);
            mapa.set(m.ingredienteId, actual);
        });
    const cont = document.getElementById("consumoIngredientes");
    const lista = [...mapa.values()].sort((a, b) => b.cantidad - a.cantidad);
    cont.innerHTML = lista.length ? lista.slice(0, 10).map(x => `<div class="consumo-item"><span>${adminEscaparHtml(x.nombre)}</span><strong>${formatearNumero(x.cantidad)} ${adminEscaparHtml(x.unidad)}</strong></div>`).join("") : `<div class="dashboard-vacio"><p>Aún no hay consumo registrado hoy.</p></div>`;
}

function renderizarUltimasVentas(pedidos) {
    const cont = document.getElementById("ultimasVentas");
    if (!pedidos.length) {
        cont.innerHTML = `<div class="dashboard-vacio"><p>Aún no hay ventas.</p></div>`;
        return;
    }
    cont.innerHTML = pedidos.slice(0, 8).map(p => `
        <div class="venta-dashboard-item">
            <div><strong>${adminNumeroPedido(p)} · ${adminEscaparHtml(p.nombre_cliente || "Cliente")}</strong><span>${p.tipo_entrega === "local" ? `Mesa ${p.numero_mesa || "-"}` : "Para llevar"}</span><small>${new Date(p.fecha_pago || p.actualizado_en).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}</small></div>
            <span>${adminEscaparHtml((p.metodo_pago || "").toUpperCase())}</span>
            <strong>${formatearDinero(p.total)}</strong>
        </div>`).join("");
}

function esStockBajo(item) {
    return Number(item.stock) <= Number(item.minimo);
}

function renderizarInventarioAdmin() {
    const inventario = window.obtenerInventario?.() || [];
    const movimientos = window.obtenerMovimientosInventario?.() || [];
    const bajos = window.ingredientesStockBajo?.() || [];
    document.getElementById("totalIngredientes").textContent = inventario.length;
    document.getElementById("totalStockBajo").textContent = bajos.length;
    document.getElementById("totalMovimientos").textContent = movimientos.length;
    renderizarAlertas(bajos);
    renderizarInventarioFijo(inventario);
    renderizarMovimientos(movimientos);
}

function renderizarAlertas(bajos) {
    const seccion = document.getElementById("alertasInventario");
    const lista = document.getElementById("alertasLista");
    if (!bajos.length) {
        seccion.classList.add("sin-alertas");
        lista.innerHTML = `<div class="alerta-ok">✓ Todo el inventario está por encima del mínimo.</div>`;
        return;
    }
    seccion.classList.remove("sin-alertas");
    lista.innerHTML = bajos.map(item => `<div class="alerta-item alerta-item-fija"><div><strong>${adminEscaparHtml(item.nombre)}</strong><span>Mínimo: ${formatearNumero(item.minimo)} ${adminEscaparHtml(item.unidad)}</span></div><strong>${formatearNumero(item.stock)} ${adminEscaparHtml(item.unidad)}</strong></div>`).join("");
}

function renderizarInventarioFijo(inventario) {
    const cont = document.getElementById("inventarioCategorias");
    cont.innerHTML = "";
    CATEGORIAS_INVENTARIO.forEach(cat => {
        const items = cat.nombres.map(nombre => inventario.find(i => i.nombre === nombre)).filter(Boolean);
        if (!items.length) return;
        const sec = document.createElement("section");
        sec.className = "inventario-categoria";
        sec.innerHTML = `<div class="categoria-inventario-titulo"><span>${cat.icono}</span><div><h3>${cat.nombre}</h3><small>${items.length} ingredientes</small></div></div><div class="inventario-grid">${items.map(crearTarjetaIngrediente).join("")}</div>`;
        cont.appendChild(sec);
    });
    cont.querySelectorAll("[data-guardar-stock]").forEach(btn => btn.addEventListener("click", () => guardarStockExacto(btn.dataset.guardarStock)));
    cont.querySelectorAll(".stock-input-directo").forEach(input => input.addEventListener("keydown", e => {
        if (e.key === "Enter") guardarStockExacto(input.dataset.stockInput);
    }));
}

function crearTarjetaIngrediente(item) {
    const bajo = esStockBajo(item);
    return `<article class="inventario-card ${bajo ? "stock-bajo" : ""}">
        <div class="inventario-card-top"><div><span>${bajo ? "⚠ STOCK BAJO" : "● DISPONIBLE"}</span><h3>${adminEscaparHtml(item.nombre)}</h3></div><div class="unidad-chip">${adminEscaparHtml(item.unidad)}</div></div>
        <div class="cantidad-editor"><label>Cantidad disponible</label><div class="cantidad-editor-linea"><input class="stock-input-directo" data-stock-input="${item.id}" type="number" min="0" step="1" value="${Number(item.stock)}"><span>${adminEscaparHtml(item.unidad)}</span><button type="button" data-guardar-stock="${item.id}">Guardar</button></div></div>
        <div class="stock-info-fija"><span>Mínimo: <strong>${formatearNumero(item.minimo)} ${adminEscaparHtml(item.unidad)}</strong></span><span>Costo base: <strong>${formatearDinero(item.costo)}</strong></span></div>
    </article>`;
}

async function guardarStockExacto(id) {
    const input = document.querySelector(`[data-stock-input="${id}"]`);
    const ingrediente = window.buscarIngrediente?.(id);
    const nuevo = Number(input?.value);
    if (!ingrediente || !Number.isFinite(nuevo) || nuevo < 0) return alert("Revisa la cantidad del ingrediente.");
    if (Number(ingrediente.stock) === nuevo) return mostrarToastAdmin(`${ingrediente.nombre} ya tiene esa cantidad.`);
    const resultado = await window.ajustarStockIngrediente(id, nuevo, "Cantidad configurada por administrador");
    if (!resultado.ok) return alert(resultado.mensaje);
    mostrarToastAdmin(`${ingrediente.nombre}: ${formatearNumero(nuevo)} ${ingrediente.unidad}`);
    renderizarInventarioAdmin();
    renderizarDashboard();
}

function renderizarMovimientos(movimientos) {
    const cont = document.getElementById("movimientosLista");
    if (!movimientos.length) {
        cont.innerHTML = `<div class="movimientos-vacio"><span>📋</span><h3>Sin movimientos todavía</h3><p>Las ventas y ajustes aparecerán aquí.</p></div>`;
        return;
    }
    cont.innerHTML = movimientos.slice(0, 80).map(m => {
        const entrada = m.tipo === "entrada" || (m.tipo === "ajuste" && m.stockNuevo >= m.stockAnterior) || m.tipo === "devolucion";
        return `<article class="movimiento-item"><div class="movimiento-icono ${entrada ? "entrada" : "salida"}">${entrada ? "↙" : "↗"}</div><div class="movimiento-info"><strong>${adminEscaparHtml(m.ingrediente)}</strong><span>${adminEscaparHtml(m.motivo)}</span><small>${new Date(m.fecha).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}</small></div><div class="movimiento-cantidad ${entrada ? "entrada" : "salida"}"><strong>${entrada ? "+" : "−"}${formatearNumero(m.cantidad)} ${adminEscaparHtml(m.unidad)}</strong><small>queda ${formatearNumero(m.stockNuevo)} ${adminEscaparHtml(m.unidad)}</small></div></article>`;
    }).join("");
}

function renderizarCatalogoAdmin() {
    const grid = document.getElementById("catalogoAdminGrid");
    const texto = (document.getElementById("buscarProductoAdmin")?.value || "").toLowerCase().trim();
    const categoria = document.getElementById("filtroCategoriaAdmin")?.value || "Todos";
    const lista = (window.productos || []).filter(p => (categoria === "Todos" || p.categoria === categoria) && (p.nombre.toLowerCase().includes(texto) || (p.descripcion || "").toLowerCase().includes(texto)));
    grid.innerHTML = lista.map(p => `<article class="catalogo-producto-card ${p.disponible ? "" : "inactivo"}"><img src="${adminEscaparHtml(p.imagen)}" alt="${adminEscaparHtml(p.nombre)}"><div class="catalogo-producto-info"><span>${adminEscaparHtml(p.categoria)} · ${p.disponible ? "ACTIVO" : "INACTIVO"}</span><h3>${adminEscaparHtml(p.nombre)}</h3><p>${adminEscaparHtml(p.descripcion)}</p><div class="catalogo-producto-footer"><strong>${formatearDinero(p.precio)}</strong><button class="editar-producto-btn" data-editar-producto="${p.id}">Editar</button></div></div></article>`).join("");
    grid.querySelectorAll("[data-editar-producto]").forEach(btn => btn.addEventListener("click", () => abrirEditorProducto(btn.dataset.editarProducto)));
}

function abrirEditorProducto(id) {
    const p = (window.productos || []).find(x => String(x.id) === String(id));
    if (!p) return;
    productoEditandoAdmin = p;
    document.getElementById("editorProductoTitulo").textContent = p.nombre;
    document.getElementById("editorProductoImagen").src = p.imagen;
    document.getElementById("editorNombre").value = p.nombre;
    document.getElementById("editorPrecio").value = p.precio;
    document.getElementById("editorDescripcion").value = p.descripcion;
    document.getElementById("editorDisponible").checked = p.disponible !== false;
    document.getElementById("editorRecetaLista").innerHTML = (p.receta || []).map((linea, i) => {
        if (linea.tipo === "subproducto") return `<div class="editor-receta-item subproducto" data-receta-index="${i}"><div class="ingrediente-nombre">${adminEscaparHtml(linea.nombre)} <small>(producto del combo)</small></div><label>Cantidad<input class="editor-receta-cantidad" type="number" min="0.001" step="1" value="${Number(linea.cantidad || 0)}"></label></div>`;
        return `<div class="editor-receta-item" data-receta-index="${i}"><div class="ingrediente-nombre">${adminEscaparHtml(linea.nombre)}</div><label>Cantidad<input class="editor-receta-cantidad" type="number" min="0.001" step="1" value="${Number(linea.cantidad || 0)}"></label><label>Unidad<input value="${adminEscaparHtml(linea.unidad || "")}" disabled></label></div>`;
    }).join("") || `<div class="dashboard-vacio"><p>Este producto no tiene receta configurada.</p></div>`;
    const modal = document.getElementById("editorProductoModal");
    modal.classList.add("activo");
    modal.setAttribute("aria-hidden", "false");
}

function cerrarEditorProducto() {
    const modal = document.getElementById("editorProductoModal");
    modal.classList.remove("activo");
    modal.setAttribute("aria-hidden", "true");
    productoEditandoAdmin = null;
}

async function guardarProductoDesdeAdmin() {
    const p = productoEditandoAdmin;
    if (!p) return;
    const nombre = document.getElementById("editorNombre").value.trim();
    const precio = Number(document.getElementById("editorPrecio").value);
    if (!nombre || !Number.isFinite(precio) || precio < 0) return alert("Revisa nombre y precio.");

    const btn = document.getElementById("guardarProductoAdminBtn");
    btn.disabled = true;
    const sb = window.urbanbiteSupabase;
    const { error } = await sb.from("productos").update({
        nombre,
        precio,
        descripcion: document.getElementById("editorDescripcion").value.trim(),
        disponible: document.getElementById("editorDisponible").checked
    }).eq("id", p.id);

    if (error) {
        btn.disabled = false;
        return alert(error.message || "No se pudo guardar el producto.");
    }

    const actualizaciones = [];
    document.querySelectorAll("#editorRecetaLista [data-receta-index]").forEach(fila => {
        const linea = p.receta[Number(fila.dataset.recetaIndex)];
        const cantidad = Number(fila.querySelector(".editor-receta-cantidad")?.value || 0);
        if (!linea?.id || !Number.isFinite(cantidad) || cantidad <= 0) return;
        const tabla = linea.tipo === "subproducto" ? "producto_componentes" : "recetas";
        actualizaciones.push(sb.from(tabla).update({ cantidad }).eq("id", linea.id));
    });
    const resultados = await Promise.all(actualizaciones);
    const errorReceta = resultados.find(r => r.error)?.error;
    btn.disabled = false;
    if (errorReceta) return alert(errorReceta.message || "El producto se guardó, pero hubo un error actualizando la receta.");

    cerrarEditorProducto();
    await recargarAdmin();
    mostrarToastAdmin("Producto y receta actualizados en Supabase");
}

function poblarFiltroCategorias() {
    const select = document.getElementById("filtroCategoriaAdmin");
    const actual = select.value || "Todos";
    const categorias = Array.from(new Set((window.productos || []).map(p => p.categoria))).sort();
    select.innerHTML = `<option value="Todos">Todas las categorías</option>${categorias.map(c => `<option value="${adminEscaparHtml(c)}">${adminEscaparHtml(c)}</option>`).join("")}`;
    if (["Todos", ...categorias].includes(actual)) select.value = actual;
}

function cambiarVistaAdmin(vista) {
    document.querySelectorAll(".admin-tab").forEach(btn => btn.classList.toggle("active", btn.dataset.adminTab === vista));
    document.querySelectorAll(".admin-vista").forEach(sec => sec.classList.remove("activa"));
    document.getElementById(({ resumen: "vistaResumen", inventario: "vistaInventario", catalogo: "vistaCatalogo" })[vista] || "vistaResumen")?.classList.add("activa");
}

function mostrarToastAdmin(texto) {
    document.querySelector(".admin-toast")?.remove();
    const toast = document.createElement("div");
    toast.className = "admin-toast";
    toast.textContent = `✓ ${texto}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add("visible"), 10);
    setTimeout(() => toast.remove(), 2000);
}

async function recargarAdmin() {
    await Promise.all([
        window.cargarProductosUrbanBite({ incluirRecetas: true }),
        window.cargarInventarioSupabase(),
        cargarPedidosAdmin()
    ]);
    poblarFiltroCategorias();
    renderizarDashboard();
    renderizarInventarioAdmin();
    renderizarCatalogoAdmin();
}

function suscribirAdmin() {
    const sb = window.urbanbiteSupabase;
    if (canalAdmin) sb.removeChannel(canalAdmin);
    let timer;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => recargarAdmin().catch(console.error), 180); };
    canalAdmin = sb.channel("urbanbite-admin")
        .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "detalle_pedido" }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "productos" }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "recetas" }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "producto_componentes" }, refresh)
        .subscribe();
    window.suscribirInventarioUrbanBite?.(() => {
        renderizarInventarioAdmin();
        renderizarDashboard();
    });
}

async function iniciarAdmin() {
    const acceso = await (window.urbanbiteAuthReady || Promise.resolve(false));
    if (!acceso || !window.urbanbiteRequiereSupabase?.()) return;
    try {
        await recargarAdmin();
        suscribirAdmin();
    } catch (error) {
        console.error(error);
        alert("No pudimos cargar Admin. Ejecuta el SQL de la Fase 7.3 y revisa tu sesión.");
        return;
    }

    document.querySelectorAll(".admin-tab").forEach(btn => btn.addEventListener("click", () => cambiarVistaAdmin(btn.dataset.adminTab)));
    document.getElementById("actualizarAdminBtn")?.addEventListener("click", async () => { await recargarAdmin(); mostrarToastAdmin("Datos sincronizados"); });
    document.getElementById("reiniciarInventarioBtn")?.addEventListener("click", async () => { await recargarAdmin(); mostrarToastAdmin("Inventario sincronizado con Supabase"); });
    document.getElementById("buscarProductoAdmin")?.addEventListener("input", renderizarCatalogoAdmin);
    document.getElementById("filtroCategoriaAdmin")?.addEventListener("change", renderizarCatalogoAdmin);
    document.querySelectorAll("[data-cerrar-editor]").forEach(x => x.addEventListener("click", cerrarEditorProducto));
    document.getElementById("guardarProductoAdminBtn")?.addEventListener("click", guardarProductoDesdeAdmin);
    document.getElementById("restaurarCatalogoBtn")?.addEventListener("click", async () => { await recargarAdmin(); mostrarToastAdmin("Catálogo recargado desde Supabase"); });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciarAdmin, { once: true });
} else {
    iniciarAdmin();
}
