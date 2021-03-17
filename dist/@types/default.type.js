"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NODE_ENV = exports.NODE_ENV_TYPE = void 0;
var NODE_ENV_TYPE;
(function (NODE_ENV_TYPE) {
    NODE_ENV_TYPE["DEVELOPMENT"] = "development";
    NODE_ENV_TYPE["PRODUCTION"] = "production";
})(NODE_ENV_TYPE = exports.NODE_ENV_TYPE || (exports.NODE_ENV_TYPE = {}));
exports.NODE_ENV = process.env.NODE_ENV || NODE_ENV_TYPE.DEVELOPMENT;
//# sourceMappingURL=default.type.js.map