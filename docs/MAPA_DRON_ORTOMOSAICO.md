# Mapa de precisión · Ortomosaico dron (LAAAMB)

> Preparado para el vuelo de **2–3 semanas**.  
> La app ya soporta capas de ortomosaico; solo falta cargar el entregable.

## 1 · Qué entrega el proveedor

| Entregable | Uso en LAAAMBAPP |
|---|---|
| **Ortomosaico georreferenciado (GeoTIFF)** | **Capa base de medición** (reemplaza Google para áreas/contornos) |
| MDS / DSM | Referencia de superficie (fase 2, no bloqueante) |
| MDT / DTM | Opcional (si hay suelo desnudo / calidad) |
| Nube de puntos LAS/LAZ | Archivo / archivo técnico (no en mobile v1) |
| Informe RMSE | Guardar `rmse_m` en config |
| Imagen alineada a satélite | Útil para QC visual |

**Alcance técnico que pediste** (misión, solapes, aerotriangulación, QC) es el flujo correcto: no usamos el GPS del celular para “medir” hectáreas definitivas.

## 2 · Qué ya está en la app (código)

| Pieza | Dónde |
|---|---|
| Columna `fincas.capa_mapa` (jsonb) | Migración **0065** |
| Tabla `levantamientos_dron` | Migración **0065** |
| `DB.getCapaMapa` / `activarOrtomosaico` / `saveLevantamientoDron` | `js/db.js` |
| Botón **🗺 Base** en mapa | Alterna satélite ↔ ortomosaico |
| Banner inferior | Indica si la base es Google o dron |
| Pivotes `geojson` en Supabase | Multi-dispositivo (fin AppData-only) |
| Modo **Vista / Editar** | Contornos bloqueados salvo Editar |

**Sin 0065 corrida:** el mapa sigue en Google; riego y geo pivotes fallan al guardar hasta que ejecutes el SQL.

## 3 · Pipeline recomendado (al recibir el GeoTIFF)

```text
GeoTIFF ortomosaico (EPSG:4326 o 9377)
        │
        ▼
  Opción A (simple, 1 finca):  recorte + PNG/JPG georreferenciado
        → Image Overlay en Leaflet (bounds SW–NE)
        │
  Opción B (mejor zoom):  gdal2tiles / rio-mbtiles / TiTiler
        → tiles XYZ  https://cdn…/{z}/{x}/{y}.png
        │
        ▼
  Guardar en fincas.capa_mapa  (o UI futura Ajustes)
        │
        ▼
  base = "orthomosaic"  → mediciones de potreros/pivotes sobre ESTA capa
```

### 3.1 Ejemplo `capa_mapa` (tiles XYZ)

```json
{
  "base": "orthomosaic",
  "ortomosaico": {
    "activo": true,
    "tipo": "xyz",
    "url_template": "https://TU-CDN/la-marinilla/2026-09/{z}/{x}/{y}.png",
    "opacity": 1,
    "survey_date": "2026-09-15",
    "rmse_m": 0.08,
    "crs": "EPSG:4326",
    "provider": "dron_local",
    "notas": "Orto vuelo San Bernardo"
  }
}
```

### 3.2 Ejemplo image overlay (más rápido de montar)

```json
{
  "base": "orthomosaic",
  "ortomosaico": {
    "activo": true,
    "tipo": "image_overlay",
    "image_url": "https://TU-CDN/la-marinilla-orto.jpg",
    "bounds": [[4.3500, -75.0900], [4.3650, -75.0700]],
    "opacity": 0.95,
    "survey_date": "2026-09-15",
    "rmse_m": 0.08
  }
}
```

`bounds` = `[[latSur, lngOeste], [latNorte, lngEste]]` del recorte.

### 3.3 SQL de activación (cuando tengas URL)

```sql
UPDATE fincas
SET capa_mapa = jsonb_build_object(
  'base', 'orthomosaic',
  'ortomosaico', jsonb_build_object(
    'activo', true,
    'tipo', 'xyz',  -- o 'image_overlay'
    'url_template', 'https://…/{z}/{x}/{y}.png',
    'opacity', 1,
    'survey_date', '2026-09-15',
    'rmse_m', 0.08,
    'crs', 'EPSG:4326',
    'provider', 'dron_local'
  )
)
WHERE id = 'a1b2c3d4-0000-0000-0000-000000000001';
```

Opcional: insertar fila en `levantamientos_dron` con `activo = true` y el resto de entregables.

## 4 · Qué hacer con potreros ya dibujados sobre Google

1. Activar ortomosaico.
2. Entrar en **✎ Editar**.
3. Ajustar vértices de finca / pivotes / potreros **alineados al orto** (RMSE del informe).
4. Guardar → áreas `area_ha` se recalculan con la geometría nueva.

Las áreas “malas” del GPS/satélite quedan corregidas sin borrar el historial de animales.

## 5 · Checklist el día del entregable

- [ ] GeoTIFF (y CRS) + informe RMSE
- [ ] Hosting público o firmado de tiles/imagen (Vercel Blob, R2, S3, etc.)
- [ ] Bounds o tiles verificados en QGIS
- [ ] SQL 0065 ya corrido en Supabase
- [ ] `UPDATE fincas.capa_mapa` o script de activación
- [ ] En app: botón Base muestra **🛰 Orto** y banner “Ortomosaico dron activo”
- [ ] Re-editar contornos críticos (perímetro + 1–2 pivotes de prueba)
- [ ] Comparar ha del informe vs `perimetro_area_ha` / pivotes

## 6 · Prioridades LAAAMB

Medir bien potreros y descansos (**rebaño sostenible**) y no invertir en “GPS de celular” como verdad de ha.  
El dron es la base cartográfica; la app ya está cableada para el switch.

## 7 · Archivos tocados

- `supabase/migrations/0065_pivotes_geo_riego_ortomosaico.sql`
- `js/db.js` — capa mapa, riego, geo pivote
- `lotes.html` — Vista/Editar, ficha pivote, riego, capa base
- Este doc
