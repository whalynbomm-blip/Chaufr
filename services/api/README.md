# Chaufr API — development guide

## Run locally

Requires Node.js 20 or newer.

```sh
cd services/api
npm test
npm start
```

The API listens on port 3000 by default. Set fare values as environment variables before starting the server. `.env.example` documents the development settings; Node does not automatically load that file.

## Endpoints

### Health check
```sh
curl http://localhost:3000/health
```

### Fare estimate
```sh
curl -X POST http://localhost:3000/v1/fare-quotes \
  -H 'content-type: application/json' \
  -d '{"distanceKm":8.5,"durationMinutes":22,"vehicleCategory":"standard"}'
```

Supported categories: `standard`, `comfort`, `xl`.

The request accepts route distance, estimated duration and vehicle category. Fare rates, fuel price, vehicle fuel consumption, operating cost, commission and minimum fare are read from server configuration. Client-supplied fare settings are ignored.

## Current limitations

- Route distance and duration are supplied to the API; no maps/routing provider is connected.
- Quotes are estimates and do not create bookings or reserve drivers.
- Authentication, database persistence, production hosting and payment processing are not implemented.
- Values in `.env.example` are development placeholders, not approved commercial fares.

See `../../docs/deployment.md` before deploying.