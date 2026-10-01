-- URBANBITE FASE 7.2 - CONSULTAS DE VERIFICACIÓN
-- Este archivo NO modifica datos. Sirve para comprobar la configuración.

-- Deben existir 14 productos y todos deben tener imagen_url.
select
    count(*) as total_productos,
    count(imagen_url) as productos_con_imagen
from public.productos;

-- Ver catálogo que consumirá el frontend.
select
    p.nombre,
    p.precio,
    p.activo,
    p.disponible,
    p.imagen_url,
    c.nombre as categoria
from public.productos p
left join public.categorias c on c.id = p.categoria_id
order by c.nombre, p.nombre;

-- Deben aparecer 16 ingredientes según la carga inicial actual.
select count(*) as total_ingredientes
from public.ingredientes;

-- Deben aparecer 6 componentes de combos.
select count(*) as componentes_combo
from public.producto_componentes;
