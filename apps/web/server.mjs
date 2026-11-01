import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";

const dev = process.argv.includes("--dev");
const hostname = "localhost";
const port = Number(process.env.PORT || 3000);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

function clientAddress(socket) {
  const address = socket?.remoteAddress || "";
  return address.startsWith("::ffff:") ? address.slice(7) : address;
}

app.prepare().then(() => {
  const server = createServer((req, res) => {
    // Replace any client-supplied value so a phone cannot invent its own address.
    req.headers["x-forwarded-for"] = clientAddress(req.socket);
    handle(req, res, parse(req.url || "/", true));
  });
  server.listen(port, "0.0.0.0", () => {
    console.log(`Ready on http://localhost:${port}`);
  });
});
