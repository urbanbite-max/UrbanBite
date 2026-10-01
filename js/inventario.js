// ============================================================
// URBANBITE · FASE 7.3
// Inventario 100% Supabase
// ============================================================

var inventarioUrbanBite = [];
var movimientosUrbanBite = [];
let canalInventarioUrbanBite = null;

function inventarioNumero(valor) {
    const n = Number(valor);
    return Number.isFinite(n) ? n : 0;
}

function normalizarIngredienteBD(row) {
    return {
        id: row.id,
        nombre: row.nombre,
        unidad: row.unidad_medida,
        stock: inventarioNumero(row.stock_actual),
        minimo: inventarioNumero(row.stock_minimo),
        costo: inventarioNumero(row.costo_unitario),
        activo: row.activo !== false,
        actualizadoEn: row.actualizado_en
    };
}

async function cargarInventarioSupabase() {
    const sb = window.urbanbiteSupabase;
    if (!sb) return { inventario: [], movimientos: [] };

    const [ingResp, movResp] = await Promise.all([
        sb.from("ingredientes")
            .select("id, nombre, unidad_medida, stock_actual, stock_minimo, costo_unitario, activo, actualizado_en")
            .eq("activo", true)
            .order("nombre", { ascending: true }),
        sb.from("movimientos_inventario")
            .select("id, ingrediente_id, pedido_id, tipo, cantidad, stock_anterior, stock_nuevo, observacion, creado_en")
            .order("creado_en", { ascending: false })
            .limit(100)
    ]);

    if (ingResp.error) throw ingResp.error;

    inventarioUrbanBite = (ingResp.data || []).map(normalizarIngredienteBD);
    const mapa = new Map(inventarioUrbanBite.map(i => [i.id, i]));
    movimientosUrbanBite = movResp.error ? [] : (movResp.data || []).map(mov => ({
        id: mov.id,
        ingredienteId: mov.ingrediente_id,
        ingrediente: mapa.get(mov.ingrediente_id)?.nombre || "Ingrediente",
        unidad: mapa.get(mov.ingrediente_id)?.unidad || "",
        pedidoId: mov.pedido_id,
        tipo: mov.tipo,
        cantidad: inventarioNumero(mov.cantidad),
        stockAnterior: inventarioNumero(mov.stock_anterior),
        stockNuevo: inventarioNumero(mov.stock_nuevo),
        motivo: mov.observacion || mov.tipo,
        fecha: mov.creado_en
    }));

    window.inventarioUrbanBite = inventarioUrbanBite;
    window.movimientosUrbanBite = movimientosUrbanBite;
    window.dispatchEvent(new CustomEvent("urbanbite:inventario", { detail: { inventario: inventarioUrbanBite, movimientos: movimientosUrbanBite } }));
    return { inventario: inventarioUrbanBite, movimientos: movimientosUrbanBite };
}

function obtenerInventario() {
    return inventarioUrbanBite;
}

function obtenerMovimientosInventario() {
    return movimientosUrbanBite;
}

function buscarIngrediente(idIngrediente) {
    return inventarioUrbanBite.find(item => String(item.id) === String(idIngrediente)) || null;
}

function ingredientesStockBajo() {
    return inventarioUrbanBite.filter(item => Number(item.stock) <= Number(item.minimo));
}

async function ajustarStockIngrediente(idIngrediente, nuevoStock, observacion = "Cantidad configurada por administrador") {
    const sb = window.urbanbiteSupabase;
    if (!sb) return { ok: false, mensaje: "Supabase no está configurado." };
    const stock = Number(nuevoStock);
    if (!Number.isFinite(stock) || stock < 0) return { ok: false, mensaje: "El stock debe ser 0 o mayor." };

    const { data, error } = await sb.rpc("ajustar_stock_ingrediente", {
        p_ingrediente_id: idIngrediente,
        p_nuevo_stock: stock,
        p_observacion: observacion
    });

    if (error) return { ok: false, mensaje: error.message };
    await cargarInventarioSupabase();
    return { ok: true, data };
}

function suscribirInventarioUrbanBite(callback) {
    const sb = window.urbanbiteSupabase;
    if (!sb) return null;
    if (canalInventarioUrbanBite) sb.removeChannel(canalInventarioUrbanBite);
    let timer;
    const refresh = () => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
            try {
                await cargarInventarioSupabase();
                callback?.();
            } catch (error) {
                console.error(error);
            }
        }, 120);
    };

    canalInventarioUrbanBite = sb.channel("urbanbite-inventario")
        .on("postgres_changes", { event: "*", schema: "public", table: "ingredientes" }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "movimientos_inventario" }, refresh)
        .subscribe();
    return canalInventarioUrbanBite;
}

window.cargarInventarioSupabase = cargarInventarioSupabase;
window.obtenerInventario = obtenerInventario;
window.obtenerMovimientosInventario = obtenerMovimientosInventario;
window.buscarIngrediente = buscarIngrediente;
window.ingredientesStockBajo = ingredientesStockBajo;
window.ajustarStockIngrediente = ajustarStockIngrediente;
window.suscribirInventarioUrbanBite = suscribirInventarioUrbanBite;
