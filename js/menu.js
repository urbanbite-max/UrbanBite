// ============================================================
// URBANBITE · FASE 7.3
// Menú en línea sincronizado con Supabase
// ============================================================

const contenedorProductos = document.getElementById("productos");
const contenedorCategorias = document.getElementById("categorias");
const buscador = document.getElementById("buscador");
const tituloCategoria = document.getElementById("tituloCategoria");
const botonCarrito = document.getElementById("botonCarrito");

const productoModal = document.getElementById("productoModal");
const modalFondo = document.getElementById("modalFondo");
const cerrarModalBtn = document.getElementById("cerrarModal");
const modalImagen = document.getElementById("modalImagen");
const modalNombre = document.getElementById("modalNombre");
const modalDescripcion = document.getElementById("modalDescripcion");
const modalPrecio = document.getElementById("modalPrecio");
const listaExtras = document.getElementById("listaExtras");
const listaRemovibles = document.getElementById("listaRemovibles");
const notaProducto = document.getElementById("notaProducto");
const cantidadModalElemento = document.getElementById("cantidadModal");
const totalModal = document.getElementById("totalModal");

let categoriaActual = "Todos";
let productoSeleccionado = null;
let cantidadModal = 1;

function menuEscapar(texto) {
    return String(texto ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function moneda(valor) {
    return "$" + Number(valor || 0).toLocaleString("es-CO");
}

function estaDisponibleProducto(producto) {
    return producto?.disponible !== false;
}

function categoriasActuales() {
    return ["Todos", ...Array.from(new Set((window.productos || []).map(p => p.categoria).filter(Boolean)))];
}

function crearCategorias() {
    if (!contenedorCategorias) return;
    const categorias = categoriasActuales();
    if (!categorias.includes(categoriaActual)) categoriaActual = "Todos";
    contenedorCategorias.innerHTML = "";

    categorias.forEach(categoria => {
        const boton = document.createElement("button");
        boton.className = `categoria-btn${categoria === categoriaActual ? " active" : ""}`;
        boton.textContent = categoria;
        boton.addEventListener("click", () => {
            categoriaActual = categoria;
            if (tituloCategoria) tituloCategoria.textContent = categoria === "Todos" ? "Todos los productos" : categoria;
            crearCategorias();
            mostrarProductos();
        });
        contenedorCategorias.appendChild(boton);
    });
}

function mostrarProductos() {
    if (!contenedorProductos) return;
    const texto = (buscador?.value || "").toLowerCase().trim();
    const lista = (window.productos || []).filter(producto => {
        const coincideCategoria = categoriaActual === "Todos" || producto.categoria === categoriaActual;
        const coincideBusqueda = producto.nombre.toLowerCase().includes(texto) || (producto.descripcion || "").toLowerCase().includes(texto);
        return coincideCategoria && coincideBusqueda && producto.activo !== false;
    });

    contenedorProductos.innerHTML = "";

    if (!lista.length) {
        contenedorProductos.innerHTML = `
            <div class="sin-productos">
                <span>🍔</span>
                <h3>No hay productos para mostrar</h3>
                <p>Prueba otra categoría o vuelve a intentar en unos segundos.</p>
            </div>`;
        return;
    }

    lista.forEach(producto => {
        const tarjeta = document.createElement("article");
        tarjeta.className = "producto-card";
        tarjeta.innerHTML = `
            <div class="producto-imagen"><img src="${menuEscapar(producto.imagen)}" alt="${menuEscapar(producto.nombre)}"></div>
            <div class="producto-info">
                <span class="producto-categoria">${menuEscapar(producto.categoria)}</span>
                <h3>${menuEscapar(producto.nombre)}</h3>
                <p>${menuEscapar(producto.descripcion)}</p>
                <div class="producto-footer">
                    <strong>${moneda(producto.precio)}</strong>
                    ${estaDisponibleProducto(producto)
                        ? `<button class="agregar-btn" data-producto="${menuEscapar(producto.id)}">+</button>`
                        : `<span class="agotado">Agotado</span>`}
                </div>
            </div>`;
        contenedorProductos.appendChild(tarjeta);
    });

    contenedorProductos.querySelectorAll(".agregar-btn").forEach(boton => {
        boton.addEventListener("click", () => abrirProducto(boton.dataset.producto));
    });
}

function abrirProducto(idProducto) {
    const producto = (window.productos || []).find(item => String(item.id) === String(idProducto));
    if (!producto || !producto.disponible) return;

    if (!producto.personalizable) {
        window.agregarAlCarrito?.(producto.id);
        mostrarToast(`${producto.nombre} agregado`);
        return;
    }

    productoSeleccionado = producto;
    cantidadModal = 1;
    modalImagen.innerHTML = `<img src="${menuEscapar(producto.imagen)}" alt="${menuEscapar(producto.nombre)}">`;
    modalNombre.textContent = producto.nombre;
    modalDescripcion.textContent = producto.descripcion;
    modalPrecio.textContent = moneda(producto.precio);
    cantidadModalElemento.textContent = cantidadModal;
    notaProducto.value = "";
    renderizarExtras();
    renderizarRemovibles();
    actualizarTotalModal();
    productoModal.classList.add("activo");
    document.body.classList.add("modal-abierto");
}

function renderizarExtras() {
    listaExtras.innerHTML = "";
    const extras = productoSeleccionado?.extras || [];
    document.getElementById("seccionExtras")?.classList.toggle("oculto", !extras.length);

    extras.forEach(extra => {
        const opcion = document.createElement("label");
        opcion.className = "opcion-item";
        opcion.innerHTML = `
            <div><strong>${menuEscapar(extra.nombre)}</strong><span>+${moneda(extra.precio)}</span></div>
            <input type="checkbox" class="extra-checkbox" value="${menuEscapar(extra.id)}">`;
        listaExtras.appendChild(opcion);
    });
    listaExtras.querySelectorAll(".extra-checkbox").forEach(check => check.addEventListener("change", actualizarTotalModal));
}

function renderizarRemovibles() {
    listaRemovibles.innerHTML = "";
    const removibles = productoSeleccionado?.removibles || [];
    document.getElementById("seccionRemovibles")?.classList.toggle("oculto", !removibles.length);

    removibles.forEach(item => {
        const opcion = document.createElement("label");
        opcion.className = "opcion-item";
        opcion.innerHTML = `
            <div><strong>${menuEscapar(item.nombre)}</strong></div>
            <input type="checkbox" class="removible-checkbox" value="${menuEscapar(item.id)}">`;
        listaRemovibles.appendChild(opcion);
    });
}

function calcularPrecioUnitarioModal() {
    if (!productoSeleccionado) return 0;
    let precio = Number(productoSeleccionado.precio || 0);
    document.querySelectorAll(".extra-checkbox:checked").forEach(check => {
        const extra = productoSeleccionado.extras.find(item => String(item.id) === check.value);
        if (extra) precio += Number(extra.precio || 0);
    });
    return precio;
}

function actualizarTotalModal() {
    totalModal.textContent = moneda(calcularPrecioUnitarioModal() * cantidadModal);
    cantidadModalElemento.textContent = cantidadModal;
}

function cerrarModal() {
    productoModal?.classList.remove("activo");
    document.body.classList.remove("modal-abierto");
    productoSeleccionado = null;
}

function mostrarToast(texto) {
    document.querySelector(".toast")?.remove();
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = `✓ ${texto}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add("mostrar"), 20);
    setTimeout(() => toast.remove(), 1800);
}

async function iniciarMenu() {
    await (window.urbanbiteAuthReady || Promise.resolve(true));
    if (!window.urbanbiteRequiereSupabase?.()) return;

    try {
        await window.cargarProductosUrbanBite();
        window.sincronizarCarritoConCatalogo?.();
        crearCategorias();
        mostrarProductos();
        window.actualizarCarrito?.();

        window.suscribirCatalogoUrbanBite?.(() => {
            window.sincronizarCarritoConCatalogo?.();
            crearCategorias();
            mostrarProductos();
            window.actualizarCarrito?.();
        });
    } catch (error) {
        console.error(error);
        contenedorProductos.innerHTML = `<div class="sin-productos"><h3>No pudimos conectar con el menú</h3><p>Revisa Supabase y vuelve a cargar.</p></div>`;
    }

    buscador?.addEventListener("input", mostrarProductos);
    botonCarrito?.addEventListener("click", () => {
        if (!window.carrito?.length) return alert("Tu carrito está vacío");
        window.location.href = "carrito.html";
    });

    document.getElementById("aumentarModal")?.addEventListener("click", () => {
        cantidadModal += 1;
        actualizarTotalModal();
    });
    document.getElementById("disminuirModal")?.addEventListener("click", () => {
        if (cantidadModal > 1) cantidadModal -= 1;
        actualizarTotalModal();
    });
    document.getElementById("agregarProductoModal")?.addEventListener("click", () => {
        if (!productoSeleccionado) return;
        const extras = Array.from(document.querySelectorAll(".extra-checkbox:checked"))
            .map(check => productoSeleccionado.extras.find(item => String(item.id) === check.value))
            .filter(Boolean);
        const removidos = Array.from(document.querySelectorAll(".removible-checkbox:checked"))
            .map(check => productoSeleccionado.removibles.find(item => String(item.id) === check.value))
            .filter(Boolean);
        window.agregarProductoPersonalizado?.(productoSeleccionado, cantidadModal, extras, removidos, notaProducto.value.trim());
        mostrarToast(`${productoSeleccionado.nombre} agregado`);
        cerrarModal();
    });
    cerrarModalBtn?.addEventListener("click", cerrarModal);
    modalFondo?.addEventListener("click", cerrarModal);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciarMenu, { once: true });
} else {
    iniciarMenu();
}
