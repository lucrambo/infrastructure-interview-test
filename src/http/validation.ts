import { z } from "zod";
import { HttpError } from "./errors";

/** Largest value of a PostgreSQL `integer`, the type of every id (plan door 1). */
export const MAX_ID = 2_147_483_647;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

const decimal = (min: number, max: number) =>
  z
    .string()
    .regex(/^\d+$/, "must be an integer")
    .transform(Number)
    .pipe(z.number().min(min).max(max));

export const postBodySchema = z.strictObject({
  title: z.string().min(1).max(255),
  text: z.string().min(1).max(10_000),
  categories: z
    .array(z.strictObject({ name: z.string().min(1).max(100) }))
    .max(10)
    .optional(),
});

export const listQuerySchema = z.object({
  limit: decimal(1, MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  after: decimal(1, MAX_ID).optional(),
});

export const idParamSchema = z.object({ id: decimal(1, MAX_ID) });

export type PostBody = z.infer<typeof postBodySchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;

/** Parses `input` or throws a 400 listing one entry per invalid field. */
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const errors = result.error.issues.flatMap((issue) => {
    // An unknown key is reported once per key, under its own name, not under its parent.
    const fields =
      issue.code === "unrecognized_keys"
        ? issue.keys.map((key) => [...issue.path, key].join("."))
        : [issue.path.join(".")];
    return fields.map((field) => ({ field: field || "body", message: issue.message }));
  });
  throw new HttpError(400, "The request is invalid", errors);
}
