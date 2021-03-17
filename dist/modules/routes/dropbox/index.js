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
const dropboxV2Api = require("dropbox-v2-api");
const dotenv = require("dotenv");
const fs = require("fs");
const multer = require("fastify-multer");
const multer_validator_1 = require("../../../file-validators/multer.validator");
const default_type_1 = require("../../../@types/default.type");
//Configure multer
const upload = multer({
    storage: multer.diskStorage({
        destination: "./uploads",
        filename: multer_validator_1.MulterValidators.preserveOriginalFileName,
    }),
});
const fastifyPlugin = require("fastify-plugin");
dotenv.config();
const { DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REDIRECT_URL, DROPBOX_PROD_REDIRECT_URL, } = process.env;
//const authURL = `http://${request.headers.host}/dropbox/callback`;
const dbx = dropboxV2Api.authenticate({
    client_id: DROPBOX_APP_KEY,
    client_secret: DROPBOX_APP_SECRET,
    redirect_uri: default_type_1.NODE_ENV === default_type_1.NODE_ENV_TYPE.DEVELOPMENT
        ? DROPBOX_REDIRECT_URL
        : DROPBOX_PROD_REDIRECT_URL,
});
let isAuthorized = false;
let tokenCredentials;
exports.default = fastifyPlugin((server, opts, next) => __awaiter(void 0, void 0, void 0, function* () {
    //Routes for Dropbox
    /**
     * If account is verified, return authURL
     * else return the token-credentials and user-profile
     */
    server.route({
        url: "/dropbox/authorize-drive",
        method: ["GET"],
        logLevel: "warn",
        handler: (request, response) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const url = dbx.generateAuthUrl();
                return { AuthURL: url };
            }
            catch (ex) {
                server.log.error(ex);
                throw ex;
            }
        }),
    });
    server.route({
        url: "/dropbox/get-user-details",
        method: ["GET"],
        logLevel: "warn",
        handler: (request, response) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                // const token: any = {
                //   access_token:
                //     "4lyiUYoM-00AAAAAAAAAAXP8pMlx_umKp2-LyKWphJSDBAN4SXskfnZJcgsHzU_v",
                //   token_type: "bearer",
                //   uid: "718151274",
                //   account_id: "dbid:AADyUREHv8twTKr3dt-tl3HML55-qWO7Q-E",
                //   scope:
                //     "account_info.read file_requests.read file_requests.write files.content.read files.content.write files.metadata.read files.metadata.write",
                // };
                const token = JSON.parse(request.headers.dropboxauthcode);
                if (token) {
                    const dbxx = dropboxV2Api.authenticate({
                        token: token.access_token,
                    });
                    const userDetails = yield new Promise((resolve, reject) => {
                        dbxx({
                            resource: "users/get_current_account",
                            parameters: {
                                account_id: token.account_id,
                            },
                        }, (err, result, response) => {
                            if (err) {
                                reject(err);
                            }
                            else {
                                resolve(result);
                            }
                        });
                    });
                    response.send(userDetails);
                }
                throw new Error("No access token was found");
            }
            catch (ex) {
                server.log.error(ex);
                throw ex;
            }
        }),
    });
    //dropbox-callback
    server.route({
        url: "/dropbox/callback",
        method: ["GET"],
        logLevel: "warn",
        handler: (request, response) => __awaiter(void 0, void 0, void 0, function* () {
            const code = request.query.code;
            const token = yield new Promise((resolve, reject) => {
                dbx.getToken(code, (err, result, response) => {
                    if (err) {
                        reject(err);
                    }
                    else {
                        //you are authorized now!
                        resolve(result);
                    }
                });
            });
            return response.redirect(`${default_type_1.NODE_ENV === "development"
                ? "http://localhost:4200"
                : "https://reservia-frontend.web.app"}/#/home?provider=dropbox&code=${JSON.stringify(token)}`);
        }),
    });
    //Returns access-token + user-details if available, null if it is not
    server.route({
        url: "/dropbox/get-token",
        method: ["GET"],
        logLevel: "warn",
        handler: (request, response) => __awaiter(void 0, void 0, void 0, function* () {
            return response.send(tokenCredentials);
        }),
    });
    //get storage space
    server.route({
        url: "/dropbox/get-drive-space",
        method: ["GET"],
        logLevel: "warn",
        handler: (request, response) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const token = JSON.parse(request.headers.dropboxauthcode);
                if (token) {
                    const dbxx = dropboxV2Api.authenticate({
                        token: token.access_token,
                    });
                    const userSpace = yield new Promise((resolve, reject) => {
                        dbxx({
                            resource: "users/get_space_usage",
                        }, (err, result, response) => {
                            if (err) {
                                reject(err);
                            }
                            else {
                                resolve(result);
                            }
                        });
                    });
                    return response.send(userSpace);
                }
                else {
                    throw new Error("No token was found");
                }
            }
            catch (ex) {
                server.log.error(ex);
                throw ex;
            }
        }),
    });
    //get file metadata and temporary download Link
    server.route({
        url: "/dropbox/get-file-metadata-and-link",
        method: ["GET"],
        logLevel: "warn",
        handler: (request, response) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const token = JSON.parse(request.headers.dropboxauthcode);
                if (token) {
                    const dbxx = dropboxV2Api.authenticate({
                        token: token.access_token,
                    });
                    const getLink = request.query.link_only || false;
                    const filePath = formatDropboxFilePath(request.query.filePath);
                    const fileMetadata = yield new Promise((resolve, reject) => {
                        dbxx({
                            resource: "files/get_temporary_link",
                            parameters: {
                                path: filePath,
                            },
                        }, (err, result, response) => {
                            if (err) {
                                reject(err);
                            }
                            else {
                                resolve(result);
                            }
                        });
                    });
                    if (getLink) {
                        //return only link
                        return response.send({ link: fileMetadata.link });
                    }
                    else {
                        //return the entire file metadata object
                        return response.send(fileMetadata);
                    }
                }
                else {
                    throw new Error("No token was found");
                }
            }
            catch (ex) {
                throw ex;
            }
        }),
    });
    //get file metadata || get-file
    /**
     * I.E: localhost:3000/dropbox/get-file-metadata?filePath=/role matrix - samples.xlsx
     */
    server.route({
        url: "/dropbox/get-file-metadata",
        method: ["GET"],
        logLevel: "warn",
        handler: (request, response) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const token = JSON.parse(request.headers.dropboxauthcode);
                if (token) {
                    const dbxx = dropboxV2Api.authenticate({
                        token: token.access_token,
                    });
                    const filePath = formatDropboxFilePath(request.query.filePath);
                    const fileMetadata = yield new Promise((resolve, reject) => {
                        dbxx({
                            resource: "files/get_metadata",
                            parameters: {
                                path: filePath,
                                include_media_info: true,
                            },
                        }, (err, result, response) => {
                            if (err) {
                                reject(err);
                            }
                            else {
                                resolve(result);
                            }
                        });
                    });
                    return response.send(fileMetadata);
                }
                else {
                    throw new Error("No token was found");
                }
            }
            catch (ex) {
                server.log.error(ex);
                throw ex;
            }
        }),
    });
    //Create folder
    server.route({
        url: "/dropbox/create-folder",
        method: ["GET"],
        logLevel: "warn",
        handler: (request, response) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const token = JSON.parse(request.headers.dropboxauthcode);
                if (token) {
                    const dbxx = dropboxV2Api.authenticate({
                        token: token.access_token,
                    });
                    const pathToFolder = request.query.pathToFolder;
                    const folderCreationData = yield new Promise((resolve, reject) => {
                        dbxx({
                            resource: "files/create_folder",
                            parameters: {
                                path: pathToFolder,
                                autorename: false,
                            },
                        }, (err, result, response) => {
                            if (err) {
                                reject(err);
                            }
                            else {
                                resolve(result);
                            }
                        });
                    });
                    return response.send(folderCreationData);
                }
                else {
                    throw new Error("No token was found");
                }
            }
            catch (ex) {
                server.log.console.error(ex);
                throw ex;
            }
        }),
    });
    //download File
    server.route({
        url: "/dropbox/download-file",
        method: ["GET"],
        logLevel: "warn",
        preHandler: [
            function createFolders(request, reply, done) {
                // your code
                if (!fs.existsSync("./downloads")) {
                    fs.mkdirSync("./downloads");
                }
                if (!fs.existsSync("./uploads")) {
                    fs.mkdirSync("./uploads");
                }
                done();
            },
        ],
        handler: (request, response) => __awaiter(void 0, void 0, void 0, function* () {
            var _a;
            try {
                const token = JSON.parse(request.headers.dropboxauthcode);
                if (token) {
                    const dbxx = dropboxV2Api.authenticate({
                        token: token.access_token,
                    });
                    const filePath = ((_a = request.query.filePath) === null || _a === void 0 ? void 0 : _a.startsWith("/")) ? request.query.filePath
                        : `/${request.query.filePath}`;
                    const filePathSplit = filePath.split("/");
                    const filename = filePathSplit[filePathSplit.length - 1];
                    yield new Promise((resolve, reject) => {
                        dbxx({
                            resource: "files/download",
                            parameters: {
                                path: filePath,
                            },
                        }, (err, result, response) => {
                            if (err) {
                                reject(err);
                            }
                            else {
                                //download completed
                                resolve(result);
                            }
                        }).pipe(fs.createWriteStream(`./downloads/${filename}`));
                    });
                    return response.send({
                        Message: `file downloaded to http://http://${request.headers.host}/downloads/${filename}`,
                    });
                }
                else {
                    throw new Error("No token was found");
                }
            }
            catch (ex) {
                server.log.error(ex);
                throw ex;
            }
        }),
    });
    //upload-files
    server.route({
        url: "/dropbox/upload-files",
        method: ["POST"],
        logLevel: "warn",
        preValidation: upload.array("files", 10),
        handler: (request, response) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const token = JSON.parse(request.headers.dropboxauthcode);
                if (token) {
                    const dbxx = dropboxV2Api.authenticate({
                        token: token.access_token,
                    });
                    const filePath = request.query.filePath
                        ? formatDropboxFilePath(request.query.filePath)
                        : "";
                    const files = request.files;
                    const uploadedFileArray = [];
                    for (const file of files) {
                        const uploadedFile = yield uploadToDropbox(file, dbxx, filePath);
                        uploadedFileArray.push(uploadedFile);
                    }
                    return response.send(uploadedFileArray);
                }
                else {
                    throw new Error("No token was found");
                }
            }
            catch (ex) {
                server.log.error(ex);
                throw ex;
            }
        }),
    });
    //Delete-file || Delete-folder
    /**
     * I.E http://localhost:3000/dropbox/delete-file?filePath=/Home/Music/calvin-harris.mp3
     */
    server.route({
        url: "/dropbox/delete-file",
        method: ["DELETE"],
        logLevel: "warn",
        handler: (request, response) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const token = JSON.parse(request.headers.dropboxauthcode);
                if (token) {
                    const dbxx = dropboxV2Api.authenticate({
                        token: token.access_token,
                    });
                    const filePath = formatDropboxFilePath(request.query.filePath);
                    const filePathSplit = filePath.split("/");
                    const filename = filePathSplit[filePathSplit.length - 1];
                    //const fileIds: string[] = request.body.idList as string[];
                    const deletedResourse = yield new Promise((resolve, reject) => {
                        dbxx({
                            resource: "files/delete",
                            parameters: {
                                path: filePath,
                            },
                        }, (err, result, response) => {
                            if (err) {
                                reject(err);
                            }
                            else {
                                resolve(result);
                            }
                        });
                    });
                    return response.send({
                        Message: `'${filename}' was deleted`,
                        ResponsePayload: deletedResourse,
                    });
                }
                else {
                    throw new Error("no token was found");
                }
            }
            catch (ex) {
                server.log.error(ex);
                throw ex;
            }
        }),
    });
    //Copy-file
    server.route({
        url: "/dropbox/copy-file-to-another-folder",
        method: ["POST"],
        logLevel: "warn",
        handler: (request, response) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const token = JSON.parse(request.headers.dropboxauthcode);
                if (token) {
                    const dbxx = dropboxV2Api.authenticate({
                        token: token.access_token,
                    });
                    let { fromPath, toPath, fileName } = request.body;
                    fromPath = formatDropboxFilePath(fromPath);
                    toPath = formatDropboxFilePath(toPath);
                    const copyFileMetadata = yield new Promise((resolve, reject) => {
                        dbxx({
                            resource: "files/copy",
                            parameters: {
                                from_path: fromPath,
                                to_path: toPath && toPath !== ""
                                    ? `${toPath}/${fileName}`
                                    : `/${fileName}`,
                                allow_shared_folder: false,
                                autorename: false,
                                allow_ownership_transfer: false,
                            },
                        }, (err, result, response) => {
                            if (err) {
                                reject(err);
                            }
                            else {
                                resolve(result);
                            }
                        });
                    });
                    return response.send(copyFileMetadata);
                }
                else {
                    throw new Error("No token was found");
                }
            }
            catch (ex) {
                server.log.error(ex);
                throw ex;
            }
        }),
    });
    //Move-file
    server.route({
        url: "/dropbox/move-file-to-another-folder",
        method: ["POST"],
        logLevel: "warn",
        handler: (request, response) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const token = JSON.parse(request.headers.dropboxauthcode);
                if (token) {
                    const dbxx = dropboxV2Api.authenticate({
                        token: token.access_token,
                    });
                    let { fromPath, toPath, fileName } = request.body;
                    fromPath = formatDropboxFilePath(fromPath);
                    toPath = formatDropboxFilePath(toPath);
                    const moveFileMetadata = yield new Promise((resolve, reject) => {
                        dbxx({
                            resource: "files/move",
                            parameters: {
                                from_path: fromPath,
                                to_path: toPath && toPath !== ""
                                    ? `${toPath}/${fileName}`
                                    : `/${fileName}`,
                                allow_shared_folder: false,
                                autorename: false,
                                allow_ownership_transfer: false,
                            },
                        }, (err, result, response) => {
                            if (err) {
                                reject(err);
                            }
                            else {
                                resolve(result);
                            }
                        });
                    });
                    return response.send(moveFileMetadata);
                }
                else {
                    throw new Error("No token was found");
                }
            }
            catch (ex) {
                server.log.error(ex);
                throw ex;
            }
        }),
    });
    //list-folders & files
    server.route({
        url: "/dropbox/get-all-files-and-folders",
        method: ["GET"],
        logLevel: "warn",
        handler: (request, response) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const token = JSON.parse(request.headers.dropboxauthcode);
                if (token) {
                    const dbxx = dropboxV2Api.authenticate({
                        token: token.access_token,
                    });
                    const filePath = request.query.filePath
                        ? formatDropboxFilePath(request.query.filePath)
                        : "";
                    const fileListData = yield new Promise((resolve, reject) => {
                        dbxx({
                            resource: "files/list_folder",
                            parameters: {
                                path: filePath,
                                recursive: false,
                                include_media_info: false,
                                include_deleted: false,
                                include_has_explicit_shared_members: false,
                                include_mounted_folders: true,
                                include_non_downloadable_files: true,
                            },
                        }, (err, result, response) => {
                            if (err) {
                                reject(err);
                            }
                            else {
                                resolve(result);
                            }
                        });
                    });
                    return response.send(fileListData);
                }
                else {
                    throw new Error("No token was found");
                }
            }
            catch (ex) {
                server.log.error(ex);
                throw ex;
            }
        }),
    });
    //Search-for-file
    /**
     * I.E: http://localhost:3000/dropbox/search-for-files?searchQuery=reservia
     */
    server.route({
        url: "/dropbox/search-for-files",
        method: ["GET"],
        logLevel: "warn",
        handler: (request, response) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const token = JSON.parse(request.headers.dropboxauthcode);
                if (token) {
                    const dbxx = dropboxV2Api.authenticate({
                        token: token.access_token,
                    });
                    const searchQuery = request.query.searchQuery;
                    const fileListData = yield new Promise((resolve, reject) => {
                        dbxx({
                            resource: "files/search",
                            parameters: {
                                query: searchQuery,
                                match_field_options: {
                                    include_highlights: true,
                                },
                            },
                        }, (err, result, response) => {
                            if (err) {
                                reject(err);
                            }
                            else {
                                resolve(result);
                            }
                        });
                    });
                    return response.send(fileListData);
                }
                else {
                    throw new Error("No token was found");
                }
            }
            catch (ex) {
                server.log.error(ex);
                throw ex;
            }
        }),
    });
    //get-file-from-path
    server.route({
        url: "/dropbox/get-file/:fileId",
        method: ["GET"],
        logLevel: "warn",
        handler: (request, response) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const token = JSON.parse(request.headers.dropboxauthcode);
                if (token) {
                    const dbxx = dropboxV2Api.authenticate({
                        token: token.access_token,
                    });
                    const fileId = request.params.fileId;
                    const file = yield new Promise((resolve, reject) => {
                        dbxx({
                            resource: "file_requests/get",
                            parameters: {
                                id: fileId,
                            },
                        }, (err, result, response) => {
                            if (err) {
                                reject(err);
                            }
                            else {
                                resolve(result);
                            }
                        });
                    });
                    return response.send(file);
                }
                else {
                    throw new Error("No token was found");
                }
            }
            catch (ex) {
                server.log.error(ex);
                throw ex;
            }
        }),
    });
    server.route({
        url: "/serve-file/:fileName",
        method: ["GET"],
        logLevel: "warn",
        handler: (request, response) => {
            const { fileName } = request.params;
            return response.sendFile(fileName);
        },
    });
    function formatDropboxFilePath(filePath) {
        if (filePath !== "") {
            if (!filePath.startsWith("/")) {
                filePath = `/${filePath}`;
            }
        }
        return filePath;
    }
    //Upload single file
    /**
     * @param saveFileTo must always start with "/"
     * Saves files to dropbox by defualt on the root path "/"
     */
    function uploadToDropbox(file, dbxx, saveFileTo = "") {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const uploadData = yield new Promise((resolve, reject) => {
                    dbxx({
                        resource: "files/upload",
                        parameters: {
                            path: `${saveFileTo}/${file.filename}`,
                        },
                        readStream: fs.createReadStream(file.path),
                    }, (err, result, response) => {
                        if (err) {
                            reject(err);
                        }
                        else {
                            //upload completed
                            resolve(result);
                        }
                    });
                });
                fs.unlinkSync(file.path);
                return uploadData;
            }
            catch (ex) {
                server.log.error(ex);
                throw ex;
            }
        });
    }
    next();
}));
//# sourceMappingURL=index.js.map