# Chaufr deployment preparation

## Current position

The API is container-ready (`services/api/Dockerfile`) and exposes `GET /health` for a hosting platform health check. It has not yet been deployed to a public host. No live API URL exists, and no production secrets or credentials are stored in GitHub. The owner console is served by the API at `/owner` and uses same-origin authenticated API requests.

## Hosting requirements

Choose a provider that supports:
- Docker deployments from the GitHub repository;
- Node.js 22 / the included Dockerfile;
- HTTPS public service URL;
- environment variables and secret storage;
- health checks against `/health`;
- a managed PostgreSQL database when database integration is implemented.

## Deployment settings

- Repository: `whalynbomm-blip/Chaufr`
- Dockerfile: `services/api/Dockerfile`
- Docker build context: `services/api`
- Health check path: `/health`
- Port: `3000` (the service reads `PORT`)
- Start command: provided by the Dockerfile

## Required environment variables

Set fare configuration only in the hosting provider's private environment settings. Do not commit production values or credentials.

| Variable | Purpose |
|---|---|
| `PORT` | Port supplied by the host (usually injected automatically) |
| `FARE_RULE_VERSION` | Identifier for the active fare rules |
| `FARE_CURRENCY` | Currency code, currently `ZAR` in development |
| `FARE_BASE` | Base fare |
| `FARE_PER_KM` | Per-kilometre charge |
| `FARE_PER_MINUTE` | Per-minute charge |
| `FARE_OPERATING_PER_KM` | Operating-cost allowance per kilometre |
| `FARE_COMMISSION_RATE` | Platform commission as a decimal fraction (default 0.12) |\n| `DAILY_ACTIVATION_FEE` | Driver daily activation fee in ZAR (default 30; owner dashboard can update it) |
| `FARE_MINIMUM` | Minimum passenger fare |
| `FARE_FUEL_PRICE_PER_LITRE` | Configured fuel price per litre |
| `FARE_FUEL_STANDARD_L100KM` | Standard vehicle consumption |
| `FARE_FUEL_COMFORT_L100KM` | Comfort vehicle consumption |
| `FARE_FUEL_XL_L100KM` | XL vehicle consumption |

Do not use the sample values as live commercial pricing without approving and validating them.

## Before public launch

1. Select and authorize the hosting provider and deployment project.
2. Configure production fare rules and verify the health endpoint.
3. Connect PostgreSQL and apply versioned migrations.
4. Provision the owner account securely through a trusted database operator; public registration must never grant owner privileges.\n5. Review the owner pricing console at `/owner`, approve all fare bands and verify audit events before allowing public trip requests.
5. Connect a routing provider and calculate routes on trusted server-side infrastructure.
6. Configure monitoring, backups, privacy controls and incident response.
7. Complete security and South African legal/compliance review.

Deploying the current API alone does not create a complete ride-hailing service. Live dispatch, driver tracking, payment-provider integration and the remaining owner operations tools still need to be completed.