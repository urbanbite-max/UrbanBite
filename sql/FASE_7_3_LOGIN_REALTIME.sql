-- ============================================================================
-- URBANBITE · FASE 7.3
-- Login por roles + pedidos online + inventario + Realtime
-- Ejecuta TODO este archivo una sola vez en Supabase > SQL Editor.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. CAMPOS QUE FALTAN EN PEDIDOS / DETALLE
-- ---------------------------------------------------------------------------

alter table public.pedidos
    add column if not exists numero_mesa integer,
    add column if not exists fecha_pago timestamptz;

alter table public.detalle_pedido
    add column if not exists configuracion jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- 2. EXTRAS Y OPCIONES REMOVIBLES DEL MENÚ
-- ---------------------------------------------------------------------------

create table if not exists public.producto_extras (
    id uuid primary key default gen_random_uuid(),
    producto_id uuid not null references public.productos(id) on delete cascade,
    nombre text not null,
    precio numeric(12,2) not null default 0 check (precio >= 0),
    ingrediente_id uuid not null references public.ingredientes(id) on delete restrict,
    cantidad numeric(12,3) not null default 1 check (cantidad > 0),
    activo boolean not null default true,
    creado_en timestamptz not null default now(),
    unique(producto_id, nombre)
);

create table if not exists public.producto_removibles (
    id uuid primary key default gen_random_uuid(),
    producto_id uuid not null references public.productos(id) on delete cascade,
    nombre text not null,
    ingrediente_id uuid not null references public.ingredientes(id) on delete restrict,
    activo boolean not null default true,
    creado_en timestamptz not null default now(),
    unique(producto_id, nombre)
);

create index if not exists idx_producto_extras_producto on public.producto_extras(producto_id);
create index if not exists idx_producto_removibles_producto on public.producto_removibles(producto_id);

alter table public.producto_extras enable row level security;
alter table public.producto_removibles enable row level security;

-- ---------------------------------------------------------------------------
-- 3. CARGAR EXTRAS DEL PROTOTIPO ORIGINAL
-- ---------------------------------------------------------------------------

with datos(producto, extra, precio, ingrediente, cantidad) as (
    values
    ('Hamburguesa Clásica','Carne extra',4000::numeric,'Carne',1::numeric),
    ('Hamburguesa Clásica','Queso extra',2000,'Queso',1),
    ('Hamburguesa Clásica','Bacon',3000,'Bacon',1),
    ('Hamburguesa Doble','Carne extra',4000,'Carne',1),
    ('Hamburguesa Doble','Queso extra',2000,'Queso',1),
    ('Hamburguesa Doble','Bacon',3000,'Bacon',1),
    ('Hamburguesa Bacon','Carne extra',4000,'Carne',1),
    ('Hamburguesa Bacon','Queso extra',2000,'Queso',1),
    ('Hamburguesa Bacon','Bacon extra',3000,'Bacon',1),
    ('Perro Clásico','Salchicha extra',3000,'Salchicha',1),
    ('Perro Clásico','Queso',2000,'Queso',1),
    ('Perro Clásico','Bacon',3000,'Bacon',1),
    ('Perro Especial','Salchicha extra',3000,'Salchicha',1),
    ('Perro Especial','Queso extra',2000,'Queso',1),
    ('Perro Especial','Bacon extra',3000,'Bacon',1),
    ('Salchipapa Personal','Salchicha extra',3000,'Salchicha',1),
    ('Salchipapa Personal','Queso extra',2000,'Queso',1),
    ('Salchipapa Personal','Carne',4000,'Carne',1),
    ('Salchipapa Especial','Salchicha extra',3000,'Salchicha',1),
    ('Salchipapa Especial','Queso extra',2000,'Queso',1),
    ('Salchipapa Especial','Carne extra',4000,'Carne',1)
)
insert into public.producto_extras(producto_id,nombre,precio,ingrediente_id,cantidad)
select p.id,d.extra,d.precio,i.id,d.cantidad
from datos d
join public.productos p on p.nombre=d.producto
join public.ingredientes i on i.nombre=d.ingrediente
on conflict(producto_id,nombre) do update
set precio=excluded.precio,
    ingrediente_id=excluded.ingrediente_id,
    cantidad=excluded.cantidad,
    activo=true;

