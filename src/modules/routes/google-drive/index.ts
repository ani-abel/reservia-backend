import { google } from "googleapis";
import * as multer from "fastify-multer";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as readline from "readline";
import { MulterValidators } from "../../../file-validators/multer.validator";
import { NODE_ENV, NODE_ENV_TYPE } from "../../../@types/default.type";
//Configure multer
const upload = multer({
  storage: multer.diskStorage({
    destination: "./uploads",
    filename: MulterValidators.preserveOriginalFileName,
  }),
});

const fastifyPlugin = require("fastify-plugin");

dotenv.config();

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URL,
  GOOGLE_PROD_REDIRECT_URL,
} = process.env;

let oAuth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  NODE_ENV === NODE_ENV_TYPE.DEVELOPMENT
    ? GOOGLE_REDIRECT_URL
    : GOOGLE_PROD_REDIRECT_URL
);

let tokenCredentials: any;

// If modifying these scopes, delete token.json.
const SCOPES: string[] = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/drive.metadata",
  "https://www.googleapis.com/auth/drive.readonly",
];

export default fastifyPlugin(async (server, opts, next) => {
  //Routes for Google-Drive

  //Google get authorize URL
  server.route({
    url: "/google/authorize-drive",
    logLevel: "warn",
    method: ["GET"],
    handler: async (request, response) => {
      try {
        const url = oAuth2Client.generateAuthUrl({
          access_type: "offline",
          scope: SCOPES,
        });
        return { AuthURL: url };
      } catch (ex) {
        server.log.error(ex);
        throw ex;
      }
    },
  });

  //Google callback
  server.route({
    url: "/google/callback",
    method: ["GET"],
    logLevel: "warn",
    handler: async (request, response) => {
      try {
        //Return Code for use to query for Token
        const code = request.query.code;
        if (code) {
          const token: any = await getGoogleToken(code);
          return response.redirect(
            `${
              NODE_ENV === "development"
                ? "http://localhost:4200"
                : "https://reservia-frontend.web.app"
            }/#/home?provider=google&code=${JSON.stringify(token)}`
          );
        }
      } catch (ex) {
        server.log.error(ex);
        throw ex;
      }
    },
  });

  server.route({
    url: "/google/get-user-details",
    logLevel: "warn",
    method: ["GET"],
    handler: async (request, response) => {
      try {
        const tokens: any = JSON.parse(request.headers.googleauthcode);
        if (tokens) {
          oAuth2Client.setCredentials(tokens);
          const oauth2 = google.oauth2({
            auth: oAuth2Client,
            version: "v2",
          });
          const userData: any = await new Promise((resolve, reject) => {
            oauth2.userinfo.get(function (err, res) {
              if (err) {
                reject(err);
              } else {
                resolve(res);
              }
            });
          });
          return response.send(userData.data);
        }
      } catch (ex) {
        server.log.error(ex);
        throw ex;
      }
    },
  });

  //Returns access-token + user-details if available, null if it is not
  server.route({
    url: "/google/get-token",
    method: ["GET"],
    logLevel: "warn",
    handler: async (request, response) => {
      return response.send(tokenCredentials);
    },
  });

  //Upload file to google Drive
  server.route({
    url: "/google/upload-files",
    logLevel: "warn",
    method: ["POST"],
    preValidation: upload.array("files", 10),
    handler: async (request, response) => {
      try {
        const files = request.files;
        const tokens: any = JSON.parse(request.headers.googleauthcode);
        if (tokens) {
          oAuth2Client.setCredentials(tokens);
          const uploadedFileArray = [];
          for (const file of files) {
            const uploadedFile = await uploadToGoogleDrive(file);
            uploadedFileArray.push(uploadedFile);
          }
          return response.send(uploadedFileArray);
        }
      } catch (ex) {
        server.log.error(ex);
        throw ex;
      }
    },
  });

  //Upload file to specific google Drive Folder
  server.route({
    url: "/google/upload-files/:folderId",
    logLevel: "warn",
    method: ["POST"],
    preValidation: upload.array("files", 10),
    handler: async (request, response) => {
      try {
        const { folderId } = request.params;
        const files = request.files;
        const tokens: any = JSON.parse(request.headers.googleauthcode);
        if (tokens) {
          oAuth2Client.setCredentials(tokens);

          const uploadedFileArray = [];
          for (const file of files) {
            const uploadedFile = await uploadToGoogleDrive(file, folderId);
            uploadedFileArray.push(uploadedFile);
          }
          return response.send(uploadedFileArray);
        }
      } catch (ex) {
        server.log.error(ex);
        throw ex;
      }
    },
  });

  //TODO
  async function uploadToGoogleDrive(
    file: any,
    folderId?: string
  ): Promise<any> {
    try {
      const { path, filename, mimetype } = file;
      const googleDrive = google.drive({ version: "v3", auth: oAuth2Client });

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

      const res: any = await new Promise((resolve, reject) => {
        googleDrive.files.create(
          {
            requestBody,
            media,
            fields: "*",
            //fields: "id, name, kind, mimeType",
          },
          function (err, res) {
            if (err) {
              reject(err);
            }
            if (file) {
              fs.unlinkSync(path);
            }
            resolve(res);
          }
        );
      });

      return res.data;
    } catch (ex) {
      server.log.error(ex);
      throw ex;
    }
  }

  //Get files from Google Drive
  server.route({
    url: "/google/get-files",
    logLevel: "warn",
    method: ["GET"],
    handler: async (request, response) => {
      const tokens: any = JSON.parse(request.headers.googleauthcode);
      if (tokens) {
        oAuth2Client.setCredentials(tokens);

        const drive = google.drive({ version: "v3", auth: oAuth2Client });
        const res: any = await new Promise((resolve, reject) => {
          drive.files.list(
            {
              pageSize: 1000,
              fields: "*",
              orderBy: "createdTime desc",
            },
            function (err, res) {
              if (err) {
                reject(err);
              }
              resolve(res);
            }
          );
        });
        return response.send(res.data);
      }
    },
  });

  //Delete a file from Google Drive
  server.route({
    url: "/google/delete-file/:fileId",
    method: ["DELETE"],
    logLevel: "warn",
    handler: async (request, response) => {
      try {
        const tokens: any = JSON.parse(request.headers.googleauthcode);
        if (tokens) {
          oAuth2Client.setCredentials(tokens);

          const fileId = request.params.fileId;
          const googleDrive = google.drive({
            version: "v3",
            auth: oAuth2Client,
          });
          const res = await googleDrive.files.delete({
            fileId,
          });
          if (res) {
            return response.send({ Message: "File deleted" });
          }
        }
      } catch (ex) {
        server.log.error(ex);
        throw ex;
      }
    },
  });

  //EmptyTrash on Google Drive
  server.route({
    url: "/google/empty-trash",
    method: ["DELETE"],
    logLevel: "warn",
    handler: async (request, response) => {
      const tokens: any = JSON.parse(request.headers.googleauthcode);
      if (tokens) {
        oAuth2Client.setCredentials(tokens);

        const drive = google.drive({ version: "v3", auth: oAuth2Client });
        drive.files.emptyTrash({
          fields: "*",
          auth: oAuth2Client,
        });

        await new Promise((resolve, reject) => {
          drive.files.emptyTrash(
            {
              fields: "*",
              auth: oAuth2Client,
            },
            function (err, res) {
              if (err) {
                reject(err);
              }
              resolve(res);
            }
          );
        });
        return response.send({ Message: "Trash emptied" });
      }
    },
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
    handler: async (request, response) => {
      const tokens: any = JSON.parse(request.headers.googleauthcode);
      if (tokens) {
        oAuth2Client.setCredentials(tokens);

        const { fileId, fileName } = request.body;
        const destinationFolder: string = "./downloads";
        const filePath: string = `${destinationFolder}/${fileName}`;
        const dest = fs.createWriteStream(filePath); // file path where google drive function will save the file

        const drive = google.drive({ version: "v3", auth: oAuth2Client }); // Authenticating drive API

        let progress = 0; // This will contain the download progress amount

        // Uploading Single image to drive
        const driveResponse = await drive.files.get(
          { fileId, alt: "media" },
          { responseType: "stream" }
        );

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
    },
  });

  //Get drive Space
  /**
   * Gets the total amount of space available in google drive
   */
  server.route({
    url: "/google/get-drive-space",
    method: ["GET"],
    logLevel: "warn",
    handler: async (request, response) => {
      const tokens: any = JSON.parse(request.headers.googleauthcode);
      if (tokens) {
        oAuth2Client.setCredentials(tokens);

        const drive = google.drive({ version: "v3", auth: oAuth2Client });

        const res: any = await new Promise((resolve, reject) => {
          drive.about.get(
            {
              fields: "*",
            },
            function (err, res) {
              if (err) {
                reject(err);
              }
              if (res) {
                resolve(res);
              }
            }
          );
        });
        const { kind, user, storageQuota } = res.data;
        return response.send({ kind, user, storageQuota });
      }
    },
  });

  //Create folder in Drive
  server.route({
    url: "/google/create-folder",
    method: ["GET"],
    logLevel: "warn",
    handler: async (request, response) => {
      try {
        const tokens: any = JSON.parse(request.headers.googleauthcode);
        if (tokens) {
          oAuth2Client.setCredentials(tokens);

          const { folderName } = request.query;
          const folderId: string = request.query.parentId || "root";
          const requestBody = {
            name: folderName,
            mimeType: "application/vnd.google-apps.folder",
            parents: [folderId],
          };
          const drive = google.drive({ version: "v3", auth: oAuth2Client });
          const res: any = await new Promise((resolve, reject) => {
            drive.files.create(
              {
                fields: "*",
                requestBody,
              },
              function (err, res) {
                if (err) {
                  reject(err);
                }
                resolve(res);
              }
            );
          });

          return response.send(res.data);
        }
      } catch (ex) {
        server.log.error(ex);
        throw ex;
      }
    },
  });

  //Move a file from one folder to another
  /***
   * Shape: { fileId, newFolerId }
   */
  server.route({
    url: "/google/move-file-to-another-folder",
    method: ["POST"],
    logLevel: "warn",
    handler: async (request, response) => {
      try {
        const tokens: any = JSON.parse(request.headers.googleauthcode);
        if (tokens) {
          oAuth2Client.setCredentials(tokens);

          const { fileId, newFolderId } = request.body;
          const drive = google.drive({ version: "v3", auth: oAuth2Client });
          const previousParents: any = await new Promise((resolve, reject) => {
            drive.files.get(
              {
                fileId: fileId,
                fields: "parents",
              },
              function (err, file) {
                if (err) {
                  // Handle error
                  reject(err);
                } else {
                  resolve(file);
                }
              }
            );
          });

          const newFolder: any = await new Promise((resolve, reject) => {
            const joinPreviousParents = previousParents.data.parents.join(",");
            //Move the file to another folder
            drive.files.update(
              {
                fileId: fileId,
                addParents: newFolderId,
                removeParents: joinPreviousParents,
                fields: "id, parents",
              },
              function (err, file) {
                if (err) {
                  // Handle error
                  reject(err);
                } else {
                  // File moved.
                  resolve(file);
                }
              }
            );
          });

          return response.send(newFolder.data);
        }
      } catch (ex) {
        server.log.error(ex);
        throw ex;
      }
    },
  });

  //Get all folders in the Drive
  server.route({
    url: "/google/get-all-folders",
    method: ["GET"],
    logLevel: "warn",
    handler: async (request, response) => {
      try {
        const tokens: any = JSON.parse(request.headers.googleauthcode);
        if (tokens) {
          oAuth2Client.setCredentials(tokens);

          const drive = google.drive({ version: "v3", auth: oAuth2Client });
          const folders: any = await new Promise((resolve, reject) => {
            drive.files.list(
              {
                q: "mimeType='application/vnd.google-apps.folder'",
                spaces: "drive",
                fields: "*",
                orderBy: "name desc",
              },
              function (err, file) {
                if (err) {
                  reject(err);
                } else {
                  resolve(file);
                }
              }
            );
          });

          return response.send(folders.data);
        }
      } catch (ex) {
        server.log.error(ex);
        throw ex;
      }
    },
  });

  //Get list of children files in a folder
  server.route({
    url: "/google/get-files-from-parent-folder/:folderId",
    method: ["GET"],
    logLevel: "warn",
    handler: async (request, response) => {
      try {
        const tokens: any = JSON.parse(request.headers.googleauthcode);
        if (tokens) {
          const { folderId } = request.params;

          //Authorize user with their token
          oAuth2Client.setCredentials(tokens);
          const drive = google.drive({ version: "v3", auth: oAuth2Client });
          const childrenFiles: any = await new Promise((resolve, reject) => {
            drive.files.list(
              {
                q: `'${folderId}' in parents and trashed = false`,
                spaces: "drive",
                fields: "*",
                orderBy: "name desc",
              },
              function (err, file) {
                if (err) {
                  reject(err);
                } else {
                  resolve(file);
                }
              }
            );
          });

          return response.send(childrenFiles.data);
        }
      } catch (ex) {
        server.log.error(ex);
        throw ex;
      }
    },
  });

  //Searching for files by name
  /**
   * Shape: /google/search-for-files?searchQuery=calvin
   */
  server.route({
    url: "/google/search-for-files",
    method: ["GET"],
    logLevel: "warn",
    handler: async (request, response) => {
      try {
        const tokens: any = JSON.parse(request.headers.googleauthcode);
        if (tokens) {
          oAuth2Client.setCredentials(tokens);

          const { searchQuery } = request.query;
          const drive = google.drive({ version: "v3", auth: oAuth2Client });
          const folders: any = await new Promise((resolve, reject) => {
            drive.files.list(
              {
                q: `name contains '${searchQuery}'`,
                spaces: "drive",
                fields: "*",
                orderBy: "name desc",
              },
              function (err, file) {
                if (err) {
                  reject(err);
                } else {
                  resolve(file);
                }
              }
            );
          });

          return response.send(folders.data);
        }
      } catch (ex) {
        server.log.error(ex);
        throw ex;
      }
    },
  });

  async function getGoogleToken(code: string): Promise<any> {
    try {
      const tokens: any = await new Promise((resolve, reject) => {
        oAuth2Client.getToken(code, function (ex, token) {
          if (ex) {
            reject(ex);
          } else {
            resolve(token);
          }
        });
      });
      return tokens;
    } catch (ex) {
      server.log.error(ex);
      throw ex;
    }
  }

  async function setGoogleCredentials(
    code: string,
    oAuth2Client?: any
  ): Promise<any> {
    try {
      const tokens: any = await new Promise((resolve, reject) => {
        oAuth2Client.getToken(code, function (ex, token) {
          if (ex) {
            reject(ex);
          } else {
            resolve(token);
          }
        });
      });
      oAuth2Client.setCredentials(tokens);
      return oAuth2Client;
    } catch (ex) {
      server.log.error(ex);
      throw ex;
    }
  }

  next();
});
