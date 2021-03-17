export enum NODE_ENV_TYPE {
  DEVELOPMENT = "development",
  PRODUCTION = "production",
}

export const NODE_ENV: string =
  process.env.NODE_ENV || NODE_ENV_TYPE.DEVELOPMENT;