with datos(producto, opcion, ingrediente) as (
    values
    ('Hamburguesa Clásica','Sin lechuga','Lechuga'),
    ('Hamburguesa Clásica','Sin tomate','Tomate'),
    ('Hamburguesa Clásica','Sin salsa','Salsa'),
    ('Hamburguesa Doble','Sin lechuga','Lechuga'),
    ('Hamburguesa Doble','Sin tomate','Tomate'),
    ('Hamburguesa Doble','Sin salsa','Salsa'),
    ('Hamburguesa Bacon','Sin lechuga','Lechuga'),
    ('Hamburguesa Bacon','Sin tomate','Tomate'),
    ('Hamburguesa Bacon','Sin salsa','Salsa'),
    ('Perro Clásico','Sin papa ripio','Papa ripio'),
    ('Perro Clásico','Sin salsas','Salsa'),
    ('Perro Especial','Sin papa ripio','Papa ripio'),
    ('Perro Especial','Sin salsas','Salsa'),
    ('Salchipapa Personal','Sin queso','Queso'),
    ('Salchipapa Personal','Sin salsas','Salsa'),
    ('Salchipapa Especial','Sin bacon','Bacon'),
    ('Salchipapa Especial','Sin queso','Queso'),
    ('Salchipapa Especial','Sin salsas','Salsa')
)
insert into public.producto_removibles(producto_id,nombre,ingrediente_id)
select p.id,d.opcion,i.id
from datos d
join public.productos p on p.nombre=d.producto
join public.ingredientes i on i.nombre=d.ingrediente
on conflict(producto_id,nombre) do update
set ingrediente_id=excluded.ingrediente_id,
    activo=true;

-- Costos que ya existían en el prototipo local. Solo rellena los que siguen en 0.
update public.ingredientes set costo_unitario = case nombre
    when 'Pan de hamburguesa' then 700
    when 'Pan de perro' then 600
    when 'Carne' then 2500
    when 'Queso' then 800
    when 'Bacon' then 600
    when 'Lechuga' then 8
    when 'Tomate' then 7
    when 'Salsa' then 5
    when 'Papa ripio' then 9
    when 'Salchicha' then 1200
    when 'Papa' then 4
    when 'Recipiente' then 350
    when 'Coca-Cola 400 ml' then 2200
    when 'Sprite 400 ml' then 2200
    when 'Kola Román 400 ml' then 2100
    when 'Agua' then 1200
    else costo_unitario
end
where costo_unitario = 0;

-- ---------------------------------------------------------------------------
-- 4. ROLES DE SUPABASE AUTH
-- ---------------------------------------------------------------------------

create or replace function public.rol_actual()
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
    select p.rol
    from public.perfiles p
    where p.id = auth.uid()
      and p.activo = true
    limit 1;
$$;

revoke all on function public.rol_actual() from public;
grant execute on function public.rol_actual() to anon, authenticated;

create or replace function public.crear_perfil_urbanbite()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    v_rol text;
    v_nombre text;
begin
    if lower(coalesce(new.email,'')) = 'admin@urbanbite.local' then
        v_rol := 'admin';
        v_nombre := 'Administrador';
    elsif lower(coalesce(new.email,'')) = 'cocineros@urbanbite.local' then
        v_rol := 'cocina';
        v_nombre := 'Cocina UrbanBite';
    else
        return new;
    end if;

    insert into public.perfiles(id,nombre,rol,activo)
    values(new.id,v_nombre,v_rol,true)
    on conflict(id) do update
    set nombre=excluded.nombre,
        rol=excluded.rol,
        activo=true,
        actualizado_en=now();

    return new;
end;
$$;

drop trigger if exists on_auth_user_created_urbanbite on auth.users;
create trigger on_auth_user_created_urbanbite
after insert or update of email on auth.users
for each row execute function public.crear_perfil_urbanbite();

-- Si ya creaste los usuarios antes de ejecutar este SQL, asigna su rol ahora.
insert into public.perfiles(id,nombre,rol,activo)
select id,
       case when lower(email)='admin@urbanbite.local' then 'Administrador' else 'Cocina UrbanBite' end,
       case when lower(email)='admin@urbanbite.local' then 'admin' else 'cocina' end,
       true
from auth.users
where lower(email) in ('admin@urbanbite.local','cocineros@urbanbite.local')
on conflict(id) do update
set nombre=excluded.nombre,
    rol=excluded.rol,
    activo=true,
    actualizado_en=now();

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------

