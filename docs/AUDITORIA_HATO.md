# Auditoría mensual de hato · LAAAMB

## Decisiones (Juan, 2026-08)

1. **Multi-día** (hasta 2+ días con ~500 animales).
2. No localizado → etiqueta **`perdido`**; **muerto** solo si el gerente lo decide al aprobar baja.
3. Auditor = **veterinario**: puede tratar en el corral (pesos, meds al momento).
4. Alerta si faltantes **> 2%** del snapshot.
5. **V1** solo hato LAAAMB (no aparcería).

## Regla de datos

| Dato | ¿Cuándo se actualiza? |
|---|---|
| Peso, CC, FAMACHA, tratamientos, stock meds | **En el acto** en el corral |
| Inventario de cabezas (baja / perdido) | **Solo al aprobar** el gerente en HOY |

## SQL

Ejecutar en Supabase: `supabase/migrations/0062_auditoria_hato.sql`

## App

- Menú **Hato → Auditoría de hato** → `auditoria.html`
- Tras cierre: tareas en **Hoy → Buscar animales · post-auditoría**
- Aprobación de no localizados: bandeja de bajas tipo `perdido`

## Flujo

1. Abrir auditoría → snapshot de activos.
2. Por grupo en corral: buscar chapeta (typeahead), peso, CC, FAMACHA, ¿tratar?
3. Multi-día: reanudar la misma auditoría abierta.
4. Cerrar → informe + faltantes.
5. Hoy: existe / no existe → si no, baja pendiente `perdido`.
6. Gerente aprueba → `animales.estado = perdido`.
