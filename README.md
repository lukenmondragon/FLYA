# FLYA

Buscador de vuelos conversacional. Escribes lo que buscas como se lo dirías a una persona («el vuelo más barato desde CDMX a Tokio en marzo, ida y vuelta») y FLYA compara aeropuertos cercanos, ordena por coste real y avisa de lo que conviene revisar antes de comprar.

## Funciones

- Búsqueda en lenguaje natural, con ajustes sobre la marcha («ahora solo directos», «con maleta»).
- Aeropuertos alternativos de origen y destino, con traslado estimado incluido en el coste.
- Avisos: escalas largas o nocturnas, cambio de aeropuerto, maleta no incluida, aeropuerto lejano.
- Precios destacados cuando están muy por debajo de lo habitual en la ruta.
- Fechas cercanas más baratas.

Los precios proceden siempre del proveedor de datos y se confirman en la web del vendedor.

## Puesta en marcha

Requisitos: Node.js 20 o superior.

```bash
git clone https://github.com/lukenmondragon/FLYA.git
cd FLYA
npm install
npm run dev
```

Abre http://localhost:3000. Sin configuración funciona con datos de demostración.

## Configuración

Copia `.env.example` a `.env.local` y rellena lo que necesites:

| Variable | Uso |
|---|---|
| `TRAVELPAYOUTS_TOKEN`, `TRAVELPAYOUTS_MARKER` | Precios reales (Travelpayouts / Aviasales) |
| `ANTHROPIC_API_KEY` o `GEMINI_API_KEY` | Interpretación de las búsquedas |
| `DATABASE_URL` | SQLite en local; Postgres en producción |
| `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ALLOWED_EMAILS` | Acceso privado con Google: solo entran los correos de la lista |

El resto de opciones están comentadas en `.env.example`.

Sin las variables de acceso, la app queda abierta en desarrollo y bloqueada en producción.

## Despliegue

Pensado para Vercel: importa el repositorio, añade las variables de entorno y una base de datos Postgres (por ejemplo, Neon). Las tablas se crean automáticamente.

## Scripts

| Comando | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` / `npm start` | Producción |
| `npm test` | Tests |
| `npm run lint` | Comprobación de tipos |
| `npm run data:build` | Regenera los datos de aeropuertos y ciudades |

## Datos

Aeropuertos: [OurAirports](https://ourairports.com/data/) (dominio público). Ciudades: [GeoNames](https://www.geonames.org/) (CC BY 4.0). Países: [world-countries](https://github.com/mledoze/countries) (ODbL).

## Aviso legal

Los textos de privacidad, cookies y términos son provisionales.
