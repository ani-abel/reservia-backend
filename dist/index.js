"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = require("fastify");
const fastifyBlipp = require("fastify-blipp");
const fastifyMulter = require("fastify-multer");
const path = require("path");
const fastifyStatic = require("fastify-static");
const google_drive_1 = require("./modules/routes/google-drive");
const dropbox_1 = require("./modules/routes/dropbox");
const cors = require("fastify-cors");
// const server: FastifyInstance<
//   Server,
//   IncomingMessage,
//   ServerResponse
// > = fastify({});
const server = fastify_1.default({});
server.register(fastifyStatic, {
    root: path.join(__dirname, "public"),
    prefix: "/",
});
server.register(fastifyMulter.contentParser);
server.register(fastifyBlipp.default);
//Pull in Externally written routes
server.register(google_drive_1.default);
server.register(dropbox_1.default);
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
const start = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const PORT = parseInt(process.env.PORT) || 3000;
        const HOST = process.env.HOST || "0.0.0.0";
        yield server.listen(PORT, HOST);
        server.blipp();
    }
    catch (ex) {
        console.error(ex);
        server.log.error(ex);
        process.exit(1);
    }
});
//Functions to handle errors
process.on("uncaughtException", (ex) => {
    console.error(ex);
});
process.on("unhandledRejection", (ex) => {
    console.error(ex);
});
start();
//# sourceMappingURL=index.js.map