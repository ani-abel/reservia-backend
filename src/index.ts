import fastify, { FastifyInstance } from "fastify";
import * as fastifyBlipp from "fastify-blipp";
import * as fastifyMulter from "fastify-multer";
import * as path from "path";
import fastifyStatic = require("fastify-static");
import GoogleDriveRoutes from "./modules/routes/google-drive";
import DropboxDriveRoutes from "./modules/routes/dropbox";

const cors = require("fastify-cors");

// const server: FastifyInstance<
//   Server,
//   IncomingMessage,
//   ServerResponse
// > = fastify({});

const server: any = fastify({});

server.register(fastifyStatic, {
  root: path.join(__dirname, "public"),
  prefix: "/",
});

server.register(fastifyMulter.contentParser);

server.register(fastifyBlipp.default);

//Pull in Externally written routes
server.register(GoogleDriveRoutes);

server.register(DropboxDriveRoutes);

//Register cors
server.register(cors, {
  // put your options here
  origin: (origin, cb) => {
    if (/localhost/.test(origin) || /firebase/.test(origin)) {
      //  Request from localhost or firebase will pass
      cb(null, true);
      return;
    }
    cb(null, true);
    //cb(new Error("Not allowed"), false); //Uncomment in production
  },
});

server.get("/", function (request, response) {
  return response.sendFile("home.html");
});

server.get("/privacy-policy", function (request, response) {
  return response.sendFile("privacy-policy.html");
});

//Function to start the server
const start = async () => {
  try {
    const PORT: number = parseInt(process.env.PORT) || 3000;
    const HOST: string = process.env.HOST || "0.0.0.0";
    await server.listen(PORT, HOST);
    server.blipp();
  } catch (ex) {
    console.error(ex);
    server.log.error(ex);
    process.exit(1);
  }
};

//Functions to handle errors
process.on("uncaughtException", (ex) => {
  console.error(ex);
});

process.on("unhandledRejection", (ex) => {
  console.error(ex);
});

start();
