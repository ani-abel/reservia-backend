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
const dropbox_1 = require("../modules/routes/dropbox");
describe("/status", () => {
    let server;
    beforeAll(() => { });
    beforeEach(() => __awaiter(void 0, void 0, void 0, function* () {
        server = fastify_1.default({});
        // eslint-disable-next-line global-require
        server.register(dropbox_1.default);
        yield server.ready();
        jest.clearAllMocks();
    }));
    it("GET returns 200", (done) => __awaiter(void 0, void 0, void 0, function* () {
        const response = yield server.inject({ method: "GET", url: "/status" });
        expect(response.statusCode).toEqual(200);
        const payload = JSON.parse(response.payload);
        expect(payload).toMatchSnapshot({ date: expect.any(String), works: true });
        done();
    }));
    it("POST returns 404", (done) => __awaiter(void 0, void 0, void 0, function* () {
        const response = yield server.inject({ method: "POST", url: "/status" });
        expect(response.statusCode).toEqual(404);
        expect(response.payload).toMatchSnapshot();
        done();
    }));
});
//# sourceMappingURL=simple.test.js.map