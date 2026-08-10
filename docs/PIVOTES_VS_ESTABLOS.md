# Pivotes de pastoreo vs Establos

Fuente de verdad en código: `js/db.js` (`getPivotes` / `getEstablos`).

## Modelo de datos

| Concepto | Tabla | Discriminador | Qué es |
|---|---|---|---|
| **Pivote** (forraje) | `pivotes` | `tipo` IS NULL o ≠ `establo` | División física de pradera. Se subdivide en **potreros** (`lotes`). Aquí va el **riego**. |
| **Establo** | `pivotes` | `tipo = 'establo'` | Instalación de estabulación. **No se riega.** |
| **Cubículo** | `lotes` | `tipo = 'cubiculo'` | Plaza dentro del establo (`pivote_id` → establo). |
| **Potrero** | `lotes` | sin tipo cubiculo / pastoreo | Unidad de rotación bajo un pivote de forraje. |

```text
Finca
 ├─ Pivote A (pastoreo) ── potreros P1, P2…     ← riego + lluvia (finca)
 ├─ Pivote B (pastoreo) ── potreros …
 └─ Establo Norte ────── cubículos C1, C2…     ← NO riego
```

## Por qué los establos no van en Riego

1. **Función agronómica distinta**: el riego es para pastura / forraje; el establo es estructura de manejo y descanso forzado.
2. **UX**: listar “Establo X” en riego confunde y contamina KPIs (días sin riego, etc.).
3. **Código**: `getPivotes()` filtra establos; `getEstablos()` solo `tipo='establo'`. El módulo **Lluvia & Riego** usa solo `getPivotes()`.

## Heurísticas de filtrado (`_esEstabloPivote`)

1. `tipo === 'establo'` (canónico)  
2. Nombre con `\bestablo\b`, cubículo, cobertizo (datos viejos sin `tipo`)  
3. Excepción: si `tipo === 'pivote'` explícito, se mantiene aunque el nombre diga “establo”

## Dónde se usa cada cosa

| Módulo / tab | Fuente | Incluye establos |
|---|---|---|
| Lotes → Mapa / Pivotes | `getPivotes` | **No** |
| Lotes → Establos | `getEstablos` + cubículos | **Solo** establos |
| Lluvia & Riego → Riego | `getPivotes` | **No** |
| Ficha pivote (mapa) | pivotes de pastoreo | **No** |

## Checklist si aparece un establo en Riego

1. Verificar `pivotes.tipo` en Supabase → debe ser `'establo'`.  
2. Si `tipo` es null y el nombre es “Establo …”, la heurística de nombre lo excluye.  
3. Si sigue apareciendo: poner `tipo = 'establo'` en SQL.
