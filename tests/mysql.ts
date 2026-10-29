/** The server version the suite runs against; the same LTS line as production (AD-001). */
export const MYSQL_IMAGE = "mysql:8.4";

export interface MysqlServer {
  host: string;
  port: number;
  rootPassword: string;
}

declare module "vitest" {
  export interface ProvidedContext {
    mysql: MysqlServer;
  }
}
