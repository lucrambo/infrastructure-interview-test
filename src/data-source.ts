// Entry point for the TypeORM CLI (`yarn migration:run`); the server builds its own DataSource.
import { loadConfig } from "./config";
import { createDataSource } from "./database";

export default createDataSource(loadConfig(process.env).db);
