process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:5432/portal_test";
(process.env as Record<string, string>).NODE_ENV = "test";
