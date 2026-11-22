import { createAppServer } from "./http.mjs";

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}
const server = createAppServer();
server.listen(port, "0.0.0.0", () => {
  console.log(`Chaufr API listening on port ${port}`);
});
