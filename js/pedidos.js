// ============================================================
// URBANBITE · FASE 7.3
// Creación de pedidos directamente en Supabase
// ============================================================

const resumenFinalProductos = document.getElementById("resumenFinalProductos");
const cantidadFinal = document.getElementById("cantidadFinal");
const totalFinal = document.getElementById("totalFinal");
const generarPedidoBtn = document.getElementById("generarPedidoBtn");
const pedidoExito = document.getElementById("pedidoExito");
const datosPedidoCard = document.getElementById("datosPedidoCard");
const numeroPedidoGenerado = document.getElementById("numeroPedidoGenerado");
const grupoMesa = document.getElementById("grupoMesa");
const numeroMesa = document.getElementById("numeroMesa");

let tipoPedido = "mesa";

function pedidoEscapar(texto) {
    return String(texto ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatoDinero(valor) {
    return "$" + Number(valor || 0).toLocaleString("es-CO");
}

function renderizarResumenFinal() {
    if (!window.carrito?.length) {
        window.location.href = "menu.html";
        return;
    }

    resumenFinalProductos.innerHTML = "";
    window.carrito.forEach(item => {
        const linea = document.createElement("div");
        linea.className = "resumen-final-item";
        const personalizacion = [
            item.extras?.length ? `<small>+ ${item.extras.map(e => pedidoEscapar(e.nombre)).join(", ")}</small>` : "",
            item.removidos?.length ? `<small>− ${item.removidos.map(r => pedidoEscapar(r.nombre.replace(/^Sin /i, ""))).join(", ")}</small>` : "",
            item.nota ? `<small>📝 ${pedidoEscapar(item.nota)}</small>` : ""
        ].join("");

        linea.innerHTML = `
            <div class="resumen-final-item-info">
                <div class="resumen-final-emoji"><img src="${pedidoEscapar(item.imagen)}" alt="${pedidoEscapar(item.nombre)}"></div>
                <div><strong>${item.cantidad}x ${pedidoEscapar(item.nombre)}</strong>${personalizacion}</div>
            </div>
            <strong>${formatoDinero(item.precioUnitario * item.cantidad)}</strong>`;
        resumenFinalProductos.appendChild(linea);
    });

    cantidadFinal.textContent = window.calcularCantidadCarrito?.() || 0;
    totalFinal.textContent = Number(window.calcularTotalCarrito?.() || 0).toLocaleString("es-CO");
}

function configurarTiposPedido() {
    document.querySelectorAll(".tipo-pedido-btn").forEach(boton => {
        boton.addEventListener("click", () => {
            document.querySelectorAll(".tipo-pedido-btn").forEach(item => item.classList.remove("active"));
            boton.classList.add("active");
            tipoPedido = boton.dataset.tipo;
            if (tipoPedido === "mesa") {
                grupoMesa.style.display = "block";
            } else {
                grupoMesa.style.display = "none";
                numeroMesa.value = "";
            }
        });
    });
}

function itemsParaSupabase() {
    return (window.carrito || []).map(item => ({
        producto_id: item.id,
        cantidad: Number(item.cantidad || 1),
        extras: (item.extras || []).map(extra => extra.id),
        removibles: (item.removidos || []).map(removido => removido.id),
        nota: item.nota || ""
    }));
}

async function crearPedido() {
    const sb = window.urbanbiteSupabase;
    if (!sb) return alert("Falta configurar Supabase.");
    if (!window.carrito?.length) return alert("Tu carrito está vacío.");

    if (tipoPedido === "mesa" && (!numeroMesa.value || Number(numeroMesa.value) < 1)) {
        alert("Escribe el número de mesa.");
        numeroMesa.focus();
        return;
    }

    generarPedidoBtn.disabled = true;
    const textoOriginal = generarPedidoBtn.innerHTML;
    generarPedidoBtn.innerHTML = `<div><span>Enviando pedido...</span><small>Guardando en línea</small></div><strong>…</strong>`;

    const nombreCliente = document.getElementById("nombreCliente").value.trim();
    const notaGeneral = document.getElementById("notaGeneral").value.trim();

    const { data, error } = await sb.rpc("crear_pedido_publico", {
        p_nombre_cliente: nombreCliente || "Cliente",
        p_tipo_entrega: tipoPedido === "mesa" ? "local" : "recoger",
        p_numero_mesa: tipoPedido === "mesa" ? Number(numeroMesa.value) : null,
        p_notas: notaGeneral || null,
        p_items: itemsParaSupabase()
    });

    generarPedidoBtn.disabled = false;
    generarPedidoBtn.innerHTML = textoOriginal;

    if (error) {
        console.error(error);
        alert(`No se pudo generar el pedido. ${error.message || "Intenta nuevamente."}`);
        return;
    }

    const resultado = Array.isArray(data) ? data[0] : data;
    const numero = resultado?.numero_pedido;
    if (!numero) {
        alert("El pedido se guardó, pero no pudimos obtener su número. Revisa Supabase.");
        return;
    }

    window.vaciarCarrito?.(false);
    mostrarPedidoGenerado(`UB-${String(numero).padStart(3, "0")}`);
}

function mostrarPedidoGenerado(numeroPedido) {
    numeroPedidoGenerado.textContent = numeroPedido;
    datosPedidoCard.style.display = "none";
    document.querySelectorAll(".pedido-card").forEach(card => card.style.display = "none");
    generarPedidoBtn.style.display = "none";
    pedidoExito.style.display = "flex";
    window.scrollTo({ top: 0, behavior: "smooth" });
}

async function iniciarPedidoPagina() {
    await (window.urbanbiteAuthReady || Promise.resolve(true));
    if (!window.urbanbiteRequiereSupabase?.()) return;

    try {
        await window.cargarProductosUrbanBite();
        window.sincronizarCarritoConCatalogo?.();
    } catch (error) {
        console.error(error);
    }

    if (!window.carrito?.length) {
        window.location.replace("menu.html");
        return;
    }

    configurarTiposPedido();
    renderizarResumenFinal();
    generarPedidoBtn?.addEventListener("click", crearPedido);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciarPedidoPagina, { once: true });
} else {
    iniciarPedidoPagina();
}
