// ============================================================
// URBANBITE · FASE 7.3
// Caja en línea + Realtime
// ============================================================

let pedidosCaja = [];
let pedidoSeleccionadoId = null;
let tabCaja = "pendientes";
let metodoPagoCaja = "efectivo";
let canalCaja = null;

const $ = id => document.getElementById(id);

function cajaMoneda(valor) {
    return "$" + Number(valor || 0).toLocaleString("es-CO");
}

function cajaEscapar(texto) {
    return String(texto ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function cajaNumeroPedido(pedido) {
    return `UB-${String(pedido.numero_pedido || 0).padStart(3, "0")}`;
}

function cajaEsHoy(fecha) {
    if (!fecha) return false;
    const d = new Date(fecha);
    const h = new Date();
    return d.getFullYear() === h.getFullYear() && d.getMonth() === h.getMonth() && d.getDate() === h.getDate();
}

function cajaFecha(fecha) {
    if (!fecha) return "";
    return new Date(fecha).toLocaleString("es-CO", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit"
    });
}

function normalizarDetallesPedido(pedido) {
    const detalles = pedido.detalle_pedido || [];
    return detalles.map(d => {
        const producto = (window.productos || []).find(p => String(p.id) === String(d.producto_id));
        const config = d.configuracion || {};
        const extras = (config.extras || []).map(id => producto?.extras?.find(e => String(e.id) === String(id))).filter(Boolean);
        const removidos = (config.removibles || []).map(id => producto?.removibles?.find(r => String(r.id) === String(id))).filter(Boolean);
        return {
            ...d,
            imagen: producto?.imagen || "img/comida-rapida.png",
            extras,
            removidos
        };
    });
}

async function cargarPedidosCaja() {
    const sb = window.urbanbiteSupabase;
    if (!sb) return;

    const { data, error } = await sb
        .from("pedidos")
        .select(`
            id, numero_pedido, nombre_cliente, telefono_cliente, tipo_entrega,
            numero_mesa, estado, estado_pago, metodo_pago, subtotal, total,
            notas, creado_en, actualizado_en, fecha_pago,
            detalle_pedido (
                id, producto_id, producto_nombre, cantidad, precio_unitario,
                subtotal, notas, configuracion, creado_en
            )
        `)
        .order("creado_en", { ascending: false });

    if (error) {
        console.error("UrbanBite Caja:", error);
        return;
    }

    pedidosCaja = (data || []).map(p => ({ ...p, productos: normalizarDetallesPedido(p) }));
    renderizarCajaCompleta();
}

function pedidosFiltradosCaja() {
    const texto = ($("buscarPedido")?.value || "").toLowerCase().trim();
    return pedidosCaja.filter(p => {
        const coincideTab = tabCaja === "pendientes"
            ? p.estado_pago === "pendiente" && p.estado !== "cancelado"
            : p.estado_pago === "pagado";
        if (!coincideTab) return false;
        if (!texto) return true;
        const numero = cajaNumeroPedido(p).toLowerCase();
        const cliente = (p.nombre_cliente || "cliente").toLowerCase();
        const mesa = p.numero_mesa ? `mesa ${p.numero_mesa}` : "";
        return numero.includes(texto) || cliente.includes(texto) || mesa.includes(texto);
    });
}

function actualizarResumenCaja() {
    const pendientes = pedidosCaja.filter(p => p.estado_pago === "pendiente" && p.estado !== "cancelado");
    const pagadosHoy = pedidosCaja.filter(p => p.estado_pago === "pagado" && cajaEsHoy(p.fecha_pago || p.actualizado_en));
    const ventas = pagadosHoy.reduce((s, p) => s + Number(p.total || 0), 0);
    $("contadorPendientes").textContent = pendientes.length;
    $("badgePendientes").textContent = pendientes.length;
    $("contadorPagados").textContent = pagadosHoy.length;
    $("ventasHoy").textContent = cajaMoneda(ventas);
}

function renderizarListaPedidos() {
    const cont = $("listaPedidosCaja");
    if (!cont) return;
    const lista = pedidosFiltradosCaja();
    cont.innerHTML = "";

    if (!lista.length) {
        cont.innerHTML = `<div class="lista-vacia-caja"><strong>No hay pedidos aquí</strong><span>Los pedidos en línea aparecerán automáticamente.</span></div>`;
        return;
    }

    lista.forEach(p => {
        const tarjeta = document.createElement("button");
        tarjeta.type = "button";
        tarjeta.className = `pedido-item-caja${String(p.id) === String(pedidoSeleccionadoId) ? " active" : ""}`;
        const tipo = p.tipo_entrega === "local" ? `Mesa ${p.numero_mesa || "-"}` : "Para llevar";
        tarjeta.innerHTML = `
            <div class="pedido-item-top">
                <strong>${cajaNumeroPedido(p)}</strong>
                <span>${cajaFecha(p.creado_en)}</span>
            </div>
            <h3>${cajaEscapar(p.nombre_cliente || "Cliente")}</h3>
            <p>${cajaEscapar(tipo)} · ${p.productos.reduce((s, i) => s + Number(i.cantidad || 0), 0)} productos</p>
            <div class="pedido-item-bottom">
                <span class="estado-mini ${p.estado_pago === "pagado" ? "pagado" : "pendiente"}">${p.estado_pago === "pagado" ? "Pagado" : "Pendiente"}</span>
                <strong>${cajaMoneda(p.total)}</strong>
            </div>`;
        tarjeta.addEventListener("click", () => mostrarDetallePedido(p.id));
        cont.appendChild(tarjeta);
    });
}

function renderizarProductosDetalle(pedido) {
    const cont = $("productosDetalleCaja");
    cont.innerHTML = "";
    pedido.productos.forEach(item => {
        const detalles = [
            item.extras?.length ? `<small>+ ${item.extras.map(e => cajaEscapar(e.nombre)).join(", ")}</small>` : "",
            item.removidos?.length ? `<small>− ${item.removidos.map(r => cajaEscapar(r.nombre)).join(", ")}</small>` : "",
            item.notas ? `<small>📝 ${cajaEscapar(item.notas)}</small>` : ""
        ].join("");
        const fila = document.createElement("article");
        fila.className = "producto-detalle-item";
        fila.innerHTML = `
            <div class="producto-detalle-imagen"><img src="${cajaEscapar(item.imagen)}" alt="${cajaEscapar(item.producto_nombre)}"></div>
            <div class="producto-detalle-info"><strong>${item.cantidad}x ${cajaEscapar(item.producto_nombre)}</strong>${detalles}<span>${cajaMoneda(item.precio_unitario)} c/u</span></div>
            <strong>${cajaMoneda(item.subtotal)}</strong>`;
        cont.appendChild(fila);
    });
}

function mostrarDetallePedido(id) {
    pedidoSeleccionadoId = id;
    const p = pedidosCaja.find(x => String(x.id) === String(id));
    if (!p) return limpiarDetalle();

    $("sinPedidoSeleccionado").style.display = "none";
    $("detallePedido").style.display = "block";
    $("detalleNumeroPedido").textContent = cajaNumeroPedido(p);
    $("detalleFecha").textContent = cajaFecha(p.creado_en);
    $("detalleTotalTop").textContent = cajaMoneda(p.total);
    $("detalleCliente").textContent = p.nombre_cliente || "Cliente";
    $("detalleTipo").textContent = p.tipo_entrega === "local" ? `Mesa ${p.numero_mesa || "-"}` : "Para llevar";
    $("detalleCantidadProductos").textContent = `${p.productos.reduce((s, i) => s + Number(i.cantidad || 0), 0)} productos`;
    $("detalleSubtotal").textContent = cajaMoneda(p.subtotal);
    $("detalleTotal").textContent = cajaMoneda(p.total);
    $("confirmarPagoTotal").textContent = cajaMoneda(p.total);

    const notaBox = $("notaGeneralCaja");
    if (p.notas) {
        notaBox.style.display = "block";
        $("detalleNotaGeneral").textContent = p.notas;
    } else {
        notaBox.style.display = "none";
    }

    renderizarProductosDetalle(p);
    actualizarVistaEstado(p);
    calcularCambio();
    renderizarListaPedidos();
}

function actualizarVistaEstado(p) {
    const pagado = p.estado_pago === "pagado";
    const estado = $("detalleEstado");
    estado.textContent = pagado ? "Pagado" : p.estado === "cancelado" ? "Cancelado" : "Pendiente de pago";
    estado.className = `estado-badge ${pagado ? "pagado" : "pendiente"}`;
    $("pagoCaja").style.display = !pagado && p.estado !== "cancelado" ? "block" : "none";
    $("pagoConfirmado").style.display = pagado ? "flex" : "none";
    if (pagado) {
        $("pagoConfirmadoMetodo").textContent = (p.metodo_pago || "Pago").replace(/^./, c => c.toUpperCase());
        $("pagoConfirmadoFecha").textContent = cajaFecha(p.fecha_pago || p.actualizado_en);
    }
}

function limpiarDetalle() {
    pedidoSeleccionadoId = null;
    $("detallePedido").style.display = "none";
    $("sinPedidoSeleccionado").style.display = "flex";
}

function actualizarMetodoPagoUI() {
    document.querySelectorAll(".metodo-pago").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.metodo === metodoPagoCaja);
    });
    $("efectivoBox").style.display = metodoPagoCaja === "efectivo" ? "block" : "none";
    calcularCambio();
}

