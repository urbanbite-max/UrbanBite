// ============================================================
// URBANBITE · FASE 7.3
// Carrito temporal de la pestaña (sessionStorage)
// Los datos compartidos del negocio viven en Supabase.
// ============================================================

const UB_CLAVE_CARRITO = "urbanbite_carrito_sesion";

function crearIdCarrito() {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function leerCarritoSesion() {
    try {
        const parsed = JSON.parse(sessionStorage.getItem(UB_CLAVE_CARRITO) || "[]");
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

var carrito = leerCarritoSesion().map(item => ({
    ...item,
    cartId: item.cartId || crearIdCarrito(),
    extras: Array.isArray(item.extras) ? item.extras : [],
    removidos: Array.isArray(item.removidos) ? item.removidos : [],
    cantidad: Math.max(1, Number(item.cantidad || 1))
}));
window.carrito = carrito;

function guardarCarrito() {
    sessionStorage.setItem(UB_CLAVE_CARRITO, JSON.stringify(carrito));
    window.carrito = carrito;
}

function sincronizarCarritoConCatalogo() {
    if (!Array.isArray(window.productos) || !window.productos.length) return;

    carrito = carrito
        .map(item => {
            const producto = window.productos.find(p => String(p.id) === String(item.id));
            if (!producto || !producto.disponible) return null;

            const extras = (item.extras || [])
                .map(extraGuardado => {
                    const actual = (producto.extras || []).find(e => String(e.id) === String(extraGuardado.id));
                    return actual ? { ...actual } : null;
                })
                .filter(Boolean);

            const removidos = (item.removidos || [])
                .map(removidoGuardado => {
                    const actual = (producto.removibles || []).find(r => String(r.id) === String(removidoGuardado.id));
                    return actual ? { ...actual } : null;
                })
                .filter(Boolean);

            const precioUnitario = Number(producto.precio || 0) + extras.reduce((s, e) => s + Number(e.precio || 0), 0);

            return {
                ...item,
                id: producto.id,
                nombre: producto.nombre,
                imagen: producto.imagen,
                precio: Number(producto.precio || 0),
                precioUnitario,
                extras,
                removidos
            };
        })
        .filter(Boolean);

    window.carrito = carrito;
    guardarCarrito();
}

function agregarAlCarrito(idProducto) {
    const producto = (window.productos || []).find(p => String(p.id) === String(idProducto));
    if (!producto || !producto.disponible) return;

    const existente = carrito.find(item => String(item.id) === String(producto.id) && !item.personalizado);
    if (existente) {
        existente.cantidad += 1;
    } else {
        carrito.push({
            cartId: crearIdCarrito(),
            id: producto.id,
            nombre: producto.nombre,
            imagen: producto.imagen,
            precio: Number(producto.precio || 0),
            precioUnitario: Number(producto.precio || 0),
            cantidad: 1,
            personalizado: false,
            extras: [],
            removidos: [],
            nota: ""
        });
    }

    guardarCarrito();
    actualizarCarrito();
}

function agregarProductoPersonalizado(producto, cantidad, extras, removidos, nota) {
    if (!producto?.disponible) return;

    const extrasValidos = (extras || []).map(extra => ({
        id: extra.id,
        nombre: extra.nombre,
        precio: Number(extra.precio || 0),
        cantidad: Number(extra.cantidad || 1)
    }));

    const removidosValidos = (removidos || []).map(item => ({
        id: item.id,
        nombre: item.nombre
    }));

    const precioUnitario = Number(producto.precio || 0) + extrasValidos.reduce((s, e) => s + e.precio, 0);

    carrito.push({
        cartId: crearIdCarrito(),
        id: producto.id,
        nombre: producto.nombre,
        imagen: producto.imagen,
        precio: Number(producto.precio || 0),
        precioUnitario,
        cantidad: Math.max(1, Number(cantidad || 1)),
        personalizado: true,
        extras: extrasValidos,
        removidos: removidosValidos,
        nota: String(nota || "").trim()
    });

    guardarCarrito();
    actualizarCarrito();
}

function calcularCantidadCarrito() {
    return carrito.reduce((total, item) => total + Number(item.cantidad || 0), 0);
}

function calcularTotalCarrito() {
    return carrito.reduce((total, item) => total + Number(item.precioUnitario || 0) * Number(item.cantidad || 0), 0);
}

function actualizarCarrito() {
    document.getElementById("cantidadCarrito")?.replaceChildren(document.createTextNode(String(calcularCantidadCarrito())));
    const total = document.getElementById("totalCarrito");
    if (total) total.textContent = calcularTotalCarrito().toLocaleString("es-CO");
}

function aumentarCantidad(cartId) {
    const item = carrito.find(x => x.cartId === cartId);
    if (!item) return;
    item.cantidad += 1;
    guardarCarrito();
    renderizarCarrito();
    actualizarCarrito();
}

function disminuirCantidad(cartId) {
    const item = carrito.find(x => x.cartId === cartId);
    if (!item) return;
    item.cantidad -= 1;
    if (item.cantidad <= 0) carrito = carrito.filter(x => x.cartId !== cartId);
    window.carrito = carrito;
    guardarCarrito();
    renderizarCarrito();
    actualizarCarrito();
}

function eliminarProducto(cartId) {
    carrito = carrito.filter(x => x.cartId !== cartId);
    window.carrito = carrito;
    guardarCarrito();
    renderizarCarrito();
    actualizarCarrito();
}

function vaciarCarrito(confirmarUsuario = true) {
    if (!carrito.length) return;
    if (confirmarUsuario && !confirm("¿Quieres eliminar todos los productos?")) return;
    carrito = [];
    window.carrito = carrito;
    guardarCarrito();
    renderizarCarrito();
    actualizarCarrito();
}

function ubEscapar(texto) {
    return String(texto ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function renderizarCarrito() {
    const lista = document.getElementById("listaCarrito");
    const vacio = document.getElementById("carritoVacio");
    const resumen = document.getElementById("resumenPedido");
    if (!lista) return;

    lista.innerHTML = "";
    if (!carrito.length) {
        if (vacio) vacio.style.display = "flex";
        if (resumen) resumen.style.display = "none";
        lista.style.display = "none";
        return;
    }

    if (vacio) vacio.style.display = "none";
    if (resumen) resumen.style.display = "block";
    lista.style.display = "flex";

    carrito.forEach(item => {
        const subtotal = Number(item.precioUnitario) * Number(item.cantidad);
        const detalles = [
            item.extras?.length ? `<div class="detalle-personalizacion"><span class="detalle-extra">+</span>${item.extras.map(e => ubEscapar(e.nombre)).join(", ")}</div>` : "",
            item.removidos?.length ? `<div class="detalle-personalizacion"><span class="detalle-quitar">−</span>${item.removidos.map(r => ubEscapar(r.nombre.replace(/^Sin /i, ""))).join(", ")}</div>` : "",
            item.nota ? `<div class="nota-cocina-carrito">📝 ${ubEscapar(item.nota)}</div>` : ""
        ].join("");

        const tarjeta = document.createElement("article");
        tarjeta.className = "carrito-producto";
        tarjeta.innerHTML = `
            <div class="carrito-producto-imagen"><img src="${ubEscapar(item.imagen)}" alt="${ubEscapar(item.nombre)}"></div>
            <div class="carrito-producto-info">
                <div class="producto-superior">
                    <div>
                        <h3>${ubEscapar(item.nombre)}</h3>
                        <span>$${Number(item.precioUnitario).toLocaleString("es-CO")} c/u</span>
                        ${detalles}
                    </div>
                    <button class="eliminar-producto" data-eliminar="${ubEscapar(item.cartId)}">✕</button>
                </div>
                <div class="producto-inferior">
                    <div class="control-cantidad">
                        <button data-restar="${ubEscapar(item.cartId)}">−</button>
                        <strong>${item.cantidad}</strong>
                        <button data-sumar="${ubEscapar(item.cartId)}">+</button>
                    </div>
                    <strong class="subtotal-producto">$${subtotal.toLocaleString("es-CO")}</strong>
                </div>
            </div>`;
        lista.appendChild(tarjeta);
    });

    lista.querySelectorAll("[data-eliminar]").forEach(b => b.addEventListener("click", () => eliminarProducto(b.dataset.eliminar)));
    lista.querySelectorAll("[data-restar]").forEach(b => b.addEventListener("click", () => disminuirCantidad(b.dataset.restar)));
    lista.querySelectorAll("[data-sumar]").forEach(b => b.addEventListener("click", () => aumentarCantidad(b.dataset.sumar)));
    actualizarResumen();
}

function actualizarResumen() {
    const cantidad = document.getElementById("cantidadResumen");
    const subtotal = document.getElementById("subtotalCarrito");
    const total = document.getElementById("totalResumen");
    if (cantidad) cantidad.textContent = calcularCantidadCarrito();
    if (subtotal) subtotal.textContent = calcularTotalCarrito().toLocaleString("es-CO");
    if (total) total.textContent = calcularTotalCarrito().toLocaleString("es-CO");
}

async function iniciarCarritoPagina() {
    await (window.urbanbiteAuthReady || Promise.resolve(true));
    if (window.cargarProductosUrbanBite) {
        try {
            await window.cargarProductosUrbanBite();
            sincronizarCarritoConCatalogo();
        } catch (error) {
            console.error(error);
        }
    }
    renderizarCarrito();
    actualizarCarrito();

    document.getElementById("vaciarCarrito")?.addEventListener("click", () => vaciarCarrito(true));
    document.getElementById("continuarPedido")?.addEventListener("click", () => {
        if (carrito.length) window.location.href = "pedido.html";
    });
}

window.guardarCarrito = guardarCarrito;
window.agregarAlCarrito = agregarAlCarrito;
window.agregarProductoPersonalizado = agregarProductoPersonalizado;
window.calcularCantidadCarrito = calcularCantidadCarrito;
window.calcularTotalCarrito = calcularTotalCarrito;
window.actualizarCarrito = actualizarCarrito;
window.renderizarCarrito = renderizarCarrito;
window.vaciarCarrito = vaciarCarrito;
window.sincronizarCarritoConCatalogo = sincronizarCarritoConCatalogo;

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciarCarritoPagina, { once: true });
} else {
    iniciarCarritoPagina();
}
