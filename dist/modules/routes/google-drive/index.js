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
const googleapis_1 = require("googleapis");
const multer = require("fastify-multer");
const dotenv = require("dotenv");
const fs = require("fs");
const readline = require("readline");
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
const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URL, GOOGLE_PROD_REDIRECT_URL, } = process.env;
let oAuth2Client = new googleapis_1.google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, default_type_1.NODE_ENV === default_type_1.NODE_ENV_TYPE.DEVELOPMENT
    ? GOOGLE_REDIRECT_URL
    : GOOGLE_PROD_REDIRECT_URL);
let tokenCredentials;
// If modifying these scopes, delete token.json.
const SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/drive.metadata",
    "https://www.googleapis.com/auth/drive.readonly",
];
exports.default = fastifyPlugin((server, opts, next) => __awaiter(void 0, void 0, void 0, function* () {
    //Routes for Google-Drive
    //Google get authorize URL
    server.route({
        url: "/google/authorize-drive",
        logLevel: "warn",
        method: ["GET"],
        handler: (request, response) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const url = oAuth2Client.generateAuthUrl({
                    access_type: "offline",
                    scope: SCOPES,
                });
                return { AuthURL: url };
            }
            catch (ex) {
                server.log.error(ex);
                throw ex;
            }
        }),
    });
    //Google callback
    server.route({
        url: "/google/callback",
        method: ["GET"],
        logLevel: "warn",
        handler: (request, response) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                //Return Code for use to query for Token
                const code = request.query.code;
                if (code) {
                    const token = yield getGoogleToken(code);
                    return response.redirect(`${default_type_1.NODE_ENV === "development"
                        ? "http://localhost:4200"
                        : "https://reservia-frontend.web.app"}/#/home?provider=google&code=${JSON.stringify(token)}`);
                }
            }
            catch (ex) {
                server.log.error(ex);
                throw ex;
            }
        }),
    });
    server.route({
        url: "/google/get-user-details",
        logLevel: "warn",
        method: ["GET"],
        handler: (request, response) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const tokens = JSON.parse(request.headers.googleauthcode);
                if (tokens) {
                    oAuth2Client.setCredentials(tokens);
                    const oauth2 = googleapis_1.google.oauth2({
                        auth: oAuth2Client,
                        version: "v2",
                    });
                    const userData = yield new Promise((resolve, reject) => {
                        oauth2.userinfo.get(function (err, res) {
                            if (err) {
                                reject(err);
                            }
                            else {
                                resolve(res);
                            }
                        });
                    });
                    return response.send(userData.data);
                }
            }
            catch (ex) {
                server.log.error(ex);
                throw ex;
            }
        }),
    });
    //Returns access-token + user-details if available, null if it is not
    server.route({
        url: "/google/get-token",
        method: ["GET"],
        logLevel: "warn",
        handler: (request, response) => __awaiter(void 0, void 0, void 0, function* () {
            return response.send(tokenCredentials);
        }),
    });
    //Upload file to google Drive
    server.route({
        url: "/google/upload-files",
        logLevel: "warn",
        method: ["POST"],
        preValidation: upload.array("files", 10),
        handler: (request, response) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const files = request.files;
                const tokens = JSON.parse(request.headers.googleauthcode);
                if (tokens) {
                    oAuth2Client.setCredentials(tokens);
                    const uploadedFileArray = [];
                    for (const file of files) {
                        const uploadedFile = yield uploadToGoogleDrive(file);
                        uploadedFileArray.push(uploadedFile);
                    }
                    return response.send(uploadedFileArray);
                }
            }
            catch (ex) {
                server.log.error(ex);
                throw ex;
            }
        }),
    });
    //Upload file to specific google Drive Folder
    server.route({
        url: "/google/upload-files/:folderId",
        logLevel: "warn",
        method: ["POST"],
        preValidation: upload.array("files", 10),
        handler: (request, response) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const { folderId } = request.params;
                const files = request.files;
                const tokens = JSON.parse(request.headers.googleauthcode);
                if (tokens) {
                    oAuth2Client.setCredentials(tokens);
                    const uploadedFileArray = [];
                    for (const file of files) {
                        const uploadedFile = yield uploadToGoogleDrive(file, folderId);
                        uploadedFileArray.push(uploadedFile);
                    }
                    return response.send(uploadedFileArray);
                }
            }
            catch (ex) {
                server.log.error(ex);
                throw ex;
            }
        }),
    });
    //TODO
    function uploadToGoogleDrive(file, folderId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { path, filename, mimetype } = file;
                const googleDrive = googleapis_1.google.drive({ version: "v3", auth: oAuth2Client });
                const media = {
                    mimeType: mimetype,
                    body: fs.createReadStream(path),
                };
                const requestBody = folderId
                    ? {
                        name: filename,
                        mimeType: mimetype,
                        parents: [folderId],
                    }
                    : {
                        name: filename,
                        mimeType: mimetype,
                    };
                const res = yield new Promise((resolve, reject) => {
                    googleDrive.files.create({
                        requestBody,
                        media,
                        fields: "*",
                    }, function (err, res) {
                        if (err) {
                            reject(err);
                        }
                        if (file) {
                            fs.unlinkSync(path);
                        }
                        resolve(res);
                    });
                });
                return res.data;
            }
            catch (ex) {
                server.log.error(ex);
                throw ex;
            }
        });
    }
    //Get files from Google Drive
    server.route({
        url: "/google/get-files",
        logLevel: "warn",
        method: ["GET"],
        handler: (request, response) => __awaiter(void 0, void 0, void 0, function* () {
            const tokens = JSON.parse(request.headers.googleauthcode);
            if (tokens) {
                oAuth2Client.setCredentials(tokens);
                const drive = googleapis_1.google.drive({ version: "v3", auth: oAuth2Client });
                const res = yield new Promise((resolve, reject) => {
                    drive.files.list({
                        pageSize: 1000,
                        fields: "*",
                        orderBy: "createdTime desc",
                    }, function (err, res) {
                        if (err) {
                            reject(err);
                        }
                        resolve(res);
                    });
                });
                return response.send(res.data);
            }
        }),
    });
    //Delete a file from Google Drive
    server.route({
        url: "/google/delete-file/:fileId",
        method: ["DELETE"],
        logLevel: "warn",
        handler: (request, response) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const tokens = JSON.parse(request.headers.googleauthcode);
                if (tokens) {
                    oAuth2Client.setCredentials(tokens);
                    const fileId = request.params.fileId;
                    const googleDrive = googleapis_1.google.drive({
                        version: "v3",
                        auth: oAuth2Client,
                    });
                    const res = yield googleDrive.files.delete({
                        fileId,
                    });
                    if (res) {
                        return response.send({ Message: "File deleted" });
                    }
                }
            }
            catch (ex) {
                server.log.error(ex);
                throw ex;
            }
        }),
    });
    //EmptyTrash on Google Drive
    server.route({
        url: "/google/empty-trash",
        method: ["DELETE"],
        logLevel: "warn",
        handler: (request, response) => __awaiter(void 0, void 0, void 0, function* () {
            const tokens = JSON.parse(request.headers.googleauthcode);
            if (tokens) {
                oAuth2Client.setCredentials(tokens);
                const drive = googleapis_1.google.drive({ version: "v3", auth: oAuth2Client });
                drive.files.emptyTrash({
                    fields: "*",
                    auth: oAuth2Client,
                });
                yield new Promise((resolve, reject) => {
                    drive.files.emptyTrash({
                        fields: "*",
                        auth: oAuth2Client,
                    }, function (err, res) {
                        if (err) {
                            reject(err);
                        }
                        resolve(res);
                    });
                });
                return response.send({ Message: "Trash emptied" });
            }
        }),
    });
    //Download file from Google Drive
    /**
     * request.body = { fileId, fileName }
     */
    server.route({
        url: "/google/download-file/",
        logLevel: "warn",
        method: ["POST"],
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
            const tokens = JSON.parse(request.headers.googleauthcode);
            if (tokens) {
                oAuth2Client.setCredentials(tokens);
                const { fileId, fileName } = request.body;
                const destinationFolder = "./downloads";
                const filePath = `${destinationFolder}/${fileName}`;
                const dest = fs.createWriteStream(filePath); // file path where google drive function will save the file
                const drive = googleapis_1.google.drive({ version: "v3", auth: oAuth2Client }); // Authenticating drive API
                let progress = 0; // This will contain the download progress amount
                // Uploading Single image to drive
                const driveResponse = yield drive.files.get({ fileId, alt: "media" }, { responseType: "stream" });
                console.log(driveResponse);
                driveResponse.data
                    .on("end", () => {
                    console.log("\nDone downloading file.");
                    /**
                     * ? Why does response.download not work on fastify
                     * use Field: "webContentLink" on the frontend as doenload link
                     * @TODO find a way to download files that reach the server
                     */
                    //response.download(filePath); // Set disposition and send it.
                })
                    .on("error", (err) => {
                    throw new Error(`Error downloading file: ${err}`);
                })
                    .on("data", (data) => {
                    progress += data.length;
                    if (process.stdout.isTTY) {
                        readline.clearLine(process.stdout, 0);
                        readline.cursorTo(process.stdout, 0, null);
                        process.stdout.write(`Downloaded ${progress} bytes`);
                    }
                })
                    .pipe(dest);
            }
        }),
    });
    //Get drive Space
    /**
     * Gets the total amount of space available in google drive
     */
    server.route({
        url: "/google/get-drive-space",
        method: ["GET"],
        logLevel: "warn",
        handler: (request, response) => __awaiter(void 0, void 0, void 0, function* () {
            const tokens = JSON.parse(request.headers.googleauthcode);
            if (tokens) {
                oAuth2Client.setCredentials(tokens);
                const drive = googleapis_1.google.drive({ version: "v3", auth: oAuth2Client });
                const res = yield new Promise((resolve, reject) => {
                    drive.about.get({
                        fields: "*",
                    }, function (err, res) {
                        if (err) {
                            reject(err);
                        }
                        if (res) {
                            resolve(res);
                        }
                    });
                });
                const { kind, user, storageQuota } = res.data;
                return response.send({ kind, user, storageQuota });
            }
        }),
    });
    //Create folder in Drive
    server.route({
        url: "/google/create-folder",
        method: ["GET"],
        logLevel: "warn",
        handler: (request, response) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const tokens = JSON.parse(request.headers.googleauthcode);
                if (tokens) {
                    oAuth2Client.setCredentials(tokens);
                    const { folderName } = request.query;
                    const folderId = request.query.parentId || "root";
                    const requestBody = {
                        name: folderName,
                        mimeType: "application/vnd.google-apps.folder",
                        parents: [folderId],
                    };
                    const drive = googleapis_1.google.drive({ version: "v3", auth: oAuth2Client });
                    const res = yield new Promise((resolve, reject) => {
                        drive.files.create({
                            fields: "*",
                            requestBody,
                        }, function (err, res) {
                            if (err) {
                                reject(err);
                            }
                            resolve(res);
                        });
                    });
                    return response.send(res.data);
                }
            }
            catch (ex) {
                server.log.error(ex);
                throw ex;
            }
        }),
    });
    //Move a file from one folder to another
    /***
     * Shape: { fileId, newFolerId }
     */
    server.route({
        url: "/google/move-file-to-another-folder",
        method: ["POST"],
        logLevel: "warn",
        handler: (request, response) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const tokens = JSON.parse(request.headers.googleauthcode);
                if (tokens) {
                    oAuth2Client.setCredentials(tokens);
                    const { fileId, newFolderId } = request.body;
                    const drive = googleapis_1.google.drive({ version: "v3", auth: oAuth2Client });
                    const previousParents = yield new Promise((resolve, reject) => {
                        drive.files.get({
                            fileId: fileId,
                            fields: "parents",
                        }, function (err, file) {
                            if (err) {
                                // Handle error
                                reject(err);
                            }
                            else {
                                resolve(file);
                            }
                        });
                    });
                    const newFolder = yield new Promise((resolve, reject) => {
                        const joinPreviousParents = previousParents.data.parents.join(",");
                        //Move the file to another folder
                        drive.files.update({
                            fileId: fileId,
                            addParents: newFolderId,
                            removeParents: joinPreviousParents,
                            fields: "id, parents",
                        }, function (err, file) {
                            if (err) {
                                // Handle error
                                reject(err);
                            }
                            else {
                                // File moved.
                                resolve(file);
                            }
                        });
                    });
                    return response.send(newFolder.data);
                }
            }
            catch (ex) {
                server.log.error(ex);
                throw ex;
            }
        }),
    });
    //Get all folders in the Drive
    server.route({
        url: "/google/get-all-folders",
        method: ["GET"],
        logLevel: "warn",
        handler: (request, response) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const tokens = JSON.parse(request.headers.googleauthcode);
                if (tokens) {
                    oAuth2Client.setCredentials(tokens);
                    const drive = googleapis_1.google.drive({ version: "v3", auth: oAuth2Client });
                    const folders = yield new Promise((resolve, reject) => {
                        drive.files.list({
                            q: "mimeType='application/vnd.google-apps.folder'",
                            spaces: "drive",
                            fields: "*",
                            orderBy: "name desc",
                        }, function (err, file) {
                            if (err) {
                                reject(err);
                            }
                            else {
                                resolve(file);
                            }
                        });
                    });
                    return response.send(folders.data);
                }
            }
            catch (ex) {
                server.log.error(ex);
                throw ex;
            }
        }),
    });
    //Get list of children files in a folder
    server.route({
        url: "/google/get-files-from-parent-folder/:folderId",
        method: ["GET"],
        logLevel: "warn",
        handler: (request, response) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const tokens = JSON.parse(request.headers.googleauthcode);
                if (tokens) {
                    const { folderId } = request.params;
                    //Authorize user with their token
                    oAuth2Client.setCredentials(tokens);
                    const drive = googleapis_1.google.drive({ version: "v3", auth: oAuth2Client });
                    const childrenFiles = yield new Promise((resolve, reject) => {
                        drive.files.list({
                            q: `'${folderId}' in parents and trashed = false`,
                            spaces: "drive",
                            fields: "*",
                            orderBy: "name desc",
                        }, function (err, file) {
                            if (err) {
                                reject(err);
                            }
                            else {
                                resolve(file);
                            }
                        });
                    });
                    return response.send(childrenFiles.data);
                }
            }
            catch (ex) {
                server.log.error(ex);
                throw ex;
            }
        }),
    });
    //Searching for files by name
    /**
     * Shape: /google/search-for-files?searchQuery=calvin
     */
    server.route({
        url: "/google/search-for-files",
        method: ["GET"],
        logLevel: "warn",
        handler: (request, response) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const tokens = JSON.parse(request.headers.googleauthcode);
                if (tokens) {
                    oAuth2Client.setCredentials(tokens);
                    const { searchQuery } = request.query;
                    const drive = googleapis_1.google.drive({ version: "v3", auth: oAuth2Client });
                    const folders = yield new Promise((resolve, reject) => {
                        drive.files.list({
                            q: `name contains '${searchQuery}'`,
                            spaces: "drive",
                            fields: "*",
                            orderBy: "name desc",
                        }, function (err, file) {
                            if (err) {
                                reject(err);
                            }
                            else {
                                resolve(file);
                            }
                        });
                    });
                    return response.send(folders.data);
                }
            }
            catch (ex) {
                server.log.error(ex);
                throw ex;
            }
        }),
    });
    function getGoogleToken(code) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const tokens = yield new Promise((resolve, reject) => {
                    oAuth2Client.getToken(code, function (ex, token) {
                        if (ex) {
                            reject(ex);
                        }
                        else {
                            resolve(token);
                        }
                    });
                });
                return tokens;
            }
            catch (ex) {
                server.log.error(ex);
                throw ex;
            }
        });
    }
    function setGoogleCredentials(code, oAuth2Client) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const tokens = yield new Promise((resolve, reject) => {
                    oAuth2Client.getToken(code, function (ex, token) {
                        if (ex) {
                            reject(ex);
                        }
                        else {
                            resolve(token);
                        }
                    });
                });
                oAuth2Client.setCredentials(tokens);
                return oAuth2Client;
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