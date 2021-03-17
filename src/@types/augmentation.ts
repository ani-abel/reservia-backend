//import * as fastify from "fastify";
import fastify, { FastifyInstance, RouteShorthandOptions } from "fastify";
import { Server, IncomingMessage, ServerResponse } from "http";

declare module "fastify" {
  export interface FastifyInstance {}
}