function calcularCambio() {
    const p = pedidosCaja.find(x => String(x.id) === String(pedidoSeleccionadoId));
    const recibido = Number($("montoRecibido")?.value || 0);
    const cambio = p && metodoPagoCaja === "efectivo" ? Math.max(0, recibido - Number(p.total || 0)) : 0;
    if ($("cambioCalculado")) $("cambioCalculado").textContent = cajaMoneda(cambio);
}

async function confirmarPago() {
    const p = pedidosCaja.find(x => String(x.id) === String(pedidoSeleccionadoId));
    if (!p || p.estado_pago === "pagado") return;

    if (metodoPagoCaja === "efectivo") {
        const recibido = Number($("montoRecibido").value || 0);
        if (recibido < Number(p.total || 0)) {
            alert("El monto recibido es menor al total del pedido.");
            $("montoRecibido").focus();
            return;
        }
    }

    const btn = $("confirmarPagoBtn");
    btn.disabled = true;
    const { data, error } = await window.urbanbiteSupabase.rpc("confirmar_pago_pedido", {
        p_pedido_id: p.id,
        p_metodo_pago: metodoPagoCaja
    });
    btn.disabled = false;

    if (error) {
        console.error(error);
        alert(error.message || "No se pudo confirmar el pago.");
        return;
    }

    await cargarPedidosCaja();
    mostrarDetallePedido(p.id);
    mostrarModalPago(cajaNumeroPedido(p));
}

