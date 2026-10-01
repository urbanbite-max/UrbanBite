// ============================================================
// URBANBITE · FASE 7.3
// Catálogo 100% sincronizado con Supabase
// ============================================================

var productos = [];
window.productos = productos;
window.urbanbiteCatalogoCargado = false;

function ubNumero(valor) {
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : 0;
}

function ubImagenProducto(path) {
    if (!path) return "img/comida-rapida.png";
    return window.urbanbiteStoragePublicUrl
        ? window.urbanbiteStoragePublicUrl(path)
        : path;
}

async function cargarProductosUrbanBite(opciones = {}) {
    const sb = window.urbanbiteSupabase;
    if (!sb) {
        productos = [];
        window.productos = productos;
        window.urbanbiteCatalogoCargado = true;
        return productos;
    }

    const incluirRecetas = Boolean(opciones.incluirRecetas);

    const [productosResp, categoriasResp, extrasResp, removiblesResp] = await Promise.all([
        sb.from("productos")
            .select("id, categoria_id, nombre, descripcion, precio, imagen_url, activo, disponible, creado_en")
            .order("creado_en", { ascending: true }),
        sb.from("categorias").select("id, nombre, activo"),
        sb.from("producto_extras")
            .select("id, producto_id, nombre, precio, ingrediente_id, cantidad, activo")
            .eq("activo", true),
        sb.from("producto_removibles")
            .select("id, producto_id, nombre, ingrediente_id, activo")
            .eq("activo", true)
    ]);

    if (productosResp.error) {
        console.error("UrbanBite: no se pudo cargar productos", productosResp.error);
        throw productosResp.error;
    }

    const categorias = categoriasResp.data || [];
    const categoriasMap = new Map(categorias.map(c => [c.id, c.nombre]));
    const extras = extrasResp.error ? [] : (extrasResp.data || []);
    const removibles = removiblesResp.error ? [] : (removiblesResp.data || []);

    productos = (productosResp.data || []).map(row => {
        const extrasProducto = extras
            .filter(extra => extra.producto_id === row.id)
            .map(extra => ({
                id: extra.id,
                nombre: extra.nombre,
                precio: ubNumero(extra.precio),
                ingredienteId: extra.ingrediente_id,
                cantidad: ubNumero(extra.cantidad || 1)
            }));

        const removiblesProducto = removibles
            .filter(item => item.producto_id === row.id)
            .map(item => ({
                id: item.id,
                nombre: item.nombre,
                ingredienteId: item.ingrediente_id
            }));

        return {
            id: row.id,
            nombre: row.nombre,
            categoria: categoriasMap.get(row.categoria_id) || "Otros",
            precio: ubNumero(row.precio),
            descripcion: row.descripcion || "",
            imagen: ubImagenProducto(row.imagen_url),
            imagenPath: row.imagen_url || "",
            activo: row.activo !== false,
            disponible: row.activo !== false && row.disponible !== false,
            personalizable: extrasProducto.length > 0 || removiblesProducto.length > 0,
            extras: extrasProducto,
            removibles: removiblesProducto,
            receta: []
        };
    });

    if (incluirRecetas && productos.length) {
        await cargarRecetasUrbanBite();
    }

    window.productos = productos;
    window.urbanbiteCatalogoCargado = true;
    window.dispatchEvent(new CustomEvent("urbanbite:catalogo", { detail: productos }));
    return productos;
}

async function cargarRecetasUrbanBite() {
    const sb = window.urbanbiteSupabase;
    if (!sb || !productos.length) return;

    const [recetasResp, ingredientesResp, componentesResp] = await Promise.all([
        sb.from("recetas").select("id, producto_id, ingrediente_id, cantidad"),
        sb.from("ingredientes").select("id, nombre, unidad_medida"),
        sb.from("producto_componentes").select("id, producto_padre_id, producto_componente_id, cantidad")
    ]);

    if (recetasResp.error) {
        console.warn("UrbanBite: recetas no disponibles para este rol", recetasResp.error.message);
        return;
    }

    const ingredientesMap = new Map((ingredientesResp.data || []).map(i => [i.id, i]));
    const productosMap = new Map(productos.map(p => [p.id, p]));

    productos.forEach(p => { p.receta = []; });

    (recetasResp.data || []).forEach(r => {
        const producto = productosMap.get(r.producto_id);
        const ingrediente = ingredientesMap.get(r.ingrediente_id);
        if (!producto || !ingrediente) return;

        producto.receta.push({
            id: r.id,
            tipo: "ingrediente",
            nombre: ingrediente.nombre,
            ingredienteId: ingrediente.id,
            cantidad: ubNumero(r.cantidad),
            unidad: ingrediente.unidad_medida
        });
    });

    if (!componentesResp.error) {
        (componentesResp.data || []).forEach(c => {
            const padre = productosMap.get(c.producto_padre_id);
            const hijo = productosMap.get(c.producto_componente_id);
            if (!padre || !hijo) return;
            padre.receta.push({
                id: c.id,
                tipo: "subproducto",
                subproducto: true,
                subproductoId: hijo.id,
                nombre: hijo.nombre,
                cantidad: ubNumero(c.cantidad),
                unidad: "und"
            });
        });
    }
}

function obtenerProductoUrbanBite(id) {
    return productos.find(p => String(p.id) === String(id)) || null;
}

let ubCanalCatalogo = null;
function suscribirCatalogoUrbanBite(callback) {
    const sb = window.urbanbiteSupabase;
    if (!sb) return null;

    if (ubCanalCatalogo) {
        sb.removeChannel(ubCanalCatalogo);
    }

    ubCanalCatalogo = sb
        .channel("urbanbite-catalogo")
        .on("postgres_changes", { event: "*", schema: "public", table: "productos" }, async () => {
            try {
                await cargarProductosUrbanBite();
                callback?.(productos);
            } catch (error) {
                console.error(error);
            }
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "producto_extras" }, async () => {
            try {
                await cargarProductosUrbanBite();
                callback?.(productos);
            } catch (error) {
                console.error(error);
            }
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "producto_removibles" }, async () => {
            try {
                await cargarProductosUrbanBite();
                callback?.(productos);
            } catch (error) {
                console.error(error);
            }
        })
        .subscribe();

    return ubCanalCatalogo;
}

window.cargarProductosUrbanBite = cargarProductosUrbanBite;
window.cargarRecetasUrbanBite = cargarRecetasUrbanBite;
window.obtenerProductoUrbanBite = obtenerProductoUrbanBite;
window.suscribirCatalogoUrbanBite = suscribirCatalogoUrbanBite;