alter table public.categorias enable row level security;
alter table public.productos enable row level security;
alter table public.ingredientes enable row level security;
alter table public.recetas enable row level security;
alter table public.producto_componentes enable row level security;
alter table public.pedidos enable row level security;
alter table public.detalle_pedido enable row level security;
alter table public.movimientos_inventario enable row level security;
alter table public.perfiles enable row level security;

-- Limpiamos políticas de esta app para que el archivo pueda volver a ejecutarse.
drop policy if exists categorias_publicas on public.categorias;
drop policy if exists productos_publicos on public.productos;
drop policy if exists ub_categorias_select on public.categorias;
drop policy if exists ub_productos_select on public.productos;
drop policy if exists ub_productos_admin_update on public.productos;
drop policy if exists ub_extras_select on public.producto_extras;
drop policy if exists ub_extras_admin on public.producto_extras;
drop policy if exists ub_removibles_select on public.producto_removibles;
drop policy if exists ub_removibles_admin on public.producto_removibles;
drop policy if exists ub_ingredientes_staff_select on public.ingredientes;
drop policy if exists ub_ingredientes_admin_update on public.ingredientes;
drop policy if exists ub_recetas_staff_select on public.recetas;
drop policy if exists ub_recetas_admin_update on public.recetas;
drop policy if exists ub_componentes_staff_select on public.producto_componentes;
drop policy if exists ub_componentes_admin_update on public.producto_componentes;
drop policy if exists ub_pedidos_staff_select on public.pedidos;
drop policy if exists ub_detalle_staff_select on public.detalle_pedido;
drop policy if exists ub_movimientos_admin_select on public.movimientos_inventario;
drop policy if exists ub_perfil_propio on public.perfiles;

create policy ub_categorias_select
on public.categorias for select
to anon, authenticated
using (activo=true or public.rol_actual() in ('admin','cocina'));

create policy ub_productos_select
on public.productos for select
to anon, authenticated
using ((activo=true and disponible=true) or public.rol_actual() in ('admin','cocina'));

create policy ub_productos_admin_update
on public.productos for update
to authenticated
using (public.rol_actual()='admin')
with check (public.rol_actual()='admin');

create policy ub_extras_select
on public.producto_extras for select
to anon, authenticated
using (activo=true or public.rol_actual()='admin');

create policy ub_extras_admin
on public.producto_extras for all
to authenticated
using (public.rol_actual()='admin')
with check (public.rol_actual()='admin');

create policy ub_removibles_select
on public.producto_removibles for select
to anon, authenticated
using (activo=true or public.rol_actual()='admin');

create policy ub_removibles_admin
on public.producto_removibles for all
to authenticated
using (public.rol_actual()='admin')
with check (public.rol_actual()='admin');

create policy ub_ingredientes_staff_select
on public.ingredientes for select
to authenticated
using (public.rol_actual() in ('admin','cocina'));

create policy ub_ingredientes_admin_update
on public.ingredientes for update
to authenticated
using (public.rol_actual()='admin')
with check (public.rol_actual()='admin');

create policy ub_recetas_staff_select
on public.recetas for select
to authenticated
using (public.rol_actual() in ('admin','cocina'));

create policy ub_recetas_admin_update
on public.recetas for update
to authenticated
using (public.rol_actual()='admin')
with check (public.rol_actual()='admin');

create policy ub_componentes_staff_select
on public.producto_componentes for select
to authenticated
using (public.rol_actual() in ('admin','cocina'));

create policy ub_componentes_admin_update
on public.producto_componentes for update
to authenticated
using (public.rol_actual()='admin')
with check (public.rol_actual()='admin');

create policy ub_pedidos_staff_select
on public.pedidos for select
to authenticated
using (public.rol_actual() in ('admin','cocina'));

create policy ub_detalle_staff_select
on public.detalle_pedido for select
to authenticated
using (public.rol_actual() in ('admin','cocina'));

create policy ub_movimientos_admin_select
on public.movimientos_inventario for select
to authenticated
using (public.rol_actual()='admin');

create policy ub_perfil_propio
on public.perfiles for select
to authenticated
using (id=auth.uid() or public.rol_actual()='admin');

-- ---------------------------------------------------------------------------
-- 6. CREAR PEDIDO PÚBLICO DE FORMA SEGURA
-- ---------------------------------------------------------------------------

