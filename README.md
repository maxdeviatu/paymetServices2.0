# Payment Services API

Este proyecto implementa un servicio de pagos utilizando Node.js, Express, Sequelize (PostgreSQL), Winston y Docker.

## Estructura del Proyecto

```
src/
├── config/             # Variables de entorno y logger
├── routes/             # Rutas (pendientes de implementación)
├── controllers/        # Controladores (pendientes de implementación) 
├── services/           # Servicios de lógica (pendientes de implementación)
├── models/             # Definiciones Sequelize (pendientes de implementación)
├── middlewares/        # Middlewares genéricos
├── jobs/               # Tareas programadas (pendientes de implementación)
└── app.js              # App principal de Express
docker/
└── local.Dockerfile    # Dockerfile para entorno local
```

## Requisitos Previos

- Node.js ≥ 20
- Docker y docker-compose (para entorno local)
- PostgreSQL (opcional, si no se usa Docker)

## Instalación

1. Clonar el repositorio:
```bash
git clone <url-del-repositorio>
cd payment-services2.0
```

2. Instalar dependencias:
```bash
npm install
```

3. Configurar variables de entorno:
   - Editar el archivo `.env` según sea necesario

## Ejecución

### Desarrollo

1. Iniciar base de datos PostgreSQL con Docker:
```bash
docker-compose up -d
```

2. Iniciar el servidor en modo desarrollo:
```bash
npm run dev
```

### Producción

```bash
npm start
```

## Herramientas y Tecnologías

- **Runtime**: Node.js ≥ 20
- **Servidor HTTP**: Express 5
- **ORM**: Sequelize 7
- **Base de datos**: PostgreSQL (15+)
- **Logger**: Winston 3 + morgan
- **Contenedores**: Docker + docker-compose
- **Linter**: StandardJS