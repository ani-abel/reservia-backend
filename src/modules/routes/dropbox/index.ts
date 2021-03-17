import * as dropboxV2Api from "dropbox-v2-api";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as multer from "fastify-multer";
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
  DROPBOX_APP_KEY,
  DROPBOX_APP_SECRET,
  DROPBOX_REDIRECT_URL,
  DROPBOX_PROD_REDIRECT_URL,
} = process.env;

//const authURL = `http://${request.headers.host}/dropbox/callback`;
const dbx = dropboxV2Api.authenticate({
  client_id: DROPBOX_APP_KEY,
  client_secret: DROPBOX_APP_SECRET,
  redirect_uri:
    NODE_ENV === NODE_ENV_TYPE.DEVELOPMENT
      ? DROPBOX_REDIRECT_URL
      : DROPBOX_PROD_REDIRECT_URL,
});

let isAuthorized: boolean = false;
let tokenCredentials;

export default fastifyPlugin(async (server, opts, next) => {
  //Routes for Dropbox
  /**
   * If account is verified, return authURL
   * else return the token-credentials and user-profile
   */
  server.route({
    url: "/dropbox/authorize-drive",
    method: ["GET"],
    logLevel: "warn",
    handler: async (request, response) => {
      try {
        const url = dbx.generateAuthUrl();
        return { AuthURL: url };
      } catch (ex) {
        server.log.error(ex);
        throw ex;
      }
    },
  });

  server.route({
    url: "/dropbox/get-user-details",
    method: ["GET"],
    logLevel: "warn",
    handler: async (request, response) => {
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

        const token: any = JSON.parse(request.headers.dropboxauthcode);

        if (token) {
          const dbxx = dropboxV2Api.authenticate({
            token: token.access_token,
          });
          const userDetails = await new Promise((resolve, reject) => {
            dbxx(
              {
                resource: "users/get_current_account",
                parameters: {
                  account_id: token.account_id,
                },
              },
              (err, result, response) => {
                if (err) {
                  reject(err);
                } else {
                  resolve(result);
                }
              }
            );
          });

          response.send(userDetails);
        }
        throw new Error("No access token was found");
      } catch (ex) {
        server.log.error(ex);
        throw ex;
      }
    },
  });

  //dropbox-callback
  server.route({
    url: "/dropbox/callback",
    method: ["GET"],
    logLevel: "warn",
    handler: async (request, response) => {
      const code = request.query.code;
      const token = await new Promise((resolve, reject) => {
        dbx.getToken(code, (err, result, response) => {
          if (err) {
            reject(err);
          } else {
            //you are authorized now!
            resolve(result);
          }
        });
      });

      return response.redirect(
        `${
          NODE_ENV === "development"
            ? "http://localhost:4200"
            : "https://reservia-frontend.web.app"
        }/#/home?provider=dropbox&code=${JSON.stringify(token)}`
      );
    },
  });

  //Returns access-token + user-details if available, null if it is not
  server.route({
    url: "/dropbox/get-token",
    method: ["GET"],
    logLevel: "warn",
    handler: async (request, response) => {
      return response.send(tokenCredentials);
    },
  });

  //get storage space
  server.route({
    url: "/dropbox/get-drive-space",
    method: ["GET"],
    logLevel: "warn",
    handler: async (request, response) => {
      try {
        const token: any = JSON.parse(request.headers.dropboxauthcode);

        if (token) {
          const dbxx = dropboxV2Api.authenticate({
            token: token.access_token,
          });

          const userSpace = await new Promise((resolve, reject) => {
            dbxx(
              {
                resource: "users/get_space_usage",
              },
              (err, result, response) => {
                if (err) {
                  reject(err);
                } else {
                  resolve(result);
                }
              }
            );
          });
          return response.send(userSpace);
        } else {
          throw new Error("No token was found");
        }
      } catch (ex) {
        server.log.error(ex);
        throw ex;
      }
    },
  });

  //get file metadata and temporary download Link
  server.route({
    url: "/dropbox/get-file-metadata-and-link",
    method: ["GET"],
    logLevel: "warn",
    handler: async (request, response) => {
      try {
        const token: any = JSON.parse(request.headers.dropboxauthcode);

        if (token) {
          const dbxx = dropboxV2Api.authenticate({
            token: token.access_token,
          });

          const getLink: boolean =
            (request.query.link_only as boolean) || false;
          const filePath: string = formatDropboxFilePath(
            request.query.filePath
          );
          const fileMetadata: any = await new Promise((resolve, reject) => {
            dbxx(
              {
                resource: "files/get_temporary_link",
                parameters: {
                  path: filePath,
                },
              },
              (err, result, response) => {
                if (err) {
                  reject(err);
                } else {
                  resolve(result);
                }
              }
            );
          });

          if (getLink) {
            //return only link
            return response.send({ link: fileMetadata.link });
          } else {
            //return the entire file metadata object
            return response.send(fileMetadata);
          }
        } else {
          throw new Error("No token was found");
        }
      } catch (ex) {
        throw ex;
      }
    },
  });

  //get file metadata || get-file
  /**
   * I.E: localhost:3000/dropbox/get-file-metadata?filePath=/role matrix - samples.xlsx
   */
  server.route({
    url: "/dropbox/get-file-metadata",
    method: ["GET"],
    logLevel: "warn",
    handler: async (request, response) => {
      try {
        const token: any = JSON.parse(request.headers.dropboxauthcode);

        if (token) {
          const dbxx = dropboxV2Api.authenticate({
            token: token.access_token,
          });

          const filePath: string = formatDropboxFilePath(
            request.query.filePath
          );
          const fileMetadata = await new Promise((resolve, reject) => {
            dbxx(
              {
                resource: "files/get_metadata",
                parameters: {
                  path: filePath,
                  include_media_info: true,
                },
              },
              (err, result, response) => {
                if (err) {
                  reject(err);
                } else {
                  resolve(result);
                }
              }
            );
          });

          return response.send(fileMetadata);
        } else {
          throw new Error("No token was found");
        }
      } catch (ex) {
        server.log.error(ex);
        throw ex;
      }
    },
  });

  //Create folder
  server.route({
    url: "/dropbox/create-folder",
    method: ["GET"],
    logLevel: "warn",
    handler: async (request, response) => {
      try {
        const token: any = JSON.parse(request.headers.dropboxauthcode);

        if (token) {
          const dbxx = dropboxV2Api.authenticate({
            token: token.access_token,
          });

          const pathToFolder: string = request.query.pathToFolder;
          const folderCreationData: any = await new Promise(
            (resolve, reject) => {
              dbxx(
                {
                  resource: "files/create_folder",
                  parameters: {
                    path: pathToFolder,
                    autorename: false,
                  },
                },
                (err, result, response) => {
                  if (err) {
                    reject(err);
                  } else {
                    resolve(result);
                  }
                }
              );
            }
          );

          return response.send(folderCreationData);
        } else {
          throw new Error("No token was found");
        }
      } catch (ex) {
        server.log.console.error(ex);
        throw ex;
      }
    },
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
    handler: async (request, response) => {
      try {
        const token: any = JSON.parse(request.headers.dropboxauthcode);

        if (token) {
          const dbxx = dropboxV2Api.authenticate({
            token: token.access_token,
          });

          const filePath: string = request.query.filePath?.startsWith("/")
            ? request.query.filePath
            : `/${request.query.filePath}`;
          const filePathSplit: string[] = filePath.split("/");
          const filename: string = filePathSplit[filePathSplit.length - 1];

          await new Promise((resolve, reject) => {
            dbxx(
              {
                resource: "files/download",
                parameters: {
                  path: filePath,
                },
              },
              (err, result, response) => {
                if (err) {
                  reject(err);
                } else {
                  //download completed
                  resolve(result);
                }
              }
            ).pipe(fs.createWriteStream(`./downloads/${filename}`));
          });

          return response.send({
            Message: `file downloaded to http://http://${request.headers.host}/downloads/${filename}`,
          });
        } else {
          throw new Error("No token was found");
        }
      } catch (ex) {
        server.log.error(ex);
        throw ex;
      }
    },
  });

  //upload-files
  server.route({
    url: "/dropbox/upload-files",
    method: ["POST"],
    logLevel: "warn",
    preValidation: upload.array("files", 10),
    handler: async (request, response) => {
      try {
        const token: any = JSON.parse(request.headers.dropboxauthcode);

        if (token) {
          const dbxx = dropboxV2Api.authenticate({
            token: token.access_token,
          });

          const filePath: string = request.query.filePath
            ? formatDropboxFilePath(request.query.filePath)
            : "";
          const files = request.files;
          const uploadedFileArray = [];
          for (const file of files) {
            const uploadedFile = await uploadToDropbox(file, dbxx, filePath);
            uploadedFileArray.push(uploadedFile);
          }
          return response.send(uploadedFileArray);
        } else {
          throw new Error("No token was found");
        }
      } catch (ex) {
        server.log.error(ex);
        throw ex;
      }
    },
  });

  //Delete-file || Delete-folder
  /**
   * I.E http://localhost:3000/dropbox/delete-file?filePath=/Home/Music/calvin-harris.mp3
   */
  server.route({
    url: "/dropbox/delete-file",
    method: ["DELETE"],
    logLevel: "warn",
    handler: async (request, response) => {
      try {
        const token: any = JSON.parse(request.headers.dropboxauthcode);

        if (token) {
          const dbxx = dropboxV2Api.authenticate({
            token: token.access_token,
          });

          const filePath: string = formatDropboxFilePath(
            request.query.filePath
          );
          const filePathSplit: string[] = filePath.split("/");
          const filename: string = filePathSplit[filePathSplit.length - 1];
          //const fileIds: string[] = request.body.idList as string[];

          const deletedResourse: any = await new Promise((resolve, reject) => {
            dbxx(
              {
                resource: "files/delete",
                parameters: {
                  path: filePath,
                },
              },
              (err, result, response) => {
                if (err) {
                  reject(err);
                } else {
                  resolve(result);
                }
              }
            );
          });

          return response.send({
            Message: `'${filename}' was deleted`,
            ResponsePayload: deletedResourse,
          });
        } else {
          throw new Error("no token was found");
        }
      } catch (ex) {
        server.log.error(ex);
        throw ex;
      }
    },
  });

  //Copy-file
  server.route({
    url: "/dropbox/copy-file-to-another-folder",
    method: ["POST"],
    logLevel: "warn",
    handler: async (request, response) => {
      try {
        const token: any = JSON.parse(request.headers.dropboxauthcode);

        if (token) {
          const dbxx = dropboxV2Api.authenticate({
            token: token.access_token,
          });

          let { fromPath, toPath, fileName } = request.body;
          fromPath = formatDropboxFilePath(fromPath);
          toPath = formatDropboxFilePath(toPath);
          const copyFileMetadata: any = await new Promise((resolve, reject) => {
            dbxx(
              {
                resource: "files/copy",
                parameters: {
                  from_path: fromPath,
                  to_path:
                    toPath && toPath !== ""
                      ? `${toPath}/${fileName}`
                      : `/${fileName}`,
                  allow_shared_folder: false,
                  autorename: false,
                  allow_ownership_transfer: false,
                },
              },
              (err, result, response) => {
                if (err) {
                  reject(err);
                } else {
                  resolve(result);
                }
              }
            );
          });
          return response.send(copyFileMetadata);
        } else {
          throw new Error("No token was found");
        }
      } catch (ex) {
        server.log.error(ex);
        throw ex;
      }
    },
  });

  //Move-file
  server.route({
    url: "/dropbox/move-file-to-another-folder",
    method: ["POST"],
    logLevel: "warn",
    handler: async (request, response) => {
      try {
        const token: any = JSON.parse(request.headers.dropboxauthcode);

        if (token) {
          const dbxx = dropboxV2Api.authenticate({
            token: token.access_token,
          });

          let { fromPath, toPath, fileName } = request.body;
          fromPath = formatDropboxFilePath(fromPath);
          toPath = formatDropboxFilePath(toPath);
          const moveFileMetadata: any = await new Promise((resolve, reject) => {
            dbxx(
              {
                resource: "files/move",
                parameters: {
                  from_path: fromPath,
                  to_path:
                    toPath && toPath !== ""
                      ? `${toPath}/${fileName}`
                      : `/${fileName}`,
                  allow_shared_folder: false,
                  autorename: false,
                  allow_ownership_transfer: false,
                },
              },
              (err, result, response) => {
                if (err) {
                  reject(err);
                } else {
                  resolve(result);
                }
              }
            );
          });
          return response.send(moveFileMetadata);
        } else {
          throw new Error("No token was found");
        }
      } catch (ex) {
        server.log.error(ex);
        throw ex;
      }
    },
  });

  //list-folders & files
  server.route({
    url: "/dropbox/get-all-files-and-folders",
    method: ["GET"],
    logLevel: "warn",
    handler: async (request, response) => {
      try {
        const token: any = JSON.parse(request.headers.dropboxauthcode);

        if (token) {
          const dbxx = dropboxV2Api.authenticate({
            token: token.access_token,
          });

          const filePath: string = request.query.filePath
            ? formatDropboxFilePath(request.query.filePath)
            : "";
          const fileListData: any = await new Promise((resolve, reject) => {
            dbxx(
              {
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
              },
              (err, result, response) => {
                if (err) {
                  reject(err);
                } else {
                  resolve(result);
                }
              }
            );
          });

          return response.send(fileListData);
        } else {
          throw new Error("No token was found");
        }
      } catch (ex) {
        server.log.error(ex);
        throw ex;
      }
    },
  });

  //Search-for-file
  /**
   * I.E: http://localhost:3000/dropbox/search-for-files?searchQuery=reservia
   */
  server.route({
    url: "/dropbox/search-for-files",
    method: ["GET"],
    logLevel: "warn",
    handler: async (request, response) => {
      try {
        const token: any = JSON.parse(request.headers.dropboxauthcode);

        if (token) {
          const dbxx = dropboxV2Api.authenticate({
            token: token.access_token,
          });

          const searchQuery: string = request.query.searchQuery;
          const fileListData: any = await new Promise((resolve, reject) => {
            dbxx(
              {
                resource: "files/search",
                parameters: {
                  query: searchQuery,
                  match_field_options: {
                    include_highlights: true,
                  },
                },
              },
              (err, result, response) => {
                if (err) {
                  reject(err);
                } else {
                  resolve(result);
                }
              }
            );
          });

          return response.send(fileListData);
        } else {
          throw new Error("No token was found");
        }
      } catch (ex) {
        server.log.error(ex);
        throw ex;
      }
    },
  });

  //get-file-from-path
  server.route({
    url: "/dropbox/get-file/:fileId",
    method: ["GET"],
    logLevel: "warn",
    handler: async (request, response) => {
      try {
        const token: any = JSON.parse(request.headers.dropboxauthcode);

        if (token) {
          const dbxx = dropboxV2Api.authenticate({
            token: token.access_token,
          });

          const fileId: string = request.params.fileId;
          const file: any = await new Promise((resolve, reject) => {
            dbxx(
              {
                resource: "file_requests/get",
                parameters: {
                  id: fileId,
                },
              },
              (err, result, response) => {
                if (err) {
                  reject(err);
                } else {
                  resolve(result);
                }
              }
            );
          });

          return response.send(file);
        } else {
          throw new Error("No token was found");
        }
      } catch (ex) {
        server.log.error(ex);
        throw ex;
      }
    },
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

  function formatDropboxFilePath(filePath: string): string {
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
  async function uploadToDropbox(
    file: any,
    dbxx: any,
    saveFileTo: string = ""
  ) {
    try {
      const uploadData: any = await new Promise((resolve, reject) => {
        dbxx(
          {
            resource: "files/upload",
            parameters: {
              path: `${saveFileTo}/${file.filename}`,
            },
            readStream: fs.createReadStream(file.path),
          },
          (err, result, response) => {
            if (err) {
              reject(err);
            } else {
              //upload completed
              resolve(result);
            }
          }
        );
      });

      fs.unlinkSync(file.path);
      return uploadData;
    } catch (ex) {
      server.log.error(ex);
      throw ex;
    }
  }
  next();
});