create or replace function public.crear_pedido_publico(
    p_nombre_cliente text,
    p_tipo_entrega text,
    p_numero_mesa integer,
    p_notas text,
    p_items jsonb
)
returns table(pedido_id uuid, numero_pedido bigint, total numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_pedido_id uuid;
    v_item jsonb;
    v_producto record;
    v_cantidad integer;
    v_extra_total numeric;
    v_precio_unitario numeric;
    v_subtotal numeric;
    v_total numeric := 0;
begin
    if p_tipo_entrega not in ('local','recoger','domicilio') then
        raise exception 'Tipo de entrega inválido.';
    end if;

    if p_tipo_entrega='local' and (p_numero_mesa is null or p_numero_mesa < 1) then
        raise exception 'Debes indicar el número de mesa.';
    end if;

    if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then
        raise exception 'El pedido está vacío.';
    end if;

    insert into public.pedidos(
        nombre_cliente,tipo_entrega,numero_mesa,estado,estado_pago,
        subtotal,total,notas
    ) values(
        nullif(trim(coalesce(p_nombre_cliente,'')),''),
        p_tipo_entrega,p_numero_mesa,'pendiente','pendiente',0,0,
        nullif(trim(coalesce(p_notas,'')),'')
    ) returning id into v_pedido_id;

    for v_item in select value from jsonb_array_elements(p_items)
    loop
        v_cantidad := greatest(coalesce((v_item->>'cantidad')::integer,1),1);

        select p.id,p.nombre,p.precio
        into v_producto
        from public.productos p
        where p.id=(v_item->>'producto_id')::uuid
          and p.activo=true
          and p.disponible=true;

        if not found then
            raise exception 'Uno de los productos ya no está disponible.';
        end if;

        select coalesce(sum(pe.precio),0)
        into v_extra_total
        from public.producto_extras pe
        where pe.producto_id=v_producto.id
          and pe.activo=true
          and pe.id::text in (
              select jsonb_array_elements_text(coalesce(v_item->'extras','[]'::jsonb))
          );

        v_precio_unitario := v_producto.precio + v_extra_total;
        v_subtotal := v_precio_unitario * v_cantidad;
        v_total := v_total + v_subtotal;

        insert into public.detalle_pedido(
            pedido_id,producto_id,producto_nombre,cantidad,precio_unitario,
            subtotal,notas,configuracion
        ) values(
            v_pedido_id,v_producto.id,v_producto.nombre,v_cantidad,v_precio_unitario,
            v_subtotal,nullif(trim(coalesce(v_item->>'nota','')),''),
            jsonb_build_object(
                'extras',coalesce(v_item->'extras','[]'::jsonb),
                'removibles',coalesce(v_item->'removibles','[]'::jsonb)
            )
        );
    end loop;

    update public.pedidos
    set subtotal=v_total,total=v_total,actualizado_en=now()
    where id=v_pedido_id;

    return query
    select p.id,p.numero_pedido,p.total
    from public.pedidos p
    where p.id=v_pedido_id;
end;
$$;

revoke all on function public.crear_pedido_publico(text,text,integer,text,jsonb) from public;
grant execute on function public.crear_pedido_publico(text,text,integer,text,jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. CALCULAR CONSUMO REAL DE UN PEDIDO
-- Expande combos, recetas, removidos y extras.
-- ---------------------------------------------------------------------------

create or replace function public.consumo_pedido(p_pedido_id uuid)
returns table(ingrediente_id uuid, cantidad numeric)
language sql
stable
security definer
set search_path = public
as $$
with recursive expansion as (
    select d.id as detalle_id,
           d.producto_id,
           d.cantidad::numeric as multiplicador,
           coalesce(d.configuracion,'{}'::jsonb) as configuracion
    from public.detalle_pedido d
    where d.pedido_id=p_pedido_id

    union all

    select e.detalle_id,
           pc.producto_componente_id,
           e.multiplicador * pc.cantidad,
           e.configuracion
    from expansion e
    join public.producto_componentes pc
      on pc.producto_padre_id=e.producto_id
),
hojas as (
    select e.*
    from expansion e
    where not exists(
        select 1
        from public.producto_componentes pc
        where pc.producto_padre_id=e.producto_id
    )
),
base as (
    select r.ingrediente_id,
           sum(r.cantidad * h.multiplicador)::numeric as cantidad
    from hojas h
    join public.recetas r on r.producto_id=h.producto_id
    where not exists(
        select 1
        from public.producto_removibles pr
        where pr.producto_id=h.producto_id
          and pr.ingrediente_id=r.ingrediente_id
          and pr.id::text in (
              select jsonb_array_elements_text(coalesce(h.configuracion->'removibles','[]'::jsonb))
          )
    )
    group by r.ingrediente_id
),
extras as (
    select pe.ingrediente_id,
           sum(pe.cantidad * d.cantidad)::numeric as cantidad
    from public.detalle_pedido d
    join public.producto_extras pe
      on pe.producto_id=d.producto_id
     and pe.activo=true
    where d.pedido_id=p_pedido_id
      and pe.id::text in (
          select jsonb_array_elements_text(coalesce(d.configuracion->'extras','[]'::jsonb))
      )
    group by pe.ingrediente_id
)
select x.ingrediente_id,sum(x.cantidad)::numeric
from (
    select * from base
    union all
    select * from extras
) x
group by x.ingrediente_id;
$$;

revoke all on function public.consumo_pedido(uuid) from public;

-- ---------------------------------------------------------------------------
-- 8. CONFIRMAR PAGO + DESCONTAR INVENTARIO EN UNA SOLA TRANSACCIÓN
-- ---------------------------------------------------------------------------

create or replace function public.confirmar_pago_pedido(
    p_pedido_id uuid,
    p_metodo_pago text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_pedido public.pedidos%rowtype;
    v_consumo record;
    v_nombre text;
    v_stock numeric;
    v_nuevo numeric;
begin
    if public.rol_actual() not in ('admin','cocina') then
        raise exception 'No tienes permiso para confirmar pagos.';
    end if;

    if p_metodo_pago not in ('efectivo','tarjeta','transferencia') then
        raise exception 'Método de pago inválido.';
    end if;

    select * into v_pedido
    from public.pedidos
    where id=p_pedido_id
    for update;

    if not found then raise exception 'Pedido no encontrado.'; end if;
    if v_pedido.estado='cancelado' then raise exception 'El pedido está cancelado.'; end if;

    if v_pedido.estado_pago='pagado' then
        return jsonb_build_object('ok',true,'ya_pagado',true);
    end if;

    for v_consumo in select * from public.consumo_pedido(p_pedido_id)
    loop
        select nombre,stock_actual into v_nombre,v_stock
        from public.ingredientes
        where id=v_consumo.ingrediente_id
        for update;

        if v_stock < v_consumo.cantidad then
            raise exception 'Stock insuficiente de %: hay %, se necesitan %.',
                v_nombre,v_stock,v_consumo.cantidad;
        end if;

        v_nuevo := v_stock - v_consumo.cantidad;

        update public.ingredientes
        set stock_actual=v_nuevo,actualizado_en=now()
        where id=v_consumo.ingrediente_id;

        insert into public.movimientos_inventario(
            ingrediente_id,pedido_id,tipo,cantidad,stock_anterior,stock_nuevo,observacion
        ) values(
            v_consumo.ingrediente_id,p_pedido_id,'venta',v_consumo.cantidad,
            v_stock,v_nuevo,'Consumo automático por venta'
        );
    end loop;

    update public.pedidos
    set estado_pago='pagado',
        metodo_pago=p_metodo_pago,
        fecha_pago=now(),
        estado='confirmado',
        actualizado_en=now()
    where id=p_pedido_id;

    return jsonb_build_object('ok',true,'pedido_id',p_pedido_id);
end;
$$;

revoke all on function public.confirmar_pago_pedido(uuid,text) from public;
grant execute on function public.confirmar_pago_pedido(uuid,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. CANCELAR PEDIDO PENDIENTE
-- ---------------------------------------------------------------------------

create or replace function public.cancelar_pedido(p_pedido_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_pago text;
begin
    if public.rol_actual() not in ('admin','cocina') then
        raise exception 'No tienes permiso para cancelar pedidos.';
    end if;

    select estado_pago into v_pago
    from public.pedidos
    where id=p_pedido_id
    for update;

    if not found then raise exception 'Pedido no encontrado.'; end if;
    if v_pago='pagado' then raise exception 'No puedes cancelar desde Caja un pedido ya pagado.'; end if;

    update public.pedidos
    set estado='cancelado',actualizado_en=now()
    where id=p_pedido_id;

    return jsonb_build_object('ok',true);
end;
$$;

revoke all on function public.cancelar_pedido(uuid) from public;
grant execute on function public.cancelar_pedido(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. FLUJO DE COCINA
-- ---------------------------------------------------------------------------

create or replace function public.actualizar_estado_cocina(
    p_pedido_id uuid,
    p_estado text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_actual text;
    v_pago text;
begin
    if public.rol_actual() not in ('admin','cocina') then
        raise exception 'No tienes permiso para actualizar Cocina.';
    end if;

    select estado,estado_pago into v_actual,v_pago
    from public.pedidos
    where id=p_pedido_id
    for update;

    if not found then raise exception 'Pedido no encontrado.'; end if;
    if v_pago <> 'pagado' then raise exception 'El pedido todavía no está pagado.'; end if;

    if not (
        (v_actual='confirmado' and p_estado='preparando') or
        (v_actual='preparando' and p_estado='listo') or
        (v_actual='listo' and p_estado='entregado')
    ) then
        raise exception 'Cambio de estado no permitido: % → %.',v_actual,p_estado;
    end if;

    update public.pedidos
    set estado=p_estado,actualizado_en=now()
    where id=p_pedido_id;

    return jsonb_build_object('ok',true,'estado',p_estado);
end;
$$;

revoke all on function public.actualizar_estado_cocina(uuid,text) from public;
grant execute on function public.actualizar_estado_cocina(uuid,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 11. AJUSTAR STOCK DESDE ADMIN
-- ---------------------------------------------------------------------------

create or replace function public.ajustar_stock_ingrediente(
    p_ingrediente_id uuid,
    p_nuevo_stock numeric,
    p_observacion text default 'Ajuste de administrador'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_stock numeric;
    v_diferencia numeric;
begin
    if public.rol_actual() <> 'admin' then
        raise exception 'Solo el administrador puede cambiar el inventario.';
    end if;
    if p_nuevo_stock < 0 then raise exception 'El stock no puede ser negativo.'; end if;

    select stock_actual into v_stock
    from public.ingredientes
    where id=p_ingrediente_id
    for update;

    if not found then raise exception 'Ingrediente no encontrado.'; end if;
    v_diferencia := abs(p_nuevo_stock-v_stock);

    update public.ingredientes
    set stock_actual=p_nuevo_stock,actualizado_en=now()
    where id=p_ingrediente_id;

    if v_diferencia > 0 then
        insert into public.movimientos_inventario(
            ingrediente_id,tipo,cantidad,stock_anterior,stock_nuevo,observacion
        ) values(
            p_ingrediente_id,'ajuste',v_diferencia,v_stock,p_nuevo_stock,
            nullif(trim(coalesce(p_observacion,'')),'')
        );
    end if;

    return jsonb_build_object('ok',true,'stock_anterior',v_stock,'stock_nuevo',p_nuevo_stock);
end;
$$;

revoke all on function public.ajustar_stock_ingrediente(uuid,numeric,text) from public;
grant execute on function public.ajustar_stock_ingrediente(uuid,numeric,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 12. REALTIME
-- ---------------------------------------------------------------------------

do $$
declare
    t text;
begin
    foreach t in array array[
        'productos','producto_extras','producto_removibles','pedidos',
        'detalle_pedido','ingredientes','movimientos_inventario','recetas',
        'producto_componentes'
    ]
    loop
        if not exists (
            select 1
            from pg_publication_tables
            where pubname='supabase_realtime'
              and schemaname='public'
              and tablename=t
        ) then
            execute format('alter publication supabase_realtime add table public.%I',t);
        end if;
    end loop;
end $$;

commit;

-- Verificación rápida:
select 'FASE 7.3 LISTA' as estado,
       (select count(*) from public.producto_extras) as extras,
       (select count(*) from public.producto_removibles) as removibles;

-- NOTA DE AUTH:
-- Crea en Authentication > Users:
--   admin@urbanbite.local      contraseña: admin
--   cocineros@urbanbite.local  contraseña: cocineros
-- Si "admin" no cumple tu longitud mínima de contraseña, ajusta temporalmente
-- el mínimo en Auth settings para la demo o usa una contraseña más fuerte y
-- cambia únicamente la contraseña del usuario en Supabase (no el email interno).
