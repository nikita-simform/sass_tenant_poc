// `@prisma/adapter-pg` connects through a real `pg.Pool`, which does not
// understand Prisma's old `?schema=` connection-string convention (libpq has
// no such connection parameter). We always select the schema explicitly via
// PrismaPgOptions.schema instead, so any `schema` query param is stripped
// before the URL reaches `pg`.
export function stripSchemaParam(databaseUrl: string): string {
  const parsed = new URL(databaseUrl);
  parsed.searchParams.delete("schema");
  return parsed.toString();
}