async function cancelarPedido() {
    const p = pedidosCaja.find(x => String(x.id) === String(pedidoSeleccionadoId));
    if (!p || p.estado_pago === "pagado") return;
    if (!confirm(`¿Cancelar ${cajaNumeroPedido(p)}?`)) return;

    const { error } = await window.urbanbiteSupabase.rpc("cancelar_pedido", { p_pedido_id: p.id });
    if (error) return alert(error.message || "No se pudo cancelar el pedido.");
    await cargarPedidosCaja();
    limpiarDetalle();
}

function mostrarModalPago(numero) {
    $("modalPagoNumero").textContent = numero;
    $("modalPagoExitoso").classList.add("activo");
}

function cerrarModalPago() {
    $("modalPagoExitoso").classList.remove("activo");
}

function renderizarCajaCompleta() {
    actualizarResumenCaja();
    renderizarListaPedidos();
    if (pedidoSeleccionadoId) {
        const existe = pedidosCaja.some(p => String(p.id) === String(pedidoSeleccionadoId));
        if (existe) mostrarDetallePedido(pedidoSeleccionadoId);
        else limpiarDetalle();
    }
}

function suscribirCaja() {
    const sb = window.urbanbiteSupabase;
    if (canalCaja) sb.removeChannel(canalCaja);
    let timer;
    const refrescar = () => {
        clearTimeout(timer);
        timer = setTimeout(cargarPedidosCaja, 150);
    };
    canalCaja = sb.channel("urbanbite-caja")
        .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, refrescar)
        .on("postgres_changes", { event: "*", schema: "public", table: "detalle_pedido" }, refrescar)
        .subscribe();
}

async function iniciarCaja() {
    const acceso = await (window.urbanbiteAuthReady || Promise.resolve(false));
    if (!acceso || !window.urbanbiteRequiereSupabase?.()) return;

    try {
        await window.cargarProductosUrbanBite();
        await cargarPedidosCaja();
        suscribirCaja();
    } catch (error) {
        console.error(error);
        alert("No pudimos cargar Caja. Revisa Supabase y las políticas de la Fase 7.3.");
    }

    document.querySelectorAll(".caja-tab").forEach(btn => btn.addEventListener("click", () => {
        tabCaja = btn.dataset.tab;
        document.querySelectorAll(".caja-tab").forEach(b => b.classList.toggle("active", b === btn));
        renderizarListaPedidos();
    }));
    $("buscarPedido")?.addEventListener("input", renderizarListaPedidos);
    document.querySelectorAll(".metodo-pago").forEach(btn => btn.addEventListener("click", () => {
        metodoPagoCaja = btn.dataset.metodo;
        actualizarMetodoPagoUI();
    }));
    $("montoRecibido")?.addEventListener("input", calcularCambio);
    $("confirmarPagoBtn")?.addEventListener("click", confirmarPago);
    $("cancelarPedidoBtn")?.addEventListener("click", cancelarPedido);
    $("actualizarCajaBtn")?.addEventListener("click", cargarPedidosCaja);
    $("cerrarModalPago")?.addEventListener("click", cerrarModalPago);
    $("modalPagoExitoso")?.querySelector(".modal-caja-fondo")?.addEventListener("click", cerrarModalPago);
    actualizarMetodoPagoUI();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciarCaja, { once: true });
} else {
    iniciarCaja();
}
