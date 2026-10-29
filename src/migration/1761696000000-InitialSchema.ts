import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Creates the schema the entities map to. Constraint and index names follow TypeORM's default
 * naming strategy, so `migration:generate` against this schema produces no diff.
 *
 * MySQL commits each DDL statement on its own; if `up` fails halfway, `down` drops what exists.
 */
export class InitialSchema1761696000000 implements MigrationInterface {
  name = "InitialSchema1761696000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`post\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`title\` varchar(255) NOT NULL,
        \`text\` text NOT NULL,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
    await queryRunner.query(`
      CREATE TABLE \`category\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`name\` varchar(100) NOT NULL,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
    await queryRunner.query(`
      CREATE TABLE \`post_categories_category\` (
        \`postId\` int NOT NULL,
        \`categoryId\` int NOT NULL,
        INDEX \`IDX_93b566d522b73cb8bc46f7405b\` (\`postId\`),
        INDEX \`IDX_a5e63f80ca58e7296d5864bd2d\` (\`categoryId\`),
        PRIMARY KEY (\`postId\`, \`categoryId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
    await queryRunner.query(`
      ALTER TABLE \`post_categories_category\`
        ADD CONSTRAINT \`FK_93b566d522b73cb8bc46f7405bd\` FOREIGN KEY (\`postId\`)
        REFERENCES \`post\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
    await queryRunner.query(`
      ALTER TABLE \`post_categories_category\`
        ADD CONSTRAINT \`FK_a5e63f80ca58e7296d5864bd2d3\` FOREIGN KEY (\`categoryId\`)
        REFERENCES \`category\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`post_categories_category\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`category\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`post\``);
  }
}
